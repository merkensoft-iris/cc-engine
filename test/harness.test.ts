import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CLAUDE_SETTINGS,
  CLAUDE_SETTINGS_PARKED,
  CODEX_CONFIG,
  CODEX_CONFIG_PARKED,
  checkClaudeSettings,
  checkCodexConfig,
  checkCodexDevelopmentProfile,
  checkDevelopmentSettings,
  COMMAND_CENTER_WRITE_TOOLS,
  DEVELOPMENT_DENIED_PATHS,
  DEVELOPMENT_PATHS,
  DEVELOPMENT_SETTINGS,
  editRule,
  LOCKDOWN_PARKED,
  main,
  REQUIRED_DENY,
} from '../tools/harness-check.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// While the lock-down is parked (docs/lockdown-parked.md) the decided rules live in the parked
// files; these tests keep them correct so re-enabling is only moving them back.
const claudeFile = LOCKDOWN_PARKED ? CLAUDE_SETTINGS_PARKED : CLAUDE_SETTINGS;
const codexFile = LOCKDOWN_PARKED ? CODEX_CONFIG_PARKED : CODEX_CONFIG;
const shipped = () => readFileSync(join(ROOT, claudeFile), 'utf8');

describe('harness deny rules (C-08-10 layer 5, ADR 0005)', () => {
  it('C-08-10 the shipped (or parked) Claude settings and Codex config pass cc:harness-check', () => {
    expect(checkClaudeSettings(shipped())).toEqual([]);
    expect(checkCodexConfig(readFileSync(join(ROOT, codexFile), 'utf8'))).toEqual([]);
    expect(main(['--repo', ROOT])).toBe(0);
  });

  it.runIf(LOCKDOWN_PARKED)('C-08-10 parked: the live files block nothing, so agents can build the engine', () => {
    expect(JSON.parse(readFileSync(join(ROOT, CLAUDE_SETTINGS), 'utf8'))).toEqual({});
    const codex = readFileSync(join(ROOT, CODEX_CONFIG), 'utf8');
    expect(codex.split(/\r?\n/).filter((l) => l.trim() !== '' && !l.trim().startsWith('#'))).toEqual([]);
  });

  it('C-08-10 the shipped deny list is exactly the ADR 0005 file plus the command-center write tools', () => {
    const settings = JSON.parse(shipped()) as { permissions: { deny: string[]; disableBypassPermissionsMode: string } };
    expect(settings.permissions.deny).toEqual([...REQUIRED_DENY]);
    expect(settings.permissions.disableBypassPermissionsMode).toBe('disable');
    expect(Object.keys(settings)).toEqual(['permissions']);
  });

  it('C-08-10 a trailing comma fails the check, since Claude Code would silently ignore the file (F3)', () => {
    const last = REQUIRED_DENY[REQUIRED_DENY.length - 1];
    const broken = shipped().replace(`"${last}"`, `"${last}",`);
    expect(broken).toMatch(/,\s*\]/);
    expect(checkClaudeSettings(broken)[0]).toContain('is not valid JSON');
  });

  it('C-08-10 a misspelled tool name fails the check, since it would deny nothing (F6)', () => {
    const typo = shipped().replace('"Monitor"', '"Montor"');
    expect(checkClaudeSettings(typo).join('\n')).toContain('missing Monitor');
  });

  it('C-08-10 dropping NotebookEdit or Monitor fails the check: both are live write paths (F1, F2)', () => {
    for (const name of ['NotebookEdit', 'Monitor']) {
      const settings = JSON.parse(shipped()) as { permissions: { deny: string[] } };
      settings.permissions.deny = settings.permissions.deny.filter((d) => d !== name);
      expect(checkClaudeSettings(JSON.stringify(settings)).join('\n')).toContain(`missing ${name}`);
    }
  });

  it('C-08-10 an allow list, a disallowedTools key or bypass mode left enabled fails the check (F4, F7)', () => {
    const base = JSON.parse(shipped()) as { permissions: Record<string, unknown> } & Record<string, unknown>;
    const withAllow = structuredClone(base);
    withAllow.permissions['allow'] = ['Read'];
    expect(checkClaudeSettings(JSON.stringify(withAllow)).join('\n')).toContain('F4');
    const withDisallowed = { ...structuredClone(base), disallowedTools: ['Bash'] };
    expect(checkClaudeSettings(JSON.stringify(withDisallowed)).join('\n')).toContain('F7');
    const bypass = structuredClone(base);
    delete bypass.permissions['disableBypassPermissionsMode'];
    expect(checkClaudeSettings(JSON.stringify(bypass)).join('\n')).toContain('disableBypassPermissionsMode');
  });

  it('C-08-10 a Codex config that is not read-only with approvals never fails the check', () => {
    expect(checkCodexConfig('sandbox_mode = "workspace-write"\napproval_policy = "never"\n')).toHaveLength(1);
    expect(checkCodexConfig('approval_policy = "on-request"\nsandbox_mode = "read-only"\n')).toHaveLength(1);
    expect(checkCodexConfig('[profile]\nsandbox_mode = "read-only"\napproval_policy = "never"\n')).toHaveLength(2);
  });
});

