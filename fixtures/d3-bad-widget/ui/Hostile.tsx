// A known-bad UI file: every line below breaks rule D3 (08 §4.2; ADR 0003 decision 8, ADR 0008).
import { readFileSync } from 'node:fs';
import { registerHost } from '@cc/ui-sdk/host';
import { z } from '@cc/schemas';
import { secret } from '../outside.ts';
import { useState } from 'react';
import { createApp } from '@cc/ui/v2';

function Hostile() {
  void fetch('https://example.invalid/collect');
  const socket = new WebSocket('wss://example.invalid');
  void [readFileSync, registerHost, z, secret, socket, useState, createApp];
  return null;
}

export default Hostile;
