import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// build.yml's signing job tries each call to Sigstore and GHCR again when it fails briefly. Its function runs here in
// bash, with a stand-in for cosign that fails a given number of times and a `sleep` that records how long it would
// wait, called as the job calls it: bare, with errexit on.
const build = readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf-8');
const retry = (/^( *)retry\(\) \{\n[\s\S]*?^\1\}$/m.exec(build)?.[0] ?? '').replace(/^ {10}/gm, '');
// The signing step's script, from its `run: |` to the end of the file.
const script = /^ {8}run: \|\n([\s\S]*?set -euo pipefail[\s\S]*)$/m.exec(build)?.[1] ?? '';

const run = (failures: number) => {
  const bash = `set -euo pipefail
${retry}
sleep() { echo "slept $1"; }
calls=0
cosign() { calls=$((calls + 1)); echo "cosign $* ($calls)"; [ "$calls" -gt ${failures} ]; }
retry cosign sign --yes ref
echo ok`;
  // A status that is tested turns errexit off in everything it tests, a subshell too, so the script's own status says
  // whether it gave up.
  const result = spawnSync('bash', ['-c', bash], { encoding: 'utf-8' });
  return [...result.stdout.trim().split('\n'), ...(result.status === 0 ? [] : ['gave up'])];
};

describe('the signing job', () => {
  it('is found, whole', () => {
    expect(retry).toMatch(/^retry\(\) \{\n[\s\S]*\n\}$/);
    expect(script).toContain('echo "$ref: signed, with an SBOM of each platform attested"');
  });

  it('calls cosign once when it works', () => {
    expect(run(0)).toEqual(['cosign sign --yes ref (1)', 'ok']);
  });

  it('tries again, waiting longer each time, while a call fails briefly', () => {
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

  it('names a command called by its path by its last part', () => {
    const bash = `${retry}\nsleep() { :; }\nretry /bin/false scan x || true`;
    expect(execFileSync('bash', ['-c', bash], { encoding: 'utf-8' })).toContain(
      '::error::false scan failed four times',
    );
  });

  // Every line of the script that runs cosign or Syft, whatever its subcommand, goes through the function, and each
  // cosign try has a time limit of its own.
  it('tries every call to cosign and Syft that way, the signature last', () => {
    const calls = script
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => !line.startsWith('#') && /(?:^|[\s"(])(?:cosign|\$SYFT|\$\{SYFT\})\b/.test(line));
    expect(calls.map((call) => call.split(' ').slice(0, 3).join(' '))).toEqual([
      'retry "$SYFT" scan',
      'retry cosign attest',
      'retry cosign sign',
    ]);
    for (const call of calls.filter((call) => call.includes('cosign'))) expect(call).toContain('--timeout 1m');
  });
});
