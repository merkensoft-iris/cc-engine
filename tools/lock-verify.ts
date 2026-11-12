/**
 * pnpm cc:lock-verify: checks every `connectors.lock` entry's sha256 against its release
 * (08 §9, engine ci.yml; 05 §15.6 rule 1, C-05-03).
 *
 * A `repo` entry is trusted through its sha256 pin, so CI downloads the release asset at its
 * `url` and compares. An `index` entry is verified against the signed index by
 * `@cc/registry-client`, which arrives in P5; until then such an entry fails closed here
 * rather than passing unchecked. The lock format itself is checked by `pnpm cc:validate`.
 *
 * This is the one engine CI step that uses the network (it runs on Linux only), and an empty
 * lock needs none. Interim: moves into @cc/build when the foundation is pinned (extension-api/README.md).
 * Exit codes follow 08 §6: 0 pass, 1 a check failed, 2 usage error.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectorsLockSchema, type ConnectorsLockEntry } from '../extension-api/v1/engine.ts';

export type FetchBytes = (url: string) => Promise<Uint8Array>;

const fetchBytes: FetchBytes = async (url) => {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

/** Problems with the entries' pins; empty when every pin matches its release. */
export async function verifyEntries(entries: readonly ConnectorsLockEntry[], get: FetchBytes = fetchBytes): Promise<string[]> {
  const problems: string[] = [];
  for (const entry of entries) {
    const name = `${entry.kind} ${entry.id}@${entry.version}`;
    if (entry.source.kind === 'index') {
      problems.push(`${name}: index entries are verified by @cc/registry-client against the signed index (P5); not verifiable here yet`);
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = await get(entry.source.url);
    } catch (error) {
      problems.push(`${name}: could not download ${entry.source.url}: ${(error as Error).message}`);
      continue;
    }
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== entry.sha256) {
      problems.push(`${name}: sha256 of ${entry.source.url} is ${actual}, the lock pins ${entry.sha256} (C-05-03)`);
    }
  }
  return problems;
}

export async function main(argv: readonly string[]): Promise<number> {
  let root = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo' && argv[i + 1] !== undefined) root = resolve(argv[++i] as string);
    else {
      console.error(`cc:lock-verify: unknown argument ${argv[i]}\nusage: cc:lock-verify [--repo <dir>]`);
      return 2;
    }
  }
  let entries: ConnectorsLockEntry[];
  try {
    const parsed = connectorsLockSchema.safeParse(JSON.parse(readFileSync(join(root, 'connectors.lock'), 'utf8')));
    if (!parsed.success) {
      console.log('cc:lock-verify: FAIL  connectors.lock is not a valid lock; run pnpm cc:validate');
      return 1;
    }
    entries = parsed.data.entries;
  } catch (error) {
    console.log(`cc:lock-verify: FAIL  ${(error as Error).message}`);
    return 1;
  }
  const problems = await verifyEntries(entries);
  if (problems.length > 0) {
    console.log(`cc:lock-verify: FAIL  ${problems.length} of ${entries.length} entries`);
    for (const p of problems) console.log(`  ${p}`);
    return 1;
  }
  console.log(`cc:lock-verify: ok  ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} match their releases`);
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
