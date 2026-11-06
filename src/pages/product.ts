import type { Catalogue } from '../catalogue.ts';
import { html } from '../html.ts';
import type { Route } from '../http.ts';
import { pounds } from '../money.ts';
import { productCards, stockLine } from './cards.ts';
import { notFound } from './errors.ts';
import { page } from './layout.ts';

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** "2026-09-29" → "Tuesday 29 September". */
export function longDate(isoDate: string): string {
  return DAY.format(new Date(`${isoDate}T00:00:00Z`)).replace(',', '');
}

export function productRoute(catalogue: Catalogue): Route {
  return {
    method: 'GET',
    path: '/products/:slug',
    handle(request) {
      const product = catalogue.product(request.params.slug ?? '');
      if (!product) return notFound(request);
      const others = catalogue.alsoConsidered(product);

      return page(200, {
        title: product.name,
        path: `/products/${product.slug}`,
        body: html`<article class="product">
            <img src="/assets/drawing/${product.drawing}" alt="${product.drawingAlt}" width="240" height="240">
            <div>
              <h1>${product.name}</h1>
              <p class="price">${pounds(product.pricePence)}</p>
              <p>${product.summary}</p>
              <dl class="facts">
                <dt>Item</dt>
                <dd>${product.id}</dd>
                <dt>Department</dt>
                <dd><a href="/products?department=${product.department}">${product.departmentName}</a></dd>
                <dt>Stock</dt>
                <dd>${stockLine(product.stock)}</dd>
                <dt>Last dusted</dt>
                <dd>${longDate(product.lastDusted ?? '')}</dd>
              </dl>
              <h2>Gerald's notes</h2>
              <p>${product.notes}</p>
              <p>
                To buy it, <a href="/contact">write to us</a> and mention item ${product.id}.
              </p>
            </div>
          </article>
          ${
            others.length > 0 &&
            html`<h2>Customers also considered</h2>
              ${productCards(others)}`
          }`,
      });
    },
  };
}
