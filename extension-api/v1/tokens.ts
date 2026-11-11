/**
 * Extension API 1: theme token names and the closed value grammar.
 *
 * Interim copy of `@cc/schemas/engine/v1-tokens` (ADR 0003 decisions 4 and 8). It imports
 * nothing, so engine widgets in `ui/` may import it under rule D3. The foundation owns it;
 * this file goes when the published package is pinned (extension-api/README.md).
 *
 * Tokens are colours, fonts, radius and density only; the layout is fixed by the foundation
 * (owner decision Q9, 10 Nov 2026; 08 §4.3).
 */

/** Every token path an engine may set, as `group.name`. A widget's `token()` takes one. */
export const TOKEN_PATHS = [
  'color.background',
  'color.surface',
  'color.text',
  'color.textMuted',
  'color.border',
  'color.accent',
  'color.accentText',
  'color.success',
  'color.warning',
  'color.danger',
  'font.body',
  'font.heading',
  'font.mono',
  'radius.small',
  'radius.medium',
  'radius.large',
  'density.scale',
] as const;

export type TokenPath = (typeof TOKEN_PATHS)[number];
export type TokenGroup = TokenPath extends `${infer G}.${string}` ? G : never;

/** The density steps the fixed layout supports. */
export const DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
export type Density = (typeof DENSITIES)[number];

/**
 * The closed value grammar per group. A value that does not match is refused, so a token can
 * never carry `url(`, `;`, `}`, `@import` or anything else that escapes a CSS custom property.
 */
export const TOKEN_VALUE_PATTERNS: Readonly<Record<TokenGroup, RegExp>> = {
  // #rgb, #rrggbb or #rrggbbaa
  color: /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
  // A comma-separated list of locally installed family names: quoted names or bare words.
  // No remote fonts: the renderer loads no remote content (04 §3).
  font: /^(?:"[A-Za-z0-9 _-]{1,64}"|[A-Za-z][A-Za-z0-9 -]{0,63})(?:\s*,\s*(?:"[A-Za-z0-9 _-]{1,64}"|[A-Za-z][A-Za-z0-9 -]{0,63}))*$/,
  // 0, or a length in px or rem
  radius: /^(?:0|\d{1,3}(?:\.\d{1,3})?(?:px|rem))$/,
  density: /^(?:compact|comfortable|spacious)$/,
};

/** The CSS custom property a token compiles to: `color.textMuted` becomes `--cc-color-text-muted`. */
export function cssVariableName(path: TokenPath): string {
  const kebab = path.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace('.', '-');
  return `--cc-${kebab}`;
}
