import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Node is pinned in three places that must name one release: mise.toml (what a laptop, CI and the dev container run),
// the build stage's FROM (what installs the dependencies and builds the catalogue) and the runtime's FROM (what serves
// the shop). Dependabot reads the Dockerfile and not mise, and moves a FROM's digest without its neighbours, so a pull
// request can pass every other check with them apart. This holds each FROM that names Node to mise.toml's release, as
// far as its tag says it: the official image's tag names the release, but the distroless runtime's names only the
// major, and a tag says nothing of what the digest beside it holds. check.yml's image job runs `node --version` in the
// image it builds, and in the build stage's base, and compares that with mise.toml (the last tests below hold it there).
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf-8').replace(/\r\n?/g, '\n');

/** mise.toml's Node, which test/toolchain.test.ts keeps exact. */
const misePinned = (toml = read('mise.toml')) => /^node = "([^"]+)"$/m.exec(toml)?.[1] ?? '';

/** Every Dockerfile in the repository, by path. */
const dockerfiles = () =>
  new Map(
    execFileSync('git', ['ls-files', '--', '*Dockerfile', '*Dockerfile.*', '*.Dockerfile'], {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf-8',
    })
      .split('\n')
      .filter(Boolean)
      .map((file) => [file, read(file)] as const),
  );

interface NodePin {
  /** `file:line`, for the failure to name. */
  where: string;
  /** The image as the FROM names it. */
  ref: string;
  /** The release its tag names: exact for the official image, the major alone for distroless; null when unread. */
  release: string | null;
}

// The official image, with its release in the tag (`node:24.22.2-alpine3.24`), and Google's distroless one, with its
// major in the name (`gcr.io/distroless/nodejs24-debian13`). Any other image with Node in its name is unread, and fails.
const OFFICIAL = /^(?:docker\.io\/)?(?:library\/)?node:(\d+\.\d+\.\d+)-[\w.-]+@sha256:[0-9a-f]{64}$/;
const DISTROLESS = /^gcr\.io\/distroless\/nodejs(\d+)-[\w.-]+(?::[\w.-]+)?@sha256:[0-9a-f]{64}$/;

/** Each FROM, in each Dockerfile, that names Node. */
function nodePins(files = dockerfiles()): NodePin[] {
  return [...files].flatMap(([file, text]) =>
    text.split('\n').flatMap((line, index) => {
      const ref = /^FROM\s+(?:--platform=\S+\s+)?(\S+)/i.exec(line)?.[1];
      if (!ref || !/node/i.test(ref.split(/[:@]/)[0] ?? '')) return [];
      const release = OFFICIAL.exec(ref)?.[1] ?? DISTROLESS.exec(ref)?.[1] ?? null;
      return [{ where: `${file}:${index + 1}`, ref, release }];
    }),
  );
}

/** The pins that are not mise.toml's release: an exact release that differs, a major that differs, or one unread. */
const apart = (node: string, pins: NodePin[]) =>
  pins
    .filter(
      ({ release }) => release === null || (release.includes('.') ? release !== node : release !== node.split('.')[0]),
    )
    .map(({ where, ref }) => `${where} ${ref}`);

/** The Dockerfiles, with one line of one replaced. */
const moved = (file: string, from: RegExp, to: string) => {
  const files = dockerfiles();
  const text = files.get(file) ?? '';
  expect(text).toMatch(from);
  files.set(file, text.replace(from, to));
  return files;
};

