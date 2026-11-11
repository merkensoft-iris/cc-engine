# Repository settings: the engine's AI enforcement outside the files

The engine's AI never changes code (C-08-10). Five layers enforce it (08 §5.2); this
repository ships three as files (CODEOWNERS, `cc:path-guard` in CI, the harness deny rules)
and the rest live in GitHub settings, which no file can set. This page lists those settings
and the exact commands to apply them. Run them once on `cc-engine`, and again on each private
copy (*your-engine*) made from it with "Use this template".

| Layer (08 §5.2) | Where it lives | Applied by |
|---|---|---|
| 1 Capability: the in-app AI has no file or shell tools | Command Center's adapters (04 §6.3) | the foundation |
| 2 Credential: CC's GitHub token has Issues read and write, no Contents | a fine-grained token, below | the owner, in GitHub's UI |
| 3 Repository: `main` protected, the user is the CODEOWNER, the path guard | `.github/CODEOWNERS`, `.github/workflows/ci.yml`, branch protection below | files here; branch protection by the owner |
| 4 Runtime: CC starts only from a clean tree and never writes the checkout | the foundation (04 §10 rules 2 and 4) | the foundation |
| 5 Harness: deny rules for edits and shell | `.claude/settings.json`, `.codex/config.toml`; **parked** in `.claude/settings.lockdown.json`, `.codex/config.lockdown.toml` | files here; parked until the Phase 1 engine-building tasks are merged ([lockdown-parked.md](lockdown-parked.md)) |

## Commands

Run from a checkout of the repository, with `gh` signed in as an admin of it.

```bash
repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"

# 1. Branch protection on main (layer 3; 08 §9 rule 1): pull requests only, green CI
#    including cc:path-guard and the harness doctor check, admins included, no force pushes.
gh api --method PUT "repos/$repo/branches/main/protection" --input .github/settings/branch-protection.json

# 2. Labels: include PRs (C-08-09) and the ticket run's issues (06 §11.2 rule 3).
gh label create connector-include --repo "$repo" --color 0e8a16 \
  --description "Include PR: changes only connectors.lock (cc:path-guard, C-08-09)"
gh label create 'cc:request' --repo "$repo" --color 1d76db \
  --description "Connector request filed by Command Center's ticket run (06 §11.2)"

# 3. Workflow token: read-only by default, and workflows may not approve pull requests.
gh api --method PUT "repos/$repo/actions/permissions/workflow" \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false

# 4. Upstream cc-engine only: mark it as a template, so users copy it rather than fork it
#    (08 §1 item 2). Skip this on your-engine.
gh api --method PATCH "repos/$repo" -F is_template=true
```

Check the result with `gh api "repos/$repo/branches/main/protection"`.

### Required checks

The branch protection file requires these check names, which are the job names in
`.github/workflows/ci.yml`: `check (ubuntu-latest)`, `check (macos-latest)`,
`check (windows-latest)`, `cc:path-guard`, `harness (claude doctor)`. Renaming a job means
updating `.github/settings/branch-protection.json` and re-running command 1.

### Code-owner review

`.github/CODEOWNERS` names the user as owner of everything. The protection file requires a
pull request and green checks but no approving review, because GitHub does not let an
account approve its own pull request: if the agents that open PRs here (firstmate's include
PRs, Renovate) act through the owner's own account, a required review would block every
merge. When they act through a separate account or GitHub App, require the owner's review:

```bash
gh api --method PATCH "repos/$repo/branches/main/protection/required_pull_request_reviews" \
  -F required_approving_review_count=1 -F require_code_owner_reviews=true
```

## Command Center's GitHub token (layer 2)

The token CC uses for the ticket run (06 §11.2 rule 2) can file issues and cannot push. GitHub
creates fine-grained tokens only in its UI (or as a GitHub App installation), so this step has
no command:

1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.
2. Resource owner: the account or organisation that owns the engine repository.
3. Repository access: **Only select repositories** → this engine repository only.
4. Repository permissions: **Issues: Read and write**. Metadata: Read (GitHub sets it).
   Everything else, **Contents** included, stays **No access**.
5. Give the token to Command Center when it asks for the `github` binding of the ticket run; it
   is stored in the OS keychain, never in this repository (04 §9).

firstmate's include PRs need a different identity, with Contents and Pull requests write on
this repository; that identity is firstmate's, not Command Center's.

## The optional harness effect probe

The `harness (effect probe)` CI job (ADR 0005 §7.3 item 2) asks a model, with the shipped
settings in place, to write a file and run a command, and fails if anything changed. While
layer 5 is parked, it installs the parked `.claude/settings.lockdown.json` in its clone first. It calls
the Anthropic API, so it is off until the owner turns it on:

```bash
gh secret set ANTHROPIC_API_KEY --repo "$repo"        # paste the key when prompted
gh variable set CC_HARNESS_PROBE --repo "$repo" --body true
```

## What layer 5 does not stop

While layer 5 is parked ([lockdown-parked.md](lockdown-parked.md)) it stops nothing; what
follows describes it once it is back on.

The deny rules constrain a model inside a session that loaded `.claude/settings.json`. They do
not constrain whoever launches the CLI: `claude --setting-sources user` ignores the file (ADR
0005 F5), and a malformed file is silently ignored (F3, which the doctor check catches). The
tool inventory is Claude Code 2.1.278's; a new tool with a command or path parameter is a new
hole, so re-check `REQUIRED_DENY` in `tools/harness-check.ts` when raising the version in CI.
The Codex file is unverified until spike P0-09 reports. Layers 1 to 4 are the ones that hold
against a determined person.
