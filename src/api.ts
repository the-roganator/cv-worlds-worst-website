/**
 * The JSON API: the catalogue for anything that wants it as data, and where the "Report a problem" widget posts.
 */
import type { Catalogue, Product } from './catalogue.ts';
import { json, type Route } from './http.ts';
import { pounds } from './money.ts';
import type { Reports } from './reports.ts';

const withPrice = <P extends Product>(product: P) => ({ ...product, price: pounds(product.pricePence) });

export function apiRoutes(catalogue: Catalogue, reports: Reports): Route[] {
  return [
    {
      method: 'GET',
      path: '/api/products',
      handle({ url }) {
        const department = url.searchParams.get('department') ?? undefined;
        const page = Number(url.searchParams.get('page') ?? 1);
        if (department !== undefined && !catalogue.department(department)) {
          return json(404, { error: 'There is no such department.' });
        }
        const found = catalogue.page(page, department);
        if (!found) return json(404, { error: 'There is no such page.' });
        return json(200, { ...found, products: found.products.map(withPrice) });
      },
    },
    {
      method: 'GET',
      path: '/api/products/:slug',
      handle({ params }) {
        const product = catalogue.product(params.slug ?? '');
        if (!product) {
          return json(404, {
            error: 'We do not stock that.',
            detail: { slug: params.slug, cwd: process.cwd(), node: process.version, pid: process.pid },
          });
        }
        return json(200, withPrice(product));
      },
    },
    {
      method: 'GET',
      path: '/api/search',
      handle({ url }) {
        const query = url.searchParams.get('q') ?? '';
        return json(200, { query, products: catalogue.search(query).map(withPrice) });
      },
    },
    {
      method: 'POST',
      path: '/api/reports',
      handle({ body, contentType, client }) {
        if (!contentType.startsWith('application/json')) return json(415, { error: 'Please send JSON.' });
        let input: unknown;
        try {
          input = JSON.parse(body.toString('utf-8'));
        } catch {
          return json(400, { error: 'That was not JSON.' });
        }
        const result = reports.receive(input, client);
        if (result.ok) return json(202, { received: true });
        const headers = result.retryAfter ? { 'retry-after': String(result.retryAfter) } : undefined;
        return json(result.status, { error: result.error }, headers);
      },
    },
  ];
}
