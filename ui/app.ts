/**
 * The composition root of this engine's app UI (ADR 0008 decision 1; 08 §4.3 item 3).
 * `cc-build` bundles this file, and everything it imports, into the app; main serves it in the
 * page shell it keeps. As the template ships it, it runs the foundation's default UI as it is,
 * with the stylesheet of ui/styles/ after the default one.
 *
 * Replace a screen by naming it in `screens`; the screens you do not name stay the default
 * ones and keep updating with @cc/ui. For example, to use the example Home in ui/screens/:
 *
 *   import { exampleHome } from './screens/example-home.js';
 *   void createApp({ screens: { home: exampleHome } }).start();
 *
 * README.md, "Build your own UI or theme", walks through every level, from tokens to a UI of
 * your own.
 */
import '@cc/ui/v1/app.css';
import './styles/app.css';
import { createApp } from '@cc/ui/v1';

void createApp().start();
