/**
 * node tools/cc.ts <command> [args...]: the seam between the engine's package.json scripts and
 * `@cc/build`, which owns them (08 §6: "The engine's scripts come from @cc/build, so the engine
 * holds no script code").
 *
 *   build          pnpm build            -> cc-build          build flag `build`
 *   start          pnpm start            -> cc-start          build flag `start`
 *   upgrade        pnpm cc:upgrade       -> cc-upgrade        build flag `upgrade`
 *   include        pnpm cc:include       -> cc-include        build flag `include`
 *   install-stamp  postinstall           -> cc-install-stamp  build flag `build`; a no-op while off
 *   flags          pnpm cc:flags         prints every build flag as name=on|off
 *
 * A command whose flag is on runs the named bin of the installed `@cc/build` with Node, in the
 * engine root, passing its arguments through and returning its exit code. One whose flag is off
 * says which build step brings it and exits 1, except `install-stamp`, which must never fail an
 * install. A flag that is on while `@cc/build` is missing, or does not ship the bin, exits 1 and
 * says so.
 *
 * Interim: no @cc/* package is published yet, so `install` cannot depend on one. Once the
 * interim scripts in tools/ are gone (extension-api/README.md), package.json names the bins
 * directly and this file is deleted.
 * Exit codes follow 08 §6: 0 pass, 1 failure, 2 usage error; a bin's own code is passed on.
 */
import { spawnSync, type StdioOptions } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_FLAGS, type BuildFlags, type FlagName } from './build-flags.ts';

export const FOUNDATION_BUILD_PACKAGE = '@cc/build';

interface Command {
  /** What the user typed, for messages. */
  readonly script: string;
  readonly flag: FlagName;
  readonly bin: string;
  /** Exit code while the flag is off. */
  readonly offExit: 0 | 1;
}

export const COMMANDS: Readonly<Record<string, Command>> = {
  build: { script: 'pnpm build', flag: 'build', bin: 'cc-build', offExit: 1 },
  start: { script: 'pnpm start', flag: 'start', bin: 'cc-start', offExit: 1 },
  upgrade: { script: 'pnpm cc:upgrade', flag: 'upgrade', bin: 'cc-upgrade', offExit: 1 },
  include: { script: 'pnpm cc:include', flag: 'include', bin: 'cc-include', offExit: 1 },
  'install-stamp': { script: 'postinstall', flag: 'build', bin: 'cc-install-stamp', offExit: 0 },
};

export interface RunOptions {
  readonly root: string;
  readonly flags?: BuildFlags;
  readonly stdio?: StdioOptions;
  readonly log?: (line: string) => void;
}

const USAGE = `usage: node tools/cc.ts <${[...Object.keys(COMMANDS), 'flags'].join('|')}> [args...]`;

/** The absolute path of `bin` in the engine's installed `@cc/build`, or a message saying why there is none. */
export function resolveBin(root: string, bin: string): { path: string } | { problem: string } {
  const manifest = join(root, 'node_modules', ...FOUNDATION_BUILD_PACKAGE.split('/'), 'package.json');
  if (!existsSync(manifest)) {
    return {
      problem: `${FOUNDATION_BUILD_PACKAGE} is not installed. Pin it in package.json and run pnpm install --frozen-lockfile (extension-api/README.md, "Pinning the foundation")`,
    };
  }
  const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: string; bin?: unknown };
  const bins = typeof pkg.bin === 'object' && pkg.bin !== null ? (pkg.bin as Record<string, unknown>) : {};
  const target = bins[bin];
  if (typeof target !== 'string') {
    return { problem: `${FOUNDATION_BUILD_PACKAGE}@${pkg.version ?? '?'} ships no ${bin} bin` };
  }
  return { path: resolve(dirname(manifest), target) };
}

export function flagLines(flags: BuildFlags = BUILD_FLAGS): string[] {
  return Object.entries(flags).map(([name, f]) => `${name}=${f.on ? 'on' : 'off'}`);
}

export function run(command: string | undefined, args: readonly string[], options: RunOptions): number {
  const flags = options.flags ?? BUILD_FLAGS;
  const log = options.log ?? ((line: string) => console.error(line));
  if (command === 'flags') {
    if (args.length > 0) {
      log(`cc:flags takes no arguments\n${USAGE}`);
      return 2;
    }
    for (const line of flagLines(flags)) console.log(line);
    return 0;
  }
  const cmd = command === undefined ? undefined : COMMANDS[command];
  if (cmd === undefined) {
    log(command === undefined ? USAGE : `unknown command ${command}\n${USAGE}`);
    return 2;
  }
  const flag = flags[cmd.flag];
  if (!flag.on) {
    if (cmd.offExit === 0) return 0;
    log(`${cmd.script} is not built yet (build flag ${cmd.flag} is off): ${flag.what}. It arrives with ${flag.arrives}; see README.md, "Build flags".`);
    return cmd.offExit;
  }
  const bin = resolveBin(options.root, cmd.bin);
  if ('problem' in bin) {
    log(`${cmd.script}: build flag ${cmd.flag} is on, but ${bin.problem}`);
    return 1;
  }
  const result = spawnSync(process.execPath, [bin.path, ...args], { cwd: options.root, stdio: options.stdio ?? 'inherit' });
  if (result.error !== undefined) {
    log(`${cmd.script}: could not run ${cmd.bin}: ${result.error.message}`);
    return 1;
  }
  if (result.status === null) {
    log(`${cmd.script}: ${cmd.bin} ended by signal ${result.signal ?? 'unknown'}`);
    return 1;
  }
  return result.status;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  process.exitCode = run(command, args, { root: join(dirname(fileURLToPath(import.meta.url)), '..') });
}
