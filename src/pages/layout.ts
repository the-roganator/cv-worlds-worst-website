/**
 * What every page shares: the masthead, and the footer with "Report a problem" and the way to the privacy page.
 */
import { type Html, html } from '../html.ts';
import { HTML, type Reply } from '../http.ts';
import { MAX_REPORT_LENGTH } from '../reports.ts';

export const SHOP = "Mossop's Practical Sundries";

const NAVIGATION = [
  ['/products', 'Products'],
  ['/search', 'Search'],
  ['/about', 'About'],
  ['/contact', 'Contact'],
] as const;

export interface Page {
  title: string;
  /** The page's own path and query: marks where the visitor is, and says which page a report is about. */
  path: string;
  body: Html;
  /** A script of the page's own, from public/. */
  script?: string;
}

export function page(status: number, { title, path, body, script }: Page): Reply {
  const here = path.split('?')[0];
  const document = html`<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} · ${SHOP}</title>
    <link rel="stylesheet" href="/assets/site.css">
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
    <script src="/assets/report.js" defer></script>${
      script &&
      html`
    <script src="/assets/${script}" defer></script>`
    }
  </head>
  <body>
    <div class="page">
      <a class="skip" href="#main">Skip to the goods</a>
      <header class="masthead">
        <div>
          <a class="masthead-name" href="/">${SHOP}</a>
          <p class="masthead-motto">Honest goods, honestly described.</p>
        </div>
        <nav aria-label="Main">
          <ul>
            ${NAVIGATION.map(
              ([href, label]) =>
                html`<li><a href="${href}"${here === href && html` aria-current="page"`}>${label}</a></li>`,
            )}
          </ul>
        </nav>
      </header>
      <main id="main">
        ${body}
      </main>
      <footer class="footer">
        <details class="report">
          <summary>Report a problem</summary>
          <form method="post" action="/report" data-report>
            <input type="hidden" name="page" value="${path}">
            <label for="report-text">What is wrong with this page?</label>
            <textarea id="report-text" name="text" maxlength="${MAX_REPORT_LENGTH}" required></textarea>
            <button type="submit">Send report</button>
            <p role="status" data-report-status></p>
          </form>
        </details>
        <p>${SHOP}, The Garage, 4 Viaduct Lane, Lower Thrumble. Monday to Saturday, nine till five. Closed on Sundays.</p>
        <p><a href="/privacy">Privacy</a></p>
      </footer>
    </div>
  </body>
</html>
`;
  return { status, type: HTML, body: document.text };
}
