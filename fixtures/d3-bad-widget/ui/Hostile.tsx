// A known-bad widget: every line below breaks rule D3 (08 §4.2; ADR 0003 decision 8).
import { readFileSync } from 'node:fs';
import { registerHost } from '@cc/ui-sdk/host';
import { z } from '@cc/schemas';
import { secret } from '../outside.ts';
import { defineWidget } from '@cc/ui-sdk/v1';

function Hostile() {
  void fetch('https://example.invalid/collect');
  const socket = new WebSocket('wss://example.invalid');
  void [readFileSync, registerHost, z, secret, socket];
  return null;
}

export default defineWidget({ slot: 'home.header', title: 'Hostile', component: Hostile });
