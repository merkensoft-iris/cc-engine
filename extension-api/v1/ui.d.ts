/**
 * Extension API 1: the type surface of `@cc/ui/v1`, the default UI an engine's `ui/app.ts`
 * composes (ADR 0008 decision 1; versioned entry points, ADR 0003 decision 2).
 *
 * Interim declarations only, copied from `packages/ui/src/v1.ts` in cc-foundation. The runtime
 * is the foundation's: `cc-build` bundles `ui/app.ts` with the published package, and the UI
 * tests in `ui/test/` run it once it is pinned (vitest.config.ts). Until then tsconfig.json
 * maps `@cc/ui/v1` here so `ui/` type-checks; nothing in this repository runs it.
 *
 * This copy declares the composition API, the app frame, the default screens, the screen
 * helpers and the UI kit's `h` and test queries. Two parts of the package are left out, as
 * `ui-sdk.d.ts` leaves out the method types: the result names of the default screens
 * (`HomeResult`, `PrincipalRow`, ...), so a default screen's state is `unknown` here, and the
 * view parts of `ui/parts.ts` (`page`, `section`, `button`, ...). They arrive with the pinned
 * package.
 */
import type {
  AppRoute,
  CcError,
  GRANT_ONLY_SCOPES as GrantOnlyScopes,
  Route,
  SCOPES as Scopes,
  ScreenName,
  Screen as ScreenOf,
  Ui,
} from './ui-sdk.d.ts';

export type { AppRoute, ItemsTab, ScreenName, SettingsSection, Ui } from './ui-sdk.d.ts';

// ---------------------------------------------------------------------------------------
// The UI kit (`ui/vnode.ts`, `ui/dom.ts`)
// ---------------------------------------------------------------------------------------

/** An element's attributes and handlers; handlers receive the input's value or a checkbox's state. */
export interface Props {
  readonly class?: string;
  /** A stable name for tests and for the end-to-end runs. */
  readonly test?: string;
  readonly title?: string;
  readonly disabled?: boolean;
  readonly type?: string;
  readonly value?: string;
  readonly checked?: boolean;
  readonly placeholder?: string;
  readonly role?: string;
  readonly 'aria-label'?: string;
  readonly 'aria-current'?: string;
  readonly 'aria-pressed'?: string;
  readonly 'aria-expanded'?: string;
  readonly colspan?: string;
  readonly for?: string;
  readonly id?: string;
  readonly name?: string;
  readonly min?: string;
  readonly step?: string;
  readonly rows?: string;
  readonly hidden?: boolean;
  readonly onClick?: () => void;
  readonly onInput?: (value: string) => void;
  readonly onCheck?: (checked: boolean) => void;
  readonly onSubmit?: () => void;
}

/** A view tree node: what a default UI screen renders. */
export interface VNode {
  readonly tag: string;
  readonly props: Props;
  readonly children: readonly (VNode | string)[];
}

export type Child = VNode | string | number | null | undefined | false | readonly Child[];

/** An element: `h('button', { onClick }, 'Save')`. */
export declare function h(tag: string, props?: Props | null, ...children: Child[]): VNode;
/** Every node of a tree, depth first. */
export declare function walk(node: VNode): VNode[];
/** The text a node shows, its children's joined. */
export declare function textOf(node: VNode | string): string;
/** The nodes with a `test` name. */
export declare function allByTest(node: VNode, test: string): VNode[];
/** The one node with a `test` name; throws when there is none. */
export declare function byTest(node: VNode, test: string): VNode;
/** The node with a `test` name, or undefined. */
export declare function queryByTest(node: VNode, test: string): VNode | undefined;
/** The buttons whose text is `label`. */
export declare function buttons(node: VNode, label: string): VNode[];
/** Draws a view tree into an element of the page, replacing what it held. */
export declare function mount(container: Element, node: VNode): void;
/** Puts text on the clipboard; resolves to whether it worked. */
export declare function copyText(text: string): Promise<boolean>;

// ---------------------------------------------------------------------------------------
// Screens (`app/screen.ts`)
// ---------------------------------------------------------------------------------------

/** A default UI screen: it renders `h` trees. */
export type Screen<S> = ScreenOf<S, VNode>;

export declare function isCcError(value: unknown): value is CcError;
/** The message a failed call shows: the API's message, or a fallback. */
export declare function errorText(error: unknown): string;
/** Runs an action, flashes `done` or the error, and reloads the screen; resolves to whether it succeeded. */
export declare function act(ui: Ui, run: () => Promise<unknown>, done: string): Promise<boolean>;

