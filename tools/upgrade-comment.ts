/**
 * node tools/upgrade-comment.ts <log> <exit-code>: the body of the CI comment on a foundation
 * dependency PR (08 §9; owner decision D-1, 10 Nov 2026), from the output and exit code of
 * `pnpm cc:upgrade --check`. Prints Markdown on stdout.
 *
 * The comment has two parts: the codemod edits the upgrade would make, and the UI drift, the
 * upstream changes to the screens this engine ejected from `@cc/ui` (`ui/.cc-ui.json`; ADR 0008
 * decision 1). `cc-upgrade --check` prints the drift after its codemod report, as lines such as
 *
 *     ejected screen home changed upstream (@cc/ui 1.0.0 -> 1.1.0):
 *       ui/screens/home.ts: changed upstream (+1 -1 lines); changed here too, merges cleanly
 *     ui/screens/home.ts:12 has an unresolved merge from cc:ui-update; resolve it
 *
 * (`@cc/build` `src/eject.ts`, `uiDrift`); this lists them per screen and says whether
 * `pnpm cc:ui-update` will need a person. The full output follows in a collapsed block.
 *
 * It runs in the CI job that already runs the PR's code with a read-only token; the job that
 * posts the comment runs nothing from the PR. Imports only Node built-ins, so it needs no install.
 * Exit codes follow 08 §6: 0 printed, 2 usage error.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface EjectedScreen {
  readonly name: string;
  /** The heading line without its indent, for example `ejected screen home changed upstream (...)`. */
  readonly heading: string;
  /** The file lines under it, without their indent. */
  readonly files: string[];
}

export interface UiDrift {
  readonly screens: EjectedScreen[];
  /** Unresolved merges left in ejected files by an earlier `cc:ui-update`. */
  readonly unresolved: string[];
  /** Whether `cc:ui-update` will leave a conflict for a person. */
  readonly needsPerson: boolean;
}

const SCREEN = /^ {2}ejected screen (\S+?):? (.*)$/;
const SCREEN_FILE = /^ {4}(\S.*)$/;
const UNRESOLVED = /^ {2}(\S+ has an unresolved merge from cc:ui-update.*)$/;

/** The UI drift lines of a `cc-upgrade --check` output. */
export function parseUiDrift(log: string): UiDrift {
  const screens: EjectedScreen[] = [];
  const unresolved: string[] = [];
  let current: EjectedScreen | undefined;
  for (const line of log.split(/\r?\n/)) {
    const screen = SCREEN.exec(line);
    if (screen?.[1] !== undefined) {
      current = { name: screen[1], heading: line.trim(), files: [] };
      screens.push(current);
      continue;
    }
    const file = SCREEN_FILE.exec(line);
    if (file?.[1] !== undefined && current !== undefined) {
      current.files.push(file[1]);
      continue;
    }
    current = undefined;
    const left = UNRESOLVED.exec(line);
    if (left?.[1] !== undefined) unresolved.push(left[1]);
  }
  const needsPerson =
    unresolved.length > 0 || screens.some((s) => s.files.some((f) => f.includes('for a person')));
  return { screens, unresolved, needsPerson };
}

/** Whether the output lists codemod edits (`... N edits in M files would be made ...`). */
function codemodsDue(log: string): boolean {
  return /would be made/.test(log.split(/\r?\n/, 1)[0] ?? '');
}

function verdict(code: string, log: string, drift: UiDrift): string[] {
  if (code === '0') {
    return ['Nothing to do: the engine is already on the extension API this foundation release expects, and no ejected screen changed upstream.'];
  }
  if (code !== '1') return [`\`pnpm cc:upgrade --check\` did not finish (exit ${code}); see the job log.`];
  const todo: string[] = [];
  if (codemodsDue(log)) todo.push('run `pnpm cc:upgrade` to apply the codemod edits');
  if (drift.screens.length > 0) todo.push('run `pnpm cc:ui-update` to merge the upstream changes into the ejected screens');
  if (drift.unresolved.length > 0) todo.push('resolve the merge left in the ejected screens');
  const what =
    todo.length > 0
      ? `Locally, when convenient and before the next foundation major: ${todo.join('; ')}. Merge the result like any change.`
      : 'Read the output below: the check found something for a person.';
  return [`${what} This PR merges as it is (owner decision D-1).`];
}

function driftSection(drift: UiDrift): string[] {
  const lines = ['#### UI drift: ejected screens', ''];
  if (drift.screens.length === 0 && drift.unresolved.length === 0) {
    lines.push('No ejected screen changed upstream (`ui/.cc-ui.json`).');
    return lines;
  }
  for (const screen of drift.screens) {
    lines.push(`- \`${screen.name}\`: ${screen.heading.replace(/^ejected screen \S+?:? /, '').replace(/:$/, '')}`);
    for (const file of screen.files) lines.push(`  - ${file}`);
  }
  for (const left of drift.unresolved) lines.push(`- ${left}`);
  lines.push(
    '',
    drift.needsPerson
      ? '`pnpm cc:ui-update` will leave conflict markers for a person: keep the user\'s intent, then re-run the UI tests.'
      : '`pnpm cc:ui-update` merges these cleanly.',
  );
  return lines;
}

/** The Markdown body of the comment. */
export function commentBody(log: string | undefined, code: string): string {
  const text = log ?? '';
  const drift = parseUiDrift(text);
  const lines = [
    '### Foundation update: `pnpm cc:upgrade --check`',
    '',
    ...verdict(code, text, drift),
    '',
    ...(code === '0' || code === '1' ? [...driftSection(drift), ''] : []),
    '<details><summary>Output</summary>',
    '',
    '~~~~text',
    ...(log === undefined || log.trim() === ''
      ? ['(no output)']
      : text.replace(/\n$/, '').split('\n').filter((line) => !line.startsWith('~~~~'))),
    '~~~~',
    '</details>',
  ];
  return `${lines.join('\n')}\n`;
}

export function main(argv: readonly string[]): number {
  if (argv.length !== 2 || argv[0] === undefined || argv[1] === undefined) {
    console.error('usage: node tools/upgrade-comment.ts <log> <exit-code>');
    return 2;
  }
  let log: string | undefined;
  try {
    log = readFileSync(argv[0], 'utf8');
  } catch {
    log = undefined;
  }
  process.stdout.write(commentBody(log, argv[1].trim()));
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
