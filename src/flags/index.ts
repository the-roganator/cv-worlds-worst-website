/**
 * The flag context: whether a flag is on for a request. The one module that asks OpenFeature, and the only code that
 * may import it or flagd's provider (biome.json says so, and `make check` holds the rest of the shop to it).
 *
 * flagd decides; the shop asks. flagd's provider runs in-process: it holds the flag set, streamed from flagd's sync
 * port, and evaluates each request here, so no request waits on flagd. Until the first flag set arrives every flag is
 * off, and the shop serves as ever.
 *
 * Each request's evaluation context has four names, which the admin service's stages target with flagd's JSON Logic:
 *
 *   marked        true when the request carries the factory's mark, `x-unmeasured` (src/measured.ts)
 *   preview       the flags its preview cookie names (preview.ts), with any it asks for now
 *   targetingKey  its share id, only when the signature checks out (share.ts); absent otherwise
 *   signed        true exactly when it has a targetingKey
 *
 * Off, whatever flagd says, when anything goes wrong: an error, a flag flagd does not know, a value that is not a
 * boolean, no flag set yet, or a flag set gone stale. The provider keeps serving its last flag set while flagd is
 * away, so a kill switch would not reach it: once it has been without flagd for a minute, every flag is off until it
 * syncs again.
 *
 * The flag set's revision is a string flag of its own, `flag-set-revision`, which is not a feature. It is told only to
 * a marked request, so the factory can see which flag set the shop holds.
 */
import type { IncomingMessage } from 'node:http';
import { FlagdProvider } from '@openfeature/flagd-provider';
import {
  type Client,
  ErrorCode,
  type EvaluationContext,
  type EvaluationDetails,
  type Logger,
  NOOP_PROVIDER,
  OpenFeature,
  ProviderEvents,
} from '@openfeature/server-sdk';
import { trace } from '@opentelemetry/api';
import type { FlagName } from '../flag-names.ts';
import { log } from '../log.ts';
import { UNMEASURED } from '../measured.ts';
import { PREVIEW, previewAsked, previewable, previewCookie, previewSetCookie } from './preview.ts';
import { type ShareKey, shareKey, signedId } from './share.ts';

export { type ShareKey, shareKey, shareKeyFile } from './share.ts';
export { PREVIEW };

/** The flag that carries the flag set's revision. */
export const REVISION_FLAG = 'flag-set-revision';
/** The response header that tells a marked request the revision. */
export const REVISION_HEADER = 'x-flags-revision';
/** How long the provider may be without flagd before every flag is off. */
export const STALE_AFTER_MS = 60_000;
/**
 * How long a stream to flagd lasts before the provider opens another: each new one is a sign of life, a reconnection
 * the provider tells as it does any other.
 */
const STREAM_MS = 60_000;

/** A revision fit for a header: visible ASCII, not too long. */
const REVISION = /^[\x21-\x7e]{1,128}$/;
/** The words the header uses for no revision; a revision spelt as one of them is told as `invalid`. */
const RESERVED = new Set(['none', 'stale', 'invalid']);

export interface Flags {
  /** The flags for one request, from what it carries. */
  forRequest(req: IncomingMessage, url: URL): RequestFlags;
  /** Whether the shop holds a flag set and is in step with flagd: synced, not lost since, and not silent. */
  inStep(): boolean;
  /** Stops the sync with flagd. */
  close(): Promise<void>;
}

export interface RequestFlags {
  /** Whether `flag`, a name on the list (src/flag-names.ts), is on for this request. Off unless flagd says it is. */
  on(flag: FlagName): Promise<boolean>;
  /**
   * The headers the answer carries, after its route: the preview cookie, on a page's answer (`page`) to a request that
   * asks to preview flags flagd knows; and, when it sets one or the route asked about any flag, `private, no-store`,
   * since the answer then depends on the cookie, the share id or the mark, and no cache in between may keep it.
   */
  headers(page: boolean): Promise<Record<string, string>>;
  /** The flag set's revision, for a marked request only: the value, `none`, `stale` or `invalid`. */
  revision(): Promise<string | undefined>;
}

export interface FlagsOptions {
  /** flagd's sync address, `host:port`, plaintext. Without it there is no flag set, and every flag is off. */
  sync?: string;
  /** The share's public key. Without one, nothing is signed. */
  key?: ShareKey;
  /** The clock, in milliseconds. */
  now?: () => number;
  /** How long to wait before syncing again when flagd drops the stream. */
  reconnectMs?: number;
  /** How long each stream to flagd lasts: more than nothing, or the provider sets no deadline and the watch reopens it. */
  streamMs?: number;
  /** How often the sync is checked for a stream that ended without a word. */
  watchMs?: number;
}

/**
 * How long past a stream's renewal the sync may be silent before it is opened again. The provider renews each stream
 * when its deadline passes, and tells it; silence beyond that means flagd ended the stream cleanly, which the provider
 * neither tells nor recovers from.
 */
const REOPEN_AFTER_MS = 5_000;

let instances = 0;

