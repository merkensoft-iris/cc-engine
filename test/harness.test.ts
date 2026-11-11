import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkClaudeSettings, checkCodexConfig, main, REQUIRED_DENY } from '../tools/harness-check.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const shipped = () => readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8');

describe('harness deny rules (C-08-10 layer 5, ADR 0005)', () => {
  it('C-08-10 the shipped .claude/settings.json and .codex/config.toml pass cc:harness-check', () => {
    expect(checkClaudeSettings(shipped())).toEqual([]);
    expect(checkCodexConfig(readFileSync(join(ROOT, '.codex', 'config.toml'), 'utf8'))).toEqual([]);
    expect(main(['--repo', ROOT])).toBe(0);
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
