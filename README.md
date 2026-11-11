# cc-engine

The Command Center engine template: the repository a user copies ("Use this template", not a
fork) to set up their own Command Center, *your-engine*. It holds no foundation code - only
pinned `@cc/*` dependencies and the user's business customisation (configuration, theme, UI
widgets in declared slots, frameworks and packs, `connectors.lock`) - and its `AGENTS.md`
forbids the engine's own AI from changing code. The design lives in
[cc-foundation/docs/design](https://github.com/merkensoft-iris/cc-foundation/tree/main/docs/design),
chiefly 08 §4 (layout and extension points), §5.2 (AI enforcement) and §9 (CI).

> **Status: skeleton (build step P1-18).** The extension points, their validation, CI and the
> AI enforcement are here. Building and starting the app (`pnpm build`, `pnpm start`),
> `pnpm cc:upgrade` and the exact `@cc/*` pins arrive with P1-16, once the foundation packages
> are published; until then those scripts say so and exit 1, and `extension-api/` carries an
> interim copy of the contract (see its README).

## Set up your own

1. On GitHub, **Use this template** → a **private** repository: your *your-engine*.
2. Replace the handle in `.github/CODEOWNERS` with yours.
3. Apply the repository settings in [docs/repository-settings.md](docs/repository-settings.md):
   branch protection, labels, workflow token, and Command Center's GitHub token.
4. Clone it and install: `pnpm install` (Node and pnpm versions: `.node-version`,
   `packageManager` in `package.json`).
5. *(P1-16)* `pnpm build && pnpm start`. On first start the app asks the onboarding questions.

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
(`.github/renovate.json`). It merges as it is; you pull it, run `pnpm cc:upgrade` locally if the
extension API changed, and Command Center offers **Rebuild now** (owner decisions D-1 and C1).
Command Center itself never writes this checkout.

## Scripts

| Script | What it does |
|---|---|
| `pnpm cc:validate` | Validates `cc.config.ts`, `theme/tokens.json`, `connectors.lock` and rule D3 for `ui/` |
| `pnpm cc:path-guard` | In CI: an include PR may change only `connectors.lock`; automated PRs may not touch the AI enforcement files |
| `pnpm cc:harness-check` | Checks `.claude/settings.json` and `.codex/config.toml` deny exactly what ADR 0005 requires |
| `pnpm cc:lock-verify` | Checks every `connectors.lock` pin against its release |
| `pnpm cc:schemas [--check]` | Regenerates the JSON Schemas in `extension-api/v1/` |
| `pnpm test`, `pnpm typecheck` | Tests (named after the acceptance IDs they prove) and type-check |

Exit codes: 0 pass, 1 failure, 2 usage error (08 §6).

## AI agents in this repository

The engine's AI reads, and proposes changes through Command Center; it does not edit files,
run a shell, commit or push. `.claude/settings.json` removes those tools from Claude Code
(verified on Claude Code 2.1.278) and `.codex/config.toml` asks Codex for a read-only sandbox
(not yet verified); see `AGENTS.md` and [docs/repository-settings.md](docs/repository-settings.md).
A person who needs a shell here starts their tool without the project settings, for example
`claude --setting-sources user` - which is exactly why the harness is the fifth layer and not
the only one.
