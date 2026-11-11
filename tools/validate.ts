/**
 * pnpm cc:validate [--repo <dir>]: validates the engine's extension files (08 §4.3, §9;
 * C-08-08), as the foundation does at build and again at start:
 *
 *   cc.config.ts       extensionApi first, then the per-version schema (ADR 0003 decisions 1, 3)
 *   theme/tokens.json  token names and the closed value grammar (decision 4)
 *   connectors.lock    the lock format of 05 §15.6
 *   ui/                rule D3: import allowlist, fail-closed count, global-name scan (decision 8)
 *   frameworks/, packs/, profile.json  listed only: the foundation's validators (C-01-03) run
 *                      on them from P1-16; nothing here pretends to check them
 *
 * `cc.config.ts` is bundled with esbuild and imported from memory (ADR 0003, "Loading
 * cc.config.ts"); it may import types only until the @cc/* packages are pinned.
 *
 * Interim: moves into @cc/build (`cc-build` runs the same checks) at P1-16.
 * Exit codes follow 08 §6: 0 pass, 1 a check failed, 2 usage error.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { z } from 'zod';
import {
  checkExtensionApi,
  connectorsLockSchema,
  engineConfigSchema,
  themeTokensSchema,
} from '../extension-api/v1/engine.ts';
import { checkUi } from './d3.ts';

export interface Section {
  readonly name: string;
  readonly ok: boolean;
  readonly summary: string;
  readonly problems: readonly string[];
}

const readText = (path: string) => readFileSync(path, 'utf8');

function zodProblems(file: string, error: z.ZodError): string[] {
  return z
    .prettifyError(error)
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => `${file}: ${l.trim()}`);
}

export async function loadConfig(root: string): Promise<unknown> {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['cc.config.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
  });
  const code = result.outputFiles[0]?.text ?? '';
  if (/^\s*import\s/m.test(code)) {
    throw new Error('cc.config.ts may import types only (import type ...) until the @cc/* packages are pinned');
  }
  const mod = (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)) as {
    default?: unknown;
  };
  return mod.default;
}

async function validateConfig(root: string): Promise<Section> {
  const name = 'cc.config.ts';
  if (!existsSync(join(root, name))) return { name, ok: false, summary: 'missing', problems: [`${name} is missing (08 §4.3 item 1)`] };
  let value: unknown;
  try {
    value = await loadConfig(root);
  } catch (error) {
    const errors = (error as { errors?: { text: string }[] }).errors;
    const text = errors?.map((e) => e.text).join('; ') ?? (error as Error).message;
    return { name, ok: false, summary: 'could not be loaded', problems: [`${name}: ${text}`] };
  }
  if (typeof value !== 'object' || value === null) {
    return { name, ok: false, summary: 'no config', problems: [`${name} must export default the config object`] };
  }
  const apiProblem = checkExtensionApi((value as { extensionApi?: unknown }).extensionApi);
  if (apiProblem !== null) return { name, ok: false, summary: 'unsupported extension API', problems: [`${name}: ${apiProblem}`] };
  const parsed = engineConfigSchema.safeParse(value);
  if (!parsed.success) return { name, ok: false, summary: 'invalid', problems: zodProblems(name, parsed.error) };
  return { name, ok: true, summary: `extension API ${parsed.data.extensionApi}`, problems: [] };
}

function validateJson(root: string, name: string, schema: z.ZodType, describe: (v: never) => string): Section {
  const path = join(root, name);
  if (!existsSync(path)) return { name, ok: false, summary: 'missing', problems: [`${name} is missing (08 §4.3)`] };
  let value: unknown;
  try {
    value = JSON.parse(readText(path));
  } catch (error) {
    return { name, ok: false, summary: 'not JSON', problems: [`${name}: ${(error as Error).message}`] };
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) return { name, ok: false, summary: 'invalid', problems: zodProblems(name, parsed.error) };
  return { name, ok: true, summary: describe(parsed.data as never), problems: [] };
}

function countFiles(dir: string, pattern: RegExp): number {
  try {
    return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && pattern.test(e.name)).length;
  } catch {
    return 0;
  }
}

export async function validate(root: string): Promise<Section[]> {
  const sections: Section[] = [await validateConfig(root)];
  sections.push(
    validateJson(root, 'theme/tokens.json', themeTokensSchema, (t: z.output<typeof themeTokensSchema>) => {
      const set = (['color', 'font', 'radius', 'density'] as const).reduce((n, g) => n + Object.keys(t[g] ?? {}).length, 0);
      return `${set} token(s) set`;
    }),
  );
  sections.push(
    validateJson(root, 'connectors.lock', connectorsLockSchema, (l: z.output<typeof connectorsLockSchema>) => `lockVersion ${l.lockVersion}, ${l.entries.length} entr${l.entries.length === 1 ? 'y' : 'ies'}`),
  );
  const ui = await checkUi(root, readText);
  sections.push({ name: 'ui/ (D3)', ok: ui.problems.length === 0, summary: `${ui.files} widget file(s)`, problems: ui.problems });

  const yaml = /\.ya?ml$/;
  const deferred = countFiles(join(root, 'frameworks'), yaml) + countFiles(join(root, 'packs'), yaml);
  const profile = existsSync(join(root, 'profile.json')) ? ', profile.json' : '';
  sections.push({
    name: 'frameworks/, packs/',
    ok: true,
    summary: `${deferred} file(s)${profile} left to the foundation's validators (C-01-03) from P1-16`,
    problems: [],
  });
  return sections;
}

export async function main(argv: readonly string[]): Promise<number> {
  let root = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo' && argv[i + 1] !== undefined) root = resolve(argv[++i] as string);
    else {
      console.error(`cc:validate: unknown argument ${argv[i]}\nusage: cc:validate [--repo <dir>]`);
      return 2;
    }
  }
  const sections = await validate(root);
  const failed = sections.filter((s) => !s.ok);
  console.log(failed.length === 0 ? 'cc:validate: ok' : `cc:validate: FAIL  ${failed.length} of ${sections.length} checks failed`);
  for (const s of sections) {
    console.log(`  ${s.ok ? 'ok  ' : 'FAIL'}  ${s.name}: ${s.summary}`);
    for (const p of s.problems) console.log(`        ${p}`);
  }
  return failed.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
