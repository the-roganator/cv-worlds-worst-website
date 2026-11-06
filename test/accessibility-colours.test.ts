import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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

describe('colours', () => {
  const css = readFileSync(fileURLToPath(new URL('../public/site.css', import.meta.url)), 'utf-8');
  const colour = (name: string) => css.match(new RegExp(`--${name}: (#[0-9a-f]{6});`))?.[1] ?? '';

  // Each pair is text on the background it is used on. AA asks for 4.5 to 1.
  it.each([
    ['ink', 'paper'],
    ['ink', 'card'],
    ['link', 'paper'],
    ['link', 'card'],
    ['alert', 'paper'],
    ['paper', 'ink'],
  ])('%s on %s can be read', (text, background) => {
    expect(contrast(colour(text), colour(background))).toBeGreaterThanOrEqual(4.5);
  });

  it('are only ever the named ones', () => {
    const [, rules = ''] = css.split(/^}$/m, 2);
    expect(css.slice(css.indexOf(rules)).match(/#[0-9a-f]{3,6}\b/g)).toBeNull();
  });
});
