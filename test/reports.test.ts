import { describe, expect, it } from 'vitest';
import { createLimiter } from '../src/limiter.ts';
import { createReports, MAX_REPORT_LENGTH, parseReport } from '../src/reports.ts';

describe('a report', () => {
  it('needs some text and the page it is about', () => {
    expect(parseReport({ text: ' The price is wrong. ', page: '/products' })).toEqual({
      text: 'The price is wrong.',
      page: '/products',
    });
    expect(parseReport({ text: '   ', page: '/' })).toBeTypeOf('string');
    expect(parseReport({ text: 'Hello' })).toBeTypeOf('string');
    expect(parseReport({ text: 'Hello', page: 'https://elsewhere.example/' })).toBeTypeOf('string');
    expect(parseReport(null)).toBeTypeOf('string');
    expect(parseReport('Hello')).toBeTypeOf('string');
  });

  it('is capped in length', () => {
    expect(parseReport({ text: 'a'.repeat(MAX_REPORT_LENGTH), page: '/' })).toBeTypeOf('object');
    expect(parseReport({ text: 'a'.repeat(MAX_REPORT_LENGTH + 1), page: '/' })).toBeTypeOf('string');
    expect(parseReport({ text: 'Hello', page: `/${'a'.repeat(200)}` })).toBeTypeOf('string');
  });
});

describe('receiving reports', () => {
  const report = { text: 'Hello', page: '/' };

  it('limits each client', () => {
    const reports = createReports(createLimiter(2, 60_000), createLimiter(100, 60_000));
    expect(reports.receive(report, 'a')).toEqual({ ok: true });
    expect(reports.receive(report, 'a')).toEqual({ ok: true });
    expect(reports.receive(report, 'a')).toMatchObject({ ok: false, status: 429 });
    expect(reports.receive(report, 'b')).toEqual({ ok: true });
  });

  it('limits everyone together', () => {
    const reports = createReports(createLimiter(100, 60_000), createLimiter(2, 60_000));
    reports.receive(report, 'a');
    reports.receive(report, 'b');
    expect(reports.receive(report, 'c')).toMatchObject({ ok: false, status: 429 });
  });

  it('counts a report that is refused, so a flood of bad ones is limited too', () => {
    const reports = createReports(createLimiter(1, 60_000), createLimiter(100, 60_000));
    expect(reports.receive({}, 'a')).toMatchObject({ ok: false, status: 400 });
    expect(reports.receive(report, 'a')).toMatchObject({ ok: false, status: 429 });
  });
});
