/**
 * A stand-in for flagd's sync port: the one call of `flagd.sync.v1.FlagSyncService` that flagd's in-process provider
 * makes, `SyncFlags`, a stream of flag sets. It sends the flag set it holds when a provider connects, and again each
 * time a test changes it, as flagd does when its `FeatureFlag` changes.
 *
 * Its one message, SyncFlagsResponse, is written by hand: its field 1, `flag_configuration`, is the flag set as JSON.
 */
import { Server, ServerCredentials, type ServerWritableStream, type ServiceDefinition } from '@grpc/grpc-js';
import type { FlagName } from '../../src/flag-names.ts';

/**
 * Any name, as the type keeps the shop's own code from asking: the flag context is held to what it does with whatever
 * reaches it.
 */
export const anyFlag = (name: string) => name as FlagName;

export interface FlagdFlag {
  state: 'ENABLED' | 'DISABLED';
  variants: Record<string, boolean | string>;
  defaultVariant: string;
  targeting?: unknown;
}

export interface FakeFlagd {
  /** `host:port`, for FLAGS_SYNC. */
  address: string;
  /** Replaces the flag set, and sends it to every provider connected. */
  set(flags: Record<string, FlagdFlag>): void;
  /** How many providers have connected. */
  connections(): number;
  /** Ends every stream cleanly, as flagd does when it shuts down gracefully, and goes on answering. */
  end(): void;
  /** While on, ends each new stream cleanly before sending it anything, as a flagd shutting down might. */
  mute(on: boolean): void;
  /** Stops answering, dropping every stream, as flagd does when it goes away. */
  stop(): Promise<void>;
  /** Answers again, on the same port. */
  restart(): Promise<void>;
}

/** A flag that is on for everyone, or off for everyone. */
export const on: FlagdFlag = { state: 'ENABLED', variants: { on: true, off: false }, defaultVariant: 'on' };
export const off: FlagdFlag = { state: 'ENABLED', variants: { on: true, off: false }, defaultVariant: 'off' };
/** A flag that is on when the evaluation context's `rule` is true. */
export const onWhen = (rule: unknown): FlagdFlag => ({ ...off, targeting: { if: [rule, 'on', 'off'] } });
/** The flag set's revision, as the admin service writes it. */
export const revision = (value: string): FlagdFlag => ({
  state: 'ENABLED',
  variants: { current: value },
  defaultVariant: 'current',
});

const encode = (flags: string): Buffer => {
  const bytes = Buffer.from(flags, 'utf8');
  const length: number[] = [];
  let n = bytes.length;
  do {
    length.push((n & 0x7f) | (n > 0x7f ? 0x80 : 0));
    n >>>= 7;
  } while (n > 0);
  return Buffer.concat([Buffer.from([0x0a, ...length]), bytes]);
};

const SYNC: ServiceDefinition = {
  syncFlags: {
    path: '/flagd.sync.v1.FlagSyncService/SyncFlags',
    requestStream: false,
    responseStream: true,
    requestSerialize: (value: Buffer) => value,
    requestDeserialize: (bytes: Buffer) => bytes,
    responseSerialize: (flags: string) => encode(flags),
    responseDeserialize: (bytes: Buffer) => bytes,
  },
};

export async function startFlagd(initial: Record<string, FlagdFlag> = {}): Promise<FakeFlagd> {
  let flags = JSON.stringify({ flags: initial });
  let streams = new Set<ServerWritableStream<Buffer, string>>();
  let connected = 0;
  let muted = false;
  let server: Server;
  let port = 0;

  const listen = async () => {
    server = new Server();
    server.addService(SYNC, {
      syncFlags(stream: ServerWritableStream<Buffer, string>) {
        connected += 1;
        if (muted) {
          stream.end();
          return;
        }
        streams.add(stream);
        stream.on('cancelled', () => streams.delete(stream));
        stream.write(flags);
      },
    });
    port = await new Promise<number>((resolve, reject) =>
      server.bindAsync(`127.0.0.1:${port}`, ServerCredentials.createInsecure(), (error, bound) =>
        error ? reject(error) : resolve(bound),
      ),
    );
  };
  await listen();

  return {
    get address() {
      return `127.0.0.1:${port}`;
    },
    set(next) {
      flags = JSON.stringify({ flags: next });
      for (const stream of streams) stream.write(flags);
    },
    connections: () => connected,
    mute(on) {
      muted = on;
    },
    end() {
      for (const stream of streams) stream.end();
      streams = new Set();
    },
    async stop() {
      server.forceShutdown();
      streams = new Set();
    },
    restart: listen,
  };
}
