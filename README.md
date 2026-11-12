# cc-engine

The Command Center engine template: the repository a user copies ("Use this template", not a
fork) to set up their own Command Center, *your-engine*. It holds no foundation code - only
pinned `@cc/*` dependencies and the user's business customisation (configuration, theme, UI
widgets in declared slots, frameworks and packs, `connectors.lock`) - and its `AGENTS.md`
forbids the engine's own AI from changing code. The design lives in
[cc-foundation/docs/design](https://github.com/merkensoft-iris/cc-foundation/tree/main/docs/design),
chiefly 08 §4 (layout and extension points), §5.2 (AI enforcement) and §9 (CI).

> **Status: engine template (build step P1-16), before the first foundation release.** The
> extension points, their validation, CI, the AI enforcement and the scripts are here; the AI
> lock-down is parked until the Phase 1 engine-building tasks are merged
> ([docs/lockdown-parked.md](docs/lockdown-parked.md)). `pnpm build`, `pnpm start` and
> `pnpm cc:upgrade` run `@cc/build`, which is not published yet, so they sit behind
> [build flags](#build-flags) that are off: until the first `@cc/*` release is pinned they say
> so and exit 1, and `extension-api/` carries an interim copy of the contract (see its README).

## Set up your own: clone, install, run

1. On GitHub, **Use this template** → a **private** repository: your *your-engine*.
2. Replace the handle in `.github/CODEOWNERS` with yours.
3. Apply the repository settings in [docs/repository-settings.md](docs/repository-settings.md):
   branch protection, labels, workflow token, and Command Center's GitHub token. Turn on the
   dependency-PR bot (Renovate) for the repository; `.github/renovate.json` configures it.
4. Install Node and pnpm at the versions in `.node-version` and `packageManager` in
   `package.json` (with Node's Corepack: `corepack enable`). Other pnpm versions can rewrite
   tracked files on install, and the app then starts in developer mode (ADR 0004).
5. Clone and install, on macOS or Windows:

   ```bash
   git clone <your-engine URL>
   cd <your-engine>
   pnpm install --frozen-lockfile
   ```

   The install's `postinstall` writes the install stamp the app checks at start (ADR 0004).
6. Build and start:

   ```bash
   pnpm build
   pnpm start
   ```

   `pnpm build` builds the app for this OS from git's view of the checkout: ignored files never
   reach a build. On first start the app asks the onboarding questions.

Start from a clean checkout: Command Center starts normally only when the running build was
made from a clean tree whose lockfiles match the install, and the checkout is still clean. An
uncommitted change starts it in labelled developer mode (04 §10 rule 4, ADR 0004).

## Build flags

Features that are not built yet stay off and are never half-wired (09 §2 rule 1). Each flag in
`tools/build-flags.ts` gates scripts; `pnpm cc:flags` prints them, and CI skips the steps of the
ones that are off. A flag is turned on, in a reviewed PR, when the foundation release that ships
its feature is pinned.

| Flag | Scripts | Turns on with | Now |
|---|---|---|---|
| `build` | `pnpm build`, the install stamp in `postinstall` | the first `cc:release` of the `@cc/*` packages, pinned here | off |
| `upgrade` | `pnpm cc:upgrade` | the first `cc:release`, pinned here | off |
| `start` | `pnpm start` | the desktop shell (P1-10) in a pinned release | off |
| `include` | `pnpm cc:include` | the lock loader (P5) | off |

While a flag is off its scripts exit 1 with the step that brings it, except the install stamp,
which never fails an install.

## Customise

| File | What it sets | Spec |
|---|---|---|
| `cc.config.ts` | modules on or off, vocabulary, default framework parameters, the calendar mapping | 08 §4.3, 02 §9.6 |
| `theme/tokens.json` | colours, fonts, radius and density; the layout is fixed | 08 §4.3, owner decision Q9 |
| `ui/` | widgets in the slots the foundation declares | `ui/README.md`, rule D3 |
| `frameworks/`, `packs/` | `custom:` framework templates and packs | 01 §9 |
| `connectors.lock` | the connector and adapter packages this Command Center may load | 05 §15.6 |
| `profile.json` | optional: exported, non-sensitive onboarding answers | 01 §9.1 |

Check your changes with `pnpm cc:validate` and `pnpm typecheck`; CI runs both. Never commit
records, secrets, account names, client names or personal data: this repository holds
configuration only.

`connectors.lock` changes only through an **include PR**: firstmate runs `pnpm cc:include`
(P5) and opens a PR labelled `connector-include` that changes nothing else. CI's
`cc:path-guard` fails any other change to it, and any include PR that touches another file
(C-08-09, AC-08-09).

## Update

The foundation arrives as one dependency PR per release, updating every `@cc/*` pin together
(`.github/renovate.json`). CI runs `pnpm cc:upgrade --check` on it and comments the codemod
edits the next extension API will need; the PR merges as it is (owner decision D-1). Then, on
your machine:

1. Pull it yourself: `git pull --ff-only`, then `pnpm install --frozen-lockfile`. Command
   Center never pulls and never writes this checkout (owner decision C1).
2. When the comment listed edits, run `pnpm cc:upgrade` when convenient, before the next
   foundation major. It applies the codemods and type-checks; commit its edits and merge them
   through a PR like any change. A site it cannot rewrite is marked `cc:upgrade TODO` for you.
3. Command Center sees that the running build is older than the checkout and offers
   **Rebuild now**: it backs up, builds the clean checkout outside it, and restarts on the new
   build when idle (04 §10 rule 2). You can also choose **Later**, or run `pnpm build` yourself.

## Scripts

| Script | What it does |
|---|---|
| `pnpm build` | Builds the app with `@cc/build` (`cc-build`): validates the extension points, type-checks, builds from git's view of the tree and writes the build stamp (ADR 0003 decisions 3 and 7, ADR 0004 decisions 1 and 4). Build flag `build` |
| `pnpm start` | Starts the built app (`cc-start`). Build flag `start` |
| `pnpm cc:upgrade [--to <version>] [--check]` | Runs the foundation's codemods between the pinned and the target extension API, then type-checks; `--check` writes nothing and exits 1 when an upgrade is due (`cc-upgrade`, ADR 0003 decision 6). Build flag `upgrade` |
| `pnpm cc:include <id>@<version>` | Adds or updates one `connectors.lock` entry, for an include PR (`cc-include`). Build flag `include` |
| `pnpm cc:flags` | Prints the build flags as `name=on\|off` |
| `pnpm cc:validate` | Validates `cc.config.ts`, `theme/tokens.json`, `connectors.lock` and rule D3 for `ui/` |
| `pnpm cc:path-guard` | In CI: an include PR may change only `connectors.lock`; automated PRs may not touch the AI enforcement files |
| `pnpm cc:harness-check` | Checks the Claude Code and Codex harness files deny exactly what ADR 0005 requires; while the lock-down is parked, the parked `.claude/settings.lockdown.json` and `.codex/config.lockdown.toml` |
| `pnpm cc:lock-verify` | Checks every `connectors.lock` pin against its release |
| `pnpm cc:schemas [--check]` | Regenerates the JSON Schemas in `extension-api/v1/` |
| `postinstall` | Writes the install stamp after every `pnpm install` (`cc-install-stamp`, ADR 0004 decision 2). Build flag `build` |
| `pnpm test`, `pnpm typecheck` | Tests (named after the acceptance IDs they prove) and type-check |

The scripts of `@cc/build` (`cc-*`) are reached through `tools/cc.ts` until the foundation is
pinned and the interim scripts are gone (extension-api/README.md). Exit codes: 0 pass,
1 failure, 2 usage error (08 §6).

## AI agents in this repository

**Parked:** until the Phase 1 engine-building tasks are merged, the lock-down below is switched
off so agents can build the engine: `.claude/settings.json` and `.codex/config.toml` block
nothing, and the decided rules wait, still checked by CI, in `.claude/settings.lockdown.json`
and `.codex/config.lockdown.toml`. See [docs/lockdown-parked.md](docs/lockdown-parked.md) for
what still runs, how it comes back on, and the plan after that.

Once re-enabled, the engine's AI reads, and proposes changes through Command Center; it does not edit files,
run a shell, commit or push. `.claude/settings.json` removes those tools from Claude Code
(verified on Claude Code 2.1.278) and `.codex/config.toml` asks Codex for a read-only sandbox
(not yet verified); see `AGENTS.md` and [docs/repository-settings.md](docs/repository-settings.md).
A person who needs a shell here starts their tool without the project settings, for example
`claude --setting-sources user` - which is exactly why the harness is the fifth layer and not
the only one.
