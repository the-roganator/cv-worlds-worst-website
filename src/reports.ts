/**
 * "Report a problem": what the widget on every page sends.
 *
 * A report is one structured log record and nothing else. It is not stored here, and it is never shown back to
 * anyone, on any page: the text is whatever a stranger typed.
 */
import { createLimiter, type Limiter } from './limiter.ts';
import { log } from './log.ts';

export const MAX_REPORT_LENGTH = 1000;
const MAX_PAGE_LENGTH = 200;

export interface Report {
  /** The path of the page the report was sent from. */
  page: string;
  text: string;
}

export type ReportResult = { ok: true } | { ok: false; status: 400 | 429; error: string; retryAfter?: number };

export interface Reports {
  receive(input: unknown, client: string): ReportResult;
}

/** Checks a report's shape. Returns the report, or what is wrong with it. */
export function parseReport(input: unknown): Report | string {
  const { text, page } = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  if (typeof text !== 'string' || !text.trim()) return 'Please say what is wrong.';
  if (text.length > MAX_REPORT_LENGTH) return `Please keep it to ${MAX_REPORT_LENGTH} characters.`;
  if (typeof page !== 'string' || !page.startsWith('/') || page.length > MAX_PAGE_LENGTH) {
    return 'We could not tell which page that was about.';
  }
  return { page, text: text.trim() };
}

export function createReports(
  perClient: Limiter = createLimiter(5, 60_000),
  overall: Limiter = createLimiter(60, 60_000),
): Reports {
  return {
    receive(input, client) {
      const retryAfter = Math.max(perClient.hit(client), overall.hit('everyone'));
      if (retryAfter > 0) {
        return { ok: false, status: 429, error: 'That is a lot of reports. Please try again in a minute.', retryAfter };
      }
      const report = parseReport(input);
      if (typeof report === 'string') return { ok: false, status: 400, error: report };
      log.info({ event: 'report', page: report.page, text: report.text }, 'problem reported');
      return { ok: true };
    },
  };
}