describe("Node's pins", () => {
  const node = misePinned();
  const pins = nodePins();
  // What a scratch change sets apart beyond what is apart already, so each case below names its own pin alone.
  const newly = (files: Map<string, string>) => {
    const before = new Set(apart(node, pins));
    return apart(node, nodePins(files)).filter((pin) => !before.has(pin));
  };

  it('are found: the build stage and the runtime, each read', () => {
    expect(node).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pins.map(({ where }) => where.split(':')[0])).toEqual(['Dockerfile', 'Dockerfile']);
    expect(pins.map(({ release }) => release)).toEqual([node, node.split('.')[0]]);
  });

  it("name mise.toml's release, every one", () => {
    expect(apart(node, pins)).toEqual([]);
  });

  it('come apart when mise.toml moves alone', () => {
    const later = misePinned(read('mise.toml').replace(/^node = "\d+\.\d+\.\d+"$/m, 'node = "26.1.0"'));
    expect(later).toBe('26.1.0');
    expect(apart(later, pins).map((pin) => pin.split(' ')[0])).toEqual(pins.map(({ where }) => where));
  });

  it('come apart when the build stage moves alone', () => {
    const files = moved('Dockerfile', /^FROM node:\d+\.\d+\.\d+-/m, 'FROM node:24.99.0-');
    expect(newly(files)).toEqual([expect.stringMatching(/^Dockerfile:\d+ node:24\.99\.0-/)]);
  });

  it('come apart when the runtime moves to another major alone', () => {
    const files = moved('Dockerfile', /distroless\/nodejs\d+-/, 'distroless/nodejs26-');
    expect(newly(files)).toEqual([expect.stringMatching(/^Dockerfile:\d+ gcr\.io\/distroless\/nodejs26-/)]);
  });

  it('fail on a Node image whose tag does not say its release, or by tag alone', () => {
    const files = moved('Dockerfile', /^FROM node:\d+\.\d+\.\d+-/m, 'FROM node:24-');
    expect(newly(files)).toEqual([expect.stringMatching(/^Dockerfile:\d+ node:24-/)]);
    const untagged = moved('Dockerfile', /@sha256:[0-9a-f]{64} AS build$/m, ' AS build');
    expect(newly(untagged)).toEqual([expect.stringMatching(/^Dockerfile:\d+ node:/)]);
  });

  it('fail on a FROM that names Node in a way this does not read', () => {
    const files = dockerfiles();
    files.set('.devcontainer/Dockerfile', `FROM mcr.microsoft.com/devcontainers/javascript-node:24\n`);
    expect(newly(files)).toEqual(['.devcontainer/Dockerfile:1 mcr.microsoft.com/devcontainers/javascript-node:24']);
  });
});

describe("the image job's check of the Node it runs", () => {
  const check = read('.github/workflows/check.yml');
  // The image job, to the end of the file: it is the last.
  const job = check.slice(check.indexOf('\n  image:\n'));
  // Each step of the job, to the next.
  const steps = job.split(/\n(?= {6}- )/).slice(1);
  const build = steps.findIndex((step) => step.includes('uses: docker/build-push-action@'));
  const runs = steps.findIndex((step) => step.includes('name: Check the image runs the Node mise.toml pins'));
  const step = steps[runs] ?? '';

  it('builds the image into Docker, under the name the check runs', () => {
    expect(steps[build]).toMatch(/^ {10}load: true$/m);
    expect(steps[build]).toMatch(/^ {10}tags: website:check$/m);
  });

  it('runs after the build, whenever the build does', () => {
    expect(build).toBeGreaterThan(-1);
    expect(runs).toBeGreaterThan(build);
    expect(step).toContain("if: env.DEPLOY != 'true'");
    expect(steps[build]).toContain("if: env.DEPLOY != 'true'");
  });

  it("reads mise.toml's Node as this test does, and fails when it finds none", () => {
    expect(step).toContain(`want=$(sed -n 's/^node = "\\([0-9.]*\\)"$/\\1/p' mise.toml)`);
    expect(step).toMatch(
      /\[\[ "\$want" =~ \^\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$ \]\] \|\| \{ echo "::error .*"; exit 1; \}/,
    );
  });

  it("runs node --version in the runtime image it built, and in the build stage's base by its pin", () => {
    expect(step).toContain(`build=$(sed -n 's/^FROM \\(node:[^ ]*\\) AS build$/\\1/p' Dockerfile)`);
    expect(step).toContain('docker run --rm --network none --pull never website:check --version');
    expect(step).toContain('docker run --rm --network none --entrypoint node "$build" --version');
  });

  it('fails when either is not the release mise.toml pins', () => {
    expect(step.match(/\[ "\$\w+" = "v\$want" \] \|\| \{ echo "::error .*"; exit 1; \}/g)).toHaveLength(2);
  });
});
