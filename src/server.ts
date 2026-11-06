/**
 * Starts the shop.
 *
 *     node --import ./src/telemetry.ts src/server.ts
 *
 * PORT sets the port (default 8080); GIT_COMMIT is the commit the build was made from, set by the image;
 * DATABASE is the catalogue database (default data/shop.db, which `pnpm seed` builds); FLAGS_SYNC is flagd's sync
 * address, `host:port` in plaintext (without it every flag is off); SHARE_PUBLIC_KEY_FILE is the share's public key, in
 * PEM (without it no request is signed).
 */
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.ts';
import { createFlags, shareKeyFile } from './flags/index.ts';
import { log } from './log.ts';
import { createShop } from './shop.ts';
import { shutdownTelemetry } from './telemetry.ts';

const port = Number(process.env.PORT ?? 8080);
const commit = process.env.GIT_COMMIT ?? 'dev';
const db = openDatabase(process.env.DATABASE ?? fileURLToPath(new URL('../data/shop.db', import.meta.url)));

// The flags sync in the background: until flagd answers, the shop serves with every flag off.
const flags = createFlags({
  ...(process.env.FLAGS_SYNC && { sync: process.env.FLAGS_SYNC }),
  key: shareKeyFile(process.env.SHARE_PUBLIC_KEY_FILE),
});

const server = createServer(createShop({ commit, db, flags }));
server.listen(port, () => log.info({ port, commit }, `shop open on :${port}`));

// Kubernetes sends SIGTERM before it stops the pod: finish the requests in flight, then flush telemetry.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    log.info({ signal }, 'shop closing');
    server.close(() => void Promise.allSettled([flags.close(), shutdownTelemetry()]).finally(() => process.exit(0)));
    server.closeIdleConnections();
  });
}