export function createFlags({
  sync,
  key = shareKey(undefined),
  now = Date.now,
  reconnectMs = 1_000,
  streamMs = STREAM_MS,
  watchMs = 1_000,
}: FlagsOptions = {}): Flags {
  const domain = `shop-${++instances}`;
  const address = sync === undefined ? undefined : syncAddress(sync);
  const syncing = address && start(domain, address, reconnectMs, streamMs);
  const client: Client | undefined = syncing ? syncing.client : undefined;

  // Whether the provider has had a flag set from flagd, when it last heard from flagd, and since when it has been
  // without it. A stream that flagd ends cleanly is not reconnected and says nothing, so silence counts too: a healthy
  // sync reconnects every stream's length, and one silent for that and a minute more is stale. The watch below opens
  // such a stream again.
  let synced = false;
  // Counted from the start, too: a first stream flagd ends before any flag set is as silent as a later one.
  let heardAt = now();
  let lostAt: number | undefined;
  let warned = false;
  const found = () => {
    synced = true;
    heardAt = now();
    lostAt = undefined;
    if (warned) log.info({ event: 'flags' }, 'flag set in step with flagd again');
    warned = false;
  };
  const lost = () => {
    lostAt ??= now();
  };
  client?.addHandler(ProviderEvents.Ready, found);
  client?.addHandler(ProviderEvents.ConfigurationChanged, found);
  client?.addHandler(ProviderEvents.Stale, lost);
  client?.addHandler(ProviderEvents.Error, lost);

  // A stream flagd ended cleanly is opened again, on the same provider, which keeps the flag set it holds meanwhile:
  // once per silence, and only when the provider is not already reconnecting after an error (when it has said it is
  // stale). If flagd is away, the provider says so, and reconnects by itself from then on.
  //
  // This relies on how @openfeature/flagd-provider 0.18 behaves, read from its code: initialize() opens a new stream
  // and closes the one before (GrpcFetch.listen), runs no second reconnect loop while none is pending (none is, after a
  // clean end, as the provider has said nothing), and resolves on the first flag set without telling Ready, hence
  // the Ready told here. The tests of a silent sync fail on a provider that behaves otherwise: one that does not reopen, or
  // opens more than one stream.
  // An attempt that flagd also ends before any flag set is tried again after as long again.
  let reopenedAt = 0;
  const silent = () => now() - Math.max(heardAt, reopenedAt) >= streamMs + REOPEN_AFTER_MS;
  const watch = syncing
    ? setInterval(() => {
        if (lostAt !== undefined || !silent()) return;
        reopenedAt = now();
        log.info({ event: 'flags' }, 'sync with flagd silent: opening it again');
        // Told as Ready, which the provider does not tell for it: OpenFeature then counts a provider whose first
        // stream was ended this way as ready, and the handler above counts the sync as heard.
        syncing.provider.initialize().then(
          () => syncing.provider.events.emit(ProviderEvents.Ready),
          () => {},
        );
      }, watchMs)
    : undefined;
  watch?.unref();

  /** Whether the flag set is fit to answer from: there is one, and flagd has not been away for a minute. */
  const fresh = (): boolean => {
    if (!client || !synced) return false;
    const lost = lostAt !== undefined && now() - lostAt >= STALE_AFTER_MS;
    const silent = now() - heardAt >= streamMs + STALE_AFTER_MS;
    if (!lost && !silent) return true;
    if (!warned) log.warn({ event: 'flags' }, 'flag set stale for a minute: every flag is off until flagd is back');
    warned = true;
    return false;
  };

  /** Whether flagd's flag set holds `flag`, whatever its state. */
  const known = async (flag: string): Promise<boolean> => {
    if (!client || !fresh() || flag === REVISION_FLAG) return false;
    const { errorCode } = await client.getBooleanDetails(flag, false, {});
    return (
      errorCode !== ErrorCode.FLAG_NOT_FOUND &&
      errorCode !== ErrorCode.PROVIDER_NOT_READY &&
      errorCode !== ErrorCode.PROVIDER_FATAL
    );
  };

  return {
    inStep: () => synced && lostAt === undefined && now() - heardAt < streamMs + REOPEN_AFTER_MS,
    forRequest(req, url) {
      const marked = req.headers[UNMEASURED] !== undefined;
      // The revision is not a feature, so a cookie that names it previews nothing by it.
      const cookie = previewCookie(req).filter((flag) => flag !== REVISION_FLAG);
      const asked = previewAsked(url);
      const id = signedId(req, key, Math.floor(now() / 1000));

      // An ask counts only when flagd knows every flag it names; the cookie keeps the flags flagd still knows.
      const previewing: Promise<{ preview: string[]; setCookie?: string }> = (async () => {
        if (!asked) return { preview: cookie };
        const knows = await Promise.all(
          [...new Set([...cookie, ...asked])].map(async (flag) => [flag, await known(flag)] as const),
        );
        const knownFlags = new Set(knows.filter(([, yes]) => yes).map(([flag]) => flag));
        if (!asked.every((flag) => knownFlags.has(flag))) return { preview: cookie };
        const preview = [...new Set([...cookie.filter((flag) => knownFlags.has(flag)), ...asked])];
        return { preview, setCookie: previewSetCookie(preview, req) };
      })().catch(() => ({ preview: cookie }));

      const context = async (): Promise<EvaluationContext> => ({
        marked,
        preview: (await previewing).preview,
        signed: id !== undefined,
        ...(id !== undefined && { targetingKey: id }),
      });

      let consulted = false;
      return {
        async on(name) {
          // Held to the name's shape and kept from the revision at run time too, whatever reaches here.
          const flag: string = name;
          consulted = true;
          if (!client || flag === REVISION_FLAG || !previewable(flag)) return false;
          if (!fresh()) {
            record({ flagKey: flag, value: false, reason: 'STALE' });
            return false;
          }
          try {
            const details = await client.getBooleanDetails(flag, false, await context());
            record(details);
            return details.errorCode === undefined && details.value === true;
          } catch {
            return false;
          }
        },
        async headers(page) {
          const setCookie = page ? (await previewing).setCookie : undefined;
          return {
            ...(setCookie && { 'set-cookie': setCookie }),
            ...((setCookie || consulted) && { 'cache-control': 'private, no-store' }),
          };
        },
        async revision() {
          if (!marked) return undefined;
          if (!client || !synced) return 'none';
          if (!fresh()) return 'stale';
          try {
            const { value, errorCode } = await client.getStringDetails(REVISION_FLAG, '', await context());
            if (errorCode === undefined) return REVISION.test(value) && !RESERVED.has(value) ? value : 'invalid';
            return errorCode === ErrorCode.FLAG_NOT_FOUND ? 'none' : 'invalid';
          } catch {
            return 'invalid';
          }
        },
      };
    },

    async close() {
      clearInterval(watch);
      if (client) await OpenFeature.setProviderAndWait(domain, NOOP_PROVIDER);
    },
  };
}

