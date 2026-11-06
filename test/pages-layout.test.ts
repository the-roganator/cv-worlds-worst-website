import { describe, expect, it } from 'vitest';
import { tags } from './support/html.ts';
import { useShop } from './support/shop.ts';

const shop = useShop();
const PAGES = ['/', '/products', '/products/thing-1', '/search', '/about', '/contact', '/privacy', '/no-such-page'];

describe('every page', () => {
  it.each(PAGES)('%s is an HTML document in British English, titled for the shop', async (path) => {
    const { headers, body } = await shop.get(path);
    expect(headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(body).toMatch(/^<!doctype html>\n<html lang="en-GB">/);
    expect(tags(body, 'title')[0]?.text).toMatch(/ · Mossop's Practical Sundries$/);
    expect(tags(body, 'h1')).toHaveLength(1);
  });

  it.each(PAGES)('%s offers the same way round the shop', async (path) => {
    const { body } = await shop.get(path);
    const navigation = body.slice(body.indexOf('<nav aria-label="Main">'), body.indexOf('</nav>'));
    expect(tags(navigation, 'a').map((a) => [a.attributes.href, a.text])).toEqual([
      ['/products', 'Products'],
      ['/search', 'Search'],
      ['/about', 'About'],
      ['/contact', 'Contact'],
    ]);
    expect(body).toContain('<a class="skip" href="#main">');
    expect(body).toContain('<main id="main">');
  });

  it('marks where the visitor is', async () => {
    const current = async (path: string) =>
      tags((await shop.get(path)).body, 'a')
        .filter((a) => a.attributes['aria-current'] === 'page')
        .map((a) => a.text);
    expect(await current('/about')).toEqual(['About']);
    expect(await current('/products?page=2')).toEqual(['Products']);
    expect(await current('/')).toEqual([]);
  });

  it.each(PAGES)('%s fetches nothing from anywhere else', async (path) => {
    const { body } = await shop.get(path);
    const fetched = [...tags(body, 'link'), ...tags(body, 'script'), ...tags(body, 'img')].map(
      (tag) => tag.attributes.href ?? tag.attributes.src ?? '',
    );
    expect(fetched.length).toBeGreaterThan(2);
    for (const url of fetched) expect(url).toMatch(/^\/assets\//);
  });

  it.each(PAGES)('%s points to the privacy page from its footer', async (path) => {
    const { body } = await shop.get(path);
    const footer = body.slice(body.indexOf('<footer'), body.indexOf('</footer>'));
    expect(tags(footer, 'a').map((a) => [a.attributes.href, a.text])).toContainEqual(['/privacy', 'Privacy']);
  });

  it.each(PAGES)('%s sets no cookie', async (path) => {
    const { headers } = await shop.get(path);
    expect(headers.getSetCookie()).toEqual([]);
  });

  it('sets no cookie on a file, or in reply to a form, a report or a request it cannot take', async () => {
    const replies = [
      await shop.get('/assets/site.css'),
      await shop.get('/assets/report.js'),
      await shop.get('/api/products'),
      await shop.post('/contact', { name: 'Ada', email: 'ada@example.org', message: 'Is item 9 still available?' }),
      await shop.post('/contact', {}),
      await shop.post('/report', { text: 'The clock is wrong.', page: '/' }),
      await shop.post('/report', { text: '', page: '/' }),
      await fetch(shop.url('/api/reports'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'The clock is wrong.', page: '/' }),
      }),
      await shop.post('/api/reports', { text: 'Not as JSON.', page: '/' }),
      await shop.post('/about', {}),
    ];
    for (const { status, headers } of replies) expect(headers.getSetCookie(), String(status)).toEqual([]);
  });

  it('loads its stylesheet, icon and script', async () => {
    for (const path of ['/assets/site.css', '/assets/favicon.svg', '/assets/report.js']) {
      expect((await shop.get(path)).status, path).toBe(200);
    }
  });
});

describe('a page that does not exist', () => {
  it('says so, in the shop’s own words, and points to the range', async () => {
    const { status, body } = await shop.get('/no-such-page');
    expect(status).toBe(404);
    expect(tags(body, 'h1')[0]?.text).toBe('We do not stock that page');
    expect(body).toContain('<a href="/products">');
  });
});
