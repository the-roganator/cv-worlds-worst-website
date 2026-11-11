import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// build.yml's signing job, and check.yml's check of the signature a deploy moves to, try each call to Sigstore and GHCR
// again when it fails briefly, with the same function. It runs here in bash, with a stand-in for cosign that fails a
// given number of times and a `sleep` that records how long it would wait, called as the signing job calls it: bare,
// with errexit on.
const read = (name: string) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf-8');
const build = read('build.yml');
const check = read('check.yml');
const retryIn = (workflow: string) =>
  (/^( *)retry\(\) \{\n[\s\S]*?^\1\}$/m.exec(workflow)?.[0] ?? '').replace(/^ {10}/gm, '');
const retry = retryIn(build);
// The signing step's script, from the `run: |` after its Syft to the end of the file: the signing job is the last.
const script =
  /^ {10}SYFT: \$\{\{ steps\.syft\.outputs\.cmd \}\}\n {8}run: \|\n([\s\S]*?set -euo pipefail[\s\S]*)$/m.exec(
    build,
  )?.[1] ?? '';
// check.yml's signature check, to the next step of its job.
const verify =
  /^ {6}- name: Check the image it moves to was signed by build\.yml on main\n([\s\S]*?)(?=^ {6}- )/m.exec(
    check,
  )?.[1] ?? '';
// The lines of a script that run cosign or Syft, whatever the subcommand, without its comments.
const calls = (lines: string) =>
  lines
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !line.startsWith('#') && /(?:^|[\s"(])(?:cosign|\$SYFT|\$\{SYFT\})\b/.test(line));

const run = (failures: number) => {
  const bash = `set -euo pipefail
${retry}
exec 2>&1
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

describe('trying Sigstore again', () => {
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
    const bash = `exec 2>&1\n${retry}\nsleep() { :; }\nretry /bin/false scan x || true`;
    expect(execFileSync('bash', ['-c', bash], { encoding: 'utf-8' })).toContain(
      '::error::false scan failed four times',
    );
  });

  // Every line of the script that runs cosign or Syft, whatever its subcommand, goes through the function, and each
  // cosign try has a time limit of its own.
  it('tries every call to cosign and Syft in the signing job that way, the signature last', () => {
    const signing = calls(script);
    expect(signing.map((call) => call.split(' ').slice(0, 3).join(' '))).toEqual([
      'retry "$SYFT" scan',
      'retry cosign attest',
      'retry cosign sign',
    ]);
    for (const call of signing.filter((call) => call.includes('cosign'))) expect(call).toContain('--timeout 1m');
  });

  it("tries the signature check's every cosign call that way, with the signing job's function", () => {
    expect(verify).toContain('echo "$ref: signed by $identity, with its SBOM attested"');
    expect(retryIn(check)).toBe(retry);
    const checks = calls(verify).filter((call) => !call.startsWith('echo '));
    expect(checks.map((call) => call.split(' ').slice(0, 5).join(' '))).toEqual([
      'if ! retry cosign verify',
      'if ! retry cosign verify-attestation',
    ]);
    for (const call of checks) expect(call).toContain('--timeout 1m');
  });
});
