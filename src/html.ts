/**
 * HTML by tagged template. Every interpolated value is escaped unless it is itself the result of `html`,
 * so a page cannot forget to escape something.
 *
 *     html`<h1>${product.name}</h1>${items.map((item) => html`<li>${item}</li>`)}`
 */
export class Html {
  readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  toString(): string {
    return this.text;
  }
}

type Value = Html | string | number | false | null | undefined | Value[];

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

function render(value: Value): string {
  if (value instanceof Html) return value.text;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === false || value === null || value === undefined) return '';
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: Value[]): Html {
  let text = strings[0] ?? '';
  for (const [i, value] of values.entries()) text += render(value) + (strings[i + 1] ?? '');
  return new Html(text);
}
