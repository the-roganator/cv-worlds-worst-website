import { describe, expect, it } from 'vitest';
import { tags, textOf } from './support/html.ts';
import { useShop } from './support/shop.ts';

const shop = useShop({ catalogue: 'real' });

describe('the about page', () => {
  it('introduces Gerald, the garage and Darren', async () => {
    const { status, body } = await shop.get('/about');
    expect(status).toBe(200);
    expect(tags(body, 'h2').map((h) => h.text)).toEqual(['Gerald', 'The garage', 'Darren', 'A short history']);
    expect(textOf(body)).toContain('31 years in the signage department of Thrumble District Council');
  });

  it('gives the opening hours', async () => {
    expect(textOf((await shop.get('/about')).body)).toContain(
      'We are open Monday to Saturday, nine till five, and closed on Sundays.',
    );
  });

  it('tells the shop’s history, month by month', async () => {
    const { body } = await shop.get('/about');
    expect(tags(body, 'dt').map((dt) => dt.text)).toEqual(['March', 'April', 'May', 'June', 'September']);
  });
});
