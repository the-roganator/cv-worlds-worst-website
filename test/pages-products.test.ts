import { describe, expect, it } from 'vitest';
import { tags, textOf } from './support/html.ts';
import { useShop } from './support/shop.ts';

const shop = useShop();

describe('the product list', () => {
  it('says "Sorry, none in stock" when there is none', async () => {
    expect(textOf((await shop.get('/products')).body)).toContain('Item 4 · Sorry, none in stock');
  });
});

describe('pages of the product list', () => {
  it('says which page this is, and links to the next', async () => {
    const { body } = await shop.get('/products');
    expect(textOf(body)).toContain('Page 1 of 3');
    expect(
      tags(body, 'a')
        .filter((a) => a.attributes.rel)
        .map((a) => [a.attributes.rel, a.attributes.href]),
    ).toEqual([['next', '/products?page=2']]);
  });

  it.each(['4', '0', '-1', 'two', '1.5'])('answers 404 for page %s', async (page) => {
    expect((await shop.get(`/products?page=${page}`)).status).toBe(404);
  });
});

describe('a department', () => {
  it('is marked in the list of departments', async () => {
    const marked = async (path: string) =>
      tags((await shop.get(path)).body, 'a')
        .filter((a) => a.attributes['aria-current'] === 'true')
        .map((a) => a.text);
    expect(await marked('/products?department=garden')).toEqual(['Garden']);
    expect(await marked('/products')).toEqual(['Everything']);
  });

  it('answers 404 when there is no such department', async () => {
    expect((await shop.get('/products?department=attic')).status).toBe(404);
  });

  it('answers 404 at the plainer address when there is no such department', async () => {
    expect((await shop.get('/departments/attic')).status).toBe(404);
  });
});
