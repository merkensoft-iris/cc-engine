# The AI lock-down is parked

**Status: parked since 11 Nov 2026, by the owner's decision.** The harness deny rules that
stop the engine's AI from changing code (C-08-10 layer 5; ADR 0005 decision A, added by P1-18)
are switched off until most of the engine is built. Agents may build the engine normally: edit
files, run the shell and the build scripts, commit and open pull requests.

## What is parked, and where it is kept

| Rule | Live file (loaded by the harness) | Parked copy (loaded by nothing) |
|---|---|---|
| Claude Code deny list, bypass mode disabled | `.claude/settings.json` is `{}` | `.claude/settings.lockdown.json` |
| Codex read-only sandbox, approvals never | `.codex/config.toml` is comments only | `.codex/config.lockdown.toml` |

The parked copies are the decided files, unchanged. Claude Code reads only `settings.json` and
`settings.local.json` from `.claude/`, and Codex only `config.toml` from `.codex/`, so the parked
copies have no effect while they keep the rules recoverable.

## What still runs

Every check that does not depend on the lock-down runs as before: typecheck, `cc:validate`,
`cc:schemas --check`, `cc:path-guard` and its AC-08-09 tests (including G3, which still keeps
automated PRs away from `.claude/`, `.codex/`, `.github/`, `AGENTS.md` and `CLAUDE.md`),
`cc:lock-verify` and the test suite. The lock-down checks keep running against the parked
copies, so the rules stay correct while they are not enforced:

- `pnpm cc:harness-check` checks the parked files (`LOCKDOWN_PARKED` in
  `tools/harness-check.ts`) and says `PARKED (not enforced)` when they pass.
- `test/harness.test.ts` checks the parked files, and that the live files block nothing.
- The `harness (claude doctor)` CI job runs `claude doctor` on the checkout and on a scratch
  repository holding the parked deny list as its `.claude/settings.json`, and its canary
  malforms the parked file. The job name, a required check, is unchanged.
- The opt-in `harness (effect probe)` job installs the parked deny list in its clone before
  probing.

The other layers of C-08-10 (08 §5.2) are not touched: CODEOWNERS, branch protection and the
path guard (layer 3) and Command Center's Issues-only token (layer 2) stay as they are. No
repository or organisation setting was changed to park the lock-down.

## When it comes back on

When the Phase 1 engine-building tasks are merged. Re-enabling is a small change, or a revert
of the PR that parked it:

1. Move `.claude/settings.lockdown.json` over `.claude/settings.json`, and
   `.codex/config.lockdown.toml` over `.codex/config.toml`.
2. Set `LOCKDOWN_PARKED` to `false` in `tools/harness-check.ts`.
3. Set `CC_HARNESS_SETTINGS` to `.claude/settings.json` in both harness jobs of
   `.github/workflows/ci.yml`, and drop the doctor step that checks the scratch repository.
4. Restore the lock-down wording in `AGENTS.md`, `README.md` and
   `docs/repository-settings.md`, and delete this page.
5. Re-check `REQUIRED_DENY` against the tool inventory of the pinned Claude Code version.

## The plan after re-enabling

Recorded here; nothing of it is built yet.

1. **A testing agent works under the rules.** One agent runs in the engine with the lock-down
   in force, uses the engine as its user's AI would, and files what it finds as GitHub issues
   with the Issues-only token (layer 2: Issues read and write, no Contents).
2. **A fixing agent, for firstmate, works under a narrow exception.** A second agent, acting for
   firstmate, fixes those issues. It is launched without the engine's project settings (for
   example `claude --setting-sources user,local`), which is the exception: it applies to that
   agent and those fixes only, and its changes reach `main` through pull requests and CI like
   any other.

## ADR 0005 follow-up note

ADR 0005 (in `merkensoft-iris/cc-foundation`) decided the layer-5 deny rules (decision A of
10 Nov 2026). It is accepted and stays as written; this note records what happened after it.
On 11 Nov 2026 the owner parked the enforcement of decision A in this engine repository until
the Phase 1 engine-building tasks are merged. The decided rules are unchanged and kept in the
parked files above, and CI keeps checking them; they come back on by the steps above, followed
by the testing and fixing agents described in the plan. `cc-foundation` needs its own follow-up
note on ADR 0005 to record the same; this repository does not change it.
