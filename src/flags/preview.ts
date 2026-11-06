/**
 * The preview cookie: the flags a browser asked to preview, with `?preview=<flag>` on any page.
 *
 * The contract is the factory's (docs/COMPONENTS/FEATURE-FLAGS.md, "The preview cookie", in
 * the-roganator/cv-software-factory), whose probes hold every attribute to it. It is the one thing the shop keeps on
 * a visitor's device, and only for one who asks. The cookie names flags and decides nothing: flagd does.
 */
import type { IncomingMessage } from 'node:http';

export const PREVIEW = 'preview';
/** A day from the latest ask. */
export const PREVIEW_MAX_AGE = 86_400;

/** Lower-case letters and digits, in words joined by hyphens. A flag named otherwise cannot be previewed. */
const FLAG_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const previewable = (name: string): boolean => FLAG_NAME.test(name);

/** The valid flag names the request's preview cookie holds, each once, in order. */
export function previewCookie(req: Pick<IncomingMessage, 'headers'>): string[] {
  const value = (req.headers.cookie ?? '')
    .split(';')
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${PREVIEW}=`))
    ?.slice(PREVIEW.length + 1);
  return unique((value ?? '').split('.').filter(previewable));
}

/** The flags the request asks to preview, or `undefined` when it asks for none or names one that cannot be. */
export function previewAsked(url: URL): string[] | undefined {
  const asked = url.searchParams.getAll(PREVIEW);
  if (asked.length === 0 || !asked.every(previewable)) return undefined;
  return unique(asked);
}

/** The cookie that remembers `flags`, Secure exactly when the request reached the shop over HTTPS. */
export function previewSetCookie(flags: string[], req: Pick<IncomingMessage, 'headers' | 'socket'>): string {
  const secure =
    (req.socket as { encrypted?: boolean }).encrypted === true ||
    req.headers['x-forwarded-proto']?.toString().trim().toLowerCase() === 'https';
  return [
    `${PREVIEW}=${flags.join('.')}`,
    'Path=/',
    `Max-Age=${PREVIEW_MAX_AGE}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

const unique = (names: string[]): string[] => [...new Set(names)];
