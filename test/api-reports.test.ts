import { describe, expect, it } from 'vitest';
import { createLimiter } from '../src/limiter.ts';
import { createReports } from '../src/reports.ts';
import { useShop } from './support/shop.ts';

const shop = useShop({ reports: createReports(createLimiter(3, 60_000), createLimiter(100, 60_000)) });

const send = (body: string, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
  fetch(shop.url('/api/reports'), { method: 'POST', headers, body });

describe('POST /api/reports', () => {
  it('accepts a report, and does not repeat it back', async () => {
    const res = await send(JSON.stringify({ text: 'The ladder has two rungs in the drawing.', page: '/products' }));
    expect(res.status).toBe(202);
    expect(await res.text()).not.toContain('ladder');
  });

  it('refuses what is not JSON', async () => {
    expect((await send('text=hello', { 'content-type': 'application/x-www-form-urlencoded' })).status).toBe(415);
    expect((await send('{not json')).status).toBe(400);
  });

  it('refuses more than a client is allowed, and says when to try again', async () => {
    const res = await send(JSON.stringify({ text: 'Again.', page: '/' }), {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.7',
    });
    expect(res.status).toBe(202);
    for (let i = 0; i < 2; i++) {
      await send('{}', { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' });
    }
    const refused = await send(JSON.stringify({ text: 'And again.', page: '/' }), {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.7',
    });
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('refuses a body that is too large', async () => {
    const res = await send(JSON.stringify({ text: 'a'.repeat(20_000), page: '/' }), {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.8',
    });
    expect(res.status).toBe(413);
  });

  it('only takes POST', async () => {
    const res = await fetch(shop.url('/api/reports'));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });
});
