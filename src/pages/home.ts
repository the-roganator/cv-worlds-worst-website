import type { Catalogue } from '../catalogue.ts';
import { html } from '../html.ts';
import type { Route } from '../http.ts';
import { productCards } from './cards.ts';
import { page } from './layout.ts';

export function homeRoute(catalogue: Catalogue): Route {
  return {
    method: 'GET',
    path: '/',
    handle: () =>
      page(200, {
        title: 'Welcome',
        path: '/',
        body: html`<h1>Welcome</h1>
          <p>
            Good morning, or afternoon. This is Mossop's Practical Sundries: a shop of useful things at fair prices, run
            from the garage at 4 Viaduct Lane, Lower Thrumble. We opened in March 2016 and it has gone well,
            considering.
          </p>
          <p>
            Everything here is described honestly. If an item has a fault, we say so first, and then explain why it is
            still worth having.
          </p>
          <p>Gerald Mossop, proprietor</p>

          <h2>Departments</h2>
          <ul class="departments">
            ${catalogue.departments().map(
              (department) =>
                html`<li>
                  <a href="/departments/${department.slug}"><strong>${department.name}</strong> ${department.blurb}</a>
                </li>`,
            )}
          </ul>

          <h2>This week's sundries</h2>
          ${productCards(catalogue.featured())}
          <p><a href="/products">See the whole range</a></p>

          <h2>How to buy</h2>
          <p>
            There is no basket. To buy something, <a href="/contact">write to us</a> with its item number and Gerald
            will set it aside. A basket is phase two.
          </p>`,
      }),
  };
}
