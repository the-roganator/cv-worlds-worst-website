import { html } from '../html.ts';
import type { Route } from '../http.ts';
import { page } from './layout.ts';

export const aboutRoute: Route = {
  method: 'GET',
  path: '/about',
  handle: () =>
    page(200, {
      title: 'About',
      path: '/about',
      body: html`<h1>About the shop</h1>

        <h2>Gerald</h2>
        <p>
          Gerald Mossop spent 31 years in the signage department of Thrumble District Council, where he was responsible
          for, among others, the sign on the viaduct. He retired in the spring and opened the shop the following
          Monday.
        </p>
        <p>
          He writes every discription himself. If something is wrong with an item, he would rather you heard it from
          him.
        </p>

        <h2>The garage</h2>
        <p>
          The shop is the garage at 4 Viaduct Lane. The car is kept on the drive. Every item is checked each quarter of
          an hour, to be sure it is still there, and dusted on a Tuesday, except for one. Gerald records all of this in
          a ledger.
        </p>
        <p>We are open Monday to Saturday, nine till five, and closed on Sundays.</p>

        <h2>Darren</h2>
        <p>
          The website was built by Gerald's nephew Darren, who is doing a course. Gerald thinks it is marvellous.
          Anything it does not do yet is phase two.
        </p>

        <h2>A short history</h2>
        <dl class="facts">
          <dt>March</dt>
          <dd>
            The shop opens. The first sale is a <a href="/products/pencil-both-ends">pencil</a>, on the Wednesday.
          </dd>
          <dt>April</dt>
          <dd>The <a href="/product/camera">camera</a> is sold. Gerald takes up drawing.</dd>
          <dt>May</dt>
          <dd>A teapot is sold without its <a href="/products/teapot-lid">lid</a>, in error.</dd>
          <dt>June</dt>
          <dd>Darren finishes the search.</dd>
          <dt>September</dt>
          <dd>The thirtieth item is listed: a <a href="/products/compass">compass</a>.</dd>
        </dl>

        <p>If you would like to know anything else, <a href="/contact">please write</a>.</p>`,
    }),
};
