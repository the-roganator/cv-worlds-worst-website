/**
 * Which requests the shop keeps a record of, in its request log, its request metrics and its traces alike: those its
 * visitors make. Health checks come every few seconds, and a record of each would bury the requests that matter. A
 * monitoring client that sends `x-unmeasured`, whatever its value, is left out too: its own pictures and comparisons of
 * the shop are not visits. An error such a request causes is still logged.
 */
import type { IncomingMessage } from 'node:http';

export const UNMEASURED = 'x-unmeasured';

export function measured(req: Pick<IncomingMessage, 'url' | 'headers'>): boolean {
  return URL.parse(req.url ?? '/', 'http://website')?.pathname !== '/health' && req.headers[UNMEASURED] === undefined;
}
