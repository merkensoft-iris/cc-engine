/**
 * Extension API 1: the validators for the engine's files (08 §4.3, C-08-08).
 *
 * Interim copy of `@cc/schemas/engine/v1` (ADR 0003 decisions 1 to 4): one zod 4
 * `strictObject` per file, semantic rules in `superRefine`, errors printed with
 * `z.prettifyError`. The foundation owns it and runs it in `cc-build` and again in main at
 * start; until the published package is pinned, `pnpm cc:validate` runs it in this
 * repository's CI. The JSON Schemas beside this file are generated from it
 * (`pnpm cc:schemas`) for editors and for tools outside TypeScript, such as `cc:include`.
 */
import { z } from 'zod';
import { DENSITIES, TOKEN_PATHS, TOKEN_VALUE_PATTERNS, type TokenGroup } from './tokens.ts';

/** The extension API this copy describes, and the versions an engine may target (ADR 0003 decision 1, D-2). */
export const EXTENSION_API_CURRENT = 1;
export const EXTENSION_API_SUPPORTED: readonly number[] = [1];

/**
 * Checks `extensionApi` before the per-version schema runs, so an unsupported value gets a
 * message that says what to do. Returns null when the value is supported.
 */
export function checkExtensionApi(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return `extensionApi must be an integer; this foundation supports ${EXTENSION_API_SUPPORTED.join(' and ')}`;
  }
  if (EXTENSION_API_SUPPORTED.includes(value)) return null;
  const oldest = Math.min(...EXTENSION_API_SUPPORTED);
  if (value < oldest) {
    return `extension API ${value} is no longer supported (supported: ${EXTENSION_API_SUPPORTED.join(', ')}); upgrade one foundation major at a time with pnpm cc:upgrade`;
  }
  return `extension API ${value} is newer than this foundation supports; set extensionApi to ${EXTENSION_API_CURRENT}, or update the @cc/* pins`;
}

// ---------------------------------------------------------------------------------------
// cc.config.ts
// ---------------------------------------------------------------------------------------

const key = z.string().regex(/^[a-z][a-z0-9_-]*$/, 'must be a lowercase key: a-z, 0-9, _ and -');
const notAnAccount = (what: string) =>
  z
    .string()
    .min(1)
    .max(80)
    .refine((v) => !v.includes('@'), `${what} must be a label, not an account or email address (02 §9.6 rule 1)`);
const workstreamKey = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'workstream keys, never names: lowercase a-z, 0-9 and - (02 §9.6)');
const hexColour = z.string().regex(TOKEN_VALUE_PATTERNS.color, 'must be a hex colour: #rgb, #rrggbb or #rrggbbaa');

/** The calendar mapping of 02 §9.6, as the engine declares it; no provider code (C-08-08). */
export const calendarMappingSchema = z.strictObject({
  providers: z.array(key).min(1, 'name at least one connector ID allowed for calendar@1'),
  routes: z
    .array(
      z
        .strictObject({
          workstreams: z.union([z.literal('all'), z.array(workstreamKey).min(1)]),
          targets: z
            .array(
              z.strictObject({
                binding: notAnAccount('binding'),
                calendar: notAnAccount('calendar'),
                role: z.enum(['primary', 'mirror']),
                colour: hexColour.optional(),
              }),
            )
            .min(1),
        })
        .superRefine((route, ctx) => {
          const primaries = route.targets.filter((t) => t.role === 'primary').length;
          if (primaries !== 1) {
            ctx.addIssue({
              code: 'custom',
              path: ['targets'],
              message: `exactly one primary target per route (found ${primaries}) (02 §9.6 rule 4)`,
            });
          }
        }),
    )
    .min(1),
  titleTemplate: z.string().min(1).max(120).optional(),
});

const vocabularyWord = z.string().trim().min(1, 'must not be empty').max(40);

/**
 * `cc.config.ts` at extension API 1 (08 §4.3 item 1): modules on or off, vocabulary, default
 * framework parameters and the calendar mapping. Checks that need the local store (a route's
 * binding implements calendar@1; sensitive workstreams never share a binding, 02 §9.6 rule 4)
 * and parameter bounds (01 §5 ParameterSpec) run in the foundation at start.
 */