/** What a screen says while one of the app shell's own windows asks the user (04 §4.3 rule 4). */
export declare const IN_WINDOW: {
  readonly confirm: 'Confirm in the window';
  readonly secret: 'Type the password in the window';
  readonly folder: 'Choose the folder in the window';
};
/** Whether `key`'s call is waiting for the shell's window. */
export declare function waitingInWindow(ui: Ui, key: string): boolean;
/** Runs `run`, whose answer comes from one of the app shell's windows, marking `key` as waiting meanwhile. */
export declare function inWindow<T>(ui: Ui, key: string, run: () => Promise<T>): Promise<T>;
/** `act`, for an action whose answer comes from one of the app shell's windows (`inWindow`). */
export declare function actInWindow(ui: Ui, key: string, run: () => Promise<unknown>, done: string): Promise<boolean>;

// ---------------------------------------------------------------------------------------
// The app frame and the default screens (`app/app.ts`, `app/routes.ts`, `screens/`)
// ---------------------------------------------------------------------------------------

/** A screen the app frame shows; `ticks` asks for a render now and then (the meeting runner). */
export type AppScreen = Screen<unknown> & { readonly ticks?: boolean };

export declare const homeScreen: Screen<unknown>;
export declare const itemsScreen: Screen<unknown>;
export declare const decisionsScreen: Screen<unknown>;
export declare const issuesScreen: Screen<unknown>;
export declare const meetingsScreen: Screen<unknown>;
export declare const scorecardScreen: Screen<unknown>;
export declare const settingsScreen: Screen<unknown>;
export declare const onboardingScreen: Screen<unknown>;

/** The default UI's screens, by route name. */
export declare const SCREENS: Readonly<Record<ScreenName, AppScreen>>;

/** The navigation, in its fixed order. */
export declare const NAV: readonly { readonly screen: ScreenName; readonly label: string }[];

/** The route a `commandcenter://` deep link opens. */
export declare function routeOfLink(route: Route): AppRoute;

export interface AppOptions {
  /** Screens that replace default ones, by route name; a route not named here shows the default screen. */
  readonly screens?: Partial<Record<ScreenName, AppScreen>>;
  readonly call: (method: string, params?: unknown) => Promise<unknown>;
  readonly render: (node: VNode) => void;
  readonly now?: () => number;
  /** The clipboard; without one, Copy reports that it did not work. */
  readonly copy?: (text: string) => Promise<boolean>;
}

/**
 * The app frame: the navigation, the message line and the current screen. Rendering goes to a
 * callback, so UI tests run the whole app headless against a fake `call` and read the view
 * trees with the queries above.
 */
export declare class App {
  constructor(options: AppOptions);
  readonly ui: Ui;
  get route(): AppRoute;
  /** Whether the current screen shows a clock that needs a render now and then. */
  get ticks(): boolean;
  /** The first screen: onboarding until it is committed, else Home; a deep link that arrived first wins. */
  start(): Promise<void>;
  /** Opens a screen and loads it. */
  go(route: AppRoute): Promise<void>;
  /** Loads the current screen; a newer load wins over a slower older one. */
  load(): Promise<void>;
  render(): void;
  view(): VNode;
}

// ---------------------------------------------------------------------------------------
// Composition (`app/create-app.ts`)
// ---------------------------------------------------------------------------------------

/** What an engine's `ui/app.ts` changes in the default UI. */
export interface AppOverrides {
  /** Screens that replace default ones, by route name; the others stay the default ones. */
  readonly screens?: AppOptions['screens'];
  /** Where the app draws; `#app` of the page shell by default. */
  readonly container?: Element;
}

export interface DefaultApp {
  /**
   * Starts the app: it opens the screen a `commandcenter://` link names, else the first
   * screen. It makes no call on a shell that speaks another `window.cc` API version.
   */
  start(): Promise<void>;
}

/** The default UI, with the screens `overrides` replaces. */
export declare function createApp(overrides?: AppOverrides): DefaultApp;

// ---------------------------------------------------------------------------------------
// Scopes (re-exported for ejected screens)
// ---------------------------------------------------------------------------------------

export declare const SCOPES: typeof Scopes;
export declare const GRANT_ONLY_SCOPES: typeof GrantOnlyScopes;