describe('development profile (ADR 0008 decision 2, AGENTS.md rule 1)', () => {
  const development = () => readFileSync(join(ROOT, DEVELOPMENT_SETTINGS), 'utf8');
  const parse = () =>
    JSON.parse(development()) as { permissions: { allow: string[]; deny: string[] } & Record<string, unknown> };

  it('C-08-10 the shipped development settings and Codex development profile pass cc:harness-check', () => {
    expect(checkDevelopmentSettings(development())).toEqual([]);
    expect(checkCodexDevelopmentProfile(readFileSync(join(ROOT, codexFile), 'utf8'))).toEqual([]);
  });

  it('C-08-10 the profile allows edits to exactly ui/, theme/, cc.config.ts, frameworks/ and packs/', () => {
    expect([...DEVELOPMENT_PATHS]).toEqual(['ui/', 'theme/', 'cc.config.ts', 'frameworks/', 'packs/']);
    expect(parse().permissions.allow).toEqual(DEVELOPMENT_PATHS.map(editRule));
  });

  it('C-08-10 the profile denies edits to every other tracked top-level path, so a new one must be denied too', () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((line) => line !== '')
      .map((path) => (path.includes('/') ? `${path.slice(0, path.indexOf('/'))}/` : path));
    const topLevel = [...new Set(tracked)].sort();
    const allowed = new Set<string>(DEVELOPMENT_PATHS);
    const denied = new Set<string>(DEVELOPMENT_DENIED_PATHS);
    expect(topLevel.filter((path) => !allowed.has(path) && !denied.has(path))).toEqual([]);
    expect(topLevel.filter((path) => allowed.has(path) && denied.has(path))).toEqual([]);
    expect(parse().permissions.deny).toEqual([...DEVELOPMENT_DENIED_PATHS.map(editRule), ...COMMAND_CENTER_WRITE_TOOLS]);
  });

  it('C-08-10 the profile denies the files rule 1 names: connectors.lock and the enforcement files', () => {
    for (const path of ['connectors.lock', '.claude/', '.codex/', '.github/', 'AGENTS.md', 'CLAUDE.md']) {
      expect(parse().permissions.deny).toContain(editRule(path));
    }
  });

  it('C-08-10 dropping a denied path, widening the allow list or denying a rule 1 path fails the check', () => {
    const dropped = parse();
    dropped.permissions.deny = dropped.permissions.deny.filter((d) => d !== 'Edit(./AGENTS.md)');
    expect(checkDevelopmentSettings(JSON.stringify(dropped)).join('\n')).toContain('missing Edit(./AGENTS.md)');

    const widened = parse();
    widened.permissions.allow.push('Edit(./tools/**)');
    expect(checkDevelopmentSettings(JSON.stringify(widened)).join('\n')).toContain('remove Edit(./tools/**)');

    for (const rule of ['Edit', 'Edit(./theme/tokens.json)', 'Write(./ui/**)', 'Edit(**/*.ts)']) {
      const blocking = parse();
      blocking.permissions.deny.push(rule);
      expect(checkDevelopmentSettings(JSON.stringify(blocking)).join('\n')).toContain('must not stop edits');
    }
  });

  it('C-08-10 a malformed development file or bypass mode left enabled fails the check (F3)', () => {
    expect(checkDevelopmentSettings(development().replace(/\]\s*\}\s*\}\s*$/, '],}}'))[0]).toContain('is not valid JSON');
    const bypass = parse();
    delete bypass.permissions['disableBypassPermissionsMode'];
    expect(checkDevelopmentSettings(JSON.stringify(bypass)).join('\n')).toContain('disableBypassPermissionsMode');
  });

  it('C-08-10 a Codex development profile that is read-only or missing fails the check', () => {
    expect(checkCodexDevelopmentProfile('[profiles.development]\nsandbox_mode = "read-only"\napproval_policy = "never"\n')).toHaveLength(1);
    expect(checkCodexDevelopmentProfile('sandbox_mode = "workspace-write"\napproval_policy = "never"\n')).toHaveLength(2);
    expect(checkCodexDevelopmentProfile('[profiles.other]\nsandbox_mode = "workspace-write"\napproval_policy = "never"\n')).toHaveLength(2);
  });

  it('C-08-10 the development profile leaves the default profile of the Codex config read-only', () => {
    expect(checkCodexConfig(readFileSync(join(ROOT, codexFile), 'utf8'))).toEqual([]);
  });
});
