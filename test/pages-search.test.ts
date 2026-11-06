import { describe, expect, it } from 'vitest';
import { tags, textOf } from './support/html.ts';
import { useShop } from './support/shop.ts';

const shop = useShop();
const names = (body: string) => tags(body, 'h3').map((h) => h.text);

describe('the search page', () => {
  it('asks what the visitor is looking for', async () => {
    const { status, body } = await shop.get('/search');
    expect(status).toBe(200);
    expect(tags(body, 'h2')).toEqual([]);
    expect(tags(body, 'form')[0]?.attributes).toMatchObject({ method: 'get', action: '/search', role: 'search' });
  });

  it('shows the products that match, and says how many', async () => {
    const { body } = await shop.get('/search?q=number+21');
    expect(tags(body, 'h2')[0]?.text).toBe('2 items match “number 21”');
    expect(names(body)).toEqual(['Thing, number 21', 'Thing, number 2']);
  });

  it('counts one item as one item', async () => {
    expect(tags((await shop.get('/search?q=lucky')).body, 'h2')[0]?.text).toBe('One item matches “lucky”');
  });

  it('says so when nothing matches', async () => {
    const { status, body } = await shop.get('/search?q=trampoline');
    expect(status).toBe(200);
    expect(tags(body, 'h2')[0]?.text).toBe('Nothing matches “trampoline”');
    expect(textOf(body)).toContain('We have noted the gap in our range.');
  });

  it('keeps the query in the box', async () => {
    const { body } = await shop.get('/search?q=lucky');
    expect(tags(body, 'input').find((input) => input.attributes.name === 'q')?.attributes.value).toBe('lucky');
  });

  it('shows a query as text, whatever it contains', async () => {
    const { body } = await shop.get(`/search?q=${encodeURIComponent('<script>alert(1)</script>')}`);
    expect(body).not.toContain('<script>alert(1)</script>');
    expect(body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
