# Your Command Center engine: agent instructions

This repository configures one person's Command Center. It holds configuration, theme,
UI widgets, framework and pack files and connectors.lock, and pins the @cc/* foundation.

## Rules
1. The engine's AI never changes code. You may read files, use Command Center through its
   command-center MCP server, and propose changes through Command Center. You do not edit,
   create or delete files here, run build scripts that write, commit, or push. This
   repository's .claude/settings.json removes the shell and the file-editing tools, and
   .codex/config.toml makes Codex read-only (C-08-10; ADR 0005).
2. connectors.lock changes only through an include PR made with pnpm cc:include by the
   firstmate project for this repository; CI's path guard rejects anything else in it.
3. Never put records, secrets, client names or personal data in this repository.
4. Use gh-axi for GitHub. Never add an agent name as a commit co-author.
