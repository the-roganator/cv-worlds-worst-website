import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// review.yml calls Software Factory's review gate; review-requested.yml is this repository's copy of the helper that
// asks it to judge again. `workflow_run` finds the helper by its name alone, so a rename here would stop the gate
// looking again after a review, and nothing would fail.
const read = (name: string) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf-8');
const review = read('review.yml');
const requested = read('review-requested.yml');

// A workflow's `on:` block, to the next top-level key, without its comments.
const triggers = (workflow: string) =>
  (/^on:\n((?:(?![a-z]).*\n)*)/m.exec(workflow)?.[1] ?? '').replace(/^\s*#.*\n/gm, '');

describe('the review gate and merge queue workflows', () => {
  it('runs the gate when the helper, found by its name, finishes', () => {
    const name = /^name: (.+)$/m.exec(requested)?.[1];
    expect(name).toBe('review requested');
    expect(review).toMatch(
      /^ {2}workflow_run:\n {4}workflows: \[review requested, gates\]\n {4}types: \[completed\]$/m,
    );
  });

  // `low-risk` needs test integrity's run at the head, so the gate judges again when the gates, found by their name,
  // finish.
  it('runs the gate again when the gates finish', () => {
    const name = /^name: (.+)$/m.exec(read('gates.yml'))?.[1];
    expect(name).toBe('gates');
    expect(/^ {4}workflows: \[(.+)\]$/m.exec(review)?.[1]?.split(', ')).toContain(name);
  });

  // A gates run cancelled by a newer push has nothing to say; the newer run asks.
  it('skips a cancelled gates run', () => {
    expect(review).toMatch(
      /^ {4}if: github\.event\.workflow_run\.name != 'gates' \|\| github\.event\.workflow_run\.conclusion != 'cancelled'$/m,
    );
  });

  it("grants the gate test integrity's check run, and nothing that writes", () => {
    expect(review).toMatch(
      /^ {4}permissions:\n {6}contents: read\n {6}pull-requests: read\n(?: {6}#.*\n)* {6}checks: read\n {4}uses:/m,
    );
  });

  // The pinned gate judges only a `workflow_run`: started any other way, it would judge nothing, and the check would
  // never post.
  it('runs the gate on nothing but a workflow_run', () => {
    expect(triggers(review).match(/^ {2}[a-z_]+:/gm)).toEqual(['  workflow_run:']);
  });

  // The helper's run on the pull request is what starts the gate. A risk label removed by anyone but Martin holds the
  // pull request, so its removal asks too.
  it('judges a pull request when it opens, moves or loses a label', () => {
    expect(requested).toMatch(
      /^ {2}pull_request:\n {4}types: \[opened, reopened, synchronize, ready_for_review, edited, unlabeled\]$/m,
    );
  });

  // A stacked pull request, into the branch of the one below it, needs the `review` check as one into main does.
  it('judges a pull request into any branch too', () => {
    expect(triggers(requested)).not.toMatch(/branches|paths|pull_request_target/);
  });

  // The merge queue waits for every required check on its commit: one that never runs there holds the queue.
  it.each(['check.yml', 'pr-title.yml', 'gates.yml'])("runs %s on the merge queue's commit", (name) => {
    expect(read(name)).toMatch(/^ {2}merge_group:\n {4}types: \[checks_requested\]$/m);
  });

  // CodeQL is not a check the queue waits for: the code scanning rule judges each pull request's own analysis and does
  // not apply to the queue's groups. Run on the queue's commit, it races the queue, which deletes its branch before the
  // results can be uploaded.
  it('does not run CodeQL on the merge queue', () => {
    expect(triggers(read('codeql.yml'))).not.toContain('merge_group');
  });

  // A merge queue's run has no head branch: grouped by it alone, every queue run would share one group and cancel
  // each other.
  it.each(['check', 'gates'])('keeps each run of %s.yml in a group of its own branch', (name) => {
    expect(read(`${name}.yml`)).toMatch(
      new RegExp(`^ {2}group: ${name}-\\$\\{\\{ github\\.head_ref \\|\\| github\\.ref \\}\\}$`, 'm'),
    );
  });

  it('passes the key in the review environment on to the gate', () => {
    // A called workflow sees an environment secret only when its caller passes it, by name.
    expect(review).toMatch(/^ {4}secrets:\n {6}REVIEW_APP_PRIVATE_KEY: \$\{\{ secrets\.REVIEW_APP_PRIVATE_KEY \}\}$/m);
    expect(review).not.toMatch(/secrets: inherit/);
  });

  it('asks again after a review and in the merge queue', () => {
    expect(requested).toMatch(/^ {2}pull_request_review:\n {4}types: \[submitted, dismissed\]$/m);
    expect(requested).toMatch(/^ {2}merge_group:\n {4}types: \[checks_requested\]$/m);
  });

  it('gives the helper no permissions and no secrets', () => {
    expect(requested).toMatch(/^permissions: \{\}$/m);
    expect(requested).not.toMatch(/secrets\.|permissions: [^{]|^\s+permissions:$/m);
  });
});
