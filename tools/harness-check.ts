/**
 * pnpm cc:harness-check: checks the engine's harness deny rules, layer 5 of C-08-10
 * (08 §5.2; ADR 0005, decision A of 10 Nov 2026).
 *
 * PARKED (11 Nov 2026): the owner switched the lock-down off until the Phase 1 engine-building
 * tasks are merged (docs/lockdown-parked.md). The decided rules are kept unchanged in
 * `.claude/settings.lockdown.json` and `.codex/config.lockdown.toml`, which neither Claude Code
 * nor Codex loads. While LOCKDOWN_PARKED is true this checks those parked files, so the rules
 * stay correct; below, `.claude/settings.json` and `.codex/config.toml` mean the parked copies.
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
 * The development profile (ADR 0008 decision 2, which amends ADR 0005 decision A; AGENTS.md
 * rule 1): the rules above are the profile of Command Center's own AI, the default for any
 * session in the checkout. A development agent working for the user is launched without the
 * project settings and with `.claude/settings.development.json`
 * (`claude --setting-sources user,local --settings .claude/settings.development.json`), or with
 * `codex --profile development`. That file must parse as strict JSON, disable bypass mode,
 * allow edits to exactly the rule 1 paths (DEVELOPMENT_PATHS), deny edits to every other path
 * of the repository (DEVELOPMENT_DENIED_PATHS) and the command-center write tools, and deny
 * nothing that would stop it changing the rule 1 paths. The Codex profile
 * `[profiles.development]` must set `sandbox_mode = "workspace-write"` and
 * `approval_policy = "never"`. The development file is not parked: it has effect only when an
 * agent is launched with it.
 *
 * What this cannot see: whether the invoker loads the file at all (F5). The effect probe of
 * ADR 0005 §7.3 items 1 and 2 (`claude doctor` and a write attempt) is the opt-in
 * `harness-probe` CI job. Interim: moves into @cc/build with the other engine scripts when the
 * foundation is pinned (extension-api/README.md).
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

/**
 * The lock-down is parked (docs/lockdown-parked.md): the rules live in the files below, which
 * no harness loads, and the live files above hold no deny rules. To re-enable, move each parked
 * file back over its live file and set LOCKDOWN_PARKED to false.
 */
export const LOCKDOWN_PARKED = true;
export const CLAUDE_SETTINGS_PARKED = '.claude/settings.lockdown.json';
export const CODEX_CONFIG_PARKED = '.codex/config.lockdown.toml';

/**
 * The paths a development agent may change (AGENTS.md rule 1; ADR 0008 decision 2). A trailing
 * `/` means the whole directory.
 */
export const DEVELOPMENT_PATHS = ['ui/', 'theme/', 'cc.config.ts', 'frameworks/', 'packs/'] as const;

/**
 * Every other top-level path of the repository, which the development profile denies: first
 * the ones rule 1 names, then the rest. A new top-level path must be added here (the harness
 * test compares this list with `git ls-files`).
 */
export const DEVELOPMENT_DENIED_PATHS = [
  'connectors.lock',
  '.claude/',
  '.codex/',
  '.github/',
  'AGENTS.md',
  'CLAUDE.md',
  '.agents/',
  '.gitattributes',
  '.gitignore',
  '.node-version',
  'README.md',
  'docs/',
  'extension-api/',
  'fixtures/',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'test/',
  'tools/',
  'tsconfig.json',
  'vitest.config.ts',
] as const;

/** The command-center MCP tools that write; a development agent does not act as the user in Command Center. */
export const COMMAND_CENTER_WRITE_TOOLS = REQUIRED_DENY.filter((name) => name.startsWith('mcp__command-center__'));

/** The Claude Code `Edit` rule for one repository path, relative to the agent's working directory (the repository root). */
export function editRule(path: string): string {
  return path.endsWith('/') ? `Edit(./${path}**)` : `Edit(./${path})`;
}

