/**
 * The share's signed ids, checked against the factory's contract and its test vector (support/share.ts).
 */
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { shareKey, shareKeyFile } from '../src/flags/index.ts';
import { shareMessage, signedId } from '../src/flags/share.ts';
import { signed, VECTOR } from './support/share.ts';

const KEY = shareKey(VECTOR.publicKey).current();
const { host, method, path, time } = VECTOR.request;

/** The request as the shop sees it: each header as often as it was sent. */
const request = (
  headers: Record<string, string | string[]>,
  target: { host: string; method: string; path: string } = { host, method, path },
) => ({
  method: target.method,
  url: target.path,
  headersDistinct: Object.fromEntries(
    Object.entries({ host: target.host, ...headers }).map(([name, value]) => [name, [value].flat()]),
  ),
});

describe('a share id', () => {
  it('builds the contract’s message', () => {
    expect(shareMessage({ ...VECTOR.request, time: String(time) }).toString('hex')).toBe(VECTOR.message);
  });

  it('is signed by the test vector, through the minute after its time', () => {
    expect(KEY).toBeDefined();
    expect(signedId(request(VECTOR.headers), KEY, time)).toBe('traffic-007');
    expect(signedId(request(VECTOR.headers), KEY, time + 59)).toBe('traffic-007');
  });

  it('is not signed when the signature is a minute old, or from the future', () => {
    expect(signedId(request(VECTOR.headers), KEY, time + 60)).toBeUndefined();
    expect(signedId(request(VECTOR.headers), KEY, time - 1)).toBeUndefined();
  });

  it('is not signed by a bad signature', () => {
    const signature = VECTOR.headers['x-share-signature'];
    const bad = `${signature.slice(0, 10)}${signature[10] === 'A' ? 'B' : 'A'}${signature.slice(11)}`;
    expect(signedId(request({ ...VECTOR.headers, 'x-share-signature': bad }), KEY, time)).toBeUndefined();
    // The same 64 bytes, spelt otherwise: its last character carries two bits the encoding leaves unused.
    const respelt = `${signature.slice(0, 85)}${signature[85] === 'w' ? 'x' : 'w'}`;
    expect(signedId(request({ ...VECTOR.headers, 'x-share-signature': respelt }), KEY, time)).toBeUndefined();
    expect(signedId(request({ ...VECTOR.headers, 'x-share-signature': `${signature}=` }), KEY, time)).toBeUndefined();
  });

  it('is not signed by another key, or without one', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const other = signed(VECTOR.request, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    expect(signedId(request(other), KEY, time)).toBeUndefined();
    expect(signedId(request(VECTOR.headers), undefined, time)).toBeUndefined();
  });

  it.each(['x-share-id', 'x-share-time', 'x-share-signature'] as const)('is not signed without %s', (name) => {
    const { [name]: _, ...rest } = VECTOR.headers;
    expect(signedId(request(rest), KEY, time)).toBeUndefined();
  });

  it.each(['x-share-id', 'x-share-time', 'x-share-signature', 'host'] as const)(
    'is not signed when %s comes twice',
    (name) => {
      const headers = { ...VECTOR.headers, host };
      expect(signedId(request({ ...headers, [name]: [headers[name], headers[name]] }), KEY, time)).toBeUndefined();
    },
  );

  it('is not signed by a signature made for another path, host or method', () => {
    expect(signedId(request(VECTOR.headers, { host, method, path: '/search?q=gloves' }), KEY, time)).toBeUndefined();
    expect(signedId(request(VECTOR.headers, { host, method, path: '/search' }), KEY, time)).toBeUndefined();
    expect(
      signedId(request(VECTOR.headers, { host: 'website.localhost:8080', method, path }), KEY, time),
    ).toBeUndefined();
    expect(signedId(request(VECTOR.headers, { host: 'elsewhere.localhost', method, path }), KEY, time)).toBeUndefined();
    expect(signedId(request(VECTOR.headers, { host, method: 'POST', path }), KEY, time)).toBeUndefined();
  });

  it('reads the host in lower case, and the method in upper case', () => {
    expect(signedId(request(VECTOR.headers, { host: 'Website.LOCALHOST', method: 'get', path }), KEY, time)).toBe(
      'traffic-007',
    );
  });

  it('is not signed when the time is not all digits, even signed as it was sent', () => {
    for (const bad of ['+1793001600', '1793001600.0', ' 1793001600', '1.793001600e9', '0x6adf0880']) {
      expect(signedId(request(signed({ ...VECTOR.request, time: bad })), KEY, time), bad).toBeUndefined();
    }
    expect(signedId(request(signed({ ...VECTOR.request, time: '1793001600' })), KEY, time)).toBe('traffic-007');
  });
});

describe('the share key', () => {
  const directory = mkdtempSync(join(tmpdir(), 'share-key-'));
  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  it('is read from its file', () => {
    const file = join(directory, 'public-key');
    writeFileSync(file, VECTOR.publicKey);
    expect(signedId(request(VECTOR.headers), shareKeyFile(file).current(), time)).toBe('traffic-007');
  });

  it('is none when there is no file, or none named', () => {
    expect(shareKeyFile(join(directory, 'missing')).current()).toBeUndefined();
    expect(shareKeyFile(undefined).current()).toBeUndefined();
  });

  it('is none when the file is not an Ed25519 public key', () => {
    const file = join(directory, 'not-a-key');
    writeFileSync(file, 'not a key\n');
    expect(shareKeyFile(file).current()).toBeUndefined();
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ type: 'spki', format: 'pem' });
    writeFileSync(file, ec);
    expect(shareKeyFile(file).current()).toBeUndefined();
  });

  it('is read again a minute later, so a key mounted after the shop starts is taken up', () => {
    const file = join(directory, 'later');
    let now = 0;
    const key = shareKeyFile(file, () => now);
    expect(key.current()).toBeUndefined();
    writeFileSync(file, VECTOR.publicKey);
    now = 59_999;
    expect(key.current()).toBeUndefined();
    now = 60_000;
    expect(key.current()).toBeDefined();
  });
});
