import { h } from '@cc/ui/v1';
import { token, type Screen } from '@cc/ui-sdk/v1';
import { label } from '../label.ts';

export const home: Screen<{ readonly status: string }, unknown> = {
  load: async () => ({ status: 'on track' }),
  view: (state) => h('p', { style: `color: ${token('color.accent')}` }, label(state.status)),
};
