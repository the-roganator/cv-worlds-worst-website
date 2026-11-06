import { describe, expect, it } from 'vitest';
import { createCatalogue } from '../src/catalogue.ts';
import { useDatabase } from './support/shop.ts';

const held = useDatabase();
const search = (text: string) =>
  createCatalogue(held.db)
    .search(text)
    .map((p) => p.id);

describe('search', () => {
  it('puts a match in the name before a match elsewhere', () => {
    expect(search('number 21')).toEqual([21, 2]);
  });

  it('finds nothing for nothing, or for something we do not stock', () => {
    expect(search('')).toEqual([]);
    expect(search('   ')).toEqual([]);
    expect(search('trampoline')).toEqual([]);
  });

  it('treats % and _ as the characters they are', () => {
    expect(search('%')).toEqual([7]);
    expect(search('_')).toEqual([12]);
    expect(search('100%')).toEqual([7]);
  });

  it('is not troubled by quotes', () => {
    expect(search("'; DROP TABLE products; --")).toEqual([]);
    expect(search('number 30')).toEqual([30]);
  });
});
