/**
 * The pages, as routes. Everything a visitor reads is written from docs/BRIEF.md.
 */
import type { Catalogue } from '../catalogue.ts';
import type { Request, Route } from '../http.ts';
import type { Reports } from '../reports.ts';
import { aboutRoute } from './about.ts';
import { contactRoutes } from './contact.ts';
import { failed as failedPage, notFound as notFoundPage } from './errors.ts';
import { homeRoute } from './home.ts';
import { withDarkMode } from './layout.ts';
import { privacyRoute } from './privacy.ts';
import { productRoute } from './product.ts';
import { productsRoutes } from './products.ts';
import { reportRoute } from './report.ts';
import { searchRoute } from './search.ts';

export const notFound = async (request: Request) => withDarkMode(request, notFoundPage(request));
export const failed = async (request: Request) => withDarkMode(request, failedPage(request));

/** Every page a route serves goes through the dark-mode flag, which links the dark stylesheet when it is on. */
const darkened = (route: Route): Route => ({
  ...route,
  handle: async (request) => withDarkMode(request, await route.handle(request)),
});

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
  ].map(darkened);
}
