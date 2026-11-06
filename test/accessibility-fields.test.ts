import { describe, expect, it } from 'vitest';
import { tags } from './support/html.ts';
import { useShop } from './support/shop.ts';

const shop = useShop();

describe('form fields', () => {
  it.each(['/', '/contact'])('on %s all have a label', async (path) => {
    const { body } = await shop.get(path);
    const labelled = new Set(tags(body, 'label').map((label) => label.attributes.for));
    const fields = [...tags(body, 'input'), ...tags(body, 'textarea')].filter((f) => f.attributes.type !== 'hidden');
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) expect(labelled.has(field.attributes.id), field.attributes.name).toBe(true);
  });
});