export const DEVELOPMENT_SETTINGS = '.claude/settings.development.json';
export const CODEX_DEVELOPMENT_PROFILE = 'development';

/** Problems with a `.claude/settings.json` text; empty when it holds. */
export function checkClaudeSettings(text: string, file: string = CLAUDE_SETTINGS): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return [`${file} is not valid JSON (${(error as Error).message}); Claude Code would silently ignore it (ADR 0005 F3)`];
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return [`${file} must be a JSON object`];
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
export function checkCodexConfig(text: string, file: string = CODEX_CONFIG): string[] {
  const values = topLevelTomlStrings(text);
  const problems: string[] = [];
  if (values.get('sandbox_mode') !== 'read-only') {
    problems.push(`${file} must set sandbox_mode = "read-only" at top level (ADR 0005 report §8)`);
  }
  if (values.get('approval_policy') !== 'never') {
    problems.push(`${file} must set approval_policy = "never" at top level (ADR 0005 report §8)`);
  }
  return problems;
}

/** `key = "value"` pairs of one `[table]` of a TOML text. */
function tomlTableStrings(text: string, table: string): Map<string, string> {
  const values = new Map<string, string>();
  let inside = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line === '') continue;
    if (line.startsWith('[')) {
      inside = line === `[${table}]`;
      continue;
    }
    if (!inside) continue;
    const match = /^([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) values.set(match[1], match[2]);
  }
  return values;
}

/** Problems with the development profile of a `.codex/config.toml` text; empty when it holds. */
export function checkCodexDevelopmentProfile(text: string, file: string = CODEX_CONFIG): string[] {
  const table = `profiles.${CODEX_DEVELOPMENT_PROFILE}`;
  const values = tomlTableStrings(text, table);
  const problems: string[] = [];
  if (values.get('sandbox_mode') !== 'workspace-write') {
    problems.push(`${file} must set sandbox_mode = "workspace-write" in [${table}] (ADR 0008 decision 2)`);
  }
  if (values.get('approval_policy') !== 'never') {
    problems.push(`${file} must set approval_policy = "never" in [${table}] (ADR 0008 decision 2)`);
  }
  return problems;
}

/** Whether an `Edit(...)` or bare tool rule would stop edits to a rule 1 path. */
function blocksDevelopmentPath(rule: string): boolean {
  if (['Edit', 'Write', 'NotebookEdit', 'Edit(*)', 'Edit(**)', 'Edit(./**)'].includes(rule)) return true;
  const match = /^(?:Edit|Write|NotebookEdit)\((?:\.\/)?([^)]*)\)$/.exec(rule);
  if (match?.[1] === undefined) return false;
  const path = match[1];
  // A pattern that starts with a wildcard (`**/*.ts`) can match under any rule 1 path.
  if (path.startsWith('*')) return true;
  return DEVELOPMENT_PATHS.some((p) => path.startsWith(p.replace(/\/$/, '')) || p.startsWith(path.replace(/\*+$/, '')));
}

