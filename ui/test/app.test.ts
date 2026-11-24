/**
 * AC-08-11, the template's half: ui/app.ts, the composition root, runs the default UI as it is.
 * The module is started here as the app's page starts it, on a fake `window.cc` and a minimal
 * fake of the few DOM calls the UI kit's `mount` makes, so the test reads what it draws.
 */
import type { CcBridge, Route } from '@cc/ui-sdk/v1';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, HOME } from './harness.ts';

/** The parts of a DOM node `mount` touches, kept as a tree the test reads. */
interface FakeNode {
  readonly tag?: string;
  readonly text?: string;
  readonly dataset: Record<string, string>;
  readonly children: FakeNode[];
}

function fakeElement(tag: string): FakeNode & Record<string, unknown> {
  const children: FakeNode[] = [];
  return {
    tag,
    dataset: {},
    children,
    addEventListener: () => undefined,
    setAttribute: () => undefined,
    appendChild: (child: FakeNode) => children.push(child),
  };
}

function find(node: FakeNode | undefined, test: string): FakeNode | undefined {
  if (node === undefined) return undefined;
  if (node.dataset['test'] === test) return node;
  for (const child of node.children) {
    const found = find(child, test);
    if (found !== undefined) return found;
  }
  return undefined;
}

function textIn(node: FakeNode | undefined): string {
  if (node === undefined) return '';
  return node.text ?? node.children.map(textIn).join('');
}

describe('AC-08-11 the template composition root, ui/app.ts', () => {
  let drawn: FakeNode | undefined;
  let calls: string[];
  let onboarding: 'not_started' | 'committed';

  const bridge: CcBridge = {
    invoke: (method) => {
      calls.push(method);
      if (method === 'onboarding.status') return Promise.resolve({ state: onboarding });
      if (method === 'home.get') return Promise.resolve(HOME);
      return Promise.reject(apiError('E_USAGE', `no fake answer for ${method}`));
    },
    shell: () => Promise.resolve({ mode: { kind: 'normal' }, version: '0.0.0', apiVersion: 1 }),
    onNavigate: (_listener: (route: Route) => void) => () => undefined,
    rebuild: () => Promise.resolve({ kind: 'none' }),
    onRebuildState: () => () => undefined,
  };

  /** Starts ui/app.ts as the page does, and lets its first screen load. */
  async function startTemplateUi(): Promise<void> {
    vi.resetModules();
    await import('../app.ts');
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  beforeEach(() => {
    drawn = undefined;
    calls = [];
    // The meeting runner's clock; never let it fire during a test.
    vi.useFakeTimers({ toFake: ['setInterval'] });
    const app = { replaceChildren: (node: FakeNode) => (drawn = node) };
    vi.stubGlobal('document', {
      activeElement: null,
      getElementById: (id: string) => (id === 'app' ? app : null),
      createElement: (tag: string) => fakeElement(tag),
      createTextNode: (text: string) => ({ text, dataset: {}, children: [] }),
    });
    vi.stubGlobal('window', { cc: bridge });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('AC-08-11 on a fresh profile the first start opens the default onboarding', async () => {
    onboarding = 'not_started';
    await startTemplateUi();
    expect(calls[0]).toBe('onboarding.status');
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.slice(1).every((method) => method.startsWith('onboarding.'))).toBe(true);
    expect(drawn).toBeDefined();
  });

  it('AC-08-11 once onboarding is committed it opens the default Home, with no screen replaced', async () => {
    onboarding = 'committed';
    await startTemplateUi();
    expect(calls).toEqual(['onboarding.status', 'home.get']);
    expect(textIn(drawn)).toContain('Send the revised proposal');
    expect(find(drawn, 'example-banner')).toBeUndefined();
  });
});
