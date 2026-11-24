# ui/: the app UI

The engine owns the app UI (08 §4.3 item 3; ADR 0008 decision 1). With no `ui/app.ts` here,
Command Center runs the foundation's default UI. With one, `cc-build` bundles `ui/app.ts` as
the composition root: the default UI from `@cc/ui/v1` as it is, restyled, with screens
replaced one at a time, or a UI of your own built on `@cc/ui-sdk/v1` alone.

```ts
// ui/app.ts
import '@cc/ui/v1/app.css';
import { createApp } from '@cc/ui/v1';

createApp().start();
```

Rule D3 (08 §4.2): a file here imports only other files of `ui/`, `@cc/ui-sdk/v1`, `@cc/ui/v1`
and `@cc/ui/v1/app.css`, and the UI libraries `cc.config.ts` names in `ui.libraries` (for
example `react`). No Node built-ins, no network, no other packages. `pnpm cc:validate` checks
every file here and fails if it cannot parse one.
