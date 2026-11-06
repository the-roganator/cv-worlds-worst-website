/**
 * Builds the catalogue database from data/catalogue.json. The image runs this once, at build time, and the
 * server opens the result read-only.
 *
 *     node scripts/seed.ts [catalogue.json] [shop.db]
 *
 * The output is the same every time: the ledger is generated from a fixed seed and fixed dates, never the clock.
 */
import { readFileSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

export interface CatalogueFile {
  departments: { slug: string; name: string; blurb: string }[];
  products: {
    id: number;
    slug: string;
    name: string;
    department: string;
    pricePence: number;
    summary: string;
    notes: string;
    drawingAlt: string;
    stock: number;
    /** How many Gerald has sold since the shop opened. */
    sold: number;
    featured?: boolean;
    /** False for the one thing Gerald does not dust. */
    dusted?: boolean;
  }[];
}

const SCHEMA = `
  CREATE TABLE departments (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    blurb TEXT NOT NULL,
    position INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    department_id INTEGER NOT NULL REFERENCES departments (id),
    price_pence INTEGER NOT NULL CHECK (price_pence > 0),
    summary TEXT NOT NULL,
    notes TEXT NOT NULL,
    drawing TEXT NOT NULL,
    drawing_alt TEXT NOT NULL,
    featured INTEGER NOT NULL DEFAULT 0
  ) STRICT;

  -- Gerald's ledger: one row each time an item is delivered, sold, dusted or checked to be still there.
  CREATE TABLE ledger (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products (id),
    on_date TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('delivered', 'sold', 'dusted', 'checked')),
    quantity INTEGER NOT NULL
  ) STRICT;

  CREATE INDEX ledger_by_product ON ledger (product_id, action);
`;

/** The shop opened on the first Monday of March, and the ledger runs to the end of September. */
const OPENED = Date.UTC(2026, 2, 2);
const DAYS = 213;
/** Gerald checks that each item is still there every quarter of an hour, nine till five. */
const CHECKS_PER_DAY = 32;

/** A small seeded generator (mulberry32), so the ledger never changes between builds. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isoDate = (day: number) => new Date(OPENED + day * 86_400_000).toISOString().slice(0, 10);

/** Every day the shop has been open: Monday to Saturday. */
const OPEN_DAYS = Array.from({ length: DAYS }, (_, day) => isoDate(day)).filter(
  (date) => new Date(date).getUTCDay() !== 0,
);

export function seed(catalogueFile: string, dbFile: string): void {
  const catalogue = JSON.parse(readFileSync(catalogueFile, 'utf-8')) as CatalogueFile;
  rmSync(dbFile, { force: true });
  const db = new DatabaseSync(dbFile);
  db.exec('PRAGMA journal_mode = OFF; PRAGMA foreign_keys = ON; BEGIN');
  db.exec(SCHEMA);

  const addDepartment = db.prepare('INSERT INTO departments (id, slug, name, blurb, position) VALUES (?, ?, ?, ?, ?)');
  const departmentIds = new Map<string, number>();
  for (const [i, department] of catalogue.departments.entries()) {
    addDepartment.run(i + 1, department.slug, department.name, department.blurb, i + 1);
    departmentIds.set(department.slug, i + 1);
  }

  const addProduct = db.prepare(
    `INSERT INTO products (id, slug, name, department_id, price_pence, summary, notes, drawing, drawing_alt, featured)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const addEntry = db.prepare('INSERT INTO ledger (product_id, on_date, action, quantity) VALUES (?, ?, ?, ?)');

  for (const product of catalogue.products) {
    const departmentId = departmentIds.get(product.department);
    if (departmentId === undefined) throw new Error(`${product.slug}: no department called "${product.department}"`);
    addProduct.run(
      product.id,
      product.slug,
      product.name,
      departmentId,
      product.pricePence,
      product.summary,
      product.notes,
      `${product.slug}.svg`,
      product.drawingAlt,
      product.featured ? 1 : 0,
    );

    // Everything arrives on opening day; each sale falls on an open day of its own; dusting is on Tuesdays.
    const next = random(product.id);
    const soldOn = new Set<string>();
    while (soldOn.size < product.sold) soldOn.add(OPEN_DAYS[Math.floor(next() * OPEN_DAYS.length)] ?? '');
    addEntry.run(product.id, isoDate(0), 'delivered', product.stock + product.sold);
    for (const date of OPEN_DAYS) {
      for (let check = 0; check < CHECKS_PER_DAY; check++) addEntry.run(product.id, date, 'checked', 0);
      if (product.dusted !== false && new Date(date).getUTCDay() === 2) addEntry.run(product.id, date, 'dusted', 0);
      if (soldOn.has(date)) addEntry.run(product.id, date, 'sold', -1);
    }
  }

  db.exec('COMMIT; PRAGMA optimize; VACUUM');
  db.close();
}

if (import.meta.main) {
  const [catalogueFile, dbFile] = process.argv.slice(2);
  const fromRoot = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
  seed(catalogueFile ?? fromRoot('data/catalogue.json'), dbFile ?? fromRoot('data/shop.db'));
}
