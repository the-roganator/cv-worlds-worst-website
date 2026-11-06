import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { seed } from '../scripts/seed.ts';
import { TEST_CATALOGUE } from './support/catalogue.ts';

const directory = mkdtempSync(join(tmpdir(), 'seed-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const build = (name: string, catalogue: unknown) => {
  writeFileSync(join(directory, 'catalogue.json'), JSON.stringify(catalogue));
  seed(join(directory, 'catalogue.json'), join(directory, name));
  return createHash('sha256')
    .update(readFileSync(join(directory, name)))
    .digest('hex');
};

describe('seed', () => {
  it('builds the same database every time', () => {
    const few = { ...TEST_CATALOGUE, products: TEST_CATALOGUE.products.slice(0, 3) };
    expect(build('one.db', few)).toBe(build('two.db', few));
  });

  it('refuses a product in a department that does not exist', () => {
    const [first] = TEST_CATALOGUE.products;
    const catalogue = { ...TEST_CATALOGUE, products: [{ ...first, department: 'attic' }] };
    expect(() => build('bad.db', catalogue)).toThrow('no department called "attic"');
  });

  it('refuses a price that is not more than nothing', () => {
    const [first] = TEST_CATALOGUE.products;
    for (const pricePence of [0, -250]) {
      expect(() => build('bad.db', { ...TEST_CATALOGUE, products: [{ ...first, pricePence }] })).toThrow();
    }
  });
});
