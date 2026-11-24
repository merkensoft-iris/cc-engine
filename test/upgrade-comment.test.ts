import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commentBody, main, parseUiDrift } from '../tools/upgrade-comment.ts';

// Outputs in the shape `cc-upgrade --check` prints them (@cc/build README, src/upgrade.ts and
// src/eject.ts). Screen names and versions are fictional.
const DRIFT_ONLY = [
  'cc-upgrade --check: engine on extension API 1 (foundation 1.1.0); 1 ejected screen changed upstream',
  '  ejected screen home changed upstream (@cc/ui 1.0.0 -> 1.1.0):',
  '    ui/screens/home.ts: changed upstream (+1 -1 lines); changed here too, merges cleanly',
  '  run pnpm cc:ui-update locally to merge them',
  '',
].join('\n');

const CODEMODS_AND_DRIFT = [
  'cc-upgrade --check: engine on API 1, foundation 2.0.0 is on API 2: 3 edits in 2 files would be made, 0 need a person',
  '  API 1 -> 2: fixture step',
  '  cc.config.ts: 1 edit',
  '  ui/app.ts: 2 edits',
  '  run pnpm cc:upgrade locally to apply them (owner decision D-1)',
  '  2 ejected screens changed upstream:',
  '  ejected screen settings changed upstream (@cc/ui 1.0.0 -> 2.0.0):',
  '    ui/screens/settings.ts: changed upstream (+4 -2 lines); changed here too, merges with 1 conflict for a person',
  '    ui/screens/settings-parts.ts: added upstream (+30 -0 lines); new here, so taken as it is',
  '  ejected screen week: no longer a default screen of @cc/ui 2.0.0; pnpm cc:ui-update stops tracking it',
  '  run pnpm cc:ui-update locally to merge them',
  '',
].join('\n');

const UNRESOLVED = [
  'cc-upgrade --check: engine on extension API 1 (foundation 1.1.0); 1 site needs a person',
  '  ui/screens/home.ts:12 has an unresolved merge from cc:ui-update; resolve it',
  '',
].join('\n');

describe('the foundation update comment (08 §9, D-1) carries the UI drift (ADR 0008 decision 1)', () => {
  it('AC-08-10 an ejected screen changed upstream is listed per screen with its files', () => {
    const drift = parseUiDrift(DRIFT_ONLY);
    expect(drift.screens).toEqual([
      {
        name: 'home',
        heading: 'ejected screen home changed upstream (@cc/ui 1.0.0 -> 1.1.0):',
        files: ['ui/screens/home.ts: changed upstream (+1 -1 lines); changed here too, merges cleanly'],
      },
    ]);
    expect(drift.needsPerson).toBe(false);
    const body = commentBody(DRIFT_ONLY, '1');
    expect(body).toContain('#### UI drift: ejected screens');
    expect(body).toContain('- `home`: changed upstream (@cc/ui 1.0.0 -> 1.1.0)');
    expect(body).toContain('  - ui/screens/home.ts: changed upstream (+1 -1 lines); changed here too, merges cleanly');
    expect(body).toContain('`pnpm cc:ui-update` merges these cleanly.');
    expect(body).toContain('run `pnpm cc:ui-update`');
    expect(body).not.toContain('run `pnpm cc:upgrade`');
    expect(body).toContain('This PR merges as it is (owner decision D-1).');
  });

  it('AC-08-10 codemods and drift together: both are due, and a conflict is flagged for a person', () => {
    const drift = parseUiDrift(CODEMODS_AND_DRIFT);
    expect(drift.screens.map((s) => s.name)).toEqual(['settings', 'week']);
    expect(drift.screens[0]?.files).toHaveLength(2);
    expect(drift.needsPerson).toBe(true);
    const body = commentBody(CODEMODS_AND_DRIFT, '1');
    expect(body).toContain('run `pnpm cc:upgrade` to apply the codemod edits; run `pnpm cc:ui-update`');
    expect(body).toContain('- `week`: no longer a default screen of @cc/ui 2.0.0; pnpm cc:ui-update stops tracking it');
    expect(body).toContain('will leave conflict markers for a person');
    // The codemod lines stay in the output only, not in the drift list.
    expect(body.split('<details>')[0]).not.toContain('ui/app.ts: 2 edits');
    expect(body.split('<details>')[1]).toContain('ui/app.ts: 2 edits');
  });

  it('AC-08-10 an unresolved merge left in an ejected screen is listed and needs a person', () => {
    const drift = parseUiDrift(UNRESOLVED);
    expect(drift.screens).toEqual([]);
    expect(drift.unresolved).toEqual(['ui/screens/home.ts:12 has an unresolved merge from cc:ui-update; resolve it']);
    const body = commentBody(UNRESOLVED, '1');
    expect(body).toContain('resolve the merge left in the ejected screens');
    expect(body).toContain('- ui/screens/home.ts:12 has an unresolved merge');
  });

  it('D-1 nothing to do says so, with no drift', () => {
    const log = 'cc-upgrade --check: ok  engine already on extension API 1 (foundation 1.0.0); nothing to do\n';
    const body = commentBody(log, '0');
    expect(body).toContain('Nothing to do');
    expect(body).toContain('No ejected screen changed upstream');
  });

  it('D-1 a check that did not finish says so and shows no drift section', () => {
    const body = commentBody(undefined, 'none');
    expect(body).toContain('did not finish (exit none)');
    expect(body).not.toContain('UI drift');
    expect(body).toContain('(no output)');
  });

  it('D-1 a fence line in the output cannot close the comment\'s code block', () => {
    expect(commentBody('cc-upgrade --check: x\n~~~~\n', '1')).not.toMatch(/~~~~\n~~~~/);
  });

  it('D-1 the script reads the log and the exit code, and a usage error exits 2', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-upgrade-comment-'));
    writeFileSync(join(dir, 'log'), DRIFT_ONLY);
    const writes: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      writes.push(chunk);
      return true;
    }) as typeof process.stdout.write;
    try {
      expect(main([join(dir, 'log'), '1\n'])).toBe(0);
    } finally {
      process.stdout.write = original;
    }
    expect(writes.join('')).toContain('- `home`:');
    expect(main([])).toBe(2);
  });
});
