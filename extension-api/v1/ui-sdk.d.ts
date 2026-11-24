/**
 * Extension API 1: the type surface of `@cc/ui-sdk/v1`, the UI contract an engine's `ui/`
 * builds on (ADR 0008 decision 1; versioned entry points, ADR 0003 decision 2).
 *
 * Interim declarations only, copied from `packages/ui-sdk/src` in cc-foundation. The runtime
 * is the foundation's: `cc-build` bundles the engine's `ui/app.ts` with the published package
 * and main serves it in the hardened window. Until that package is pinned, tsconfig.json maps
 * `@cc/ui-sdk/v1` here so `ui/` type-checks; nothing in this repository runs it.
 *
 * One difference from the package: its `UiMethods` is generated from the methods marked `ui`
 * in `@cc/schemas`, so each method's params and result are the schemas' own types. This copy
 * holds no foundation code, so it names no methods and types them as `unknown`; they arrive
 * with the pinned package.
 */
import type { TokenPath } from './tokens.ts';

export type { TokenPath } from './tokens.ts';

// ---------------------------------------------------------------------------------------
// window.cc (`bridge.ts`)
// ---------------------------------------------------------------------------------------

/** A local API error as the window receives it (04 §4.1 rule 4, 07 §4.4). */
export interface CcError {
  readonly code: string;
  readonly message: string;
  readonly help: readonly string[];
}

/** Where a `commandcenter://` deep link points (main parses and validates it first). */
export type Route =
  | { readonly kind: 'home' }
  | { readonly kind: 'items' | 'confirmations' | 'requests' | 'meeting'; readonly target: string };

/** How the app started: normal, or developer mode with its reasons (ADR 0004 decision 7). */
export type StartMode =
  | { readonly kind: 'normal' }
  | { readonly kind: 'developer'; readonly reasons: readonly string[] };

export interface ShellInfo {
  readonly mode: StartMode;
  readonly version: string;
  /** The extension API version of this `window.cc`; check it with `apiVersionProblem`. */
  readonly apiVersion: number;
}

/** The Rebuild now offer, as main sends it (04 §10 rule 2). */
export type RebuildState =
  | { readonly kind: 'none' }
  | { readonly kind: 'offered'; readonly reason: string; readonly deferred: boolean }
  | { readonly kind: 'building' }
  | { readonly kind: 'failed'; readonly reason: string; readonly log: string | null }
  | { readonly kind: 'waiting-for-idle'; readonly busy: readonly string[] }
  | { readonly kind: 'restarting' };

/** `window.cc`, the app UI's only way out (04 §3). */
export interface CcBridge {
  /** One local API call as the user; main passes only the methods marked `ui`. Rejects with a `CcError`. */
  invoke(method: string, params?: unknown): Promise<unknown>;
  /** The shell's mode, version and `window.cc` API version. */
  shell(): Promise<ShellInfo>;
  /** Deep links opened while the app runs; returns an unsubscribe function. */
  onNavigate(listener: (route: Route) => void): () => void;
  /** Rebuild now (`now`), Later (`later`), or the current offer (`state`). */
  rebuild(action: 'state' | 'now' | 'later'): Promise<RebuildState>;
  /** Changes to the offer; returns an unsubscribe function. */
  onRebuildState(listener: (state: RebuildState) => void): () => void;
}

/** Whether a rejection is a local API error (`CcError`). */
export declare function isCcError(value: unknown): value is CcError;

// ---------------------------------------------------------------------------------------
// The typed client (`client.ts`)
// ---------------------------------------------------------------------------------------

/** The local API methods the window may call; generated in the package, open here (see above). */
export interface UiMethods {
  readonly [method: string]: { readonly params: unknown; readonly result: unknown };
}

export type UiMethod = keyof UiMethods & string;
export type Params<M extends UiMethod> = UiMethods[M]['params'];
export type Result<M extends UiMethod> = UiMethods[M]['result'];

/** The extension API version this entry point speaks. */
export declare const API_VERSION: 1;
export type ApiVersion = typeof API_VERSION;

export interface Client {
  /** One local API call as the user. Rejects with a `CcError`. */
  call<M extends UiMethod>(method: M, params: Params<M>): Promise<Result<M>>;
}

/** The typed client over `window.cc.invoke` (or a test's fake of it). */
export declare function createClient(bridge: Pick<CcBridge, 'invoke'>): Client;

/** Why this UI cannot run on the shell it is in (another `window.cc` API version), or undefined. */
export declare function apiVersionProblem(
  shell: Pick<ShellInfo, 'apiVersion'>,
  expected?: number,
): string | undefined;

