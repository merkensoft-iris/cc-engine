// A fixture engine UI: the default UI with one screen replaced (ADR 0008 decision 1).
import '@cc/ui/v1/app.css';
import { createApp } from '@cc/ui/v1';
import { home } from './screens/home.ts';

createApp({ screens: { home } }).start();
