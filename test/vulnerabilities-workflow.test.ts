import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// vulnerabilities.yml calls Software Factory's daily scan. The scan refuses any event but a push to main, the schedule,
// a run by hand on main or its proving run on a pull request, and uploads only with the grant here: either slip would
// stop the scan with nothing failing on a pull request.
const workflow = readFileSync(new URL('../.github/workflows/vulnerabilities.yml', import.meta.url), 'utf-8');

// The `on:` block, to the next top-level key, without its comments.
const triggers = (/^on:\n((?:(?![a-z]).*\n)*)/m.exec(workflow)?.[1] ?? '').replace(/^\s*#.*\n/gm, '');

describe('the daily vulnerability scan', () => {
  it('runs on main, daily, by hand, and on a pull request that changes it', () => {
    expect(triggers.match(/^ {2}[a-z_]+:/gm)).toEqual([
      '  push:',
      '  schedule:',
      '  workflow_dispatch:',
      '  pull_request:',
    ]);
    expect(triggers).toMatch(/^ {2}push:\n {4}branches: \[main\]$/m);
    expect(triggers).toMatch(/^ {2}pull_request:\n {4}paths:\n {6}- \.github\/workflows\/vulnerabilities\.yml$/m);
  });

  it('grants the scan what it reads and its upload, and nothing else', () => {
    expect(workflow).toMatch(/^permissions: \{\}$/m);
    const grant = /^ {4}permissions:\n((?: {6}.*\n)*) {4}uses:/m.exec(workflow)?.[1] ?? '';
    expect(grant.replace(/^\s*#.*\n/gm, '').replace(/ #.*$/gm, '')).toBe(
      '      contents: read\n      packages: read\n      security-events: write\n',
    );
    expect(workflow).not.toMatch(/secrets/);
  });

  it('calls the scan at a full commit', () => {
    expect(workflow).toMatch(
      /^ {4}uses: the-roganator\/cv-software-factory\/\.github\/workflows\/vulnerabilities\.yml@[0-9a-f]{40} # main$/m,
    );
  });

  it('runs one at a time, cancelling none in progress, so an older upload cannot finish last', () => {
    expect(workflow).toMatch(/^ {2}cancel-in-progress: false$/m);
  });
});
