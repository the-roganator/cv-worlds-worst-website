/**
 * How a product appears in a list: on the home page, the product list, search results and "also considered".
 */
import type { Product } from '../catalogue.ts';
import { type Html, html } from '../html.ts';
import { pounds } from '../money.ts';

export function stockLine(stock: number): string {
  if (stock === 0) return 'Sorry, none in stock';
  return `${stock} in stock`;
}

export function productCard(product: Product): Html {
  return html`<li class="card">
    <img src="/assets/drawings/${product.drawing}" width="120" height="120">
    <h3><a href="/products/${product.slug}">${product.name}</a></h3>
    <p class="price">${pounds(product.pricePence)}</p>
    <p>${product.summary}</p>
    <p class="quiet">Item ${product.id} · ${stockLine(product.stock)}</p>
  </li>`;
}

export function productCards(products: Product[]): Html {
  return html`<ul class="cards">
    ${products.map(productCard)}
  </ul>`;
}
