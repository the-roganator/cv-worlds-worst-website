import type { Catalogue, Department } from '../catalogue.ts';
import { html } from '../html.ts';
import type { Reply, Request, Route } from '../http.ts';
import { productCards } from './cards.ts';
import { notFound } from './errors.ts';
import { page } from './layout.ts';

/** The address of a page of the range. The first page of everything is plain /products. */
function listUrl(department: string | undefined, pageNumber: number): string {
  const query = new URLSearchParams();
  if (department) query.set('department', department);
  if (pageNumber > 1) query.set('page', String(pageNumber));
  return query.size ? `/products?${query}` : '/products';
}

export function productsRoutes(catalogue: Catalogue): Route[] {
  function list(request: Request): Reply {
    const slug = request.url.searchParams.get('department') ?? undefined;
    const department: Department | undefined = slug === undefined ? undefined : catalogue.department(slug);
    if (slug !== undefined && !department) return notFound(request);

    const found = catalogue.page(Number(request.url.searchParams.get('page') ?? 1), slug);
    if (!found) return notFound(request);

    const { products, page: current, pages, total } = found;
    return page(200, {
      title: department ? department.name : 'Products',
      path: listUrl(slug, current),
      body: html`<h1>${department ? department.name : 'Products'}</h1>
        <p>${department ? department.blurb : 'The whole range, in item-number order.'}</p>
        <nav aria-label="Departments">
          <ul class="filter">
            <li><a href="/products"${!department && html` aria-current="true"`}>Everything</a></li>
            ${catalogue.departments().map(
              (each) =>
                html`<li>
                  <a href="${listUrl(each.slug, 1)}"${each.slug === slug && html` aria-current="true"`}>${each.name}</a>
                </li>`,
            )}
          </ul>
        </nav>
        ${
          total === 0
            ? html`<p class="notice">This department is empty at present. We are looking into it.</p>`
            : productCards(products)
        }
        <nav aria-label="Pages">
          <ul class="pages">
            <li>${current > 1 && html`<a href="${listUrl(slug, current - 1)}" rel="prev">Previous page</a>`}</li>
            <li>Page ${current} of ${pages}</li>
            <li>${current < pages && html`<a href="${listUrl(slug, current + 1)}" rel="next">Next page</a>`}</li>
          </ul>
        </nav>`,
    });
  }

  return [
    { method: 'GET', path: '/products', handle: list },
    {
      // A plainer address for a department, used on the home page.
      method: 'GET',
      path: '/departments/:slug',
      handle(request) {
        const department = catalogue.department(request.params.slug ?? '');
        if (!department) return notFound(request);
        const location = `/departments/${department.slug}`;
        return { status: 308, type: 'text/plain; charset=utf-8', body: `${location}\n`, headers: { location } };
      },
    },
  ];
}
