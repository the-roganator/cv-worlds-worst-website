import { describe, expect, it } from 'vitest';
import { useShop } from './support/shop.ts';

const shop = useShop();

const EXPECTED = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

describe('security headers', () => {
  it.each(['/', '/api/products', '/assets/site.css', '/health', '/no-such-page'])('are sent with %s', async (path) => {
    const res = await fetch(shop.url(path));
    for (const [name, value] of Object.entries(EXPECTED)) expect(res.headers.get(name), name).toBe(value);
  });

  it('say nothing about what the server runs on', async () => {
    const res = await fetch(shop.url('/'));
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('server')).toBeNull();
  });
});
