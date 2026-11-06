import { describe, expect, it } from 'vitest';
import { FLAG_NAMES } from '../src/flag-names.ts';
import { REVISION_FLAG } from '../src/flags/index.ts';
import { previewable } from '../src/flags/preview.ts';
import type { Request } from '../src/http.ts';

describe('the flag names', () => {
  it.each(FLAG_NAMES)('name %s as the flag context reads one', (name) => {
    expect(previewable(name)).toBe(true);
  });

  it('each name a flag once', () => {
    expect(new Set(FLAG_NAMES).size).toBe(FLAG_NAMES.length);
  });

  it('leave out the flag set revision, which is never a feature', () => {
    expect(FLAG_NAMES).not.toContain(REVISION_FLAG);
  });

  it('are the only names a page may ask about', () => {
    // Checked by `tsc`, not run: each name on the list type-checks, and one that is not does not.
    const ask = (request: Request) => {
      for (const listed of FLAG_NAMES) void request.flag(listed);
      // @ts-expect-error a name not on the list
      void request.flag('not-on-the-list');
    };
    expect(ask).toBeTypeOf('function');
  });
});
