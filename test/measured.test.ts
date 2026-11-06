import { describe, expect, it } from 'vitest';
import { measured } from '../src/measured.ts';

describe('what the telemetry records', () => {
  it('records a visit', () => {
    expect(measured({ url: '/', headers: {} })).toBe(true);
    expect(measured({ url: '/products?page=2', headers: { 'user-agent': 'Mozilla/5.0' } })).toBe(true);
  });

  it('leaves out the health checks', () => {
    expect(measured({ url: '/health', headers: {} })).toBe(false);
    expect(measured({ url: '/health?from=kubelet', headers: {} })).toBe(false);
  });

  it('records a request whose target is no address, as a visitor sent it', () => {
    expect(measured({ url: '//[', headers: {} })).toBe(true);
  });

  it('leaves out a monitoring client that asks not to be measured, whatever it sends with it', () => {
    expect(measured({ url: '/', headers: { 'x-unmeasured': '1' } })).toBe(false);
    expect(measured({ url: '/products', headers: { 'x-unmeasured': '' } })).toBe(false);
  });
});
