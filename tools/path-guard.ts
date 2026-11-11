/**
 * pnpm cc:path-guard: the engine's pull-request path guard (08 §6, §9; C-08-09; AC-08-09).
 *
 * Rules, each printed with its ID when it fails:
 *   G1 (C-08-09)  A PR labelled `connector-include` may change only `connectors.lock`.
 *   G2 (C-08-09)  `connectors.lock` changes only through such a PR (AGENTS.md rule 2): a PR
 *                 without the label that changes it fails.
 *   G3 (C-08-10)  An automated PR (labelled `connector-include`, or opened by a bot account)
 *                 may not change the files that are the engine's AI enforcement: `.claude/`,
 *                 `.codex/`, `.github/`, `AGENTS.md`, `CLAUDE.md` (ADR 0005 §7.3 item 3, so the
 *                 file that is layer 5 is never edited by the thing it constrains).
 *
 * The changed files are those of `git diff <merge-base(base, head)> <head>`, renames listed
 * as a delete and an add, so moving a file out of a guarded path is still a change to it.
 *
 * In GitHub Actions it reads the pull request from $GITHUB_EVENT_PATH: labels, the author's
 * account type, and the base and head commits. Flags override the event, for local runs and
 * tests: --repo <dir> --base <rev> --head <rev> --label <name> (repeatable) --bot.
 *
 * Interim: this script moves into @cc/build with the other engine scripts (08 §6, P1-16).
 * Exit codes follow 08 §6: 0 pass (or not a pull request), 1 a rule failed, 2 usage error.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const INCLUDE_LABEL = 'connector-include';
export const LOCK_FILE = 'connectors.lock';
/** Paths an automated PR may never change (G3). A trailing `/` means the whole directory. */
export const ENFORCEMENT_PATHS = ['.claude/', '.codex/', '.github/', 'AGENTS.md', 'CLAUDE.md'] as const;

export interface GuardInput {
  /** Repository-relative paths with `/` separators. */
  readonly changed: readonly string[];
  readonly labels: readonly string[];
  readonly authorIsBot: boolean;
}

export interface Violation {
  readonly rule: 'G1' | 'G2' | 'G3';
  readonly message: string;
  readonly paths: readonly string[];
}

function isEnforcementPath(path: string): boolean {
  return ENFORCEMENT_PATHS.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p));
}

/** Applies G1 to G3 to one pull request's changed paths. */
export function evaluate(input: GuardInput): Violation[] {
  const violations: Violation[] = [];
  const isInclude = input.labels.includes(INCLUDE_LABEL);
  const automated = isInclude || input.authorIsBot;

  if (isInclude) {
    const others = input.changed.filter((p) => p !== LOCK_FILE);
    if (others.length > 0) {
      violations.push({
        rule: 'G1',
        message: `a PR labelled ${INCLUDE_LABEL} may change only ${LOCK_FILE} (C-08-09)`,
        paths: others,
      });
    }
  } else if (input.changed.includes(LOCK_FILE)) {
    violations.push({
      rule: 'G2',
      message: `${LOCK_FILE} changes only through an include PR labelled ${INCLUDE_LABEL}, made with pnpm cc:include (C-08-09)`,
      paths: [LOCK_FILE],
    });
  }

  if (automated) {
    const guarded = input.changed.filter(isEnforcementPath);
    if (guarded.length > 0) {
      violations.push({
        rule: 'G3',
        message: `an automated PR may not change the engine's AI enforcement files (${ENFORCEMENT_PATHS.join(', ')}) (C-08-10)`,
        paths: guarded,
      });
    }
  }
  return violations;
}

class UsageError extends Error {}

function git(repo: string, args: readonly string[]): string {
  try {
    return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim() ?? String(error);
    throw new UsageError(`git ${args.join(' ')} failed: ${stderr}`);
  }
}

/** The paths changed between the merge base of `base` and `head`, and `head`. */
export function changedPaths(repo: string, base: string, head: string): string[] {
  const mergeBase = git(repo, ['merge-base', base, head]).trim();
  return git(repo, ['diff', '--name-only', '--no-renames', '-z', mergeBase, head])
    .split('\0')
    .filter((p) => p.length > 0)
    .sort();
}

interface PullRequestEvent {
  pull_request?: {
    labels?: { name?: string }[];
    user?: { type?: string };
    base?: { sha?: string };
    head?: { sha?: string };
  };
}

interface Options {
  repo: string;
  base?: string;
  head?: string;
  labels: string[];
  bot: boolean;
  isPullRequest: boolean;
}

function parseArgs(argv: readonly string[], env: NodeJS.ProcessEnv): Options {
  const options: Options = { repo: process.cwd(), labels: [], bot: false, isPullRequest: false };
  const eventPath = env['GITHUB_EVENT_PATH'];
  if (eventPath !== undefined && eventPath !== '') {
    const event = JSON.parse(readFileSync(eventPath, 'utf8')) as PullRequestEvent;
    const pr = event.pull_request;
    if (pr !== undefined) {
      options.isPullRequest = true;
      options.labels = (pr.labels ?? []).flatMap((l) => (l.name === undefined ? [] : [l.name]));
      options.bot = pr.user?.type === 'Bot';
      if (pr.base?.sha !== undefined) options.base = pr.base.sha;
      if (pr.head?.sha !== undefined) options.head = pr.head.sha;
    }
  }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = (): string => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new UsageError(`${flag} needs a value`);
      return v;
    };
    switch (flag) {
      case '--repo':
        options.repo = resolve(value());
        break;
      case '--base':
        options.base = value();
        options.isPullRequest = true;
        break;
      case '--head':
        options.head = value();
        break;
      case '--label':
        options.labels.push(value());
        break;
      case '--bot':
        options.bot = true;
        break;
      default:
        throw new UsageError(`unknown argument ${flag}`);
    }
  }
  return options;
}

export function main(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): number {
  let options: Options;
  try {
    options = parseArgs(argv, env);
  } catch (error) {
    console.error(`cc:path-guard: ${(error as Error).message}`);
    console.error('usage: cc:path-guard [--repo <dir>] --base <rev> [--head <rev>] [--label <name>]... [--bot]');
    return 2;
  }
  if (!options.isPullRequest) {
    console.log('cc:path-guard: ok  not a pull request; nothing to guard');
    return 0;
  }
  if (options.base === undefined) {
    console.error('cc:path-guard: the pull request has no base commit; pass --base <rev>');
    return 2;
  }
  let changed: string[];
  try {
    changed = changedPaths(options.repo, options.base, options.head ?? 'HEAD');
  } catch (error) {
    console.error(`cc:path-guard: ${(error as Error).message}`);
    return 2;
  }
  const labels = options.labels.length > 0 ? options.labels.join(', ') : 'none';
  const author = options.bot ? 'bot' : 'person';
  const violations = evaluate({ changed, labels: options.labels, authorIsBot: options.bot });
  if (violations.length === 0) {
    console.log(`cc:path-guard: ok  ${changed.length} file(s) changed; labels: ${labels}; author: ${author}`);
    return 0;
  }
  console.log(`cc:path-guard: FAIL  ${changed.length} file(s) changed; labels: ${labels}; author: ${author}`);
  for (const v of violations) {
    console.log(`${v.rule}: ${v.message}:`);
    for (const p of v.paths) console.log(`  ${p}`);
  }
  return 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
