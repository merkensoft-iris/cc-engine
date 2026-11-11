/**
 * Extension API 1: the type surface of `@cc/ui-sdk/v1` that engine widgets in `ui/` build on.
 *
 * Interim declarations only (ADR 0003 decisions 2, 4 and 5). The runtime is the foundation's:
 * `@cc/ui-sdk` registers widgets inside an error boundary in the hardened renderer, which the
 * engine builds with `@cc/build` (P1-16). Until that package is pinned, tsconfig.json maps
 * `@cc/ui-sdk/v1` here so widgets type-check; nothing in this repository runs them.
 *
 * Widget data reads (ADR 0003 D-3: read-only methods on a declared allowlist, enforced by
 * main) are an additive change to this surface and are not declared yet.
 */
import type { SlotId } from './slots.ts';
import type { TokenPath } from './tokens.ts';

export type { SlotId } from './slots.ts';
export type { TokenPath } from './tokens.ts';

/** What the foundation passes a widget when it renders it in its slot. */
export interface WidgetProps {
  readonly slot: SlotId;
}

/** A widget component. The renderer uses React; the type stays library-neutral here. */
export type WidgetComponent = (props: WidgetProps) => unknown;

export interface WidgetDefinition {
  /** One of the slots the foundation declares; a typo is a type error. */
  readonly slot: SlotId;
  /** Shown in the widget's frame and in error messages; required (ADR 0003 decision 5). */
  readonly title: string;
  readonly component: WidgetComponent;
}

export interface RegisteredWidget extends WidgetDefinition {
  readonly extensionApi: 1;
}

/** Registers a widget for a declared slot. Export the result as the module's default. */
export declare function defineWidget(definition: WidgetDefinition): RegisteredWidget;

/** A CSS value reading the theme token, for example `var(--cc-color-accent)`. */
export declare function token(path: TokenPath): string;
