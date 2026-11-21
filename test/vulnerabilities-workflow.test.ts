import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// vulnerabilities.yml calls Software Factory's daily scan. The scan refuses any event but a push to main, the schedule,
// a run by hand on main or its proving run on a pull request, and uploads only with the grant here: either slip would
// stop the scan with nothing failing on a pull request. The same called workflow submits the dependency graph on a push,
// and every workflow here calls the factory's at one commit.
const workflows = new URL('../.github/workflows/', import.meta.url);
const workflow = readFileSync(new URL('vulnerabilities.yml', workflows), 'utf-8');

// A job's block, from its name to the next job, and its grant without comments. Each throws on finding nothing, so an
// assertion that something is absent cannot pass on an empty string.
const found = (what: string, match: RegExpExecArray | null) => {
  if (match?.[1] === undefined) throw new Error(`vulnerabilities.yml: no ${what}`);
  return match[1];
};
const job = (name: string) =>
  found(
    `job ${name}`,
    new RegExp(`^ {2}${name}:\\n((?: {4}.*\\n|\\n)*?)(?=^ {2}\\S|(?![\\s\\S]))`, 'm').exec(workflow),
  );
const grant = (block: string) =>
  found('permissions block', /^ {4}permissions:\n((?: {6}.*\n)*)/m.exec(block))
    .replace(/^\s*#.*\n/gm, '')
    .replace(/ #.*$/gm, '');

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

  // One call: the called workflow has the scan's jobs and the graph's, so a second call would scan twice on a push.
  it('calls the scan and the graph once, and has no other job', () => {
    expect(workflow.slice(workflow.indexOf('\njobs:\n')).match(/^ {2}[^\s#][^:]*:/gm)).toEqual(['  vulnerabilities:']);
  });

  // The graph's job takes `contents: write`, for the dependency submission API, and refuses any event but a push; the
  // scan's jobs ask for `contents: read`. A called job may have no more than its caller grants.
  it('grants the scan what it reads and its upload, the graph its submission, and nothing else', () => {
    expect(workflow).toMatch(/^permissions: \{\}$/m);
    expect(grant(job('vulnerabilities'))).toBe(
      '      actions: read\n      contents: write\n      packages: read\n      security-events: write\n',
    );
    // One secret, the key its state is sealed with, passed by name to the scan's job alone: never `inherit`.
    expect(workflow.match(/\bsecrets\b/g)).toHaveLength(2);
    expect(job('vulnerabilities')).toMatch(/^ {4}secrets:\n {6}SCAN_STATE_KEY: \$\{\{ secrets\.SCAN_STATE_KEY \}\}$/m);
    expect(workflow).not.toMatch(/secrets: inherit/);
  });

  it('calls the scan at a full commit', () => {
    expect(job('vulnerabilities')).toMatch(
      /^ {4}uses: the-roganator\/cv-software-factory\/\.github\/workflows\/vulnerabilities\.yml@[0-9a-f]{40} # main$/m,
    );
  });

  // Every call of Software Factory's workflows names one commit of its main, so the gates, the review gate, the scan and
  // the graph are always the same version of the factory's rules, and a pin moved in one file is moved in all.
  it("calls every one of the factory's workflows at the same commit", () => {
    const pins = readdirSync(workflows)
      .filter((name) => /\.ya?ml$/.test(name))
      .flatMap((name) =>
        [
          ...readFileSync(new URL(name, workflows), 'utf-8').matchAll(
            /^\s*(?:- )?uses:\s*['"]?the-roganator\/cv-software-factory\/([^@\s'"]+)@([^\s'"]+)/gim,
          ),
        ].map(([, path, ref]) => ({ name, path, ref })),
      );
    expect(pins.length).toBeGreaterThanOrEqual(6);
    for (const pin of pins) expect(pin.ref, `${pin.name}: ${pin.path}`).toMatch(/^[0-9a-f]{40}$/);
    expect(new Set(pins.map((pin) => pin.ref)).size).toBe(1);
  });

  // One upload at a time is the called scan job's own concurrency, for the repository: none here, so a push's graph,
  // beside the scan in the same call, never waits behind the schedule's scan or a run by hand.
  it('leaves one upload at a time to the scan job, and holds the graph behind nothing', () => {
    expect(workflow).not.toMatch(/^ *concurrency:/m);
  });
});
