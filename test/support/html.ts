/**
 * Just enough reading of HTML for the tests: the tags of a kind, and their attributes.
 */
export interface Tag {
  attributes: Record<string, string>;
  /** The text between the opening and closing tags, for tags that have one. */
  text: string;
}

const unescapeHtml = (text: string) =>
  text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');

/** Every `<name …>` in the page, with its attributes and, where it has a closing tag, its text. */
export function tags(page: string, name: string): Tag[] {
  return [...page.matchAll(new RegExp(`<${name}\\b([^>]*)>(?:([\\s\\S]*?)</${name}>)?`, 'g'))].map(
    ([, attributes = '', text = '']) => ({
      attributes: Object.fromEntries(
        [...attributes.matchAll(/([a-z-]+)(?:="([^"]*)")?/g)].map(([, key, value]) => [key, unescapeHtml(value ?? '')]),
      ),
      text: unescapeHtml(
        text
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      ),
    }),
  );
}

/** The page's visible text, more or less: tags removed and space collapsed. */
export function textOf(page: string): string {
  return unescapeHtml(
    page
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

/** Where the page's links lead, leaving out links to other sites. */
export function linksOf(page: string): string[] {
  return tags(page, 'a')
    .map((tag) => tag.attributes.href ?? '')
    .filter((href) => href.startsWith('/'));
}
