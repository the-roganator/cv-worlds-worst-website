import { describe, expect, it } from 'vitest';
import { linksOf, tags, textOf } from './support/html.ts';
import { useShop } from './support/shop.ts';

const shop = useShop();

describe('the home page', () => {
  it('lists the departments, each with its blurb', async () => {
    const { body } = await shop.get('/');
    expect(linksOf(body).filter((href) => href.startsWith('/departments/'))).toEqual([
      '/departments/kitchen',
      '/departments/garden',
      '/departments/shed',
    ]);
    expect(textOf(body)).toContain('Garden Things for the garden.');
  });

  it('shows this week’s four sundries', async () => {
    const { body } = await shop.get('/');
    expect(tags(body, 'h3').map((h) => h.text)).toEqual([
      'Thing, number 1',
      'Thing, number 2',
      'Thing, number 3',
      'Thing, number 4',
    ]);
  });

  it('explains how to buy, with a link to the contact page', async () => {
    const { body } = await shop.get('/');
    expect(textOf(body)).toContain('There is no basket.');
    expect(linksOf(body)).toContain('/contact');
  });
});
