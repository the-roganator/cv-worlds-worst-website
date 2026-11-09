import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { FlagName } from '../src/flag-names.ts';
import type { Flags } from '../src/flags/index.ts';
import { tags } from './support/html.ts';
import { useShop } from './support/shop.ts';

/** Flags whose answer for every request is `answer(name)`, as a request's `flag` stub would give. */
function stubbed(answer: (name: FlagName) => boolean): Flags {
  return {
    forRequest: () => ({
      on: async (name) => answer(name),
      headers: async () => ({}),
      revision: async () => undefined,
    }),
    inStep: () => true,
    close: async () => {},
  };
}

const off = useShop({ flags: () => stubbed(() => false) });
const on = useShop({ flags: () => stubbed((name) => name === 'dark-mode') });

const PAGES = ['/', '/products', '/products/thing-1', '/about', '/contact', '/privacy', '/search', '/no-such-page'];
const DARK = '<link rel="stylesheet" href="/assets/dark.css" media="(prefers-color-scheme: dark)">';

const stylesheets = (body: string) =>
  tags(body, 'link')
    .filter((link) => link.attributes.rel === 'stylesheet')
    .map((link) => link.attributes.href);

describe('with the dark-mode flag on', () => {
  it.each(PAGES)('%s links the dark stylesheet under the dark media query, after the main one', async (path) => {
    const { body } = await on.get(path);
    expect(stylesheets(body)).toEqual(['/assets/site.css', '/assets/dark.css']);
    expect(body).toContain(DARK);
    expect(body.indexOf('/assets/site.css')).toBeLessThan(body.indexOf('/assets/dark.css'));
  });

  it('serves a dark stylesheet that names every colour, each pair readable', async () => {
    const { status, body } = await on.get('/assets/dark.css');
    expect(status).toBe(200);
    const colour = (name: string) => body.match(new RegExp(`--${name}: (#[0-9a-f]{6});`))?.[1] ?? '';
    for (const name of ['paper', 'card', 'ink', 'link', 'alert', 'quiet', 'rule'])
      expect(colour(name), name).not.toBe('');
    expect(body).toContain('prefers-color-scheme: dark');
    for (const [text, background] of [
      ['ink', 'paper'],
      ['ink', 'card'],
      ['link', 'paper'],
      ['link', 'card'],
      ['alert', 'paper'],
      ['alert', 'card'],
      ['quiet', 'paper'],
      ['quiet', 'card'],
      ['paper', 'ink'],
    ] as const) {
      expect(contrast(colour(text), colour(background)), `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(PAGES)('%s has no colour scheme switch, and sets no cookie', async (path) => {
    const { headers, body } = await on.get(path);
    expect(headers.getSetCookie()).toEqual([]);
    expect(body).not.toMatch(/<(button|input|select)[^>]*(dark|theme|scheme)/i);
    expect(body).not.toMatch(/localStorage|sessionStorage/);
    expect(tags(body, 'button').map((button) => button.text)).not.toContainEqual(expect.stringMatching(/dark|theme/i));
  });

  it('links it on a page that failed, too', async () => {
    const { status, body } = await on.get('/no-such-page');
    expect(status).toBe(404);
    expect(body).toContain(DARK);
  });
});

describe('with the dark-mode flag off', () => {
  it.each(PAGES)('%s links no dark stylesheet', async (path) => {
    const { body } = await off.get(path);
    expect(stylesheets(body)).toEqual(['/assets/site.css']);
    expect(body).not.toContain('dark.css');
  });

  it.each(PAGES)('%s is the page the flag on gives, less the dark link', async (path) => {
    const flagOff = (await off.get(path)).body;
    const flagOn = (await on.get(path)).body;
    expect(flagOn.replace(`\n    ${DARK}`, '')).toBe(flagOff);
  });

  it('leaves site.css as it is', async () => {
    const served = (await off.get('/assets/site.css')).body;
    const file = readFileSync(fileURLToPath(new URL('../public/site.css', import.meta.url)), 'utf-8');
    expect(served).toBe(file);
    const [, rules = ''] = file.split(/^}$/m, 2);
    expect(file.slice(file.indexOf(rules)).match(/#[0-9a-f]{3,6}\b/g)).toBeNull();
  });
});

/** WCAG's contrast ratio between two colours written as #rrggbb. */
function contrast(one: string, other: string): number {
  const luminance = (colour: string) => {
    const [r = 0, g = 0, b = 0] = [1, 3, 5].map((at) => {
      const channel = Number.parseInt(colour.slice(at, at + 2), 16) / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [lighter = 0, darker = 0] = [luminance(one), luminance(other)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}
