import { describe, expect, it } from 'vitest';
import { createCatalogue } from '../src/catalogue.ts';
import { longDate } from '../src/pages/product.ts';
import { linksOf, tags, textOf } from './support/html.ts';
import { useDatabase, useShop } from './support/shop.ts';

const shop = useShop();

describe('a product page', () => {
  it('shows the product’s name, price and summary', async () => {
    const { status, body } = await shop.get('/products/thing-5');
    expect(status).toBe(200);
    expect(tags(body, 'h1')[0]?.text).toBe('Thing, number 5');
    expect(tags(body, 'title')[0]?.text).toBe("Thing, number 5 · Mossop's Practical Sundries");
    expect(textOf(body)).toContain('Thing, number 5 £2.25 A thing for the garden.');
  });

  it('gives its item number, department and stock', async () => {
    const { body } = await shop.get('/products/thing-5');
    expect(textOf(body)).toContain('Item 5 Department Garden Stock 1 in stock');
    expect(linksOf(body)).toContain('/products?department=garden');
  });

  it('shows Gerald’s notes, and how to buy', async () => {
    const { body } = await shop.get('/products/thing-5');
    expect(textOf(body)).toContain("Gerald's notes Notes on thing 5.");
    expect(textOf(body)).toContain('To buy it, write to us and mention item 5.');
  });

  it('says when it was last dusted', async () => {
    expect(textOf((await shop.get('/products/thing-5')).body)).toContain('Last dusted Tuesday 29 September');
  });

  it('renders a product that has never been dusted, without a last-dusted date', async () => {
    const { status, body } = await shop.get('/products/thing-6');
    expect(status).toBe(200);
    expect(tags(body, 'h1')[0]?.text).toBe('Thing, number 6');
    expect(textOf(body)).toContain('Item 6');
    expect(textOf(body)).not.toContain('Invalid');
    expect(textOf(body)).not.toMatch(/Last dusted\s*(Invalid|$)/);
  });

  it('answers 404 for a product we do not stock', async () => {
    expect((await shop.get('/products/thing-99')).status).toBe(404);
  });

  it('answers 404 for an address that is not properly encoded', async () => {
    expect((await shop.get('/products/%E0%A4%A')).status).toBe(404);
  });
});

describe('longDate', () => {
  it('writes a date the way Gerald would say it', () => {
    expect(longDate('2026-09-29')).toBe('Tuesday 29 September');
    expect(longDate('2026-03-02')).toBe('Monday 2 March');
  });
});

describe('customers also considered', () => {
  it('never links to the product being viewed', async () => {
    const { body } = await shop.get('/products/thing-5');
    const considered = body.slice(body.indexOf('also considered'));
    expect(linksOf(considered)).not.toContain('/products/thing-5');
  });
});

describe('customers also considered, for every product in a department', () => {
  const held = useDatabase();

  it('offers three other products from the same department', () => {
    const catalogue = createCatalogue(held.db);
    for (const id of [1, 2, 3, 4, 7, 28, 29, 30]) {
      const product = catalogue.product(`thing-${id}`);
      if (!product) throw new Error(`no thing-${id}`);
      const others = catalogue.alsoConsidered(product);
      expect(others).toHaveLength(3);
      expect(others.map((o) => o.id)).not.toContain(product.id);
      expect(others.every((o) => o.department === product.department)).toBe(true);
    }
  });

  it('never links to the product viewed, on any product page', async () => {
    for (const id of [1, 2, 3, 28, 29, 30]) {
      const { body } = await shop.get(`/products/thing-${id}`);
      const considered = body.slice(body.indexOf('also considered'));
      expect(linksOf(considered)).not.toContain(`/products/thing-${id}`);
    }
  });
});

describe('the stock entry', () => {
  const real = useShop({ catalogue: 'real' });

  it('gives the real count for the doorstop, never "Plenty"', async () => {
    const text = textOf((await real.get('/products/doorstop')).body);
    expect(text).toContain('Stock 6 in stock');
    expect(text).not.toContain('Plenty in stock');
  });
});
