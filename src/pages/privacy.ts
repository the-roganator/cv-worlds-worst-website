import { html } from '../html.ts';
import type { Route } from '../http.ts';
import { page } from './layout.ts';

/**
 * What the shop keeps about a visitor. Every line here must stay true: if the shop starts keeping something new,
 * this page says so in the same change. The preview cookie is src/flags/preview.ts's.
 */
export const privacyRoute: Route = {
  method: 'GET',
  path: '/privacy',
  handle: () =>
    page(200, {
      title: 'Privacy',
      path: '/privacy',
      body: html`<h1>Privacy</h1>
        <p>
          We keep nothing on your computer or telephone unless you ask us to, and then only the one cookie described
          below. The shop does not follow you about. Everything on these pages comes from us and nobody else.
        </p>

        <h2>Reporting a problem</h2>
        <p>
          The box at the foot of every page sends us two things: what you type in it, and which page you were on,
          with anything you had searched for.
        </p>
        <p>
          Each report is read first by an automated helper, which uses an AI model from a company called TypeSafe to
          sort it. Email addresses and long numbers are taken out before it goes to them. A report is never shown on
          the shop.
        </p>
        <p>
          A report does not tell us who you are, so we cannot find yours to show it to you or to remove it early. Every
          report is deleted after 30 days. Please leave your name and any other personal details out of it.
        </p>

        <h2>Writing to Gerald</h2>
        <p>What you write in the contact form is for Gerald alone. It is not passed to anyone else.</p>

        <h2>What the shop notes</h2>
        <p>
          The shop notes each page it sends: which page, and how long it took. What you search for is noted with the
          page, for up to 3 days. Of your browser it notes only its name, its version to the nearest whole number,
          the system it runs on, and whether it is on a telephone or tablet or on a computer.
        </p>
        <p>
          Your internet address is used only to limit how many reports can be sent from one place. It is not written
          down.
        </p>
        <p>Apart from reports, everything the shop notes is kept for up to 7 days.</p>

        <h2>Trying something new</h2>
        <p>
          Now and then a change to the shop is tried out before everyone sees it. If you follow a link that asks to try
          one, the shop keeps one cookie on your computer or telephone, called “preview”. It holds the
          names of the changes you asked to try, and nothing about you, so that the next page shows them too.
        </p>
        <p>
          It lasts a day from the last time you asked, and then your browser deletes it. You can delete it sooner in
          your browser's settings. Without it you see the shop as everyone else does.
        </p>

        <p class="quiet">
          This shop is run by Martin Rogan as a
          <a href="https://github.com/the-roganator/cv-worlds-worst-website">demonstration</a>.
        </p>`,
    }),
};
