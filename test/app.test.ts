import { describe, expect, it } from 'vitest';
import { COMMIT, useShop } from './support/shop.ts';

const shop = useShop();

describe('the shop', () => {
  it('reports its health', async () => {
    const res = await fetch(shop.url('/health'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('reports the commit it was built from', async () => {
    expect(await (await fetch(shop.url('/version'))).json()).toEqual({ commit: COMMIT });
  });

  it('answers HEAD like GET, without the body', async () => {
    const res = await fetch(shop.url('/api/products'), { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(Number(res.headers.get('content-length'))).toBeGreaterThan(0);
    expect(await res.text()).toBe('');
  });

  it('says which methods an address takes', async () => {
    const res = await fetch(shop.url('/api/products'), { method: 'DELETE' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, HEAD');
  });
});

describe('files', () => {
  it('are served with their type', async () => {
    const res = await fetch(shop.url('/assets/site.css'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/css; charset=utf-8');
  });

  it('answer a conditional request with 304', async () => {
    const etag = (await fetch(shop.url('/assets/site.css'))).headers.get('etag') ?? '';
    const again = await fetch(shop.url('/assets/site.css'), { headers: { 'if-none-match': etag } });
    expect(again.status).toBe(304);
  });
});
