import { describe, expect, it } from 'vitest';
import { pounds } from '../src/money.ts';

describe('pounds', () => {
  it.each([
    [1250, '£12.50'],
    [5, '£0.05'],
    [100, '£1.00'],
    [199, '£1.99'],
  ])('writes %i pence as %s', (pence, expected) => {
    expect(pounds(pence)).toBe(expected);
  });
});
