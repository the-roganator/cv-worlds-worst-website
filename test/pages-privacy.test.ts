import { describe, expect, it } from 'vitest';
import { tags, textOf } from './support/html.ts';
import { useShop } from './support/shop.ts';

const shop = useShop();

describe('the privacy page', () => {
  it('says what the shop keeps, under a heading for each thing a visitor does', async () => {
    const { status, body } = await shop.get('/privacy');
    expect(status).toBe(200);
    expect(tags(body, 'h1')[0]?.text).toBe('Privacy');
    expect(tags(body, 'h2').map((h) => h.text)).toEqual([
      'Reporting a problem',
      'Writing to Gerald',
      'What the shop notes',
      'Trying something new',
    ]);
  });

  // Nothing unless they ask, and then only the preview cookie, which the next test names.
  it('says that nothing is kept on the visitor’s device', async () => {
    const text = textOf((await shop.get('/privacy')).body);
    expect(text).toContain('We keep nothing on your computer or telephone unless you ask us to');
    expect(text).not.toContain('The shop sets no cookies');
  });

  it('names the preview cookie: what it holds, why, how long it lasts and how to remove it', async () => {
    const text = textOf((await shop.get('/privacy')).body);
    expect(text).toContain('the shop keeps one cookie on your computer or telephone, called “preview”.');
    expect(text).toContain('It holds the names of the changes you asked to try, and nothing about you');
    expect(text).toContain('so that the next page shows them too.');
    expect(text).toContain('It lasts a day from the last time you asked, and then your browser deletes it.');
    expect(text).toContain("You can delete it sooner in your browser's settings.");
  });

  it('says where a report goes, and that it is never shown on the shop', async () => {
    const text = textOf((await shop.get('/privacy')).body);
    expect(text).toContain('what you type in it, and which page you were on, with anything you had searched for');
    expect(text).toContain('an AI model from a company called TypeSafe');
    expect(text).toContain('Email addresses and long numbers are taken out before it goes to them.');
    expect(text).toContain('A report is never shown on the shop.');
  });

  it('says a report cannot be found again, is deleted after 30 days, and should hold no personal details', async () => {
    const text = textOf((await shop.get('/privacy')).body);
    expect(text).toContain(
      'A report does not tell us who you are, so we cannot find yours to show it to you or to remove it early.',
    );
    expect(text).toContain('Every report is deleted after 30 days.');
    expect(text).toContain('Please leave your name and any other personal details out of it.');
    expect(text).not.toContain('as long as it is useful');
  });

  it('says who runs the shop, at its foot, linking to the shop’s repository', async () => {
    const { body } = await shop.get('/privacy');
    const main = body.slice(body.indexOf('<main'), body.indexOf('</main>'));
    expect(tags(main, 'p').at(-1)?.text).toBe('This shop is run by Martin Rogan as a demonstration.');
    const link = tags(main, 'a').at(-1);
    expect([link?.attributes.href, link?.text]).toEqual([
      'https://github.com/the-roganator/cv-worlds-worst-website',
      'demonstration',
    ]);
  });

  it('says what the contact form keeps, and how long anything else noted is kept', async () => {
    const text = textOf((await shop.get('/privacy')).body);
    expect(text).toContain('What you write in the contact form is for Gerald alone. It is not passed to anyone else.');
    expect(text).toContain('What you search for is noted with the page, for up to 3 days.');
    expect(text).toContain('Your internet address is used only to limit how many reports can be sent');
    expect(text).toContain('Apart from reports, everything the shop notes is kept for up to 7 days.');
  });
});
