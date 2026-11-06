/**
 * Only the flag context asks OpenFeature: biome.json refuses an import of `@openfeature/*` anywhere else, so
 * `make check` fails. Checked here by linting a few files with the repository's own rules.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'flag-imports-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

/** The rules biome finds broken in a file of the given path and contents. */
function broken(path: string, source: string): string[] {
  const here = mkdtempSync(join(directory, 'case-'));
  copyFileSync(join(ROOT, 'biome.json'), join(here, 'biome.json'));
  mkdirSync(join(here, dirname(path)), { recursive: true });
  writeFileSync(join(here, path), source);
  try {
    execFileSync(join(ROOT, 'node_modules/.bin/biome'), ['lint', '--vcs-enabled=false', '--reporter=json', path], {
      cwd: here,
      stdio: 'pipe',
    });
    return [];
  } catch (error) {
    const report = JSON.parse(String((error as { stdout: Buffer }).stdout)) as {
      diagnostics: { category: string }[];
    };
    return report.diagnostics.map((diagnostic) => diagnostic.category);
  }
}

const IMPORT = "import { OpenFeature } from '@openfeature/server-sdk';\n\nexport const api = OpenFeature;\n";
const PROVIDER =
  "import { FlagdProvider } from '@openfeature/flagd-provider';\n\nexport const provider = FlagdProvider;\n";
const DYNAMIC = "export const core = await import('@openfeature/core');\n";

describe('who may import OpenFeature', () => {
  it.each([
    ['src/pages/home.ts', IMPORT],
    ['src/app.ts', PROVIDER],
    ['src/catalogue.ts', DYNAMIC],
    ['test/flags.test.ts', IMPORT],
  ])('not %s', (path, source) => {
    expect(broken(path, source)).toContain('lint/style/noRestrictedImports');
  });

  it.each([
    ['src/flags/index.ts', IMPORT],
    ['src/flags/index.ts', PROVIDER],
  ])('the flag context, %s', (path, source) => {
    expect(broken(path, source)).toEqual([]);
  });
});
