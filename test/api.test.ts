import { describe, expect, it } from 'vitest';
import { useShop } from './support/shop.ts';

const shop = useShop();
const get = async (path: string) => {
  const res = await fetch(shop.url(path));
  // biome-ignore lint/suspicious/noExplicitAny: the tests say what shape they expect
  return { status: res.status, type: res.headers.get('content-type'), body: (await res.json()) as any };
};

describe('GET /api/products', () => {
  it('can be limited to a department', async () => {
    const { body } = await get('/api/products?department=shed');
    expect(body.total).toBe(10);
  });

  it('answers 404 for a page or a department that does not exist', async () => {
    for (const query of ['page=4', 'page=0', 'page=two', 'department=attic']) {
      expect((await get(`/api/products?${query}`)).status, query).toBe(404);
    }
  });
});

describe('GET /api/products/:slug', () => {
  it('returns one product, with its notes', async () => {
    const { status, body } = await get('/api/products/thing-3');
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: 3, name: 'Thing, number 3', notes: 'Notes on thing 3.', price: '£1.75' });
  });
});

describe('GET /api/search', () => {
  it('returns the products that match', async () => {
    const { status, body } = await get('/api/search?q=lucky');
    expect(status).toBe(200);
    expect(body.query).toBe('lucky');
    expect(body.products.map((p: { id: number }) => p.id)).toEqual([7]);
  });

  it('returns nothing without a query', async () => {
    expect((await get('/api/search')).body.products).toEqual([]);
  });
});
