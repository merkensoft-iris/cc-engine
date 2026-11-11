/**
 * This Command Center's configuration (08 §4.3 item 1), validated by the foundation at build
 * and at start. Run `pnpm cc:validate` to check it.
 *
 * `extensionApi` names the extension API this engine is written against (ADR 0003). Every
 * field below it is optional; leave one out to take the foundation's default. Use workstream
 * keys and binding labels here, never names, accounts or email addresses (02 §9.6): this
 * file is committed.
 */
import type { EngineConfig } from '@cc/schemas/engine/v1';

export default {
  extensionApi: 1,

  // modules: { <module id>: true | false },
  // vocabulary: { goal: 'Rock', action: 'To-do' },
  // frameworkParameters: { 'eos-lite': { <parameter>: <value> } },
  // calendars: {
  //   providers: ['google-calendar'],
  //   routes: [{ workstreams: 'all', targets: [{ binding: 'gcal-main', calendar: 'Rhythm', role: 'primary' }] }],
  // },
} satisfies EngineConfig;
