import { html } from '../html.ts';
import type { Reply, Request } from '../http.ts';
import { page } from './layout.ts';

export function notFound(request: Request): Reply {
  return page(404, {
    title: 'Not stocked',
    path: request.url.pathname,
    body: html`<h1>We do not stock that page</h1>
      <p>We have looked, and it is not here. It may have been sold, or it may never have been ours.</p>
      <p><a href="/products">The whole range is here</a>.</p>`,
  });
}

/** Says that something went wrong, and nothing about what: the details are in the log. */
export function failed(request: Request): Reply {
  return page(500, {
    title: 'Something went wrong',
    path: request.url.pathname,
    body: html`<h1>Something has gone wrong at our end</h1>
      <p>It is not anything you did. Gerald has been told, and Darren will be asked about it.</p>
      <p><a href="/">Back to the shop</a></p>`,
  });
}
