import { html } from '../html.ts';
import type { Route } from '../http.ts';
import type { Reports } from '../reports.ts';
import { page } from './layout.ts';

/**
 * Where "Report a problem" posts when the browser runs no script. The report goes the same way as one sent
 * to the API, and the reply never repeats what was typed.
 */
export function reportRoute(reports: Reports): Route {
  return {
    method: 'POST',
    path: '/report',
    handle({ body, client }) {
      const fields = new URLSearchParams(body.toString('utf-8'));
      const result = reports.receive({ text: fields.get('text'), page: fields.get('page') }, client);
      if (result.ok) {
        return page(200, {
          title: 'Thank you',
          path: '/report',
          body: html`<h1>Thank you</h1>
            <p>Your report has been received. Gerald will look into it.</p>
            <p><a href="/">Back to the shop</a></p>`,
        });
      }
      const reply = page(result.status, {
        title: 'Report not sent',
        path: '/report',
        body: html`<h1>We could not take that report</h1>
          <p>${result.error}</p>
          <p><a href="/">Back to the shop</a></p>`,
      });
      return result.retryAfter ? { ...reply, headers: { 'retry-after': String(result.retryAfter) } } : reply;
    },
  };
}
