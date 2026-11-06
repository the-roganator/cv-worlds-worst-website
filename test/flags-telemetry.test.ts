/**
 * What the shop's telemetry says about its flags, from the shop run as the image runs it, with its telemetry
 * preloaded and sent to a stand-in collector: each flag a request asks about is an event on its span, with the
 * variant flagd chose; and a share id and its signature are nowhere in a span, a metric, a log sent to the collector,
 * or a line on stdout.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeFlagd, startFlagd } from './support/flagd.ts';
import { signed, VECTOR } from './support/share.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ID = 'traffic-sentinel-5f3a';

let flagd: FakeFlagd;
let collector: Server;
let shop: ChildProcess;
let port = 0;
let stdout = '';
let stderr = '';
const exported: { path: string; body: string }[] = [];
const directory = mkdtempSync(join(tmpdir(), 'flags-telemetry-'));
const headersSent: Record<string, string>[] = [];

/** A GET to the shop, as the traffic generator sends it: signed for the host and path it asks for. */
function get(path: string): Promise<number> {
  const host = `127.0.0.1:${port}`;
  const headers = signed({ id: ID, time: Math.floor(Date.now() / 1000), host, method: 'GET', path });
  headersSent.push(headers);
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, headers }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', reject);
    req.end();
  });
}

beforeAll(async () => {
  flagd = await startFlagd({
    'big-buttons': {
      state: 'ENABLED',
      variants: { shown: true, hidden: false },
      defaultVariant: 'hidden',
      targeting: { if: [{ '==': [{ var: 'targetingKey' }, ID] }, 'shown', 'hidden'] },
    },
  });
  collector = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      exported.push({ path: req.url ?? '', body });
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  await new Promise<void>((resolve) => collector.listen(0, '127.0.0.1', resolve));
  const keyFile = join(directory, 'public-key');
  writeFileSync(keyFile, VECTOR.publicKey);

  shop = spawn(process.execPath, ['--import', './src/telemetry.ts', 'test/support/telemetry-shop.ts'], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH ?? '',
      FLAGS_SYNC: flagd.address,
      SHARE_PUBLIC_KEY_FILE: keyFile,
      OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${(collector.address() as AddressInfo).port}`,
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
      OTEL_METRIC_EXPORT_INTERVAL: '200',
      LOG_LEVEL: 'debug',
    },
  });
  shop.stderr?.on('data', (chunk) => {
    stderr += chunk;
  });
  port = await new Promise<number>((resolve, reject) => {
    shop.stdout?.on('data', (chunk) => {
      stdout += chunk;
      const match = /^\{"port":(\d+)\}$/m.exec(stdout);
      if (match) resolve(Number(match[1]));
    });
    shop.once('exit', (code) => reject(new Error(`the shop exited (${code}): ${stderr}`)));
  });

  expect(await get('/flag/big-buttons')).toBe(200);
  expect(await get('/flag/no-such-flag')).toBe(200);
  expect(await get('/broken')).toBe(500);
  expect(await get('/no-such-page')).toBe(404);

  await new Promise((resolve) => {
    shop.once('exit', resolve);
    shop.kill('SIGTERM');
  });
}, 30_000);

afterAll(async () => {
  shop?.kill();
  await flagd?.stop();
  await new Promise((resolve) => collector?.close(resolve));
  rmSync(directory, { recursive: true, force: true });
});

interface Span {
  name: string;
  attributes: { key: string; value: { stringValue?: string } }[];
  events?: { name: string; attributes: { key: string; value: Record<string, unknown> }[] }[];
}

const spans = (): Span[] =>
  exported
    .filter(({ path }) => path === '/v1/traces')
    .flatMap(({ body }) => (JSON.parse(body) as { resourceSpans: { scopeSpans: { spans: Span[] }[] }[] }).resourceSpans)
    .flatMap(({ scopeSpans }) => scopeSpans.flatMap(({ spans }) => spans));

const attributes = (list: { key: string; value: Record<string, unknown> }[]) =>
  Object.fromEntries(list.map(({ key, value }) => [key, Object.values(value)[0]]));

describe('the shop’s telemetry', () => {
  it('puts each flag a request asks about on its span, with the variant flagd chose', () => {
    const asked = spans().filter((span) =>
      span.attributes.some(({ key, value }) => key === 'url.path' && value.stringValue?.startsWith('/flag/')),
    );
    const events = asked.flatMap((span) => span.events ?? []).filter(({ name }) => name === 'feature_flag.evaluation');
    expect(events.map(({ attributes: list }) => attributes(list))).toEqual([
      {
        'feature_flag.key': 'big-buttons',
        'feature_flag.provider.name': 'flagd',
        'feature_flag.result.value': true,
        'feature_flag.result.variant': 'shown',
        'feature_flag.result.reason': 'targeting_match',
      },
      {
        'feature_flag.key': 'no-such-flag',
        'feature_flag.provider.name': 'flagd',
        'feature_flag.result.value': false,
        'feature_flag.result.reason': 'error',
        'error.type': 'flag_not_found',
      },
    ]);
  });

  it('sent spans, metrics and logs, and wrote the request and error logs', () => {
    expect(new Set(exported.map(({ path }) => path))).toEqual(new Set(['/v1/traces', '/v1/metrics', '/v1/logs']));
    expect(stdout).toContain('"event":"request"');
    expect(stdout).toContain('"event":"error"');
  });

  it('has no share id or signature in any span, metric or log, or on stdout', () => {
    const everything = [stdout, stderr, ...exported.map(({ body }) => body)].join('\n');
    expect(headersSent).toHaveLength(4);
    expect(everything).not.toContain(ID);
    for (const headers of headersSent) expect(everything).not.toContain(headers['x-share-signature']);
    expect(everything).not.toMatch(/x-share/i);
  });
});
