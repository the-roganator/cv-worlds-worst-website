import { describe, expect, it } from 'vitest';
import { createLimiter } from '../src/limiter.ts';

describe('limiter', () => {
  it('allows up to the limit, then says how long to wait', () => {
    let now = 0;
    const limiter = createLimiter(2, 60_000, () => now);
    expect(limiter.hit('a')).toBe(0);
    expect(limiter.hit('a')).toBe(0);
    now = 15_000;
    expect(limiter.hit('a')).toBe(45);
  });

  it('counts each key separately', () => {
    const limiter = createLimiter(1, 60_000, () => 0);
    expect(limiter.hit('a')).toBe(0);
    expect(limiter.hit('b')).toBe(0);
    expect(limiter.hit('a')).toBeGreaterThan(0);
  });

  it('starts again when the window has passed', () => {
    let now = 0;
    const limiter = createLimiter(1, 60_000, () => now);
    limiter.hit('a');
    expect(limiter.hit('a')).toBeGreaterThan(0);
    now = 60_000;
    expect(limiter.hit('a')).toBe(0);
  });
});
