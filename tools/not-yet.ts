/**
 * Placeholder for engine scripts whose implementation arrives with a later build step
 * (cc-foundation docs/design/09-build-plan.md). They come from @cc/build (08 §6), so the
 * engine will hold no script code for them. Exits 1 so nothing mistakes a placeholder for success.
 */
const [, , name = 'this script', step = 'a later build step'] = process.argv;
console.error(`${name}: not available yet; it arrives with ${step} (cc-foundation docs/design/09-build-plan.md)`);
process.exitCode = 1;
