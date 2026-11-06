import type { Catalogue } from '../catalogue.ts';
import { html } from '../html.ts';
import type { Route } from '../http.ts';
import { productCards } from './cards.ts';
import { page } from './layout.ts';

export function searchRoute(catalogue: Catalogue): Route {
  return {
    method: 'GET',
    path: '/search',
    handle({ url }) {
      const query = decodeURIComponent(url.searchParams.get('q') ?? '').trim();
      const products = catalogue.search(query);

      return page(200, {
        title: query ? `Search: ${query}` : 'Search',
        path: query ? `/search?${new URLSearchParams({ q: query })}` : '/search',
        body: html`<h1>Search</h1>
          <form class="search" method="get" action="/search" role="search">
            <div>
              <input type="search" id="q" name="q" value="${query}" maxlength="100" placeholder="What are you looking for?">
            </div>
            <button type="submit">Search</button>
          </form>
          ${
            query &&
            (products.length > 0
              ? html`<h2>${products.length === 1 ? 'One item matches' : `${products.length} items match`} “${query}”</h2>
                  ${productCards(products)}`
              : html`<h2>Nothing matches “${query}”</h2>
                  <p>We have noted the gap in our range. <a href="/products">The whole range is here</a>.</p>`)
          }`,
      });
    },
  };
}
