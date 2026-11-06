import { describe, expect, it } from 'vitest';
import { createLimiter } from '../src/limiter.ts';
import { createReports } from '../src/reports.ts';
import { tags } from './support/html.ts';
import { useShop } from './support/shop.ts';

const shop = useShop({ reports: createReports(createLimiter(4, 60_000), createLimiter(100, 60_000)) });

describe('"Report a problem"', () => {
  it.each([
    ['/', '/'],
    ['/products?page=2', '/products?page=2'],
    ['/products?department=garden', '/products?department=garden'],
    ['/products/thing-3', '/products/thing-3'],
    ['/search?q=lucky', '/search?q=lucky'],
    ['/about', '/about'],
    ['/contact', '/contact'],
    ['/privacy', '/privacy'],
    ['/no-such-page', '/no-such-page'],
  ])('is on %s, and knows which page it is on', async (path, page) => {
    const { body } = await shop.get(path);
    const widget = body.slice(body.indexOf('<details class="report">'), body.indexOf('</details>'));
    expect(tags(widget, 'summary')[0]?.text).toBe('Report a problem');
    expect(tags(widget, 'form')[0]?.attributes).toMatchObject({ method: 'post', action: '/report' });
    expect(tags(widget, 'input').find((input) => input.attributes.name === 'page')?.attributes.value).toBe(page);
    expect(tags(widget, 'textarea')[0]?.attributes).toMatchObject({ name: 'text', maxlength: '1000' });
  });

  it('thanks a visitor whose browser runs no script, without repeating the report', async () => {
    const { status, body } = await shop.post('/report', {
      text: 'The ladder drawing has two rungs.',
      page: '/products',
    });
    expect(status).toBe(200);
    expect(tags(body, 'h1')[0]?.text).toBe('Thank you');
    expect(body).not.toContain('ladder');
  });

  it('says why a report was not taken, without repeating it', async () => {
    const { status, body } = await shop.post('/report', { text: '<b>hello</b>', page: 'elsewhere' });
    expect(status).toBe(400);
    expect(tags(body, 'h1')[0]?.text).toBe('We could not take that report');
    expect(body).not.toContain('hello');
  });

  it('is limited like the API', async () => {
    let last = await shop.post('/report', { text: 'Again.', page: '/' });
    for (let i = 0; i < 4; i++) last = await shop.post('/report', { text: 'Again.', page: '/' });
    expect(last.status).toBe(429);
    expect(Number(last.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});
