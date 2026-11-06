/**
 * The files in public/, read once at startup and served under /assets/.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

export interface Asset {
  body: Buffer;
  type: string;
  etag: string;
  /** The Cache-Control header it is sent with. */
  cacheControl: string;
}

const TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/** URL path → asset, for every file under the directory. A file of a type we do not serve stops the server. */
export function loadAssets(directory: string): Map<string, Asset> {
  const assets = new Map<string, Asset>();
  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    const type = TYPES[extname(file)];
    if (!type) throw new Error(`${file}: no content type for this kind of file`);
    const body = readFileSync(file);
    const etag = `"${createHash('sha256').update(body).digest('base64url').slice(0, 16)}"`;
    assets.set(`/assets/${relative(directory, file).split(sep).join('/')}`, {
      body,
      type,
      etag,
      cacheControl: 'no-store',
    });
  }
  return assets;
}
