/**
 * The share's signed ids: which of the factory's traffic generator's requests carry an id the shop may target by.
 *
 * The contract is the factory's (docs/COMPONENTS/FEATURE-FLAGS.md, "The share's signed ids", in
 * the-roganator/cv-software-factory): three headers, each sent once; the time in whole seconds, less than a minute old
 * and not from the future by the shop's own clock; and an Ed25519 signature over six length-prefixed fields, built from
 * the shop's own view of the request (its `Host`, method and request target), never from anything else it says about
 * itself. Anything else, and the request is not signed.
 *
 * The shop holds only the public key, in a file mounted from the cluster. With no file, or one it cannot read as an
 * Ed25519 public key, nothing is signed and the shop still serves. The id and its signature are a bearer credential
 * for one page and one minute: nothing here logs them, and nothing else may.
 */
import { createPublicKey, type KeyObject, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';

const CONTEXT = 'software-factory share-id v1';
const MAX_AGE_SECONDS = 60;
/** How often the key file is read again, so a key mounted or changed after the shop starts is taken up. */
const REREAD_MS = 60_000;

/** Visible ASCII, as the contract's fields are; anything else cannot have been signed by the generator. */
const VISIBLE = /^[\x21-\x7e]+$/;
const DIGITS = /^[0-9]{1,15}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/;

export const SHARE_HEADERS = ['x-share-id', 'x-share-time', 'x-share-signature'] as const;

export interface ShareKey {
  /** The public key, or `undefined` when there is none to read. */
  current(): KeyObject | undefined;
}

/** The key in a PEM file, read when first needed and again at most once a minute. */
export function shareKeyFile(path: string | undefined, now: () => number = Date.now): ShareKey {
  let key: KeyObject | undefined;
  let readAt = Number.NEGATIVE_INFINITY;
  return {
    current() {
      if (!path) return undefined;
      if (now() - readAt >= REREAD_MS) {
        readAt = now();
        key = readKey(path);
      }
      return key;
    },
  };
}

/** A key held in memory, for tests. */
export function shareKey(pem: string | undefined): ShareKey {
  const key = pem === undefined ? undefined : parseKey(pem);
  return { current: () => key };
}

function readKey(path: string): KeyObject | undefined {
  try {
    return parseKey(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

function parseKey(pem: string): KeyObject | undefined {
  try {
    const key = createPublicKey(pem);
    return key.asymmetricKeyType === 'ed25519' ? key : undefined;
  } catch {
    return undefined;
  }
}

/** The six fields, each its UTF-8 bytes after its length as an unsigned 32-bit big-endian integer. */
export function shareMessage(fields: { id: string; time: string; host: string; method: string; path: string }): Buffer {
  return Buffer.concat(
    [CONTEXT, fields.id, fields.time, fields.host, fields.method, fields.path].flatMap((field) => {
      const bytes = Buffer.from(field, 'utf8');
      const length = Buffer.alloc(4);
      length.writeUInt32BE(bytes.length);
      return [length, bytes];
    }),
  );
}

/**
 * The request's share id, when its signature checks out for this request, at `nowSeconds`; otherwise `undefined`.
 */
export function signedId(
  req: Pick<IncomingMessage, 'headersDistinct' | 'method' | 'url'>,
  share: ShareKey | KeyObject | undefined,
  nowSeconds: number,
): string | undefined {
  const [id, time, signature, host] = [...SHARE_HEADERS, 'host'].map((name) => once(req.headersDistinct[name]));
  if (id === undefined || time === undefined || signature === undefined || host === undefined) return;
  // The key is read only for a request that carries all three, which only the traffic generator sends.
  const key = share && 'current' in share ? share.current() : share;
  if (!key) return;
  if (!VISIBLE.test(id) || !DIGITS.test(time) || !SIGNATURE.test(signature)) return;

  const age = nowSeconds - Number(time);
  if (!(age >= 0 && age < MAX_AGE_SECONDS)) return;

  const path = req.url ?? '';
  const method = (req.method ?? '').toUpperCase();
  if (!VISIBLE.test(host) || !VISIBLE.test(path) || !VISIBLE.test(method)) return;

  const bytes = Buffer.from(signature, 'base64url');
  // Only the one encoding of those 64 bytes, so that a signature has exactly one spelling.
  if (bytes.length !== 64 || bytes.toString('base64url') !== signature) return;

  const message = shareMessage({ id, time, host: host.toLowerCase(), method, path });
  try {
    return verify(null, message, key, bytes) ? id : undefined;
  } catch {
    return undefined;
  }
}

/** The header's value when the request sent it exactly once. */
function once(values: string[] | undefined): string | undefined {
  return values?.length === 1 ? values[0] : undefined;
}
