/**
 * Build flags: the engine features that are not built yet stay off, never half-wired
 * (cc-foundation docs/design/09-build-plan.md §2 rule 1). Each flag gates engine scripts in
 * `tools/cc.ts`. While a flag is off, its scripts say what is missing and which build step
 * brings it, and exit 1. Turning a flag on is a one-line, reviewed change, made in the PR that
 * pins the foundation release which ships the feature (extension-api/README.md, "Pinning the
 * foundation").
 *
 * `pnpm cc:flags` prints them as `name=on|off` lines; CI appends that to $GITHUB_OUTPUT to
 * skip the steps of features that are off.
 */
export interface BuildFlag {
  readonly on: boolean;
  /** What the flag turns on, as a phrase: "building the app with @cc/build". */
  readonly what: string;
  /** What has to happen first, as a phrase: "the first cc:release of the @cc/* packages (P1-16)". */
  readonly arrives: string;
}

export const BUILD_FLAGS = {
  build: {
    on: false,
    what: 'building the app with @cc/build (cc-build, and the install stamp of ADR 0004)',
    arrives: 'the first cc:release of the @cc/* packages, pinned here (P1-16)',
  },
  upgrade: {
    on: false,
    what: 'cc:upgrade, the foundation codemods',
    arrives: 'the first cc:release of the @cc/* packages, pinned here (P1-16)',
  },
  start: {
    on: false,
    what: 'starting the desktop shell',
    arrives: 'the desktop shell (P1-10) in a cc:release pinned here (P1-16 follow-up)',
  },
  include: {
    on: false,
    what: 'cc:include, adding a connectors.lock entry for an include PR',
    arrives: 'the lock loader (P5)',
  },
} as const satisfies Record<string, BuildFlag>;

export type FlagName = keyof typeof BUILD_FLAGS;
export type BuildFlags = Readonly<Record<FlagName, BuildFlag>>;
