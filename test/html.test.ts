import { describe, expect, it } from 'vitest';
import { html } from '../src/html.ts';

describe('html', () => {
  it('escapes what is interpolated', () => {
    expect(html`<p>${'<script>"a" & \'b\'</script>'}</p>`.text).toBe(
      '<p>&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/script&gt;</p>',
    );
  });

  it('leaves nested html alone', () => {
    expect(html`<ul>${html`<li>${'a & b'}</li>`}</ul>`.text).toBe('<ul><li>a &amp; b</li></ul>');
  });

  it('joins lists without commas', () => {
    expect(html`<ul>${['a', 'b'].map((item) => html`<li>${item}</li>`)}</ul>`.text).toBe(
      '<ul><li>a</li><li>b</li></ul>',
    );
  });

  it('renders numbers, and nothing for false, null and undefined', () => {
    expect(html`${0}|${false}|${null}|${undefined}|${12}`.text).toBe('0||||12');
  });
});
