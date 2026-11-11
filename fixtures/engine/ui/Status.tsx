import { defineWidget, token } from '@cc/ui-sdk/v1';
import { label } from './label.ts';

function Status() {
  return <span style={{ color: token('color.accent') }}>{label('on track')}</span>;
}

export default defineWidget({ slot: 'home.aside', title: 'Status', component: Status });
