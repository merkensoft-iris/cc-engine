/**
 * The headless harness for this engine's UI tests, on what @cc/ui/v1 publishes for them: the
 * app frame `App`, whose rendering goes to a callback, and the queries that read its view trees
 * (`byTest`, `textOf`, ...). A fake local API answers each method from a table and records every
 * call; the latest view tree is kept for the test to read and click through. No window, no
 * Electron and no core: what a screen shows and which calls it makes, as the user would.
 *
 * Fictional data only (C-08-04).
 */
import { App, textOf, type AppOptions, type AppRoute, type VNode } from '@cc/ui/v1';

/** One fake method: its result, or a promise that rejects with an API error. */
export type Answer = (params: Record<string, unknown>) => unknown;

export interface Harness {
  readonly app: App;
  /** Every call, in order. */
  readonly calls: { readonly method: string; readonly params: Record<string, unknown> }[];
  /** The latest view tree. */
  tree(): VNode;
  /** The latest view's text. */
  text(): string;
  /** The params of every call of `method`. */
  callsOf(method: string): Record<string, unknown>[];
  /** Lets pending calls, reloads and renders finish. */
  settle(): Promise<void>;
}

/** A local API error, as `window.cc.invoke` rejects with it. */
export function apiError(code: string, message: string) {
  return { code, message, help: [] };
}

/** A fixed clock: 13 Nov 2026, 09:30 UTC. */
export const NOW = Date.parse('2026-11-13T09:30:00Z');

/** Opens `route` in the app frame with `screens` replacing default ones, against `answers`. */
export async function startApp(
  answers: Readonly<Record<string, Answer>>,
  route: AppRoute,
  screens?: AppOptions['screens'],
): Promise<Harness> {
  let last: VNode | undefined;
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const app = new App({
    ...(screens === undefined ? {} : { screens }),
    call: async (method, params) => {
      const record = (params ?? {}) as Record<string, unknown>;
      calls.push({ method, params: record });
      const answer = answers[method];
      if (answer === undefined) throw apiError('E_USAGE', `no fake answer for ${method}`);
      return answer(record);
    },
    render: (node) => {
      last = node;
    },
    now: () => NOW,
  });
  const settle = async () => {
    for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  };
  await app.go(route);
  await settle();
  return {
    app,
    calls,
    tree: () => {
      if (last === undefined) throw new Error('nothing rendered');
      return last;
    },
    text: () => (last === undefined ? '' : textOf(last)),
    callsOf: (method) => calls.filter((c) => c.method === method).map((c) => c.params),
    settle,
  };
}

/** Clicks a node and lets what it started finish. */
export async function click(harness: Harness, node: VNode): Promise<void> {
  const onClick = node.props.onClick;
  if (onClick === undefined) throw new Error(`<${node.tag}> has no click handler`);
  if (node.props.disabled === true) throw new Error(`<${node.tag}> is disabled`);
  onClick();
  await harness.settle();
}

/** What `home.get` answers for a fictional workspace. */
export const HOME = {
  workspace: 'main',
  now: '2026-11-13T15:00:00+05:30',
  today: [{ ref: 'M-0031', time: '15:00', title: 'Weekly review' }],
  attention: { overdue: 1, atRisk: 0, awaitingReview: 0, confirmationsPending: 0, sessionsNeedingYou: 0 },
  items: [{ ref: 'A-0142', title: 'Send the revised proposal', due: '2026-11-12', state: 'overdue' }],
  counts: { dueSoon: 2, open: 7 },
  backup: {
    state: 'ok',
    lastGood: { id: 'bkp_01KA0000000000000000000000', at: '2026-11-13T03:00:00.000Z', destination: 'Synced folder' },
  },
};
