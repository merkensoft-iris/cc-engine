/**
 * Extension API 1: the UI slots the foundation declares for engine widgets.
 *
 * Interim copy of the slot list `@cc/ui-sdk/v1` exports (ADR 0003 decision 5). The layout is
 * fixed by the foundation and engine widgets appear only in these slots (owner decision Q9,
 * 10 Nov 2026; 08 §4.3). These are the two slots ADR 0003's prototype proved in a hardened
 * renderer. More slots arrive with the renderer screens (P1-16 and the P1 UI steps) as an
 * additive change, which does not bump the extension API (ADR 0003 D-2).
 */
export const SLOT_IDS = ['home.header', 'home.aside'] as const;

export type SlotId = (typeof SLOT_IDS)[number];
