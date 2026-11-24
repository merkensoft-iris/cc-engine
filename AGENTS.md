# Your Command Center engine: agent instructions

This repository configures one person's Command Center. It holds configuration, theme,
the app UI, framework and pack files and connectors.lock, and pins the @cc/* foundation.

## Rules
1. Command Center's own AI never changes code: it has no file or shell tools and its GitHub
   token has no Contents access (C-08-10). Development agents working for the user may change
   ui/, theme/, cc.config.ts, frameworks/ and packs/ through pull requests the user reviews.
   They never touch connectors.lock (rule 2), .claude/, .codex/, .github/, AGENTS.md or
   CLAUDE.md, and never write UI code that tries to complete a safety-critical operation
   without the user: those are confirmed by the app shell, not by your screens (04 §4.3).
   The harness lock-down is PARKED until the Phase 1 engine-building tasks are merged
   (docs/lockdown-parked.md): until then agents building the engine itself may change any
   file through reviewed PRs, and .claude/settings.json and .codex/config.toml block nothing.
2. connectors.lock changes only through an include PR made with pnpm cc:include by the
   firstmate project for this repository; CI's path guard rejects anything else in it.
3. Never put records, secrets, client names or personal data in this repository.
4. Use gh-axi for GitHub. Never add an agent name as a commit co-author.
