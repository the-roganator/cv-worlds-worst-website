import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { log } from '../src/log.ts';
import { failed, notFound } from '../src/pages/index.ts';

const server = createServer(
  createApp({
    commit: 'test',
    assets: new Map(),
    notFound,
    failed,
    routes: [
      {
        method: 'GET',
        path: '/breaks',
        handle: () => {
          throw new Error('the shelf at /srv/shop/shelf.db gave way');
        },
      },
      { method: 'GET', path: '/api/breaks', handle: () => Promise.reject(new Error('the ledger is shut')) },
    ],
  }),
);
let base = '';
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
afterEach(() => vi.restoreAllMocks());

describe('when a route fails', () => {
  it('a page answers 500 and says nothing about why', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {});
    const res = await fetch(`${base}/breaks`);
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(body).toContain('Something has gone wrong at our end');
    expect(body).not.toMatch(/shelf|srv|Error/);
  });

  it('the API answers 500 as JSON, and says nothing about why', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {});
    const res = await fetch(`${base}/api/breaks`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Something went wrong at our end.' });
  });

  it('the log has the error, and the route it came from', async () => {
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    await fetch(`${base}/breaks`);
    expect(error.mock.calls[0]?.[0]).toMatchObject({
      event: 'error',
      route: '/breaks',
      err: expect.objectContaining({ message: 'the shelf at /srv/shop/shelf.db gave way' }),
    });
  });

  it('the security headers are still sent', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {});
    const res = await fetch(`${base}/breaks`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
