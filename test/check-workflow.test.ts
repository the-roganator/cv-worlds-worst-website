import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// check.yml's signature check runs on main's every commit, the repository's first included, which has no parent to
// compare its pins with. It needs yq and cosign, which the toolchain does not hold, so the test reads the step.
const check = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf-8');
// The step, to the next step of its job.
const step =
  /^ {6}- name: Check the image it moves to was signed by build\.yml on main\n([\s\S]*?)(?=^ {6}- )/m.exec(
    check,
  )?.[1] ?? '';
const [first = '', rest = ''] = step.split(/^ *else$/m);

describe('the signature check on a commit with no parent', () => {
  it('is found, whole', () => {
    expect(rest).toContain('echo "$ref: signed by $identity, with its SBOM attested"');
  });

  it('counts the parents the commit records, which a shallow checkout does not hide', () => {
    expect(first).toContain('commit=$(git cat-file commit HEAD)');
    expect(first).toContain(`parents=$(awk '/^$/ { exit } /^parent / { n++ } END { print n + 0 }' <<< "$commit")`);
  });

  it('reads the base only when the commit has a parent', () => {
    expect(first).toMatch(/if \[ "\$parents" -eq 0 \]; then\n.*\n *before=\n/);
    expect(first).not.toContain('HEAD^1');
    expect(rest).toContain('base=$(git show "HEAD^1:$FILE")');
  });

  it('fails a first commit that names a tag rather than a digest', () => {
    expect(first).toContain(
      `tagged=$(yq '.images[] | select((.digest // "") == "" and .newTag != null) | .newName + ":" + .newTag' "$FILE")`,
    );
    expect(first).toMatch(/\[ -z "\$tagged" \] \|\| \{ echo "::error .*"; exit 1; \}/);
  });

  it('lets an entry with no digest pass unverified on the first commit alone', () => {
    expect(rest).toMatch(
      /if \[\[ "\$ref" == \*@ \]\]; then\n *if \[ "\$parents" -eq 0 \]; then\n.*\n *continue\n *fi\n *echo "::error file=\$FILE::\$ref names no digest"; exit 1\n/,
    );
  });
});
