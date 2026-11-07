import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// check.yml's signature check runs on main's every commit, the repository's first included, which has no parent to
// compare its pins with. It needs yq and cosign, which the toolchain does not hold, so the test reads the step.
const check = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf-8');
const step = /- name: Check the image it moves to was signed by build\.yml on main\n((?: {8}.*\n)*)/.exec(check)?.[1];

describe('the signature check on a commit with no parent', () => {
  it('counts the parents the commit records, which a shallow checkout does not hide', () => {
    expect(step).toContain('commit=$(git cat-file commit HEAD)');
    expect(step).toContain(`parents=$(awk '/^$/ { exit } /^parent / { n++ } END { print n + 0 }' <<< "$commit")`);
  });

  it('reads the base only when the commit has a parent', () => {
    const [first, rest] = step?.split(/^ *else$/m) ?? [];
    expect(first).toMatch(/if \[ "\$parents" -eq 0 \]; then\n.*\n *before=\n/);
    expect(first).not.toContain('HEAD^1');
    expect(rest).toContain('base=$(git show "HEAD^1:$FILE")');
  });

  it('lets pass, unverified, only an entry of the first commit with neither digest nor tag', () => {
    const [first, rest] = step?.split(/^ *else$/m) ?? [];
    expect(first).toContain(
      `unpinned=$(yq '.images[] | select(.digest == null and .newTag == null) | .newName + "@"' "$FILE")`,
    );
    expect(rest).not.toContain('unpinned=');
    expect(step).toMatch(/^ *unpinned=$/m);
  });
});
