import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// build.yml's signing job tries each cosign call again when Sigstore fails briefly. Its function runs here in bash,
// with a stand-in for cosign that fails a given number of times and a `sleep` that records how long it would wait.
const build = readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf-8');
const sigstore = (/^( *)sigstore\(\) \{\n[\s\S]*?^\1\}$/m.exec(build)?.[0] ?? '').replace(/^ {10}/gm, '');

const run = (failures: number) => {
  const script = `set -euo pipefail
${sigstore}
sleep() { echo "slept $1"; }
calls=0
cosign() { calls=$((calls + 1)); echo "cosign $* ($calls)"; [ "$calls" -gt ${failures} ]; }
sigstore cosign sign --yes ref && echo ok || echo "gave up"`;
  return execFileSync('bash', ['-c', script], { encoding: 'utf-8' }).trim().split('\n');
};

describe('the signing job', () => {
  it('is found, whole', () => {
    expect(sigstore).toMatch(/^sigstore\(\) \{\n[\s\S]*\n\}$/);
  });

  it('calls cosign once when it works', () => {
    expect(run(0)).toEqual(['cosign sign --yes ref (1)', 'ok']);
  });

  it('tries again, waiting longer each time, while Sigstore fails briefly', () => {
    expect(run(3)).toEqual([
      'cosign sign --yes ref (1)',
      '::warning::cosign sign failed (try 1 of 4); trying again in 15s',
      'slept 15',
      'cosign sign --yes ref (2)',
      '::warning::cosign sign failed (try 2 of 4); trying again in 30s',
      'slept 30',
      'cosign sign --yes ref (3)',
      '::warning::cosign sign failed (try 3 of 4); trying again in 60s',
      'slept 60',
      'cosign sign --yes ref (4)',
      'ok',
    ]);
  });

  it('fails after four tries, without waiting again', () => {
    const lines = run(4);
    expect(lines.filter((line) => line.startsWith('cosign '))).toHaveLength(4);
    expect(lines.slice(-3)).toEqual(['cosign sign --yes ref (4)', '::error::cosign sign failed four times', 'gave up']);
  });

  it('tries every cosign call that way, the signature last', () => {
    const calls = build.match(/^ *(?:sigstore )?cosign (?:attest|sign) .*$/gm) ?? [];
    expect(calls.map((call) => call.trim().split(' ').slice(0, 3).join(' '))).toEqual([
      'sigstore cosign attest',
      'sigstore cosign sign',
    ]);
  });
});
