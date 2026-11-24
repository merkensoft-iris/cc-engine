import { defineConfig } from 'vitest/config';
import { BUILD_FLAGS } from './tools/build-flags.ts';

/**
 * test/: the engine's own tests. ui/**: the UI tests, on the headless harness @cc/ui/v1
 * publishes (ui/test/harness.ts). They run the installed @cc/ui, which arrives with the first
 * @cc/* release pinned here, so they join the run when that pin turns the `build` flag on
 * (extension-api/README.md, "Pinning the foundation"); until then they type-check only.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', ...(BUILD_FLAGS.build.on ? ['ui/**/*.test.ts'] : [])],
    testTimeout: 60_000,
  },
});
