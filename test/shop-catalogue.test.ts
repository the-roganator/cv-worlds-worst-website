/**
 * About what the shop really sells: data/catalogue.json, and the drawings that go with it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CatalogueFile } from '../scripts/seed.ts';
import { tags } from './support/html.ts';
import { useShop } from './support/shop.ts';

const fromRoot = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const catalogue = JSON.parse(readFileSync(fromRoot('data/catalogue.json'), 'utf-8')) as CatalogueFile;
const shop = useShop({ catalogue: 'real' });

describe('the catalogue', () => {
  it('numbers its items from 1, with no gaps', () => {
    expect(catalogue.products.map((p) => p.id)).toEqual(catalogue.products.map((_, i) => i + 1));
  });

  it('gives every product an address of its own', () => {
    const slugs = catalogue.products.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('puts every product in a department, and something in every department', () => {
    const departments = catalogue.departments.map((d) => d.slug);
    for (const product of catalogue.products) expect(departments, product.slug).toContain(product.department);
    for (const slug of departments)
      expect(
        catalogue.products.some((p) => p.department === slug),
        slug,
      ).toBe(true);
  });

  it('prices everything at a penny or more', () => {
    for (const product of catalogue.products) {
      expect(Number.isInteger(product.pricePence) && product.pricePence > 0, product.slug).toBe(true);
    }
  });

  it('describes every product, and its drawing', () => {
    for (const product of catalogue.products) {
      for (const field of ['name', 'summary', 'notes', 'drawingAlt'] as const) {
        expect(product[field].trim().length, `${product.slug} ${field}`).toBeGreaterThan(5);
      }
    }
  });

  it('features four products on the home page', () => {
    expect(catalogue.products.filter((p) => p.featured)).toHaveLength(4);
  });

  it('has a drawing for every product', () => {
    for (const product of catalogue.products) {
      expect(existsSync(fromRoot(`public/drawings/${product.slug}.svg`)), product.slug).toBe(true);
    }
  });
});

describe('the shop, with its real catalogue', () => {
  it.each(['/', '/products', '/products?page=2', '/products?page=3'])('loads every drawing on %s', async (path) => {
    const images = tags((await shop.get(path)).body, 'img').map((img) => img.attributes.src ?? '');
    expect(images.length).toBeGreaterThan(3);
    for (const src of images) {
      const drawing = await shop.get(src);
      expect(drawing.status, src).toBe(200);
      expect(drawing.headers.get('content-type')).toBe('image/svg+xml');
    }
  });

  it('shows the price in the catalogue', async () => {
    const { body } = await shop.get('/products/ladder-one-rung');
    expect(tags(body, 'p').find((p) => p.attributes.class === 'price')?.text).toBe('£8.50');
  });
});
