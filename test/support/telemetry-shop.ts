/**
 * A shop for the telemetry test (flags-telemetry.test.ts), run in a process of its own with the shop's telemetry
 * preloaded, as the image runs it:
 *
 *     node --import ./src/telemetry.ts test/support/telemetry-shop.ts
 *
 * Its routes ask the flag context whether a flag is on, and one fails, so its spans and logs hold what a flagged
 * page's and an error's would. It prints its port as one JSON line, and on SIGTERM flushes its telemetry and exits.
 * FLAGS_SYNC and SHARE_PUBLIC_KEY_FILE are the server's.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../src/app.ts';
import { createFlags, shareKeyFile } from '../../src/flags/index.ts';
import { json } from '../../src/http.ts';
import { failed, notFound } from '../../src/pages/index.ts';
import { shutdownTelemetry } from '../../src/telemetry.ts';
import { anyFlag } from './flagd.ts';

const flags = createFlags({
  ...(process.env.FLAGS_SYNC && { sync: process.env.FLAGS_SYNC }),
  key: shareKeyFile(process.env.SHARE_PUBLIC_KEY_FILE),
});

const server = createServer(
  createApp({
    commit: 'test',
    flags,
    assets: new Map(),
    notFound,
    failed,
    routes: [
      {
        method: 'GET',
        path: '/flag/:name',
        handle: async (request) => json(200, { on: await request.flag(anyFlag(request.params.name ?? '')) }),
      },
      {
        method: 'GET',
        path: '/broken',
        handle: () => {
          throw new Error('the till drawer jammed');
        },
      },
    ],
  }),
);

const ready = setInterval(() => {
  if (!flags.inStep()) return;
  clearInterval(ready);
  server.listen(0, '127.0.0.1', () => {
    process.stdout.write(`${JSON.stringify({ port: (server.address() as AddressInfo).port })}\n`);
  });
}, 20);

process.once('SIGTERM', () => {
  server.close(() => void Promise.allSettled([flags.close(), shutdownTelemetry()]).finally(() => process.exit(0)));
  server.closeAllConnections();
});