export const engineConfigSchema = z.strictObject({
  extensionApi: z.literal(1),
  /** Module ID to on or off. The foundation narrows the keys to its module IDs. */
  modules: z.record(key, z.boolean()).optional(),
  /** Overrides of the framework vocabulary (01 §4 `FrameworkTemplate.vocabulary`, 01 §9 level 2). */
  vocabulary: z
    .strictObject({
      goal: vocabularyWord.optional(),
      action: vocabularyWord.optional(),
      issue: vocabularyWord.optional(),
      measure: vocabularyWord.optional(),
      meeting: vocabularyWord.optional(),
    })
    .optional(),
  /** Default parameters per framework template ID (01 §9 level 1), checked against its ParameterSpec bounds. */
  frameworkParameters: z.record(z.string().regex(/^(?:custom:)?[a-z][a-z0-9-]*$/), z.record(z.string(), z.unknown())).optional(),
  calendars: calendarMappingSchema.optional(),
});

export type EngineConfig = z.input<typeof engineConfigSchema>;
export type CalendarMapping = z.input<typeof calendarMappingSchema>;

// ---------------------------------------------------------------------------------------
// theme/tokens.json
// ---------------------------------------------------------------------------------------

const GROUP_HINTS: Readonly<Record<TokenGroup, string>> = {
  color: 'a hex colour: #rgb, #rrggbb or #rrggbbaa',
  font: 'a list of locally installed font family names, such as "Inter", system-ui',
  radius: '0, or a length in px or rem',
  density: `one of ${DENSITIES.join(', ')}`,
};

function groupSchema(group: TokenGroup) {
  const names = TOKEN_PATHS.filter((p) => p.startsWith(`${group}.`)).map((p) => p.slice(group.length + 1));
  const leaf = z.strictObject({
    $value: z.string().regex(TOKEN_VALUE_PATTERNS[group], `must be ${GROUP_HINTS[group]}`),
    $description: z.string().max(200).optional(),
  });
  return z.strictObject(Object.fromEntries(names.map((n) => [n, leaf.optional()]))).optional();
}

/**
 * `theme/tokens.json` (08 §4.3 item 2, ADR 0003 decision 4): a DTCG-style nested object,
 * `{ "color": { "accent": { "$value": "#0b6e4f" } } }`. Every token is optional; the
 * foundation's defaults fill the rest. Unknown groups and names are refused.
 */
export const themeTokensSchema = z.strictObject({
  $schema: z.string().optional(),
  color: groupSchema('color'),
  font: groupSchema('font'),
  radius: groupSchema('radius'),
  density: groupSchema('density'),
});

export type ThemeTokens = z.input<typeof themeTokensSchema>;

// ---------------------------------------------------------------------------------------
// connectors.lock
// ---------------------------------------------------------------------------------------

const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, 'must be 64 lowercase hex characters (sha256)');

/** One entry of `connectors.lock` (05 §15.6). */
export const connectorsLockEntrySchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/, 'a connector or adapter ID such as hostinger or codex_cli'),
  kind: z.enum(['connector', 'adapter']),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, 'an exact semantic version'),
  source: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('index'), publisher: z.string().min(1) }),
    z.strictObject({
      kind: z.literal('repo'),
      repo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'owner/name'),
      tag: z.string().min(1),
      url: z.url({ protocol: /^https$/ }),
    }),
  ]),
  /** The trust anchor for `repo` sources (05 §15.6 rule 1). */
  sha256: sha256Hex,
  permissionsDigest: sha256Hex,
  /** The development request it came from (06 §10.4). */
  requestId: z.string().min(1).optional(),
});

/**
 * `connectors.lock` (05 §15.6): JSON, `lockVersion` 1. CC reads it and never writes it;
 * entries change only through an include PR (C-08-09), made with `pnpm cc:include`.
 */
export const connectorsLockSchema = z
  .strictObject({
    $schema: z.string().optional(),
    lockVersion: z.literal(1),
    entries: z.array(connectorsLockEntrySchema),
  })
  .superRefine((lock, ctx) => {
    const seen = new Set<string>();
    lock.entries.forEach((entry, index) => {
      const id = `${entry.kind}:${entry.id}`;
      if (seen.has(id)) {
        ctx.addIssue({ code: 'custom', path: ['entries', index, 'id'], message: `${entry.kind} ${entry.id} appears more than once` });
      }
      seen.add(id);
    });
  });

export type ConnectorsLock = z.input<typeof connectorsLockSchema>;
export type ConnectorsLockEntry = z.input<typeof connectorsLockEntrySchema>;
