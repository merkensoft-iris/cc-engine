/**
 * Rule D3 for the engine's `ui/` (08 §4.2; ADR 0003 decision 8 as amended by ADR 0008
 * decision 1): a file of `ui/` imports other files of `ui/`, the versioned entry points of the
 * UI contract and the default UI (`@cc/ui-sdk/v<N>`, `@cc/ui/v<N>` and its stylesheet
 * `@cc/ui/v<N>/app.css`), and the UI libraries the engine names in `cc.config.ts`
 * (`ui: { libraries: [...] }`, any subpath). No Node built-ins, no network, no other package,
 * and no relative import that leaves `ui/`. Interim copy of the check `cc-build` runs
 * (`@cc/build`, `packages/build/src/ui.ts`) until that package is pinned.
 *
 * Two checks, as ADR 0003 decided:
 *   1. The import allowlist, read from esbuild's resolver (the resolver the real bundle uses,
 *      so the check cannot drift from what ships). It fails closed: if esbuild parsed fewer
 *      `ui/` files than exist, the tree is refused rather than passed unchecked.
 *   2. A global-name scan for `fetch`, `WebSocket`, `eval` and the like. It is a lint for
 *      honest mistakes, not a boundary: `globalThis['fe' + 'tch']` evades it by design. The
 *      boundary is the hardened window `@cc/desktop` ships (ADR 0003 decision 9).
 */
import { readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { build, type Plugin } from 'esbuild';
import ts from 'typescript';
import { EXTENSION_API_SUPPORTED } from '../extension-api/v1/engine.ts';

const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
/**
 * The UI tests (`*.test.ts` files in ui/) run under vitest, never in the window: `cc-build` bundles
 * only what `ui/app.ts` reaches, so it never takes one, and this check skips them.
 */
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

/** The packages a UI imports by versioned entry point only (ADR 0003 decision 2). */
export const UI_CONTRACT_PACKAGES = ['@cc/ui-sdk', '@cc/ui'] as const;

/** The versioned entry points a file of `ui/` may import, for every extension API the foundation supports. */
export function contractEntries(): Set<string> {
  const entries = new Set<string>();
  for (const n of EXTENSION_API_SUPPORTED) {
    entries.add(`@cc/ui-sdk/v${n}`);
    entries.add(`@cc/ui/v${n}`);
    entries.add(`@cc/ui/v${n}/app.css`);
  }
  return entries;
}

/** The package a bare specifier names: `@scope/name` or `name`. */
export function packageOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}

/** Whether a file of `ui/` may import the bare `specifier`, given the engine's `ui.libraries`. */
export function isAllowedImport(specifier: string, libraries: readonly string[]): boolean {
  const name = packageOf(specifier);
  if ((UI_CONTRACT_PACKAGES as readonly string[]).includes(name)) return contractEntries().has(specifier);
  return !name.startsWith('@cc/') && libraries.includes(name);
}

/** Globals a widget must not reach for: network, code loading, workers and Node. */
export const DENIED_GLOBALS = new Set([
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'RTCPeerConnection',
  'Worker',
  'SharedWorker',
  'importScripts',
  'eval',
  'Function',
  'require',
  'process',
  'Buffer',
  '__dirname',
  '__filename',
  'sendBeacon',
]);
const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self', 'navigator', 'document']);

export interface D3Result {
  readonly files: number;
  readonly problems: string[];
}

function listCodeFiles(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true, recursive: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && CODE_FILE.test(e.name) && !DECLARATION_FILE.test(e.name) && !TEST_FILE.test(e.name))
    .map((e) => join(e.parentPath, e.name))
    .sort();
}

const toPosix = (p: string) => p.split(sep).join('/');

function scanGlobals(file: string, text: string, display: string): string[] {
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const problems: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && DENIED_GLOBALS.has(node.text)) {
      const parent = node.parent;
      let flagged = true;
      if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
        // x.fetch is someone's property, unless x is a global object (window.fetch).
        flagged = ts.isIdentifier(parent.expression) && GLOBAL_OBJECTS.has(parent.expression.text);
      } else if (
        (ts.isPropertyAssignment(parent) ||
          ts.isPropertySignature(parent) ||
          ts.isPropertyDeclaration(parent) ||
          ts.isMethodDeclaration(parent) ||
          ts.isJsxAttribute(parent)) &&
        parent.name === node
      ) {
        flagged = false;
      }
      if (flagged) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        problems.push(`D3: ${display}:${line + 1} uses ${node.text}; widgets have no network, code loading or Node`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}

/**
 * Runs both D3 checks over `<root>/ui`. `libraries` are the UI libraries the engine names in
 * `cc.config.ts` (`ui.libraries`), already validated by its schema.
 */
export async function checkUi(
  root: string,
  readText: (path: string) => string,
  libraries: readonly string[] = [],
): Promise<D3Result> {
  // esbuild reports real paths, so a root reached through a symlink (macOS's /var is
  // /private/var) would otherwise put every ui/ file outside ui/.
  try {
    root = realpathSync(root);
  } catch {
    // A missing root has no ui/ files; listCodeFiles returns none.
  }
  const uiDir = resolve(root, 'ui');
  const files = listCodeFiles(uiDir);
  if (files.length === 0) return { files: 0, problems: [] };

  const allowed = [...contractEntries(), ...libraries.map((l) => `${l} (cc.config.ts ui.libraries)`)].join(', ');
  const problems: string[] = [];
  const display = (p: string) => toPosix(relative(root, p));

  const guard: Plugin = {
    name: 'cc-d3',
    setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') return undefined;
        const from = args.importer === '' ? '(entry)' : display(args.importer);
        if (args.path.startsWith('.') || isAbsolute(args.path)) {
          const target = resolve(args.resolveDir, args.path);
          const inside = relative(uiDir, target);
          if (inside.startsWith('..') || isAbsolute(inside)) {
            problems.push(`D3: ${from} imports ${args.path}, which is outside ui/`);
            return { path: args.path, external: true };
          }
          return undefined;
        }
        if (!isAllowedImport(args.path, libraries)) {
          problems.push(`D3: ${from} imports ${args.path}; engine ui/ may import only ${allowed}`);
        }
        return { path: args.path, external: true };
      });
    },
  };

  let parsed = 0;
  try {
    const result = await build({
      absWorkingDir: root,
      entryPoints: files,
      bundle: true,
      write: false,
      metafile: true,
      outdir: join(root, '.cc-cache', 'd3'),
      platform: 'browser',
      format: 'esm',
      jsx: 'automatic',
      logLevel: 'silent',
      loader: { '.css': 'css', '.svg': 'dataurl', '.png': 'dataurl' },
      plugins: [guard],
    });
    const uiPrefix = `${toPosix(relative(root, uiDir))}/`;
    parsed = Object.keys(result.metafile.inputs).filter((p) => p.startsWith(uiPrefix) && CODE_FILE.test(p)).length;
  } catch (error) {
    const errors = (error as { errors?: { text: string; location?: { file: string; line: number } | null }[] }).errors;
    for (const e of errors ?? [{ text: String(error) }]) {
      problems.push(`D3: ${e.location ? `${e.location.file}:${e.location.line}: ` : ''}${e.text}`);
    }
    return { files: files.length, problems };
  }
  if (parsed < files.length) {
    problems.push(`D3: esbuild parsed ${parsed} of ${files.length} ui/ files; refusing to pass an unchecked tree`);
  }
  for (const file of files) problems.push(...scanGlobals(file, readText(file), display(file)));
  return { files: files.length, problems };
}
