/**
 * pnpm cc:harness-check: checks the engine's harness deny rules, layer 5 of C-08-10
 * (08 §5.2; ADR 0005, decision A of 10 Nov 2026).
 *
 * `.claude/settings.json` must:
 *   - parse as strict JSON. Claude Code silently ignores a malformed settings file in print
 *     mode, and layer 5 vanishes with it (ADR 0005 F3);
 *   - deny every tool in REQUIRED_DENY by its exact name. An unknown or misspelled name
 *     denies nothing and says nothing (F6), so the check is an exact-name match against the
 *     inventory ADR 0005 verified on Claude Code 2.1.278, not a syntax check;
 *   - set `permissions.disableBypassPermissionsMode` to "disable" (§7.1);
 *   - have no `permissions.allow` entries (F4: ignored in an untrusted clone anyway, and the
 *     design expresses layer 5 as a deny list), no `disallowedTools` key (F7: not a settings
 *     key) and no `defaultMode` of bypassPermissions.
 *
 * `.codex/config.toml` must set `sandbox_mode = "read-only"` and `approval_policy = "never"`
 * at top level (ADR 0005 report §8). That half is documentation-only and unverified until
 * spike P0-09 reports; this checks the file says what the ADR proposes.
 *
 * What this cannot see: whether the invoker loads the file at all (F5). The effect probe of
 * ADR 0005 §7.3 items 1 and 2 (`claude doctor` and a write attempt) is the opt-in
 * `harness-probe` CI job. Interim: moves into @cc/build with the other engine scripts (P1-16).
 * Exit codes follow 08 §6: 0 pass, 1 a check failed, 2 usage error.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The Claude Code version ADR 0005 verified the tool inventory on. Re-check on every upgrade. */
export const VERIFIED_CLAUDE_CODE = '2.1.278';

/**
 * Every tool layer 5 removes (ADR 0005 §7.1, variant A): the shell (`Bash`, decision A), the
 * file writers (`NotebookEdit`, F2), the other command runner (`Monitor`, F1), agent and
 * worktree spawners, and the tools that schedule, message or publish; then the write-scoped
 * tools of the `command-center` MCP server (07 §7 fixes the name).
 */
export const REQUIRED_DENY = [
  'Bash',
  'Write',
  'Edit',
  'NotebookEdit',
  'Monitor',
  'Agent',
  'Workflow',
  'EnterWorktree',
  'ExitWorktree',
  'CronCreate',
  'CronDelete',
  'RemoteTrigger',
  'PushNotification',
  'SendMessage',
  'TaskCreate',
  'TaskUpdate',
  'Artifact',
  'Projects',
  'DesignSync',
  'mcp__command-center__cc_create_action',
  'mcp__command-center__cc_update_action',
  'mcp__command-center__cc_claim',
  'mcp__command-center__cc_attach_evidence',
  'mcp__command-center__cc_connector_invoke',
] as const;

export const CLAUDE_SETTINGS = '.claude/settings.json';
export const CODEX_CONFIG = '.codex/config.toml';

/** Problems with a `.claude/settings.json` text; empty when it holds. */
export function checkClaudeSettings(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return [`${CLAUDE_SETTINGS} is not valid JSON (${(error as Error).message}); Claude Code would silently ignore it (ADR 0005 F3)`];
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return [`${CLAUDE_SETTINGS} must be a JSON object`];
  }
  const settings = parsed as Record<string, unknown>;
  const problems: string[] = [];
  if ('disallowedTools' in settings) {
    problems.push('disallowedTools is not a settings key and is silently ignored; use permissions.deny (ADR 0005 F7)');
  }
  const permissions = settings['permissions'];
  if (typeof permissions !== 'object' || permissions === null || Array.isArray(permissions)) {
    return [...problems, 'permissions must be an object holding the deny list (ADR 0005 §7.1)'];
  }
  const perms = permissions as Record<string, unknown>;
  const deny = perms['deny'];
  if (!Array.isArray(deny) || !deny.every((d) => typeof d === 'string')) {
    problems.push('permissions.deny must be an array of tool names (ADR 0005 §7.1)');
  } else {
    const missing = REQUIRED_DENY.filter((name) => !deny.includes(name));
    if (missing.length > 0) {
      problems.push(
        `permissions.deny is missing ${missing.join(', ')}; names must match exactly, a misspelled name denies nothing (ADR 0005 F6)`,
      );
    }
  }
  if (perms['disableBypassPermissionsMode'] !== 'disable') {
    problems.push('permissions.disableBypassPermissionsMode must be "disable" (ADR 0005 §7.1)');
  }
  const allow = perms['allow'];
  if (allow !== undefined && !(Array.isArray(allow) && allow.length === 0)) {
    problems.push('permissions.allow must not be used: layer 5 is a deny list (ADR 0005 F4)');
  }
  if (perms['defaultMode'] === 'bypassPermissions') {
    problems.push('permissions.defaultMode must not be bypassPermissions (ADR 0005 §7.1)');
  }
  return problems;
}

/** Top-level `key = "value"` pairs of a TOML text, before its first table header. */
function topLevelTomlStrings(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line === '') continue;
    if (line.startsWith('[')) break;
    const match = /^([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) values.set(match[1], match[2]);
  }
  return values;
}

/** Problems with a `.codex/config.toml` text; empty when it holds. */
export function checkCodexConfig(text: string): string[] {
  const values = topLevelTomlStrings(text);
  const problems: string[] = [];
  if (values.get('sandbox_mode') !== 'read-only') {
    problems.push(`${CODEX_CONFIG} must set sandbox_mode = "read-only" at top level (ADR 0005 report §8)`);
  }
  if (values.get('approval_policy') !== 'never') {
    problems.push(`${CODEX_CONFIG} must set approval_policy = "never" at top level (ADR 0005 report §8)`);
  }
  return problems;
}

export function main(argv: readonly string[]): number {
  let root = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo' && argv[i + 1] !== undefined) root = resolve(argv[++i] as string);
    else {
      console.error(`cc:harness-check: unknown argument ${argv[i]}\nusage: cc:harness-check [--repo <dir>]`);
      return 2;
    }
  }
  const problems: string[] = [];
  for (const [file, check] of [
    [CLAUDE_SETTINGS, checkClaudeSettings],
    [CODEX_CONFIG, checkCodexConfig],
  ] as const) {
    const path = join(root, file);
    if (!existsSync(path)) problems.push(`${file} is missing (08 §5.2 layer 5)`);
    else problems.push(...check(readFileSync(path, 'utf8')));
  }
  if (problems.length > 0) {
    console.log(`cc:harness-check: FAIL  ${problems.length} problem(s) in the harness deny rules (C-08-10 layer 5)`);
    for (const p of problems) console.log(`  ${p}`);
    return 1;
  }
  console.log(
    `cc:harness-check: ok  ${REQUIRED_DENY.length} tools denied, bypass mode disabled, Codex read-only (inventory verified on Claude Code ${VERIFIED_CLAUDE_CODE})`,
  );
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
