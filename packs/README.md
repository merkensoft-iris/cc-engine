# packs/: custom packs

Custom packs for this Command Center (01 §9, level 3 and 6), as `packs/<id>/<version>.yaml`.
The foundation's validators run on every file here at build and at start (C-01-03), through
`pnpm build` once `@cc/build` is pinned and its build flag is on (README, "Build flags").
