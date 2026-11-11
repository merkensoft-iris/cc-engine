import type { EngineConfig } from '@cc/schemas/engine/v1';

export default {
  extensionApi: 1,
  modules: { scorecards: true },
  vocabulary: { goal: 'Rock' },
  calendars: {
    providers: ['google-calendar'],
    routes: [
      {
        workstreams: ['ws-alpha', 'ws-beta'],
        targets: [
          { binding: 'cal-main', calendar: 'Rhythm', role: 'primary' },
          { binding: 'cal-main', calendar: 'Team mirror', role: 'mirror', colour: '#0b6e4f' },
        ],
      },
    ],
  },
} satisfies EngineConfig;
