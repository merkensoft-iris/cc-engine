/**
 * The engine's package.json scripts and their seam to @cc/build (tools/cc.ts) behind the build
 * flags (tools/build-flags.ts): P1-16, engine half. A fake @cc/build in a temporary engine
 * stands in for the unpublished package, so these prove the wiring, not the foundation's bins.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { BUILD_FLAGS, type BuildFlags } from '../tools/build-flags.ts';
import { COMMANDS, flagLines, run } from '../tools/cc.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CC = join(ROOT, 'tools', 'cc.ts');

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function allOn(): BuildFlags {
  return Object.fromEntries(Object.entries(BUILD_FLAGS).map(([k, f]) => [k, { ...f, on: true }])) as unknown as BuildFlags;
}

/**
 * A temporary engine with a fake @cc/build whose bins record argv and cwd to `calls.jsonl`
 * and exit with the code in their first `--exit=<n>` argument.
 */
function engineWithFakeBuild(bins: readonly string[] = ['cc-build', 'cc-start', 'cc-upgrade', 'cc-include', 'cc-install-stamp']): string {
  const root = mkdtempSync(join(tmpdir(), 'cc-scripts-'));
  dirs.push(root);
  const pkg = join(root, 'node_modules', '@cc', 'build');
  mkdirSync(join(pkg, 'bin'), { recursive: true });
  writeFileSync(
    join(pkg, 'package.json'),
    JSON.stringify({ name: '@cc/build', version: '1.0.0', type: 'module', bin: Object.fromEntries(bins.map((b) => [b, `bin/${b}.mjs`])) }),
  );
  for (const b of bins) {
    writeFileSync(
      join(pkg, 'bin', `${b}.mjs`),
      [
        "import { appendFileSync } from 'node:fs';",
        `appendFileSync(${JSON.stringify(join(root, 'calls.jsonl'))}, JSON.stringify({ bin: ${JSON.stringify(b)}, args: process.argv.slice(2), cwd: process.cwd() }) + '\\n');`,
        "const code = process.argv.slice(2).find((a) => a.startsWith('--exit='));",
        "process.exitCode = code === undefined ? 0 : Number(code.slice(7));",
      ].join('\n'),
    );
  }
  return root;
}

function calls(root: string): { bin: string; args: string[]; cwd: string }[] {
  try {
    return readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function capture() {
  const lines: string[] = [];
  return { lines, log: (l: string) => lines.push(l) };
}

describe('P1-16 engine scripts: package.json wiring', () => {
  const scripts = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;

  it.each([
    ['postinstall', 'install-stamp'],
    ['build', 'build'],
    ['start', 'start'],
    ['cc:upgrade', 'upgrade'],
    ['cc:include', 'include'],
    ['cc:flags', 'flags'],
  ])('%s goes through the @cc/build seam as `%s`', (script, command) => {
    expect(scripts[script]).toBe(`node tools/cc.ts ${command}`);
  });

  it('no script still points at the removed placeholder', () => {
    expect(Object.values(scripts).filter((s) => s.includes('not-yet'))).toEqual([]);
  });

  it('every seam command maps to a declared build flag', () => {
    for (const cmd of Object.values(COMMANDS)) expect(Object.keys(BUILD_FLAGS)).toContain(cmd.flag);
  });
});

describe('P1-16 build flags: features not built yet stay off', () => {
  it('the template ships with build, upgrade, start and include off until the foundation is pinned', () => {
    expect(flagLines()).toEqual(['build=off', 'upgrade=off', 'start=off', 'include=off']);
  });

  it.each(['build', 'start', 'upgrade', 'include'])('%s with its flag off names the build step and exits 1, running nothing', (command) => {
    const root = engineWithFakeBuild();
    const out = capture();
    expect(run(command, [], { root, log: out.log })).toBe(1);
    const flag = BUILD_FLAGS[COMMANDS[command]!.flag];
    expect(out.lines.join('\n')).toContain(`build flag ${COMMANDS[command]!.flag} is off`);
    expect(out.lines.join('\n')).toContain(flag.arrives);
    expect(calls(root)).toEqual([]);
  });

  it('install-stamp with the build flag off is a silent no-op, so pnpm install never fails on it', () => {
    const root = engineWithFakeBuild();
    const out = capture();
    expect(run('install-stamp', [], { root, log: out.log })).toBe(0);
    expect(out.lines).toEqual([]);
    expect(calls(root)).toEqual([]);
  });

  it('the CLI prints the flags as name=on|off lines for $GITHUB_OUTPUT', () => {
    const r = spawnSync(process.execPath, [CC, 'flags'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split('\n')).toEqual(flagLines());
  });
});

describe('P1-16 seam: a flag that is on runs the @cc/build bin', () => {
  it.each([
    ['build', 'cc-build'],
    ['start', 'cc-start'],
    ['upgrade', 'cc-upgrade'],
    ['include', 'cc-include'],
    ['install-stamp', 'cc-install-stamp'],
  ])('%s runs %s in the engine root with the arguments passed through', (command, bin) => {
    const root = engineWithFakeBuild();
    expect(run(command, ['--check', 'x y'], { root, flags: allOn(), stdio: 'ignore' })).toBe(0);
    expect(calls(root)).toEqual([{ bin, args: ['--check', 'x y'], cwd: root }]);
  });

  it.each([0, 1, 2])('passes on the bin exit code %i (cc:upgrade --check exits 1 when an upgrade is due)', (code) => {
    const root = engineWithFakeBuild();
    expect(run('upgrade', ['--check', `--exit=${code}`], { root, flags: allOn(), stdio: 'ignore' })).toBe(code);
  });

  it('only the flag of the command matters: build on, start off', () => {
    const root = engineWithFakeBuild();
    const flags = { ...BUILD_FLAGS, build: { ...BUILD_FLAGS.build, on: true } } as BuildFlags;
    expect(run('build', [], { root, flags, stdio: 'ignore' })).toBe(0);
    expect(run('start', [], { root, flags, log: () => {} })).toBe(1);
    expect(calls(root).map((c) => c.bin)).toEqual(['cc-build']);
  });

  it('a flag that is on with @cc/build not installed exits 1 and says how to pin it', () => {
    const root = mkdtempSync(join(tmpdir(), 'cc-scripts-'));
    dirs.push(root);
    const out = capture();
    expect(run('build', [], { root, flags: allOn(), log: out.log })).toBe(1);
    expect(out.lines.join('\n')).toMatch(/@cc\/build is not installed.*Pinning the foundation/);
  });

  it('a flag that is on while @cc/build ships no such bin exits 1 and names the bin and version', () => {
    const root = engineWithFakeBuild(['cc-build']);
    const out = capture();
    expect(run('upgrade', ['--check'], { root, flags: allOn(), log: out.log })).toBe(1);
    expect(out.lines.join('\n')).toContain('@cc/build@1.0.0 ships no cc-upgrade bin');
  });
});

describe('P1-16 seam: usage errors exit 2 (08 §6)', () => {
  it.each([[undefined], ['bogus']])('command %s', (command) => {
    expect(run(command, [], { root: ROOT, log: () => {} })).toBe(2);
  });

  it('flags takes no arguments', () => {
    expect(run('flags', ['--x'], { root: ROOT, log: () => {} })).toBe(2);
  });
});

