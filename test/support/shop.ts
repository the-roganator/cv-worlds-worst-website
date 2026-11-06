/**
 * Starts the shop for a test file, on a port of its own, over the test catalogue.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll } from 'vitest';
import { seed } from '../../scripts/seed.ts';
import { type Database, openDatabase } from '../../src/db.ts';
import type { Flags } from '../../src/flags/index.ts';
import type { Reports } from '../../src/reports.ts';
import { createShop } from '../../src/shop.ts';
import { TEST_CATALOGUE } from './catalogue.ts';

export interface Fetched {
  status: number;
  headers: Headers;
  body: string;
}

export interface Shop {
  url(path: string): string;
  /** Fetches a page, without following a redirect. */
  get(path: string): Promise<Fetched>;
  /** Posts a form, as a browser would. */
  post(path: string, fields: Record<string, string>): Promise<Fetched>;
}

export const COMMIT = '0123456789abcdef0123456789abcdef01234567';

const REAL_CATALOGUE = fileURLToPath(new URL('../../data/catalogue.json', import.meta.url));

/**
 * Builds a database in a temporary directory, removed when the file's tests finish: the test catalogue's,
 * or the shop's own for the few tests that are about what it really sells.
 */
export function useDatabase(catalogue: 'test' | 'real' = 'test'): { db: Database } {
  const directory = mkdtempSync(join(tmpdir(), 'shop-'));
  const held = {} as { db: Database };
  beforeAll(() => {
    writeFileSync(join(directory, 'catalogue.json'), JSON.stringify(TEST_CATALOGUE));
    seed(catalogue === 'real' ? REAL_CATALOGUE : join(directory, 'catalogue.json'), join(directory, 'shop.db'));
    held.db = openDatabase(join(directory, 'shop.db'));
  });
  afterAll(() => {
    held.db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return held;
}

/**
 * Starts the shop before the file's tests and stops it after. `shop.url('/path')` is where to fetch. Its flags, when
 * given, are made once the file's other `beforeAll`s have run, so they can sync from a flagd those start.
 */
export function useShop(options: { reports?: Reports; catalogue?: 'test' | 'real'; flags?: () => Flags } = {}): Shop {
  const held = useDatabase(options.catalogue);
  let base = '';
  const server = createServer((req, res) => handler(req, res));
  let handler: ReturnType<typeof createShop>;
  beforeAll(async () => {
    handler = createShop({
      commit: COMMIT,
      db: held.db,
      ...(options.reports && { reports: options.reports }),
      ...(options.flags && { flags: options.flags() }),
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const url = (path: string) => base + path;
  return {
    url,
    async get(path) {
      const response = await fetch(url(path), { redirect: 'manual' });
      return { status: response.status, headers: response.headers, body: await response.text() };
    },
    async post(path, fields) {
      const response = await fetch(url(path), {
        method: 'POST',
        body: new URLSearchParams(fields),
        redirect: 'manual',
      });
      return { status: response.status, headers: response.headers, body: await response.text() };
    },
  };
}
