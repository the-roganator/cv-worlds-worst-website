import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Syft's version is written once, in deploy/images/syft/Dockerfile, which Dependabot moves, and build.yml's signing job
// reads it from there, from the workflow's own commit, so a bump of the pin is the whole change. The reading step runs
// here in bash, as the job runs it, against the pin and against pins it must refuse.
const PIN = 'deploy/images/syft/Dockerfile';
const root = fileURLToPath(new URL('..', import.meta.url));
const workflows = new URL('../.github/workflows/', import.meta.url);
const build = readFileSync(new URL('build.yml', workflows), 'utf-8');

// A job's block, from its name to the next job. Each throws on finding nothing, so an assertion that something is
// absent cannot pass on an empty string.
const found = (what: string, match: RegExpExecArray | null) => {
  if (match?.[1] === undefined) throw new Error(`build.yml: no ${what}`);
  return match[1];
};
const job = (name: string) =>
  found(`job ${name}`, new RegExp(`^ {2}${name}:\\n((?: {4}.*\\n|\\n)*?)(?=^ {2}\\S|(?![\\s\\S]))`, 'm').exec(build));
const reader = job('syft-version');
const sign = job('sign');
// The reading step's script, from its `run: |` to the end of the job.
const script = found('script reading the pin', /^ {8}run: \|\n((?: {10}.*\n|\n)*)/m.exec(reader)).replace(
  /^ {10}/gm,
  '',
);

// What the script gives as the version for a pin, or undefined when it refuses it.
const versionOf = (dockerfile: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'syft-pin-'));
  try {
    const pin = join(dir, 'Dockerfile');
    const output = join(dir, 'output');
    writeFileSync(pin, dockerfile);
    writeFileSync(output, '');
    try {
      execFileSync('bash', ['-c', script], { env: { PATH: process.env.PATH, PIN: pin, GITHUB_OUTPUT: output } });
    } catch {
      return undefined;
    }
    return /^version=(.*)$/m.exec(readFileSync(output, 'utf-8'))?.[1];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe("Syft's one pin", () => {
  it("pins Syft's image once, by version and digest", () => {
    const froms = readFileSync(new URL(`../${PIN}`, import.meta.url), 'utf-8')
      .split('\n')
      .filter((line) => /^\s*FROM\s/i.test(line));
    expect(froms).toHaveLength(1);
    expect(froms[0]).toMatch(/^FROM ghcr\.io\/anchore\/syft:v\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/);
  });

  it('is read by Dependabot', () => {
    const dependabot = readFileSync(new URL('../.github/dependabot.yml', import.meta.url), 'utf-8');
    const docker = found('docker entry', /^ {2}- package-ecosystem: docker\n((?: {4}.*\n|\n)*)/m.exec(dependabot));
    expect(docker).toMatch(/^ {6}- \/deploy\/images\/syft$/m);
    expect(docker).toMatch(/^ {4}cooldown:\n {6}default-days: \d+$/m);
  });

  it("is read from the workflow's own commit, by a job that holds no OIDC token and keeps no credentials", () => {
    expect(found('permissions', /^ {4}permissions:\n((?: {6}.*\n)*)/m.exec(reader))).toBe('      contents: read\n');
    expect(reader).toMatch(/^ {4}outputs:\n {6}version: \$\{\{ steps\.pin\.outputs\.version \}\}$/m);
    expect(reader).toContain(
      [
        '      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
        '        with:',
        '          ref: ${{ github.workflow_sha }}',
        `          sparse-checkout: ${PIN}`,
        '          sparse-checkout-cone-mode: false',
        '          persist-credentials: false',
        "      - name: Read Syft's version from its pin",
        '        id: pin',
        '        env:',
        `          PIN: ${PIN}`,
        '        run: |',
      ].join('\n'),
    );
    expect(reader.match(/^ {6}- /gm)).toHaveLength(2);
  });

  it('gives the signing job its version, which never signs without one and checks nothing out', () => {
    expect(sign).toMatch(/^ {4}needs: \[image, syft-version\]$/m);
    // A condition of its own could let the job run with the reader failed, and download-syft given no version installs
    // whatever Syft is newest.
    expect(sign).not.toMatch(/^ {4}if:/m);
    expect(sign).not.toContain('actions/checkout@');
    const downloads = build.match(/^ *uses: anchore\/sbom-action\/download-syft@.*\n(?: {8,}.*\n)*/gm) ?? [];
    expect(downloads).toHaveLength(1);
    expect(sign).toContain(downloads[0]);
    expect(downloads[0]).toMatch(/^ {10}syft-version: \$\{\{ needs\.syft-version\.outputs\.version \}\}$/m);
  });

  it('is the only place a Syft version is written', () => {
    // Every tracked file but the pin and this test, which writes versions of its own for the pins it refuses.
    const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf-8' })
      .split('\n')
      .filter((file) => file && file !== PIN && file !== 'test/syft-pin.test.ts');
    expect(files).toContain('.github/workflows/build.yml');
    for (const file of files) {
      const lines = readFileSync(join(root, file), 'utf-8')
        .split('\n')
        // An action's pin names its own version in a trailing comment, which is not Syft's.
        .map((line) => line.replace(/#\s*v\d+\.\d+\.\d+$/, ''));
      expect(
        lines.filter((line) => /syft/i.test(line) && /\d+\.\d+/.test(line)),
        file,
      ).toEqual([]);
    }
  });

  it('builds and signs again when it moves', () => {
    expect(found('push paths', /^ {4}paths:\n((?: {6}.*\n)*)/m.exec(build))).toMatch(new RegExp(`^ {6}- ${PIN}$`, 'm'));
  });

  it("gives the version the pin names, and refuses any pin but one of Syft's image by version and digest", () => {
    const pinned = readFileSync(new URL(`../${PIN}`, import.meta.url), 'utf-8');
    expect(versionOf(pinned)).toBe(/:(v\d+\.\d+\.\d+)@/.exec(pinned)?.[1]);
    const digest = `sha256:${'a'.repeat(64)}`;
    expect(versionOf(`# a comment\nFROM ghcr.io/anchore/syft:v1.57.1@${digest}\n`)).toBe('v1.57.1');
    for (const bad of [
      `FROM ghcr.io/anchore/syft:v1.57.1\n`,
      `FROM ghcr.io/anchore/syft@${digest}\n`,
      `FROM ghcr.io/anchore/syft:latest@${digest}\n`,
      `FROM ghcr.io/anchore/syft:1.57.1@${digest}\n`,
      `FROM ghcr.io/other/syft:v1.57.1@${digest}\n`,
      `FROM ghcr.io/anchore/syft:v1.57.1@${digest} AS x\n`,
      `FROM ghcr.io/anchore/syft:v1.57.1@${digest}\nFROM ghcr.io/anchore/syft:v1.54.0@${digest}\n`,
      `from ghcr.io/anchore/syft:v1.57.1@${digest}\n`,
      `FROM ghcr.io/anchore/syft:v1.57.1-rc1@${digest}\n`,
      '',
    ])
      expect(versionOf(bad), bad).toBeUndefined();
  });
});
