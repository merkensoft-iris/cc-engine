/**
 * An example screen override (ADR 0008 decision 1): Home as the default UI draws it, with a
 * banner of this engine's own above it. ui/app.ts does not use it yet, so the app runs the
 * default UI as it is; to use it, name it in ui/app.ts:
 *
 *   createApp({ screens: { home: exampleHome } })
 *
 * It wraps the default screen instead of copying it, so Home's own content keeps updating with
 * @cc/ui. To change Home's own content, eject it instead (`pnpm cc:eject home`). Its styles
 * are in ui/styles/app.css; its tests are in ui/test/example-home.test.ts.
 */
import { h, homeScreen, type Screen } from '@cc/ui/v1';

/** What the default Home loads, whatever the installed @cc/ui says it is. */
type HomeState = Awaited<ReturnType<typeof homeScreen.load>>;

export const exampleHome: Screen<HomeState> = {
  load: (ui, route) => homeScreen.load(ui, route),
  view: (state, ui, route) =>
    h(
      'div',
      { class: 'example-home', test: 'example-home' },
      h(
        'section',
        { class: 'example-banner', test: 'example-banner' },
        h('p', null, 'This week: check the scorecard before the weekly review.'),
        h(
          'button',
          { type: 'button', class: 'secondary', onClick: () => ui.go({ screen: 'scorecard' }) },
          'Open the scorecard',
        ),
      ),
      homeScreen.view(state, ui, route),
    ),
};