// ---------------------------------------------------------------------------------------
// Routes and the screen contract (`routes.ts`, `screen.ts`)
// ---------------------------------------------------------------------------------------

/** The onboarding steps (01 §3), as `@cc/schemas` declares them. */
export type OnboardingStep =
  | 'workspace'
  | 'workstreams'
  | 'profiles'
  | 'recommendation'
  | 'tailoring'
  | 'rhythm'
  | 'tools'
  | 'ai'
  | 'commit';

export type ItemsTab = 'list' | 'review' | 'drafts';

/** The Settings pages (09 P1-11): the Overview, then one page per section. */
export type SettingsSection = 'overview' | 'backups' | 'agents' | 'notifications' | 'ai';

/** The app's screens and what each can be opened on; a replaced screen keeps its route. */
export type AppRoute =
  | { readonly screen: 'home'; readonly confirmation?: string; readonly request?: string }
  | { readonly screen: 'items'; readonly tab?: ItemsTab; readonly ref?: string }
  | { readonly screen: 'decisions'; readonly ref?: string }
  | { readonly screen: 'issues' }
  | { readonly screen: 'meetings'; readonly ref?: string; readonly from?: string }
  | { readonly screen: 'scorecard'; readonly tab?: 'measures' | 'goals'; readonly ref?: string }
  | { readonly screen: 'settings'; readonly tab?: SettingsSection }
  | { readonly screen: 'onboarding'; readonly step?: OnboardingStep };

export type ScreenName = AppRoute['screen'];

/** What every screen is given. */
export interface Ui extends Client {
  /** Opens a screen. */
  go(route: AppRoute): void;
  /** Loads the current screen's state again, keeping the route. */
  reload(): Promise<void>;
  /** Renders the current state again, after a handler changed it. */
  render(): void;
  /** A short message under the header: what an action did, or why it failed. */
  flash(message: string, kind?: 'ok' | 'error'): void;
  /** Puts text on the clipboard; resolves to whether it worked. */
  copy(text: string): Promise<boolean>;
  /** Milliseconds since the epoch; tests pass a fixed clock. */
  now(): number;
  /** A value the app keeps for this window across reloads and screen changes. */
  keep<T extends object>(key: string, init: () => T): T;
}

/** What a screen provides: its state, loaded through the local API, and a view of it. */
export interface Screen<S, View> {
  load(ui: Ui, route: AppRoute): Promise<S>;
  view(state: S, ui: Ui, route: AppRoute): View;
}

// ---------------------------------------------------------------------------------------
// Principal scopes (`scopes.ts`)
// ---------------------------------------------------------------------------------------

/** The scopes, in the order of 07 §5. */
export declare const SCOPES: readonly [
  'read',
  'items:write',
  'items:claim',
  'decisions:propose',
  'meetings:capture',
  'measures:write',
  'connectors:read',
  'connectors:invoke',
  'sessions:read',
  'discovery:request',
  'requests:propose',
  'onboarding:apply',
];

/** The scopes no agent has by default (07 §5 rule 3); granting one is confirmed in the shell's window. */
export declare const GRANT_ONLY_SCOPES: readonly [
  'connectors:invoke',
  'discovery:request',
  'requests:propose',
  'onboarding:apply',
];

export type Scope = (typeof SCOPES)[number];
export type GrantOnlyScope = (typeof GRANT_ONLY_SCOPES)[number];

/** `true` only when `List` names every member of `Union`. */
export type ListsAll<Union, List extends readonly Union[]> = [Exclude<Union, List[number]>] extends [never]
  ? true
  : false;

/** Compiles only when `T` is `true`. */
export type Assert<T extends true> = T;

export type ScopeListsComplete = [
  Assert<ListsAll<Scope, typeof SCOPES>>,
  Assert<ListsAll<GrantOnlyScope, typeof GRANT_ONLY_SCOPES>>,
];

// ---------------------------------------------------------------------------------------
// Theme tokens (`tokens.ts`)
// ---------------------------------------------------------------------------------------

/** The token paths `theme/tokens.json` may set (the list in `./tokens.ts`). */
export declare const TOKEN_PATHS: readonly TokenPath[];

/** `color.textMuted` compiles to `--cc-color-text-muted`. */
export declare function cssVariableName(path: TokenPath): string;

/** A theme token as a CSS value: `token('color.accent')` is `var(--cc-color-accent)`. */
export declare function token(path: TokenPath): string;
