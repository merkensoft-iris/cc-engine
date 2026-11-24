/**
 * The example screen override, ui/screens/example-home.ts, on the headless harness: it shows
 * its banner above the default Home, and the screens it does not replace stay the default ones
 * (ADR 0008 decision 1).
 */
import { buttons, byTest, queryByTest, textOf } from '@cc/ui/v1';
import { describe, expect, it } from 'vitest';
import { exampleHome } from '../screens/example-home.ts';
import { apiError, click, HOME, startApp } from './harness.ts';

describe('the example Home override', () => {
  it('shows its banner above the default Home, which loads home.get as before', async () => {
    const harness = await startApp({ 'home.get': () => HOME }, { screen: 'home' }, { home: exampleHome });
    expect(textOf(byTest(harness.tree(), 'example-banner'))).toContain('check the scorecard before the weekly review');
    expect(harness.callsOf('home.get')).toEqual([{}]);
    // The default Home is drawn below the banner, with the app's own navigation around both.
    expect(harness.text()).toContain('Send the revised proposal');
    expect(harness.text()).toContain('Issues and risks');
  });

  it('opens the default Scorecard from its button', async () => {
    const harness = await startApp({ 'home.get': () => HOME }, { screen: 'home' }, { home: exampleHome });
    const [open] = buttons(byTest(harness.tree(), 'example-banner'), 'Open the scorecard');
    if (open === undefined) throw new Error('no Open the scorecard button');
    await click(harness, open);
    expect(harness.app.route).toEqual({ screen: 'scorecard' });
    expect(queryByTest(harness.tree(), 'example-banner')).toBeUndefined();
  });

  it('keeps the default screen for every route it does not replace', async () => {
    const harness = await startApp(
      { 'decisions.get': () => Promise.reject(apiError('E_NOT_FOUND', 'No decision D-0007')) },
      { screen: 'decisions', ref: 'D-0007' },
      { home: exampleHome },
    );
    expect(harness.callsOf('decisions.get')).toEqual([{ ref: 'D-0007' }]);
    expect(harness.text()).toContain('No decision D-0007');
    expect(queryByTest(harness.tree(), 'example-banner')).toBeUndefined();
  });

  it('shows the default load failure when Home cannot load, as the default Home does', async () => {
    const harness = await startApp(
      { 'home.get': () => Promise.reject(apiError('E_APP_NOT_RUNNING', 'Command Center is not running')) },
      { screen: 'home' },
      { home: exampleHome },
    );
    expect(textOf(byTest(harness.tree(), 'load-error'))).toContain('Command Center is not running');
  });
});