/** Problems with a `.claude/settings.development.json` text; empty when it holds. */
export function checkDevelopmentSettings(text: string, file: string = DEVELOPMENT_SETTINGS): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return [`${file} is not valid JSON (${(error as Error).message}); Claude Code would silently ignore it (ADR 0005 F3)`];
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return [`${file} must be a JSON object`];
  }
  const settings = parsed as Record<string, unknown>;
  const problems: string[] = [];
  if ('disallowedTools' in settings) {
    problems.push(`${file}: disallowedTools is not a settings key and is silently ignored; use permissions.deny (ADR 0005 F7)`);
  }
  const permissions = settings['permissions'];
  if (typeof permissions !== 'object' || permissions === null || Array.isArray(permissions)) {
    return [...problems, `${file}: permissions must be an object holding the allow and deny lists (ADR 0008 decision 2)`];
  }
  const perms = permissions as Record<string, unknown>;
  if (perms['disableBypassPermissionsMode'] !== 'disable') {
    problems.push(`${file}: permissions.disableBypassPermissionsMode must be "disable"`);
  }
  if (perms['defaultMode'] === 'bypassPermissions') {
    problems.push(`${file}: permissions.defaultMode must not be bypassPermissions`);
  }
  const allow = perms['allow'];
  const wanted = DEVELOPMENT_PATHS.map(editRule);
  if (!Array.isArray(allow) || !allow.every((a) => typeof a === 'string')) {
    problems.push(`${file}: permissions.allow must be an array of rules`);
  } else {
    const extra = allow.filter((a) => !wanted.includes(a));
    const missing = wanted.filter((w) => !allow.includes(w));
    if (extra.length > 0 || missing.length > 0) {
      problems.push(
        `${file}: permissions.allow must be exactly the edits AGENTS.md rule 1 allows (${wanted.join(', ')})${extra.length > 0 ? `; remove ${extra.join(', ')}` : ''}${missing.length > 0 ? `; add ${missing.join(', ')}` : ''}`,
      );
    }
  }
  const deny = perms['deny'];
  if (!Array.isArray(deny) || !deny.every((d) => typeof d === 'string')) {
    problems.push(`${file}: permissions.deny must be an array of rules`);
  } else {
    const required = [...DEVELOPMENT_DENIED_PATHS.map(editRule), ...COMMAND_CENTER_WRITE_TOOLS];
    const missing = required.filter((r) => !deny.includes(r));
    if (missing.length > 0) {
      problems.push(
        `${file}: permissions.deny is missing ${missing.join(', ')}; a development agent changes only the paths of AGENTS.md rule 1`,
      );
    }
    const blocking = deny.filter(blocksDevelopmentPath);
    if (blocking.length > 0) {
      problems.push(`${file}: permissions.deny must not stop edits to the paths of AGENTS.md rule 1: ${blocking.join(', ')}`);
    }
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
  const codexFile = LOCKDOWN_PARKED ? CODEX_CONFIG_PARKED : CODEX_CONFIG;
  for (const [file, check] of [
    [LOCKDOWN_PARKED ? CLAUDE_SETTINGS_PARKED : CLAUDE_SETTINGS, checkClaudeSettings],
    [codexFile, checkCodexConfig],
    [codexFile, checkCodexDevelopmentProfile],
    [DEVELOPMENT_SETTINGS, checkDevelopmentSettings],
  ] as const) {
    const path = join(root, file);
    if (!existsSync(path)) problems.push(`${file} is missing (08 §5.2 layer 5)`);
    else problems.push(...check(readFileSync(path, 'utf8'), file));
  }
  if (problems.length > 0) {
    console.log(`cc:harness-check: FAIL  ${problems.length} problem(s) in the harness deny rules (C-08-10 layer 5)`);
    for (const p of problems) console.log(`  ${p}`);
    return 1;
  }
  if (LOCKDOWN_PARKED) {
    console.log(
      `cc:harness-check: ok, PARKED (not enforced)  ${CLAUDE_SETTINGS_PARKED} denies ${REQUIRED_DENY.length} tools with bypass mode disabled, ${CODEX_CONFIG_PARKED} is read-only (inventory verified on Claude Code ${VERIFIED_CLAUDE_CODE}); development profile ${DEVELOPMENT_SETTINGS} allows edits to ${DEVELOPMENT_PATHS.length} paths only; see docs/lockdown-parked.md`,
    );
    return 0;
  }
  console.log(
    `cc:harness-check: ok  ${REQUIRED_DENY.length} tools denied, bypass mode disabled, Codex read-only (inventory verified on Claude Code ${VERIFIED_CLAUDE_CODE}); development profile ${DEVELOPMENT_SETTINGS} allows edits to ${DEVELOPMENT_PATHS.length} paths only`,
  );
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
