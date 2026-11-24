# cc-engine

The Command Center engine template: the repository a user copies ("Use this template", not a
fork) to set up their own Command Center, *your-engine*. It holds no foundation backend code -
only pinned `@cc/*` dependencies and the user's own customisation (configuration, theme, the
app UI, frameworks and packs, `connectors.lock`) - and its `AGENTS.md`
forbids Command Center's own AI from changing code and lets development agents change only the
UI, theme and configuration, through pull requests the user reviews. The design lives in
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
| `upgrade` | `pnpm cc:upgrade`, `pnpm cc:eject`, `pnpm cc:ui-update` | the first `cc:release`, pinned here | off |
| `start` | `pnpm start` | the desktop shell (P1-10) in a pinned release | off |
| `include` | `pnpm cc:include` | the lock loader (P5) | off |

While a flag is off its scripts exit 1 with the step that brings it, except the install stamp,
which never fails an install.

## Customise

| File | What it sets | Spec |
|---|---|---|
| `cc.config.ts` | modules on or off, vocabulary, default framework parameters, the calendar mapping, the UI libraries | 08 §4.3, 02 §9.6 |
| `theme/tokens.json` | colours, fonts, radius and density, for every screen and the app shell's confirm window | 08 §4.3 |
| `ui/` | the app UI: `ui/app.ts`, the composition root over the default UI `@cc/ui/v1`, with `ui/styles/`, `ui/screens/` and the UI tests in `ui/test/` | [Build your own UI or theme](#build-your-own-ui-or-theme), `ui/README.md`, rule D3, ADR 0008 |
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

## Build your own UI or theme

The app UI belongs to this repository: `ui/app.ts` is the composition root that decides what
runs (ADR 0008 decision 1). As the template ships it, it runs the foundation's default UI,
`@cc/ui/v1`, as it is, with the stylesheet in `ui/styles/` after the default one. Take the
smallest step that does what you want. Each step down the list makes more of the UI your own
code, which you then keep up with foundation changes yourself.

1. **Theme.** Set colours, fonts, radius and density in `theme/tokens.json`. Every screen
   follows, and so does the confirm window the app shell draws.
2. **Restyle.** Add rules to `ui/styles/app.css`. Read the tokens as custom properties, such as
   `var(--cc-color-accent)`. The default UI's markup can change in a foundation release without
   an extension API bump, so look at the app after each foundation update.
3. **Compose.** Replace a screen by naming it in `ui/app.ts`; every screen you do not name stays
   the default one and keeps updating with `@cc/ui`:

   ```ts
   import { exampleHome } from './screens/example-home.js';

   void createApp({ screens: { home: exampleHome } }).start();
   ```

   A screen is a `Screen` that loads its state through `ui.call` and renders `h` trees. The
   example, `ui/screens/example-home.ts`, wraps the default Home with a banner of its own, so
   Home's content still comes from `@cc/ui`.
4. **Replace.** Write a screen of your own in `ui/screens/`, with `h` or with a UI library you
   name in `cc.config.ts` `ui.libraries` (rule D3 refuses any other import). Or drop `createApp`
   and build the whole UI on `@cc/ui-sdk/v1` alone; you then own the navigation, the errors and
   every flow.
5. **Eject.** To change a default screen's own code instead of wrapping it, run
   `pnpm cc:eject <screen>`. It copies the screen from the installed `@cc/ui` into `ui/screens/`
   and records its upstream version and hash in `ui/.cc-ui.json`, with the upstream text in
   `ui/.cc-ui/base/`. Commit them with the screen, never edit them by hand, and name the copy in
   `ui/app.ts`.
6. **Check upstream changes.** On each foundation dependency PR, `pnpm cc:upgrade --check`
   lists what changed upstream in your ejected screens since you took them, and whether merging
   will need you; CI comments its output on the PR. Run `pnpm cc:ui-update [<screen>...]` on
   your machine to merge those changes, 3-way. A conflict is left with git's markers for you to
   resolve, and `cc:upgrade` reports it until you do.

Whatever a screen draws, the safety-critical operations (granting high-risk agent scopes,
removing an agent's access, restoring a backup and the others of 04 §4.3 rule 4) are confirmed
in the app shell's own window, and the backup password and folders are asked for there too: a
screen explains and asks, and never approves. The window has no network, so the UI cannot
fetch, load remote fonts or images, or widen its content security policy.

**Test it.** The UI tests in `ui/test/` run the app headless on what `@cc/ui/v1` publishes for
it: the app frame `App` on a fake local API, and the queries that read its view trees (`byTest`,
`textOf`). `ui/test/harness.ts` sets it up, `ui/test/app.test.ts` checks that `ui/app.ts` runs
the default UI (AC-08-11), and `ui/test/example-home.test.ts` checks the example. `pnpm test`
runs them once the foundation is pinned (build flag `build`, `vitest.config.ts`); until then
`pnpm typecheck` checks them against the interim contract in `extension-api/`. `pnpm cc:eject`,
`pnpm cc:ui-update` and `pnpm cc:upgrade` come from `@cc/build`, so they wait for build flag
`upgrade`.

A development agent that changes the UI or the theme follows the `cc-engine-ui` skill in
`.agents/skills/`, which walks the same steps.

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
   When the comment listed upstream changes to screens you ejected, run `pnpm cc:ui-update`
   too ([Build your own UI or theme](#build-your-own-ui-or-theme), step 6).
3. Command Center sees that the running build is older than the checkout and offers
   **Rebuild now**: it backs up, builds the clean checkout outside it, and restarts on the new
   build when idle (04 §10 rule 2). You can also choose **Later**, or run `pnpm build` yourself.

## Scripts

| Script | What it does |
|---|---|
| `pnpm build` | Builds the app with `@cc/build` (`cc-build`): validates the extension points, type-checks, builds from git's view of the tree and writes the build stamp (ADR 0003 decisions 3 and 7, ADR 0004 decisions 1 and 4). Build flag `build` |
| `pnpm start` | Starts the built app (`cc-start`). Build flag `start` |
| `pnpm cc:upgrade [--to <version>] [--check]` | Runs the foundation's codemods between the pinned and the target extension API, then type-checks; `--check` writes nothing, lists the planned edits and the upstream changes to ejected screens, and exits 1 when either is due (`cc-upgrade`, ADR 0003 decision 6). Build flag `upgrade` |
| `pnpm cc:eject <screen>` | Copies one default screen of the installed `@cc/ui` into `ui/screens/` and records it in `ui/.cc-ui.json` (`cc-eject`, ADR 0008 decision 1). Build flag `upgrade` |
| `pnpm cc:ui-update [<screen>...]` | Merges upstream changes into the ejected screens, 3-way; exits 1 when a conflict is left for you (`cc-ui-update`). Build flag `upgrade` |
| `pnpm cc:include <id>@<version>` | Adds or updates one `connectors.lock` entry, for an include PR (`cc-include`). Build flag `include` |
| `pnpm cc:flags` | Prints the build flags as `name=on\|off` |
| `pnpm cc:validate` | Validates `cc.config.ts`, `theme/tokens.json`, `connectors.lock` and rule D3 for `ui/` |
| `pnpm cc:path-guard` | In CI: an include PR may change only `connectors.lock`; automated PRs may not touch the AI enforcement files |
| `pnpm cc:harness-check` | Checks the Claude Code and Codex harness files deny exactly what ADR 0005 requires (while the lock-down is parked, the parked `.claude/settings.lockdown.json` and `.codex/config.lockdown.toml`), and that the development profile allows edits to the `AGENTS.md` rule 1 paths and nowhere else (ADR 0008) |
| `pnpm cc:lock-verify` | Checks every `connectors.lock` pin against its release |
| `pnpm cc:schemas [--check]` | Regenerates the JSON Schemas in `extension-api/v1/` |
| `postinstall` | Writes the install stamp after every `pnpm install` (`cc-install-stamp`, ADR 0004 decision 2). Build flag `build` |
| `pnpm test`, `pnpm typecheck` | Tests (named after the acceptance IDs they prove), with the UI tests in `ui/test/` once the foundation is pinned, and type-check |

The scripts of `@cc/build` (`cc-*`) are reached through `tools/cc.ts` until the foundation is
pinned and the interim scripts are gone (extension-api/README.md). Exit codes: 0 pass,
1 failure, 2 usage error (08 §6).

## AI agents in this repository

**Parked:** until the Phase 1 engine-building tasks are merged, the lock-down below is switched
off so agents can build the engine: `.claude/settings.json` and `.codex/config.toml` block
nothing, and the decided rules wait, still checked by CI, in `.claude/settings.lockdown.json`
and `.codex/config.lockdown.toml`. See [docs/lockdown-parked.md](docs/lockdown-parked.md) for
what still runs, how it comes back on, and the plan after that.

Once re-enabled, Command Center's own AI, and any session started here without a profile,
reads, and proposes changes through Command Center; it does not edit files, run a shell, commit
or push. `.claude/settings.json` removes those tools from Claude Code (verified on Claude Code
2.1.278) and `.codex/config.toml` asks Codex for a read-only sandbox (not yet verified); see
`AGENTS.md` and [docs/repository-settings.md](docs/repository-settings.md).

Development agents working for the user change `ui/`, `theme/`, `cc.config.ts`, `frameworks/`
and `packs/` through pull requests the user reviews (`AGENTS.md` rule 1, ADR 0008). They run
under the development profile, `claude --setting-sources user,local --settings
.claude/settings.development.json` or `codex --profile development`, and follow the skill in
`.agents/skills/cc-engine-ui/`; see [docs/lockdown-parked.md](docs/lockdown-parked.md) for what
the profile allows and what it cannot stop. On a foundation dependency PR, CI comments the
codemod edits and the UI drift: upstream changes to the screens the engine ejected.

A person who needs a shell here starts their tool without the project settings, for example
`claude --setting-sources user` - which is exactly why the harness is the fifth layer and not
the only one.
