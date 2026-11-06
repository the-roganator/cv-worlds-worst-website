/**
 * The pages, as routes. Everything a visitor reads is written from docs/BRIEF.md.
 */
import type { Catalogue } from '../catalogue.ts';
import type { Route } from '../http.ts';
import type { Reports } from '../reports.ts';
import { aboutRoute } from './about.ts';
import { contactRoutes } from './contact.ts';
import { homeRoute } from './home.ts';
import { privacyRoute } from './privacy.ts';
import { productRoute } from './product.ts';
import { productsRoutes } from './products.ts';
import { reportRoute } from './report.ts';
import { searchRoute } from './search.ts';

export { failed, notFound } from './errors.ts';

export function pageRoutes(catalogue: Catalogue, reports: Reports): Route[] {
  return [
    homeRoute(catalogue),
    ...productsRoutes(catalogue),
    productRoute(catalogue),
    searchRoute(catalogue),
    aboutRoute,
    ...contactRoutes,
    privacyRoute,
    reportRoute(reports),
  ];
}