/** `host:port`, or `undefined`, and a line in the log, when it is not one. */
function syncAddress(sync: string): { host: string; port: number } | undefined {
  const match = /^([a-z0-9.-]+):([0-9]{1,5})$/i.exec(sync);
  const port = Number(match?.[2]);
  if (match?.[1] && port > 0 && port < 65_536) return { host: match[1], port };
  log.error({ event: 'flags' }, 'FLAGS_SYNC is not host:port, so every flag is off');
  return undefined;
}

/**
 * The provider, configured explicitly: it also reads FLAGD_* environment variables, and any of those set on the pod
 * (a socket, a file, TLS, another resolver) would otherwise change where the flags come from. Each is set here, to
 * what the shop means, or to `undefined` so that it does not apply.
 */
function start(
  domain: string,
  { host, port }: { host: string; port: number },
  reconnectMs: number,
  streamMs: number,
): { client: Client; provider: FlagdProvider } {
  const options = {
    resolverType: 'in-process',
    host,
    port,
    tls: false,
    certPath: undefined,
    socketPath: undefined,
    offlineFlagSourcePath: undefined,
    selector: undefined,
    defaultAuthority: undefined,
    deadlineMs: 500,
    // A fresh stream every minute, so a connection that died without a word is noticed within two.
    streamDeadlineMs: streamMs,
    retryBackoffMs: reconnectMs,
    retryBackoffMaxMs: reconnectMs,
    keepAliveTime: 0,
    fatalStatusCodes: [],
    retryGracePeriod: 5,
    // What flagd sends beside the flags is not let into the context: only the four names above are targeted.
    contextEnricher: () => ({}),
  } as const;
  // The provider's types leave `undefined` out of its options, but an explicit `undefined` is what overrides the
  // environment (it merges defaults, then FLAGD_*, then these).
  const provider = new FlagdProvider(options as unknown as ConstructorParameters<typeof FlagdProvider>[0]);
  OpenFeature.setProvider(domain, provider);
  const client = OpenFeature.getClient(domain);
  client.setLogger(QUIET);
  return { client, provider };
}

/**
 * OpenFeature's log, into the shop's: its messages alone, at debug, since a lost flag set is told once, above. Never
 * the context, which can hold a share id.
 */
const QUIET: Logger = {
  error: (message: unknown) => log.debug({ event: 'flags' }, String(message)),
  warn: (message: unknown) => log.debug({ event: 'flags' }, String(message)),
  info: () => {},
  debug: () => {},
};

/**
 * An evaluation, as an event on the request's span, named as OpenTelemetry's semantic conventions for feature flags
 * name it (`feature_flag.evaluation`). Never the context: `feature_flag.context.id` would be the share id.
 */
function record(
  details: Pick<EvaluationDetails<boolean>, 'flagKey' | 'value' | 'reason' | 'variant' | 'errorCode'>,
): void {
  trace.getActiveSpan()?.addEvent('feature_flag.evaluation', {
    'feature_flag.key': details.flagKey,
    'feature_flag.provider.name': 'flagd',
    'feature_flag.result.value': details.errorCode === undefined && details.value === true,
    ...(details.variant !== undefined && { 'feature_flag.result.variant': details.variant }),
    ...(details.reason !== undefined && { 'feature_flag.result.reason': details.reason.toLowerCase() }),
    ...(details.errorCode !== undefined && { 'error.type': details.errorCode.toLowerCase() }),
  });
}
