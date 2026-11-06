/**
 * The flag context against a stand-in for flagd's sync port (support/flagd.ts), through flagd's own in-process
 * provider: what flagd says reaches a request, what each request carries reaches flagd's targeting, and anything
 * else is off.
 */
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type AppOptions, createApp } from '../src/app.ts';
import { createFlags, type Flags, REVISION_FLAG, STALE_AFTER_MS, shareKey } from '../src/flags/index.ts';
import { HTML, json } from '../src/http.ts';
import { failed, notFound } from '../src/pages/index.ts';
import { anyFlag, type FakeFlagd, off, on, onWhen, revision, startFlagd } from './support/flagd.ts';
import { signed, VECTOR } from './support/share.ts';

/** A shop whose routes ask about flags, one file, and the shop's own replies when no route matches or one fails. */
async function serve(
  flags: Flags,
  replies: Partial<Pick<AppOptions, 'notFound'>> = {},
): Promise<{ base: string; server: Server }> {
  const server = createServer(
    createApp({
      commit: 'test',
      flags,
      assets: new Map([
        [
          '/assets/site.css',
          { body: Buffer.from('body{}'), type: 'text/css', etag: '"site"', cacheControl: 'no-cache' },
        ],
      ]),
      notFound,
      failed,
      ...replies,
      routes: [
        {
          method: 'GET',
          path: '/flag/:name',
          handle: async (request) => json(200, { on: await request.flag(anyFlag(request.params.name ?? '')) }),
        },
        // A page that asks about no flag.
        { method: 'GET', path: '/plain', handle: () => ({ status: 200, type: HTML, body: '<p>Plain.</p>' }) },
        {
          // A page and an API route that ask about a flag, and then fail.
          method: 'GET',
          path: '/broken',
          handle: async (request) => {
            await request.flag(anyFlag('big-buttons'));
            throw new Error('asked, then failed');
          },
        },
        {
          method: 'GET',
          path: '/api/broken',
          handle: async (request) => {
            await request.flag(anyFlag('big-buttons'));
            throw new Error('asked, then failed');
          },
        },
        {
          // A page that tries to set what only the flag context may.
          method: 'GET',
          path: '/greedy',
          handle: async (request) => ({
            status: 200,
            type: HTML,
            body: `<p>${await request.flag(anyFlag('big-buttons'))}</p>`,
            headers: {
              'cache-control': 'public, max-age=600',
              'set-cookie': 'preview=everything',
              'x-flags-revision': 'r0',
            },
          }),
        },
      ],
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

let flagd: FakeFlagd;
const opened: { flags: Flags; server?: Server }[] = [];

async function shop(options: Parameters<typeof createFlags>[0] = {}) {
  const flags = createFlags({ sync: flagd.address, reconnectMs: 50, ...options });
  const { base, server } = await serve(flags);
  opened.push({ flags, server });
  await vi.waitFor(() => expect(flags.inStep()).toBe(true));
  const isOn = async (flag: string, headers: Record<string, string> = {}) =>
    ((await (await fetch(`${base}/flag/${flag}`, { headers })).json()) as { on: boolean }).on;
  return { flags, base, isOn };
}

beforeAll(async () => {
  flagd = await startFlagd();
});
afterEach(async () => {
  for (const { flags, server } of opened.splice(0)) {
    await flags.close();
    await new Promise((resolve) => server?.close(resolve));
  }
});
afterAll(() => flagd.stop());

describe('whether a flag is on', () => {
  it('is off for every flag without flagd', async () => {
    const { base, server } = await serve(createFlags());
    opened.push({ flags: createFlags(), server });
    expect(await (await fetch(`${base}/flag/big-buttons`)).json()).toEqual({ on: false });
  });

  it('is off for every flag until the first flag set arrives', async () => {
    const flags = createFlags({ sync: '127.0.0.1:9', reconnectMs: 50 });
    const { base, server } = await serve(flags);
    opened.push({ flags, server });
    expect(await (await fetch(`${base}/flag/big-buttons`)).json()).toEqual({ on: false });
    expect(flags.inStep()).toBe(false);
  });

  it('is what flagd says, and off for anything flagd does not say is on', async () => {
    flagd.set({
      'big-buttons': on,
      'dark-mode': off,
      'quiet-mode': { ...on, state: 'DISABLED' },
      'named-thing': { state: 'ENABLED', variants: { a: 'yes' }, defaultVariant: 'a' },
      Shouting: on,
      [REVISION_FLAG]: revision('r1'),
    });
    const { isOn } = await shop();
    expect(await isOn('big-buttons')).toBe(true);
    expect(await isOn('dark-mode')).toBe(false);
    expect(await isOn('no-such-flag')).toBe(false);
    expect(await isOn('quiet-mode')).toBe(false); // disabled
    expect(await isOn('named-thing')).toBe(false); // not a boolean
    expect(await isOn('Shouting')).toBe(false); // not a flag's name
    expect(await isOn(REVISION_FLAG)).toBe(false); // not a feature
  });

  it('changes as soon as flagd sends a change, with no restart', async () => {
    flagd.set({ 'big-buttons': on });
    const { isOn } = await shop();
    expect(await isOn('big-buttons')).toBe(true);
    flagd.set({ 'big-buttons': off });
    await vi.waitFor(async () => expect(await isOn('big-buttons')).toBe(false));
    flagd.set({});
    await vi.waitFor(async () => expect(await isOn('big-buttons')).toBe(false));
  });

  it('takes its address only from what the shop says, whatever FLAGD_* the pod has', async () => {
    const env = {
      FLAGD_HOST: 'flagd.invalid',
      FLAGD_PORT: '1',
      FLAGD_SYNC_PORT: '1',
      FLAGD_TLS: 'true',
      FLAGD_RESOLVER: 'rpc',
      FLAGD_SOCKET_PATH: '/nowhere.sock',
      FLAGD_OFFLINE_FLAG_SOURCE_PATH: '/nowhere.json',
      FLAGD_SOURCE_SELECTOR: 'nothing',
      FLAGD_SERVER_CERT_PATH: '/nowhere.crt',
      FLAGD_DEFAULT_AUTHORITY: 'elsewhere',
    };
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    try {
      flagd.set({ 'big-buttons': on });
      const { isOn } = await shop();
      expect(await isOn('big-buttons')).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('is off for an address that is not host:port', async () => {
    const flags = createFlags({ sync: 'http://flagd.flagd:8015/' });
    expect(flags.inStep()).toBe(false);
    const { base, server } = await serve(flags);
    opened.push({ flags, server });
    expect(await (await fetch(`${base}/flag/big-buttons`)).json()).toEqual({ on: false });
  });
});

describe('the evaluation context', () => {
  it('says whether the request carries the mark', async () => {
    flagd.set({ 'big-buttons': onWhen({ var: 'marked' }) });
    const { isOn } = await shop();
    expect(await isOn('big-buttons')).toBe(false);
    expect(await isOn('big-buttons', { 'x-unmeasured': '1' })).toBe(true);
    expect(await isOn('big-buttons', { 'x-unmeasured': '' })).toBe(true);
  });

  it('names the flags the preview cookie names, valid ones only', async () => {
    flagd.set({ 'big-buttons': onWhen({ in: ['big-buttons', { var: 'preview' }] }) });
    const { isOn } = await shop();
    expect(await isOn('big-buttons')).toBe(false);
    expect(await isOn('big-buttons', { cookie: 'preview=dark-mode.big-buttons' })).toBe(true);
    expect(await isOn('big-buttons', { cookie: 'other=1; preview=big-buttons' })).toBe(true);
    expect(await isOn('big-buttons', { cookie: 'preview=dark-mode' })).toBe(false);
    expect(await isOn('big-buttons', { cookie: 'xpreview=big-buttons' })).toBe(false);
  });

  it('leaves the flag set’s revision out of the preview, even when the cookie names it', async () => {
    flagd.set({
      'by-revision': onWhen({ in: [REVISION_FLAG, { var: 'preview' }] }),
      'by-preview': onWhen({ in: ['big-buttons', { var: 'preview' }] }),
    });
    const { isOn } = await shop();
    expect(await isOn('by-preview', { cookie: `preview=${REVISION_FLAG}.big-buttons` })).toBe(true);
    expect(await isOn('by-revision', { cookie: `preview=${REVISION_FLAG}.big-buttons` })).toBe(false);
    expect(await isOn('by-revision', { cookie: `preview=${REVISION_FLAG}` })).toBe(false);
  });

  it('names a flag asked for on this request, so the page asked for shows it', async () => {
    flagd.set({ 'big-buttons': onWhen({ in: ['big-buttons', { var: 'preview' }] }) });
    const { base } = await shop();
    const reply = await fetch(`${base}/flag/big-buttons?preview=big-buttons`);
    expect(await reply.json()).toEqual({ on: true });
  });

  it('carries the share id only when its signature checks out, and says so', async () => {
    flagd.set({
      'by-id': onWhen({ '==': [{ var: 'targetingKey' }, VECTOR.request.id] }),
      'by-signed': onWhen({ var: 'signed' }),
    });
    const { base } = await shop({
      key: shareKey(VECTOR.publicKey),
      now: () => (VECTOR.request.time + 30) * 1000,
    });
    const port = Number(new URL(base).port);
    const ask = (flag: string, headers: Record<string, string>) =>
      new Promise<boolean>((resolve, reject) => {
        // fetch sets its own Host, so the request is sent as the generator's is, to the host it signed for.
        const req = httpRequest(
          { host: '127.0.0.1', port, path: `/flag/${flag}`, headers: { host: VECTOR.request.host, ...headers } },
          (res) => {
            let body = '';
            res.on('data', (chunk) => {
              body += chunk;
            });
            res.on('end', () => resolve((JSON.parse(body) as { on: boolean }).on));
          },
        );
        req.on('error', reject);
        req.end();
      });
    const sign = (path: string) => signed({ ...VECTOR.request, path });
    expect(await ask('by-id', sign('/flag/by-id'))).toBe(true);
    expect(await ask('by-signed', sign('/flag/by-signed'))).toBe(true);
    // Made for another page, or not signed at all: no id, and not signed.
    expect(await ask('by-id', sign('/flag/by-signed'))).toBe(false);
    expect(await ask('by-signed', VECTOR.headers)).toBe(false);
    expect(await ask('by-id', { 'x-share-id': VECTOR.request.id })).toBe(false);
    expect(await ask('by-signed', { 'x-share-id': VECTOR.request.id })).toBe(false);
  });
});

describe('caching', () => {
  it('keeps an answer that asked about a flag, or sets the preview cookie, out of any cache between', async () => {
    flagd.set({ 'big-buttons': on, [REVISION_FLAG]: revision('r9') });
    const { base } = await shop();
    expect((await fetch(`${base}/flag/big-buttons`)).headers.get('cache-control')).toBe('private, no-store');
    expect((await fetch(`${base}/plain`)).headers.get('cache-control')).toBeNull();
    expect((await fetch(`${base}/plain?preview=big-buttons`)).headers.get('cache-control')).toBe('private, no-store');
  });

  it('keeps a reply out of any cache between once a flag was asked, whatever the reply', async () => {
    flagd.set({ 'big-buttons': on });
    const { base } = await shop();
    const page = await fetch(`${base}/broken`);
    expect(page.status).toBe(500);
    expect(page.headers.get('cache-control')).toBe('private, no-store');
    const api = await fetch(`${base}/api/broken`);
    expect(api.status).toBe(500);
    expect(api.headers.get('cache-control')).toBe('private, no-store');
    // A failed page sets no preview cookie, even when asked to.
    const asked = await fetch(`${base}/broken?preview=big-buttons`);
    expect(asked.status).toBe(500);
    expect(asked.headers.get('set-cookie')).toBeNull();

    // A not-found page that asks about a flag.
    const flags = createFlags({ sync: flagd.address, reconnectMs: 50 });
    const asks = await serve(flags, {
      notFound: (request) => {
        void request.flag(anyFlag('big-buttons'));
        return notFound(request);
      },
    });
    opened.push({ flags, server: asks.server });
    const missing = await fetch(`${asks.base}/nowhere`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toBe('private, no-store');
    expect((await fetch(`${base}/nowhere`)).headers.get('cache-control')).toBeNull();
  });

  it('keeps a reply that tells the flag set’s revision out of any cache between, and only that one', async () => {
    flagd.set({ [REVISION_FLAG]: revision('r9') });
    const { base } = await shop();
    const marked = { headers: { 'x-unmeasured': '1' } };
    for (const path of ['/plain', '/health', '/nowhere', '/assets/site.css']) {
      expect((await fetch(`${base}${path}`, marked)).headers.get('cache-control')).toBe('private, no-store');
    }
    const unchanged = await fetch(`${base}/assets/site.css`, {
      headers: { ...marked.headers, 'if-none-match': '"site"' },
    });
    expect(unchanged.status).toBe(304);
    expect(unchanged.headers.get('cache-control')).toBe('private, no-store');
    expect(unchanged.headers.get('x-flags-revision')).toBe('r9');
    expect((await fetch(`${base}/plain`)).headers.get('cache-control')).toBeNull();
    expect((await fetch(`${base}/assets/site.css`)).headers.get('cache-control')).toBe('no-cache');
  });

  it('puts the flag context’s headers on last, so a route cannot undo them', async () => {
    flagd.set({ 'big-buttons': on, [REVISION_FLAG]: revision('r9') });
    const { base } = await shop();
    const asked = await fetch(`${base}/greedy?preview=big-buttons`, { headers: { 'x-unmeasured': '1' } });
    expect(asked.headers.get('cache-control')).toBe('private, no-store');
    expect(asked.headers.getSetCookie()).toEqual([
      'preview=big-buttons; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax',
    ]);
    expect(asked.headers.get('x-flags-revision')).toBe('r9');
  });
});

describe('a stale flag set', () => {
  it('is served for up to a minute without flagd, and then every flag is off until flagd is back', async () => {
    let now = 1_000_000;
    flagd.set({ 'big-buttons': on, [REVISION_FLAG]: revision('r7') });
    const { flags, base, isOn } = await shop({ now: () => now });
    const told = async () =>
      (await fetch(`${base}/flag/big-buttons`, { headers: { 'x-unmeasured': '1' } })).headers.get('x-flags-revision');
    expect(await told()).toBe('r7');

    await flagd.stop();
    await vi.waitFor(() => expect(flags.inStep()).toBe(false));
    now += STALE_AFTER_MS - 1;
    expect(await isOn('big-buttons')).toBe(true);
    expect(await told()).toBe('r7');
    now += 1;
    expect(await isOn('big-buttons')).toBe(false);
    expect(await told()).toBe('stale');

    await flagd.restart();
    await vi.waitFor(() => expect(flags.inStep()).toBe(true), { timeout: 10_000 });
    expect(await isOn('big-buttons')).toBe(true);
    expect(await told()).toBe('r7');
  });
});

describe('a sync that falls silent', () => {
  it('is opened again when flagd ends its stream cleanly, and serves flagd’s flag set again, with no restart', async () => {
    let now = 5_000_000;
    flagd.set({ 'big-buttons': on });
    const { flags, isOn } = await shop({ now: () => now, watchMs: 20 });
    const before = flagd.connections();
    // The provider does not reconnect after a clean end, and says nothing: only the silence tells.
    flagd.end();
    now += 60_000 + 5_000;
    await vi.waitFor(() => expect(flagd.connections()).toBe(before + 1));
    expect(await isOn('big-buttons')).toBe(true);
    // One stream, not two: opening it again starts no second loop beside the provider's.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(flagd.connections()).toBe(before + 1);
    flagd.set({ 'big-buttons': off });
    await vi.waitFor(async () => expect(await isOn('big-buttons')).toBe(false));
    flagd.set({ 'big-buttons': on });
    await vi.waitFor(async () => expect(await isOn('big-buttons')).toBe(true));
    // Heard from again, so a minute on it is still fresh.
    now += 60_000 + 5_000 - 1;
    expect(await isOn('big-buttons')).toBe(true);
    expect(flags.inStep()).toBe(true);
  });

  it('opens the first stream again when flagd ends it before sending any flag set', async () => {
    let now = 4_000_000;
    flagd.set({ 'big-buttons': on });
    const before = flagd.connections();
    flagd.mute(true);
    const flags = createFlags({ sync: flagd.address, reconnectMs: 50, now: () => now, watchMs: 20 });
    const { base, server } = await serve(flags);
    opened.push({ flags, server });
    await vi.waitFor(() => expect(flagd.connections()).toBe(before + 1));
    expect(flags.inStep()).toBe(false);
    expect(await (await fetch(`${base}/flag/big-buttons`)).json()).toEqual({ on: false });
    flagd.mute(false);
    now += 60_000 + 5_000;
    await vi.waitFor(() => expect(flags.inStep()).toBe(true), { timeout: 5_000 });
    expect(flagd.connections()).toBe(before + 2);
    expect(await (await fetch(`${base}/flag/big-buttons`)).json()).toEqual({ on: true });
  });

  it('tries again when flagd ends the stream it opens again too, before sending anything', async () => {
    let now = 6_000_000;
    flagd.set({ 'big-buttons': on });
    const { flags, isOn } = await shop({ now: () => now, watchMs: 20 });
    const before = flagd.connections();
    flagd.mute(true);
    flagd.end();
    now += 60_000 + 5_000;
    await vi.waitFor(() => expect(flagd.connections()).toBe(before + 1));
    expect(flags.inStep()).toBe(false);
    now += STALE_AFTER_MS - 5_000;
    expect(await isOn('big-buttons')).toBe(false);
    flagd.mute(false);
    now += 5_000 + 60_000;
    await vi.waitFor(() => expect(flags.inStep()).toBe(true), { timeout: 5_000 });
    expect(flagd.connections()).toBe(before + 2);
    expect(await isOn('big-buttons')).toBe(true);
  });

  it('is off once silent past a stream and a minute while flagd is away, and back when flagd is', async () => {
    let now = 7_000_000;
    flagd.set({ 'big-buttons': on });
    const { flags, isOn } = await shop({ now: () => now, watchMs: 20 });
    flagd.end();
    await flagd.stop();
    now += 60_000 + STALE_AFTER_MS - 1;
    expect(await isOn('big-buttons')).toBe(true);
    now += 1;
    expect(await isOn('big-buttons')).toBe(false);
    // Opening it again finds flagd away, and the provider says so, and reconnects by itself.
    await vi.waitFor(() => expect(flags.inStep()).toBe(false), { timeout: 5_000 });
    await flagd.restart();
    await vi.waitFor(() => expect(flags.inStep()).toBe(true), { timeout: 10_000 });
    expect(await isOn('big-buttons')).toBe(true);
  });

  it('is not stale while each stream is renewed in its time', async () => {
    let now = 9_000_000;
    flagd.set({ 'big-buttons': on });
    const before = flagd.connections();
    const { isOn } = await shop({ now: () => now, streamMs: 100 });
    for (let renewal = 1; renewal <= 3; renewal += 1) {
      now += 100 + STALE_AFTER_MS - 1_000;
      // Each stream's deadline ends it, and the provider opens another: a sign of life at the clock's time.
      const seen = flagd.connections();
      await vi.waitFor(() => expect(flagd.connections()).toBeGreaterThan(seen), { timeout: 5_000 });
      await vi.waitFor(async () => expect(await isOn('big-buttons')).toBe(true));
    }
    expect(flagd.connections() - before).toBeGreaterThanOrEqual(4);
  });
});

describe('the flag set’s revision', () => {
  it('is told to a marked request only', async () => {
    flagd.set({ [REVISION_FLAG]: revision('2026-10-26T08:00:00Z.3') });
    const { base } = await shop();
    const marked = await fetch(`${base}/flag/x`, { headers: { 'x-unmeasured': '1' } });
    expect(marked.headers.get('x-flags-revision')).toBe('2026-10-26T08:00:00Z.3');
    const health = await fetch(`${base}/health`, { headers: { 'x-unmeasured': '1' } });
    expect(health.headers.get('x-flags-revision')).toBe('2026-10-26T08:00:00Z.3');
    expect((await fetch(`${base}/flag/x`)).headers.get('x-flags-revision')).toBeNull();
    expect((await fetch(`${base}/health`)).headers.get('x-flags-revision')).toBeNull();
  });

  it('is none when the flag set has no revision, or there is no flag set', async () => {
    flagd.set({ 'big-buttons': on });
    const { base } = await shop();
    const marked = { headers: { 'x-unmeasured': '1' } };
    expect((await fetch(`${base}/flag/x`, marked)).headers.get('x-flags-revision')).toBe('none');
    const alone = await serve(createFlags());
    opened.push({ flags: createFlags(), server: alone.server });
    expect((await fetch(`${alone.base}/flag/x`, marked)).headers.get('x-flags-revision')).toBe('none');
  });

  it.each(['none', 'stale', 'invalid'])(
    'is invalid when the revision is spelt %s, a word the header keeps',
    async (word) => {
      flagd.set({ [REVISION_FLAG]: revision(word) });
      const { base } = await shop();
      const marked = { headers: { 'x-unmeasured': '1' } };
      expect((await fetch(`${base}/flag/x`, marked)).headers.get('x-flags-revision')).toBe('invalid');
    },
  );

  it('is invalid when it is not fit for a header', async () => {
    flagd.set({ [REVISION_FLAG]: revision('two words') });
    const { base } = await shop();
    const marked = { headers: { 'x-unmeasured': '1' } };
    expect((await fetch(`${base}/flag/x`, marked)).headers.get('x-flags-revision')).toBe('invalid');
  });
});
