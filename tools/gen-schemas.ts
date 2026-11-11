/**
 * pnpm cc:schemas [--check]: writes the JSON Schemas of the extension files from their zod
 * schemas (`z.toJSONSchema`, ADR 0003 decision 3), for editors (`$schema` in
 * theme/tokens.json and connectors.lock) and for tools outside TypeScript. The zod schemas,
 * with their refinements, stay the authority; the JSON Schemas omit the refinements.
 *
 * Generated files are never edited by hand (C-08-03): `--check` fails when a file on disk
 * differs from what would be generated. Interim: `@cc/schemas` generates these at P1-16.
 * Exit codes follow 08 §6: 0 pass, 1 drift, 2 usage error.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { connectorsLockSchema, engineConfigSchema, themeTokensSchema } from '../extension-api/v1/engine.ts';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension-api', 'v1');

export function generated(): Map<string, string> {
  const files = new Map<string, string>();
  const add = (name: string, title: string, schema: z.ZodType) => {
    const json = { title, ...z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) };
    files.set(name, `${JSON.stringify(json, null, 2)}\n`);
  };
  add('cc.config.schema.json', 'cc.config (extension API 1)', engineConfigSchema);
  add('tokens.schema.json', 'theme/tokens.json (extension API 1)', themeTokensSchema);
  add('connectors-lock.schema.json', 'connectors.lock (lockVersion 1)', connectorsLockSchema);
  return files;
}

export function main(argv: readonly string[]): number {
  const check = argv.includes('--check');
  if (argv.some((a) => a !== '--check')) {
    console.error('usage: cc:schemas [--check]');
    return 2;
  }
  const drift: string[] = [];
  for (const [name, text] of generated()) {
    const path = join(OUT_DIR, name);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
    if (current === text) continue;
    if (check) drift.push(name);
    else writeFileSync(path, text);
  }
  if (check && drift.length > 0) {
    console.log(`cc:schemas: FAIL  generated files drifted (C-08-03): ${drift.join(', ')}; run pnpm cc:schemas`);
    return 1;
  }
  console.log(`cc:schemas: ok  ${check ? 'no drift' : 'written'}`);
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
