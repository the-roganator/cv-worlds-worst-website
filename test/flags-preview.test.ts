/**
 * The preview cookie, as the factory's contract has it (docs/COMPONENTS/FEATURE-FLAGS.md, "The preview cookie", in
 * the-roganator/cv-software-factory): set only for an ask that names flags flagd knows, for exactly a day, and never
 * echoed. The factory's probes hold its attributes; these tests hold the lifetime and the "flagd knows it" rule.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFlags, type Flags, REVISION_FLAG } from '../src/flags/index.ts';
import { log } from '../src/log.ts';
import { type FakeFlagd, off, on, revision, startFlagd } from './support/flagd.ts';
import { tags } from './support/html.ts';
import { useShop } from './support/shop.ts';

let flagd: FakeFlagd;
let flags: Flags;
beforeAll(async () => {
  flagd = await startFlagd({
    'big-buttons': off,
    'dark-mode': on,
    'quiet-mode': { ...on, state: 'DISABLED' },
    [REVISION_FLAG]: revision('r1'),
  });
});
const shop = useShop({
  flags: () => {
    flags = createFlags({ sync: flagd.address, reconnectMs: 50 });
    return flags;
  },
});
beforeAll(() => vi.waitFor(() => expect(flags.inStep()).toBe(true)));
afterAll(async () => {
  await flags.close();
  await flagd.stop();
});

const ask = (path: string, headers: Record<string, string> = {}) =>
  fetch(shop.url(path), { headers, redirect: 'manual' });
const setCookie = async (path: string, headers: Record<string, string> = {}) =>
  (await ask(path, headers)).headers.getSetCookie();

describe('asking to preview a flag', () => {
  it('sets the preview cookie, for a day, read only by the shop', async () => {
    expect(await setCookie('/?preview=big-buttons')).toEqual([
      'preview=big-buttons; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax',
    ]);
  });

  it('keeps that answer out of any cache between', async () => {
    expect((await ask('/?preview=big-buttons')).headers.get('cache-control')).toBe('private, no-store');
    expect((await ask('/?preview=no-such-flag')).headers.get('cache-control')).toBeNull();
  });

  it('works on any page, whatever else its address asks', async () => {
    expect(await setCookie('/products?page=2&preview=big-buttons')).toEqual([
      'preview=big-buttons; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax',
    ]);
    expect(await setCookie('/products/thing-1?preview=big-buttons')).toHaveLength(1);
  });

  it('counts a flag flagd knows whatever its state, since flagd decides whether it is on', async () => {
    expect(await setCookie('/?preview=quiet-mode')).toEqual([
      'preview=quiet-mode; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax',
    ]);
  });

  it('adds the flag to those the cookie names that flagd still knows, each once, in the order asked', async () => {
    const cookie = { cookie: 'preview=dark-mode.gone-now.big-buttons' };
    expect(await setCookie('/?preview=quiet-mode', cookie)).toEqual([
      'preview=dark-mode.big-buttons.quiet-mode; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax',
    ]);
    expect(await setCookie('/?preview=dark-mode', cookie)).toEqual([
      'preview=dark-mode.big-buttons; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax',
    ]);
    expect(await setCookie('/?preview=big-buttons&preview=dark-mode&preview=big-buttons')).toEqual([
      'preview=big-buttons.dark-mode; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax',
    ]);
  });

  it('is Secure exactly when the request reached the shop over HTTPS', async () => {
    expect(await setCookie('/?preview=big-buttons', { 'x-forwarded-proto': 'https' })).toEqual([
      'preview=big-buttons; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax; Secure',
    ]);
    expect(await setCookie('/?preview=big-buttons', { 'x-forwarded-proto': 'http' })).toEqual([
      'preview=big-buttons; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax',
    ]);
  });

  it.each([
    ['a flag flagd does not know', '/?preview=no-such-flag'],
    ['the flag set’s revision, which is not a feature', `/?preview=${REVISION_FLAG}`],
    ['a name no flag may have', '/?preview=Big_Buttons'],
    ['nothing', '/?preview='],
    ['one flag flagd knows and one it does not', '/?preview=big-buttons&preview=no-such-flag'],
  ])('changes nothing for %s', async (_, path) => {
    expect(await setCookie(path)).toEqual([]);
    expect(await setCookie(path, { cookie: 'preview=dark-mode' })).toEqual([]);
  });

  it('sets nothing on a page that does not exist, a file, the API, a redirect, a form, the health check or a request it refuses', async () => {
    expect(await setCookie('/no-such-page?preview=big-buttons')).toEqual([]);
    expect(await setCookie('/assets/site.css?preview=big-buttons')).toEqual([]);
    expect(await setCookie('/api/products?preview=big-buttons')).toEqual([]);
    expect(await setCookie('/departments/shed?preview=big-buttons')).toEqual([]);
    expect(await setCookie('/health?preview=big-buttons')).toEqual([]);
    const posted = await fetch(shop.url('/contact?preview=big-buttons'), {
      method: 'POST',
      body: new URLSearchParams({ name: 'Ada', email: 'ada@example.org', message: 'Hello.' }),
    });
    expect(posted.headers.getSetCookie()).toEqual([]);
  });

  it('is never echoed: not in the page, a redirect or the log', async () => {
    const info = vi.spyOn(log, 'info');
    try {
      const page = await ask('/search?q=glove&preview=big-buttons');
      const body = await page.text();
      expect(body).not.toContain('big-buttons');
      expect(body).not.toContain('preview');
      const hidden = tags(body, 'input').find((input) => input.attributes.name === 'page');
      expect(hidden?.attributes.value).toBe('/search?q=glove');
      const moved = await ask('/departments/shed?preview=big-buttons');
      expect(moved.status).toBe(308);
      expect(await moved.text()).not.toContain('preview');
      expect(JSON.stringify(info.mock.calls)).not.toContain('big-buttons');
    } finally {
      info.mockRestore();
    }
  });
});

describe('without asking', () => {
  it('sets no cookie, and does not renew one it set', async () => {
    expect(await setCookie('/')).toEqual([]);
    expect(await setCookie('/', { cookie: 'preview=big-buttons' })).toEqual([]);
  });
});
