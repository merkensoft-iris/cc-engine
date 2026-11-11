import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkExtensionApi,
  connectorsLockSchema,
  engineConfigSchema,
  themeTokensSchema,
  type ConnectorsLockEntry,
} from '../extension-api/v1/engine.ts';
import { cssVariableName, TOKEN_PATHS } from '../extension-api/v1/tokens.ts';
import { main as genSchemas } from '../tools/gen-schemas.ts';
import { verifyEntries } from '../tools/lock-verify.ts';
import { validate } from '../tools/validate.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function copyOfFixtureEngine(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cc-ext-'));
  dirs.push(dir);
  cpSync(join(ROOT, 'fixtures', 'engine'), dir, { recursive: true });
  return dir;
}

const failed = async (root: string) => (await validate(root)).filter((s) => !s.ok);

describe('cc:validate on whole engines (C-08-08)', () => {
  it('C-08-08 the template engine passes cc:validate', async () => {
    expect(await failed(ROOT)).toEqual([]);
  });

  it('C-08-08 the fixture engine, with every extension point filled in, passes cc:validate', async () => {
    expect(await failed(join(ROOT, 'fixtures', 'engine'))).toEqual([]);
  });

  it('C-08-08 an engine on an unsupported extension API is refused with what to do (ADR 0003 decision 1)', async () => {
    const dir = copyOfFixtureEngine();
    writeFileSync(join(dir, 'cc.config.ts'), 'export default { extensionApi: 2 };\n');
    const [section] = await failed(dir);
    expect(section?.problems.join('\n')).toContain('set extensionApi to 1');
    expect(checkExtensionApi(0)).toContain('upgrade one foundation major at a time');
  });

  it('C-08-08 cc.config.ts may import types only while the @cc/* packages are not pinned', async () => {
    const dir = copyOfFixtureEngine();
    writeFileSync(join(dir, 'cc.config.ts'), "import { x } from 'some-package';\nexport default { extensionApi: 1, modules: { a: x } };\n");
    const [section] = await failed(dir);
    expect(section?.problems.join('\n')).toContain('may import types only');
  });
});

describe('cc.config schema, extension API 1', () => {
  const route = (targets: unknown[], workstreams: unknown = 'all') => ({
    extensionApi: 1,
    calendars: { providers: ['google-calendar'], routes: [{ workstreams, targets }] },
  });

  it('C-08-08 a route needs exactly one primary target (02 §9.6 rule 4)', () => {
    const two = route([
      { binding: 'a', calendar: 'A', role: 'primary' },
      { binding: 'b', calendar: 'B', role: 'primary' },
    ]);
    expect(JSON.stringify(engineConfigSchema.safeParse(two).error?.issues)).toContain('exactly one primary target per route (found 2)');
  });

  it('C-08-08 calendars and bindings are labels, never accounts or email addresses (02 §9.6 rule 1)', () => {
    const r = engineConfigSchema.safeParse(route([{ binding: 'a', calendar: 'someone@example.invalid', role: 'primary' }]));
    expect(JSON.stringify(r.error?.issues)).toContain('must be a label, not an account or email address');
  });

  it('C-08-08 workstreams are keys, never names', () => {
    const r = engineConfigSchema.safeParse(route([{ binding: 'a', calendar: 'A', role: 'primary' }], ['Client Work']));
    expect(JSON.stringify(r.error?.issues)).toContain('workstream keys, never names');
  });

  it('C-08-08 unknown keys and empty vocabulary are refused', () => {
    expect(engineConfigSchema.safeParse({ extensionApi: 1, layout: 'wide' }).success).toBe(false);
    expect(engineConfigSchema.safeParse({ extensionApi: 1, vocabulary: { goal: ' ' } }).success).toBe(false);
    expect(engineConfigSchema.safeParse({ extensionApi: 1, vocabulary: { goal: 'Rock' } }).success).toBe(true);
  });
});

