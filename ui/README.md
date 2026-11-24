# ui/: the app UI

The engine owns the app UI (08 §4.3 item 3; ADR 0008 decision 1). `cc-build` bundles
`ui/app.ts`, the composition root, and everything it imports into the app: one script and one
stylesheet, which main serves in the page shell it keeps. As the template ships it, `ui/app.ts`
runs the foundation's default UI from `@cc/ui/v1` as it is:

```ts
// ui/app.ts
import '@cc/ui/v1/app.css';
import './styles/app.css';
import { createApp } from '@cc/ui/v1';

void createApp().start();
```

| Path | What it is |
|---|---|
| `app.ts` | The composition root: `createApp(overrides)`, where `overrides.screens` names the screens this engine replaces |
| `styles/app.css` | This engine's stylesheet, after the default one: restyling beyond the theme tokens |
| `screens/example-home.ts` | An example screen override, not used until `app.ts` names it: the default Home with a banner above it |
| `test/` | The UI tests, on the headless harness `@cc/ui/v1` publishes (`harness.ts`) |
| `css.d.ts` | Lets TypeScript accept the stylesheet imports |
| `.cc-ui.json`, `.cc-ui/base/` | Written by `pnpm cc:eject` and `pnpm cc:ui-update` once a screen is ejected; never edited by hand |

How to theme, restyle, compose, replace or eject screens, and keep ejected ones up to date:
README.md, "Build your own UI or theme".

Rule D3 (08 §4.2): a file here imports only other files of `ui/`, `@cc/ui-sdk/v1`, `@cc/ui/v1`
and `@cc/ui/v1/app.css`, and the UI libraries `cc.config.ts` names in `ui.libraries` (for
example `react`). No Node built-ins, no network, no other packages. `pnpm cc:validate` checks
every file here except the UI tests (`*.test.ts`), which run under vitest and are never
bundled, and fails if it cannot parse one; `cc-build` checks the bundle of `app.ts` again.
