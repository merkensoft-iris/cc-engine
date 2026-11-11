# ui/: widgets in declared slots

Widgets for the slots the foundation declares (08 §4.3 item 3). The layout is fixed; a widget
appears only in its slot (owner decision Q9, 10 Nov 2026). Extension API 1 declares
`home.header` and `home.aside` (`extension-api/v1/slots.ts`).

```tsx
// ui/WeekBanner.tsx
import { defineWidget, token } from '@cc/ui-sdk/v1';

function WeekBanner() {
  return <strong style={{ color: token('color.accent') }}>This week</strong>;
}

export default defineWidget({ slot: 'home.header', title: 'Week banner', component: WeekBanner });
```

Rule D3 (08 §4.2): a widget imports only `@cc/ui-sdk/v1`, `@cc/schemas/engine/v1-tokens`,
`react` and `react-dom`, and relative files inside `ui/`. No Node built-ins, no network, no
other packages. `pnpm cc:validate` checks every file here and fails if it cannot parse one.
