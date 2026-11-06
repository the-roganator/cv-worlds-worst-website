import { describe, expect, it } from 'vitest';
import { tags, textOf } from './support/html.ts';
import { useShop } from './support/shop.ts';

const shop = useShop();
const valid = { name: 'Ada', email: 'ada@example.org', message: 'Is item 9 still available?' };

describe('the contact page', () => {
  it('offers a form for a name, an email address and a message', async () => {
    const { status, body } = await shop.get('/contact');
    expect(status).toBe(200);
    expect(tags(body, 'form')[0]?.attributes).toMatchObject({ method: 'post', action: '/contact' });
    expect(tags(body, 'label').map((label) => label.text)).toContain('Your email address');
  });

  it('says how long a message may be', async () => {
    const { body } = await shop.get('/contact');
    expect(tags(body, 'textarea').find((t) => t.attributes.id === 'message')?.attributes.maxlength).toBe('2000');
  });

  it('thanks the sender of a complete message', async () => {
    const { status, body } = await shop.post('/contact', valid);
    expect(status).toBe(200);
    expect(tags(body, 'h1')[0]?.text).toBe('Thank you');
    expect(textOf(body)).toContain('Gerald reads every message, usually on a Thursday.');
  });

  it('does not repeat the message back', async () => {
    expect((await shop.post('/contact', valid)).body).not.toContain('item 9');
  });

  it('says what is missing, beside the field it is missing from', async () => {
    const { status, body } = await shop.post('/contact', { ...valid, email: '' });
    expect(status).toBe(422);
    expect(tags(body, 'p').find((p) => p.attributes.id === 'email-error')?.text).toBe(
      'Please give an email address, so that Gerald can reply.',
    );
    expect(tags(body, 'input').find((i) => i.attributes.id === 'email')?.attributes['aria-describedby']).toBe(
      'email-error',
    );
    expect(tags(body, 'p').some((p) => p.attributes.role === 'alert')).toBe(true);
  });

  it('rejects an address that is not one', async () => {
    const { status, body } = await shop.post('/contact', { ...valid, email: 'ada at example' });
    expect(status).toBe(422);
    expect(textOf(body)).toContain('That does not look like an email address.');
  });
});
