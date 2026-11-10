import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// vulnerabilities.yml calls Software Factory's daily scan. The scan refuses any event but a push to main, the schedule,
// a run by hand on main or its proving run on a pull request, and uploads only with the grant here: either slip would
// stop the scan with nothing failing on a pull request. The same file submits the dependency graph on a push, and every
// workflow here calls the factory's at one commit.
const workflows = new URL('../.github/workflows/', import.meta.url);
const workflow = readFileSync(new URL('vulnerabilities.yml', workflows), 'utf-8');

// A job's block, from its name to the next job, and its grant without comments.
const job = (name: string) =>
  new RegExp(`^ {2}${name}:\\n((?: {4}.*\\n|\\n)*?)(?=^ {2}\\S|(?![\\s\\S]))`, 'm').exec(workflow)?.[1] ?? '';
const grant = (block: string) =>
  (/^ {4}permissions:\n((?: {6}.*\n)*)/m.exec(block)?.[1] ?? '').replace(/^\s*#.*\n/gm, '').replace(/ #.*$/gm, '');

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
    // Once a day, at whatever minute: the advisories it is read against change daily.
    expect(triggers).toMatch(/^ {2}schedule:\n {4}- cron: '\d{1,2} \d{1,2} \* \* \*'$/m);
    expect(triggers).toMatch(/^ {2}pull_request:\n {4}paths:\n {6}- \.github\/workflows\/vulnerabilities\.yml$/m);
  });

  it('has the scan and the graph, and no other job', () => {
    expect(workflow.slice(workflow.indexOf('\njobs:\n')).match(/^ {2}[a-z-]+:$/gm)).toEqual([
      '  vulnerabilities:',
      '  dependency-graph:',
    ]);
  });

  it('grants the scan what it reads and its upload, and nothing else', () => {
    expect(workflow).toMatch(/^permissions: \{\}$/m);
    expect(grant(job('vulnerabilities'))).toBe(
      '      contents: read\n      packages: read\n      security-events: write\n',
    );
    expect(workflow).not.toMatch(/secrets/);
  });

  it('calls the scan at a full commit', () => {
    expect(job('vulnerabilities')).toMatch(
      /^ {4}uses: the-roganator\/cv-software-factory\/\.github\/workflows\/vulnerabilities\.yml@[0-9a-f]{40} # main$/m,
    );
  });

  // The graph's submission writes to this repository's dependency graph with the job's token, so `contents: write`
  // goes to that job alone, and only on a push, the one event the graph's job accepts.
  it('submits the dependency graph on a push alone, with contents: write for that job alone', () => {
    const graph = job('dependency-graph');
    expect(graph).toMatch(/^ {4}if: \$\{\{ github\.event_name == 'push' \}\}$/m);
    expect(grant(graph)).toBe('      contents: write\n');
    expect(grant(job('vulnerabilities'))).not.toMatch(/contents: write/);
    expect(graph).toMatch(
      /^ {4}uses: the-roganator\/cv-software-factory\/\.github\/workflows\/dependency-graph\.yml@[0-9a-f]{40} # main$/m,
    );
  });

  // Every call of Software Factory's workflows names one commit of its main, so the gates, the review gate, the scan and
  // the graph are always the same version of the factory's rules, and a pin moved in one file is moved in all.
  it("calls every one of the factory's workflows at the same commit", () => {
    const pins = readdirSync(workflows)
      .filter((name) => name.endsWith('.yml'))
      .flatMap((name) =>
        [
          ...readFileSync(new URL(name, workflows), 'utf-8').matchAll(
            /^\s*(?:- )?uses: the-roganator\/cv-software-factory\/(\S+)@(\S+)/gm,
          ),
        ].map(([, path, ref]) => ({ name, path, ref })),
      );
    expect(pins.length).toBeGreaterThanOrEqual(7);
    for (const pin of pins) expect(pin.ref, `${pin.name}: ${pin.path}`).toMatch(/^[0-9a-f]{40}$/);
    expect(new Set(pins.map((pin) => pin.ref)).size).toBe(1);
  });

  it('runs one at a time on each branch, cancelling none in progress, so an older upload cannot finish last', () => {
    expect(workflow).toMatch(/^ {2}group: vulnerabilities-\$\{\{ github\.head_ref \|\| github\.ref \}\}$/m);
    expect(workflow).toMatch(/^ {2}cancel-in-progress: false$/m);
  });
});
