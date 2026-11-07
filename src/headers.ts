/**
 * The security headers the shop sends with every response (`src/app.ts`), whatever the route.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
};
