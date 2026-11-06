/**
 * A catalogue for tests, so they do not depend on what the shop happens to sell this week: three departments
 * and thirty products, enough for three pages.
 */
import type { CatalogueFile } from '../../scripts/seed.ts';

const DEPARTMENTS = ['kitchen', 'garden', 'shed'] as const;

const NOTES: Record<number, string> = {
  2: 'Often mistaken for number 21.',
  12: 'Gerald calls this one the under_score.',
};

export const TEST_CATALOGUE: CatalogueFile = {
  departments: DEPARTMENTS.map((slug) => ({
    slug,
    name: slug[0]?.toUpperCase() + slug.slice(1),
    blurb: `Things for the ${slug}.`,
  })),
  products: Array.from({ length: 30 }, (_, i) => {
    const id = i + 1;
    const department = DEPARTMENTS[i % 3] ?? 'kitchen';
    return {
      id,
      slug: `thing-${id}`,
      name: `Thing, number ${id}`,
      department,
      pricePence: 100 + id * 25,
      summary: id === 7 ? 'The only one described as 100% lucky.' : `A thing for the ${department}.`,
      notes: NOTES[id] ?? `Notes on thing ${id}.`,
      drawingAlt: `A drawing of thing ${id}.`,
      stock: id % 4,
      sold: id % 5,
      featured: id <= 4,
      // Thing 6 is the one Gerald does not dust.
      dusted: id !== 6,
    };
  }),
};
