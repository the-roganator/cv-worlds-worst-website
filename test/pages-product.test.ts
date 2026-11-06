import { describe, expect, it } from 'vitest';
import { longDate } from '../src/pages/product.ts';
import { linksOf, tags, textOf } from './support/html.ts';
import { useShop } from './support/shop.ts';

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
