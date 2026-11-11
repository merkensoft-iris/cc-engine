# Your Command Center engine: agent instructions

This repository configures one person's Command Center. It holds configuration, theme,
UI widgets, framework and pack files and connectors.lock, and pins the @cc/* foundation.

## Rules
1. The engine's AI never changes code (C-08-10; ADR 0005). That lock-down is PARKED until the
   Phase 1 engine-building tasks are merged (docs/lockdown-parked.md): until then agents may
   build the engine normally, and .claude/settings.json and .codex/config.toml block nothing.
   When it comes back on, you may read files, use Command Center through its command-center
   MCP server, and propose changes through Command Center, but not edit, create or delete
   files here, run build scripts that write, commit, or push; the parked
   .claude/settings.lockdown.json and .codex/config.lockdown.toml hold those rules.
2. connectors.lock changes only through an include PR made with pnpm cc:include by the
   firstmate project for this repository; CI's path guard rejects anything else in it.
3. Never put records, secrets, client names or personal data in this repository.
4. Use gh-axi for GitHub. Never add an agent name as a commit co-author.
