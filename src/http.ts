/**
 * The shapes a route works with: what came in, what goes out, and how a path is matched to a handler.
 */
import type { FlagName } from './flag-names.ts';

export interface Request {
  url: URL;
  /** The named parts of the route's path: `/products/:slug` gives `params.slug`. */
  params: Record<string, string>;
  /** The request body, already read. Empty for a GET. */
  body: Buffer;
  contentType: string;
  /** An address for the client, for rate limiting only. */
  client: string;
  /** Whether a feature flag is on for this request: off unless flagd says so (src/flags/). Only a name on the list. */
  flag(name: FlagName): Promise<boolean>;
}

export interface Reply {
  status: number;
  type: string;
  body: string | Buffer;
  headers?: Record<string, string>;
}

export interface Route {
  method: 'GET' | 'POST';
  /** The path, with `:name` for a part that varies. Also the route's name in traces and metrics. */
  path: string;
  handle(request: Request): Reply | Promise<Reply>;
}

export const HTML = 'text/html; charset=utf-8';
export const JSON_TYPE = 'application/json; charset=utf-8';

export const json = (status: number, value: unknown, headers?: Record<string, string>): Reply => ({
  status,
  type: JSON_TYPE,
  body: `${JSON.stringify(value)}\n`,
  ...(headers && { headers }),
});

/** Matches a path against a route's pattern. Returns the named parts, or `undefined` if it does not match. */
export function matchPath(pattern: string, path: string): Record<string, string> | undefined {
  const wanted = pattern.split('/');
  const given = path.split('/');
  if (wanted.length !== given.length) return undefined;
  const params: Record<string, string> = {};
  for (const [i, part] of wanted.entries()) {
    const value = given[i] ?? '';
    if (part.startsWith(':')) {
      if (!value) return undefined;
      try {
        params[part.slice(1)] = decodeURIComponent(value);
      } catch {
        return undefined; // not valid percent-encoding, so not a path we serve
      }
    } else if (part !== value) return undefined;
  }
  return params;
}