describe('theme tokens, extension API 1 (owner decision Q9)', () => {
  const tokens = (group: string, name: string, value: string) => ({ [group]: { [name]: { $value: value } } });

  it('C-08-08 token values follow the closed grammar, so no value can inject CSS or load a URL', () => {
    for (const [group, name, value] of [
      ['color', 'accent', 'red;}body{background:url(https://example.invalid)}'],
      ['color', 'accent', 'url(https://example.invalid/x.png)'],
      ['font', 'body', 'x; @import url(https://example.invalid/f.css)'],
      ['radius', 'small', '4px;}'],
      ['density', 'scale', 'roomy'],
    ] as const) {
      expect(themeTokensSchema.safeParse(tokens(group, name, value)).success, value).toBe(false);
    }
    expect(themeTokensSchema.safeParse(tokens('font', 'body', '"Inter", system-ui, sans-serif')).success).toBe(true);
  });

  it('C-08-08 only colours, fonts, radius and density exist: layout tokens are refused', () => {
    expect(themeTokensSchema.safeParse({ spacing: { gutter: { $value: '8px' } } }).success).toBe(false);
    expect(themeTokensSchema.safeParse(tokens('color', 'sidebarWidth', '#fff')).success).toBe(false);
    expect(TOKEN_PATHS.every((p) => /^(?:color|font|radius|density)\./.test(p))).toBe(true);
    expect(cssVariableName('color.textMuted')).toBe('--cc-color-text-muted');
  });
});

describe('connectors.lock format (05 §15.6)', () => {
  const entry = (over: Partial<ConnectorsLockEntry> = {}): ConnectorsLockEntry => ({
    id: 'demo-calendar',
    kind: 'connector',
    version: '1.0.0',
    source: { kind: 'repo', repo: 'example-owner/example-connectors', tag: 'v1.0.0', url: 'https://example.invalid/a.tgz' },
    sha256: 'a'.repeat(64),
    permissionsDigest: 'b'.repeat(64),
    ...over,
  });

  it('C-08-09 a lock entry pins an exact version, a sha256 and a permissions digest', () => {
    expect(connectorsLockSchema.safeParse({ lockVersion: 1, entries: [entry()] }).success).toBe(true);
    expect(connectorsLockSchema.safeParse({ lockVersion: 1, entries: [entry({ version: '^1.0.0' })] }).success).toBe(false);
    expect(connectorsLockSchema.safeParse({ lockVersion: 1, entries: [entry({ sha256: 'xyz' })] }).success).toBe(false);
    expect(connectorsLockSchema.safeParse({ lockVersion: 2, entries: [] }).success).toBe(false);
    const http = entry({ source: { kind: 'repo', repo: 'o/r', tag: 't', url: 'http://example.invalid/a.tgz' } });
    expect(connectorsLockSchema.safeParse({ lockVersion: 1, entries: [http] }).success).toBe(false);
  });

  it('C-08-09 a connector appears in the lock at most once', () => {
    const r = connectorsLockSchema.safeParse({ lockVersion: 1, entries: [entry(), entry({ version: '1.1.0' })] });
    expect(JSON.stringify(r.error?.issues)).toContain('appears more than once');
  });

  it('C-05-03 cc:lock-verify passes a matching pin, fails a mismatched one, and fails closed on index entries', async () => {
    const bytes = new TextEncoder().encode('fixture package');
    const sha = createHash('sha256').update(bytes).digest('hex');
    const get = async () => bytes;
    expect(await verifyEntries([entry({ sha256: sha })], get)).toEqual([]);
    expect((await verifyEntries([entry()], get)).join('\n')).toContain('the lock pins');
    expect((await verifyEntries([entry({ source: { kind: 'index', publisher: 'cc' } })], get)).join('\n')).toContain('P5');
  });
});

describe('rule D3 for engine ui/ (ADR 0003 decision 8)', () => {
  it('C-08-02 a known-bad widget fails cc:validate, naming every forbidden import and global', async () => {
    const sections = await validate(join(ROOT, 'fixtures', 'd3-bad-widget'));
    const d3 = sections.find((s) => s.name === 'ui/ (D3)');
    const text = d3?.problems.join('\n') ?? '';
    expect(d3?.ok).toBe(false);
    for (const needle of ['imports node:fs', 'imports @cc/ui-sdk/host', 'imports @cc/schemas;', 'outside ui/', 'uses fetch', 'uses WebSocket']) {
      expect(text, needle).toContain(needle);
    }
  });

  it('C-08-02 a ui/ file esbuild cannot parse fails closed instead of passing unchecked', async () => {
    const dir = copyOfFixtureEngine();
    writeFileSync(join(dir, 'ui', 'Broken.tsx'), 'export default function (\n');
    const d3 = (await validate(dir)).find((s) => s.name === 'ui/ (D3)');
    expect(d3?.ok).toBe(false);
  });
});

describe('generated JSON Schemas', () => {
  it('C-08-03 the JSON Schemas in extension-api/v1 match their zod schemas (cc:schemas --check)', () => {
    expect(genSchemas(['--check'])).toBe(0);
  });
});
