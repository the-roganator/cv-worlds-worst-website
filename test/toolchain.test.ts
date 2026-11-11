import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// mise.toml names the releases each tool may move within, and mise.lock the one each is at, with its download and
// checksum for every platform the toolchain runs on. CI installs with `--locked`, which fails when the lock has no entry
// for a request, but only for the platform it runs on: this holds the rest to the lock too, so a Mac or the dev
// container never resolves a version of its own.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf-8').replace(/\r\n?/g, '\n');

/** Each tool in mise.toml's [tools], with its request. */
function requests(toml = read('mise.toml')): Map<string, string> {
  const tools = toml.slice(toml.indexOf('\n[tools]\n')).split(/\n\[(?!tools\])/)[0] ?? '';
  return new Map([...tools.matchAll(/^([\w-]+) = "([^"]+)"$/gm)].map(([, tool = '', request = '']) => [tool, request]));
}

/** The platforms mise.toml's settings lock. */
function platforms(toml = read('mise.toml')): string[] {
  const list = /^lockfile_platforms = \[([^\]]*)\]$/m.exec(toml)?.[1] ?? '';
  return [...list.matchAll(/"([^"]+)"/g)].map(([, platform = '']) => platform);
}

interface Locked {
  version: string;
  specifiers: string[];
  /** Each platform locked, with whether it has a download and its checksum. */
  platforms: Map<string, { url: boolean; checksum: boolean }>;
}

/** Each tool in mise.lock. */
function locked(lock = read('mise.lock')): Map<string, Locked> {
  const tools = new Map<string, Locked>();
  for (const [, tool = '', body = ''] of lock.matchAll(/^\[\[tools\.([\w-]+)\]\]\n([\s\S]*?)(?=^\[\[|(?![\s\S]))/gm)) {
    const specifiers = /^specifiers = \[([^\]]*)\]$/m.exec(body)?.[1] ?? '';
    tools.set(tool, {
      version: /^version = "([^"]+)"$/m.exec(body)?.[1] ?? '',
      specifiers: [...specifiers.matchAll(/"([^"]+)"/g)].map(([, specifier = '']) => specifier),
      platforms: new Map(
        [...body.matchAll(/^\[tools\.[\w-]+\."platforms\.([\w-]+)"\]\n((?:[a-z_]+ = .*\n?)*)/gm)].map(
          ([, platform = '', fields = '']) => [
            platform,
            { url: /^url = "https:\/\//m.test(fields), checksum: /^checksum = "sha256:[0-9a-f]{64}"$/m.test(fields) },
          ],
        ),
      ),
    });
  }
  return tools;
}

/** Whether a version is in a request's range: the request itself, or a release that begins with it. */
const within = (version: string, request: string) => version === request || version.startsWith(`${request}.`);

/** The tools whose lock entry is missing, or was made for another request, or holds a version outside it. */
const stale = (wanted: Map<string, string>, lock: Map<string, Locked>) =>
  [...wanted]
    .filter(([tool, request]) => {
      const entry = lock.get(tool);
      return !entry || entry.specifiers.join() !== request || !within(entry.version, request);
    })
    .map(([tool]) => tool);

describe('the toolchain', () => {
  const wanted = requests();
  const lock = locked();

  it('is read from mise.toml and mise.lock', () => {
    expect([...wanted.keys()].sort()).toEqual(['kustomize', 'node', 'pnpm']);
    expect(platforms().sort()).toEqual(['linux-arm64', 'linux-x64', 'macos-arm64', 'macos-x64']);
    expect(read('mise.toml')).toMatch(/^lockfile = true$/m);
  });

  it('has each tool locked at one version, in its range, for its request', () => {
    expect([...lock.keys()].sort()).toEqual([...wanted.keys()].sort());
    expect(stale(wanted, lock)).toEqual([]);
  });

  it('has a download and its checksum for each platform', () => {
    for (const [tool, entry] of lock) {
      expect({ tool, platforms: Object.fromEntries(entry.platforms) }).toEqual({
        tool,
        platforms: Object.fromEntries(platforms().map((platform) => [platform, { url: true, checksum: true }])),
      });
    }
  });

  it("locks the pnpm package.json's packageManager names, which is the one pnpm runs", () => {
    const manager = /"packageManager": "pnpm@([^+"]+)/.exec(read('package.json'))?.[1];
    expect(manager).toMatch(/^\d+\.\d+\.\d+$/);
    expect(lock.get('pnpm')?.version).toBe(manager);
  });

  it("keeps Node exact, at the build image's Node", () => {
    expect(wanted.get('node')).toMatch(/^\d+\.\d+\.\d+$/);
    const image = /^FROM node:(\d+\.\d+\.\d+)-/m.exec(read('Dockerfile'))?.[1];
    expect(image).toBe(wanted.get('node'));
  });

  it('takes a release only once it is three days old, as Dependabot does', () => {
    expect(read('mise.toml')).toMatch(/^minimum_release_age = "3d"$/m);
  });

  it('is stale when a request moves and the lock does not', () => {
    const moved = requests(read('mise.toml').replace(/^kustomize = "\d+"$/m, 'kustomize = "99"'));
    expect(stale(moved, lock)).toEqual(['kustomize']);
    expect(within('5.8.0', '5')).toBe(true);
    expect(within('5.80.0', '5.8')).toBe(false);
  });
});

describe('every use of mise in CI', () => {
  const workflows = readdirSync(new URL('../.github/workflows', import.meta.url))
    .filter((file) => file.endsWith('.yml'))
    .map((file) => [file, read(`.github/workflows/${file}`)] as const);
  // Each step that uses the action, to the next step: its `version` is in that block, wherever it is written.
  const uses = workflows.flatMap(([file, text]) =>
    text
      .split(/\n(?= +- )/)
      .filter((step) => /^ +- uses: jdx\/mise-action@/.test(step))
      .map((step) => ({ file, version: /^ +version: (\S+)$/m.exec(step)?.[1] })),
  );

  it('installs one release of mise, named', () => {
    expect(uses.length).toBeGreaterThan(0);
    expect(uses.length).toBe(workflows.reduce((n, [, text]) => n + text.split('jdx/mise-action@').length - 1, 0));
    const versions = new Set(uses.map(({ version }) => version));
    expect(versions.size).toBe(1);
    expect([...versions][0]).toMatch(/^\d{4}\.\d+\.\d+$/);
  });

  it('checks out mise.lock beside mise.toml, so a sparse checkout installs from the lock too', () => {
    for (const [file, text] of workflows) {
      for (const [, indent] of text.matchAll(/^( +)mise\.toml$/gm)) {
        expect({ file, lock: text.includes(`\n${indent}mise.toml\n${indent}mise.lock\n`) }).toEqual({
          file,
          lock: true,
        });
      }
    }
  });
});
