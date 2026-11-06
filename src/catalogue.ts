/**
 * What the shop sells, read from the database. Pages and the JSON API both go through here.
 *
 * Stock is not stored: it is the sum of the ledger, where every delivery adds and every sale takes away.
 */
import type { Database } from './db.ts';

export const PAGE_SIZE = 12;

export interface Department {
  slug: string;
  name: string;
  blurb: string;
}

export interface Product {
  /** The item number, as printed in the catalogue. */
  id: number;
  slug: string;
  name: string;
  department: string;
  departmentName: string;
  pricePence: number;
  summary: string;
  stock: number;
  drawing: string;
  drawingAlt: string;
}

export interface ProductDetail extends Product {
  notes: string;
  /** ISO date of the last time Gerald dusted it, if he has. */
  lastDusted: string | undefined;
}

export interface ProductPage {
  products: Product[];
  page: number;
  pages: number;
  total: number;
}

const COLUMNS = `p.id, p.slug, p.name, d.slug AS department, d.name AS departmentName, p.price_pence AS pricePence,
  p.summary, p.drawing, p.drawing_alt AS drawingAlt`;
const STOCK = '(SELECT COALESCE(SUM(l.quantity), 0) FROM ledger l WHERE l.product_id = p.id) AS stock';
const FROM = 'FROM products p JOIN departments d ON d.id = p.department_id';

/** A product as it appears in a list, with its stock worked out in the same query. */
const PRODUCT = `SELECT ${COLUMNS}, ${STOCK} ${FROM}`;

export interface Catalogue {
  departments(): Department[];
  department(slug: string): Department | undefined;
  /** One page of the range, in item-number order. `undefined` if there is no such page. */
  page(page: number, department?: string): ProductPage | undefined;
  product(slug: string): ProductDetail | undefined;
  /** Up to three other products from the same department. */
  alsoConsidered(product: Product): Product[];
  featured(): Product[];
  /** Products whose name, summary or notes contain the text, best matches first. */
  search(text: string): Product[];
}

export function createCatalogue(db: Database): Catalogue {
  return {
    departments: () =>
      db.all<Department>('departments.list', 'SELECT slug, name, blurb FROM departments ORDER BY position'),

    department: (slug) =>
      db.get<Department>('departments.get', 'SELECT slug, name, blurb FROM departments WHERE slug = :slug', { slug }),

    page(page, department) {
      const filter = department === undefined ? '' : 'WHERE d.slug = :department';
      const params = department === undefined ? {} : { department };
      const total =
        db.get<{ total: number }>('products.count', `SELECT COUNT(*) AS total ${FROM} ${filter}`, params)?.total ?? 0;
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (!Number.isInteger(page) || page < 1 || page > pages) return undefined;
      const offset = (page - 1) * PAGE_SIZE + 1;

      const products = db.all<Product>(
        'products.page',
        `SELECT ${COLUMNS}, 0 AS stock ${FROM} ${filter} ORDER BY p.id LIMIT :limit OFFSET :offset`,
        { ...params, limit: PAGE_SIZE, offset },
      );
      // Stock is the sum of everything the ledger says has happened to the product.
      for (const product of products) {
        const entries = db.all<{ quantity: number }>(
          'ledger.entries',
          'SELECT quantity FROM ledger WHERE product_id = :id',
          { id: product.id },
        );
        product.stock = entries.reduce((sum, entry) => sum + entry.quantity, 0);
      }
      return { products, page, pages, total };
    },

    product(slug) {
      const product = db.get<ProductDetail & { lastDusted: string | null }>(
        'products.get',
        `SELECT q.*, p.notes,
                (SELECT MAX(l.on_date) FROM ledger l WHERE l.product_id = p.id AND l.action = 'dusted') AS lastDusted
         FROM (${PRODUCT}) q JOIN products p ON p.id = q.id
         WHERE q.slug = :slug`,
        { slug },
      );
      return product && { ...product, lastDusted: product.lastDusted ?? undefined };
    },

    alsoConsidered: (product) =>
      db.all<Product>(
        'products.also-considered',
        `${PRODUCT} WHERE d.slug = :department ORDER BY (p.id < :id), p.id LIMIT 3`,
        { department: product.department, id: product.id },
      ),

    featured: () => db.all<Product>('products.featured', `${PRODUCT} WHERE p.featured = 1 ORDER BY p.id LIMIT 4`),

    search(text) {
      const words = text.trim();
      if (!words) return [];
      // GLOB treats *, ? and [ as wildcards; a customer typing them means the characters themselves.
      const pattern = `*${words.replace(/[*?[]/g, (char) => `[${char}]`)}*`;
      return db.all<Product>(
        'products.search',
        `${PRODUCT}
         WHERE p.name GLOB :pattern OR p.summary GLOB :pattern OR p.notes GLOB :pattern
         ORDER BY (p.name GLOB :pattern) DESC, p.id`,
        { pattern },
      );
    },
  };
}
