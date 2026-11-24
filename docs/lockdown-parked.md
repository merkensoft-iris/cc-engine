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
| Codex development profile (ADR 0008) | none | `[profiles.development]` in `.codex/config.lockdown.toml` |

The parked copies are the decided files; the Codex one has since gained the development
profile below, and its default profile is unchanged. Claude Code reads only `settings.json` and
`settings.local.json` from `.claude/`, and Codex only `config.toml` from `.codex/`, so the parked
copies have no effect while they keep the rules recoverable.

## The development profile (ADR 0008 decision 2)

ADR 0008 (in `merkensoft-iris/cc-foundation`, 21 Nov 2026) amends ADR 0005 decision A: the deny
rules above stay as they are for Command Center's own AI, and they are the default for any
session in the checkout. Development agents working for the user may change `ui/`, `theme/`,
`cc.config.ts`, `frameworks/` and `packs/` through pull requests the user reviews (`AGENTS.md`
rule 1). They run under a development profile:

- **Claude Code:** `.claude/settings.development.json`, loaded by name and without the project
  settings: `claude --setting-sources user,local --settings .claude/settings.development.json`,
  started in the repository root. It allows edits to the five rule 1 paths, denies edits to
  every other top-level path of the repository (`connectors.lock` and the enforcement files
  included) and the command-center write tools, and disables bypass mode. Claude Code never
  loads this file by itself, so it is not parked: it applies when an agent is launched with it.
- **Codex:** `codex --profile development` selects `[profiles.development]`, a workspace-write
  sandbox. Codex cannot limit writes to the rule 1 paths.
- **What it does not stop:** the shell. A development agent keeps `Bash` (it runs `pnpm`, `git`
  and `gh-axi`), and a shell command is not bound by the `Edit` rules. The limit to the rule 1
  paths is therefore the user's review of the pull request; the profile keeps the file tools
  inside it, and `cc:path-guard`'s G3 still keeps automated PRs off the enforcement files.

`pnpm cc:harness-check` checks both profiles (`DEVELOPMENT_PATHS` and `DEVELOPMENT_DENIED_PATHS`
in `tools/harness-check.ts`), `test/harness.test.ts` fails when a new top-level path is neither
allowed nor denied, and the `harness (claude doctor)` CI job runs `claude doctor` on the
development file. The engine's development skill is `.agents/skills/cc-engine-ui/SKILL.md`,
copied from cc-foundation's `templates/engine-skills/`.

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
4. Drop the PARKED sentence from `AGENTS.md` rule 1 (the rest of the rule is the text agreed
   in ADR 0008), restore the lock-down wording in `README.md` and
   `docs/repository-settings.md`, move the development profile section of this page into
   `docs/repository-settings.md`, and delete this page.
5. Re-check `REQUIRED_DENY` against the tool inventory of the pinned Claude Code version, and
   on that version confirm that the development profile holds: an agent launched as above can
   edit `ui/` and cannot edit `AGENTS.md` or `tools/`, while a session started without it
   still has no `Edit` or `Bash`.

## The plan after re-enabling

Recorded here; nothing of it is built yet.

1. **A testing agent works under the rules.** One agent runs in the engine with the lock-down
   in force, uses the engine as its user's AI would, and files what it finds as GitHub issues
   with the Issues-only token (layer 2: Issues read and write, no Contents).
2. **A fixing agent, for firstmate, works under the development profile.** A second agent,
   acting for firstmate, fixes those issues. When the fix is in `ui/`, `theme/`, `cc.config.ts`,
   `frameworks/` or `packs/`, it runs under the development profile above. A fix anywhere else
   (the template's tools, CI or the enforcement files) is template maintenance, not engine
   development: the agent is launched without the engine's project settings (for example
   `claude --setting-sources user,local`), which is the exception and applies to that agent and
   those fixes only. Either way its changes reach `main` through pull requests and CI like any
   other.

## ADR 0005 follow-up note

ADR 0005 (in `merkensoft-iris/cc-foundation`) decided the layer-5 deny rules (decision A of
10 Nov 2026). It is accepted and stays as written; this note records what happened after it.
On 11 Nov 2026 the owner parked the enforcement of decision A in this engine repository until
the Phase 1 engine-building tasks are merged. The decided rules are unchanged and kept in the
parked files above, and CI keeps checking them; they come back on by the steps above, followed
by the testing and fixing agents described in the plan. `cc-foundation` needs its own follow-up
note on ADR 0005 to record the same; this repository does not change it.

ADR 0008 (21 Nov 2026) amended decision A: it now applies to Command Center's own AI, and
development agents change the engine's UI and configuration under the development profile
described above. ADR 0005 carries a status note pointing to ADR 0008.
