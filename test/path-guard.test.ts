import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { evaluate } from '../tools/path-guard.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = join(ROOT, 'tools', 'path-guard.ts');
const FIXTURE_ENGINE = join(ROOT, 'fixtures', 'engine');

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1',
};

function git(repo: string, ...args: string[]): string {
  const r = spawnSync('git', ['-C', repo, '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], {
    encoding: 'utf8',
    env: GIT_ENV,
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

/** A temporary git repository holding the fixture engine on `main`, checked out on a PR branch. */
function fixtureEngineRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'cc-pg-'));
  dirs.push(repo);
  cpSync(FIXTURE_ENGINE, repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'fixture engine');
  git(repo, 'checkout', '-q', '-b', 'pr');
  return repo;
}

function change(repo: string, path: string, text: string): void {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
}

function commit(repo: string): void {
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'pr change');
}

function bumpLock(repo: string): void {
  change(
    repo,
    'connectors.lock',
    `${JSON.stringify(
      {
        lockVersion: 1,
        entries: [
          {
            id: 'demo-calendar',
            kind: 'connector',
            version: '1.1.0',
            source: {
              kind: 'repo',
              repo: 'example-owner/example-connectors',
              tag: 'demo-calendar-v1.1.0',
              url: 'https://example.invalid/demo-calendar-1.1.0.tgz',
            },
            sha256: '0'.repeat(63) + '3',
            permissionsDigest: '0'.repeat(63) + '2',
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

function runGuard(args: string[], env: NodeJS.ProcessEnv = {}): { status: number | null; out: string } {
  const r = spawnSync(process.execPath, [GUARD, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_EVENT_PATH: '', ...env },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('cc:path-guard against a fixture engine', () => {
  it('AC-08-09 a PR labelled connector-include that also changes ui/ fails cc:path-guard', () => {
    const repo = fixtureEngineRepo();
    bumpLock(repo);
    change(repo, 'ui/Status.tsx', 'export default null;\n');
    commit(repo);
    const r = runGuard(['--repo', repo, '--base', 'main', '--head', 'HEAD', '--label', 'connector-include']);
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain('G1: a PR labelled connector-include may change only connectors.lock');
    expect(r.out).toContain('ui/Status.tsx');
  });

  it('AC-08-09 a PR labelled connector-include that changes only connectors.lock passes cc:path-guard', () => {
    const repo = fixtureEngineRepo();
    bumpLock(repo);
    commit(repo);
    const r = runGuard(['--repo', repo, '--base', 'main', '--head', 'HEAD', '--label', 'connector-include']);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('cc:path-guard: ok  1 file(s) changed; labels: connector-include');
  });

  it('C-08-09 a PR without the connector-include label that changes connectors.lock fails (G2)', () => {
    const repo = fixtureEngineRepo();
    bumpLock(repo);
    change(repo, 'theme/tokens.json', '{}\n');
    commit(repo);
    const r = runGuard(['--repo', repo, '--base', 'main', '--head', 'HEAD']);
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain('G2: connectors.lock changes only through an include PR');
  });

  it('C-08-09 a PR without the label that leaves connectors.lock alone passes', () => {
    const repo = fixtureEngineRepo();
    change(repo, 'ui/Status.tsx', 'export default null;\n');
    change(repo, 'theme/tokens.json', '{}\n');
    commit(repo);
    expect(runGuard(['--repo', repo, '--base', 'main', '--head', 'HEAD']).status).toBe(0);
  });

  it('C-08-09 moving connectors.lock away is a change to it, so the label is still required', () => {
    const repo = fixtureEngineRepo();
    git(repo, 'mv', 'connectors.lock', 'connectors.lock.old');
    commit(repo);
    const r = runGuard(['--repo', repo, '--base', 'main', '--head', 'HEAD']);
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain('G2');
  });

  it('C-08-09 creating connectors.lock with no entries, where none existed, needs no label', () => {
    const repo = fixtureEngineRepo();
    git(repo, 'checkout', '-q', 'main');
    git(repo, 'rm', '-q', 'connectors.lock');
    git(repo, 'commit', '-q', '-m', 'engine without a lock');
    git(repo, 'checkout', '-q', '-B', 'pr');
    change(repo, 'connectors.lock', '{\n  "lockVersion": 1,\n  "entries": []\n}\n');
    change(repo, 'ui/Status.tsx', 'export default null;\n');
    commit(repo);
    expect(runGuard(['--repo', repo, '--base', 'main', '--head', 'HEAD']).status).toBe(0);
  });

  it('C-08-09 creating connectors.lock with an entry, where none existed, still needs an include PR', () => {
    const repo = fixtureEngineRepo();
    git(repo, 'checkout', '-q', 'main');
    git(repo, 'rm', '-q', 'connectors.lock');
    git(repo, 'commit', '-q', '-m', 'engine without a lock');
    git(repo, 'checkout', '-q', '-B', 'pr');
    bumpLock(repo);
    commit(repo);
    const r = runGuard(['--repo', repo, '--base', 'main', '--head', 'HEAD']);
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain('G2');
  });

  it('C-08-09 emptying an existing connectors.lock still needs an include PR', () => {
    const repo = fixtureEngineRepo();
    change(repo, 'connectors.lock', '{\n  "lockVersion": 1,\n  "entries": []\n}\n');
    commit(repo);
    expect(runGuard(['--repo', repo, '--base', 'main', '--head', 'HEAD']).status).toBe(1);
  });

  it('C-08-10 a bot-authored PR that changes .claude/settings.json fails (G3, ADR 0005 §7.3 item 3)', () => {
    const repo = fixtureEngineRepo();
    change(repo, '.claude/settings.json', '{"permissions":{"deny":[]}}\n');
    change(repo, 'package.json', '{}\n');
    commit(repo);
    const r = runGuard(['--repo', repo, '--base', 'main', '--head', 'HEAD', '--bot']);
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain("G3: an automated PR may not change the engine's AI enforcement files");
    expect(r.out).toContain('.claude/settings.json');
    expect(r.out).not.toContain('  package.json');
  });

  it('C-08-09 reads the labels, author and commits from the GitHub pull_request event', () => {
    const repo = fixtureEngineRepo();
    const base = git(repo, 'rev-parse', 'main');
    bumpLock(repo);
    change(repo, 'ui/Extra.tsx', 'export default null;\n');
    commit(repo);
    const head = git(repo, 'rev-parse', 'HEAD');
    const eventPath = join(repo, '..', `${repo.split(/[\\/]/).pop()}-event.json`);
    dirs.push(eventPath);
    writeFileSync(
      eventPath,
      JSON.stringify({
        pull_request: {
          labels: [{ name: 'connector-include' }],
          user: { type: 'User' },
          base: { sha: base },
          head: { sha: head },
        },
      }),
    );
    const r = runGuard(['--repo', repo], { GITHUB_EVENT_PATH: eventPath });
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain('ui/Extra.tsx');
  });

  it('C-08-09 outside a pull request there is nothing to guard', () => {
    const r = runGuard([]);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('not a pull request');
  });

  it('C-08-09 an unknown flag is a usage error (exit 2)', () => {
    expect(runGuard(['--nope']).status).toBe(2);
  });
});

describe('path-guard rules', () => {
  it('C-08-09 an include PR may change nothing but connectors.lock, wherever the other file is', () => {
    for (const other of ['ui/a.tsx', 'package.json', 'pnpm-lock.yaml', 'cc.config.ts', 'connectors.lock.bak']) {
      const v = evaluate({ changed: ['connectors.lock', other], labels: ['connector-include'], authorIsBot: false });
      expect(v.map((x) => x.rule)).toContain('G1');
    }
  });

  it('C-08-10 every enforcement path is guarded against automated PRs', () => {
    for (const path of ['.claude/settings.json', '.codex/config.toml', '.github/workflows/ci.yml', '.github/CODEOWNERS', 'AGENTS.md', 'CLAUDE.md']) {
      const v = evaluate({ changed: [path], labels: [], authorIsBot: true });
      expect(v.map((x) => x.rule), path).toEqual(['G3']);
    }
    expect(evaluate({ changed: ['package.json', 'pnpm-lock.yaml'], labels: [], authorIsBot: true })).toEqual([]);
    expect(evaluate({ changed: ['.claude/settings.json'], labels: [], authorIsBot: false })).toEqual([]);
  });
});
