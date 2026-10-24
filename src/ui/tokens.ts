// Design tokens for code paths that need raw colour values (canvas, SVG, three.js).
// Tailwind exposes the same palette as utility colours (bg, surface, line, ink, mute, cyan, gof, lof, mixed, indet, warn).
import type { DataCategory, MechanismClass, ReuseClass } from '../domain/types';

export const C = {
  bg: '#080D12',
  canvas: '#05090D',
  surface: '#101922',
  surface2: '#16212B',
  line: '#253542',
  line2: '#1A2833',
  ink: '#E7EEF4',
  mute: '#8A9CA9',
  dim: '#5D6F7C',
  cyan: '#40D8D0',
  gof: '#DDA45A',
  lof: '#6D9AE9',
  mixed: '#A58CE3',
  indet: '#7D8790',
  warn: '#D76F72',
} as const;

export const MECH_COLOR: Record<MechanismClass, string> = {
  GoF: C.gof,
  LoF: C.lof,
  mixed: C.mixed,
  indeterminate: C.indet,
};

export const MECH_LABEL: Record<MechanismClass, string> = {
  GoF: 'Gain of function',
  LoF: 'Loss of function',
  mixed: 'Mixed',
  indeterminate: 'Indeterminate',
};

/** Reuse classes: colour + line style (used consistently in graph, timelines and legends). */
export const REUSE_STYLE: Record<ReuseClass, { color: string; label: string; dash: string; short: string }> = {
  reusable: { color: C.cyan, label: 'Reusable evidence', dash: '', short: 'REUSE' },
  'reuse-with-validation': { color: C.gof, label: 'Reusable with additional validation', dash: '6 3', short: 'VALIDATE' },
  'new-work': { color: C.ink, label: 'New work required', dash: '2 3', short: 'NEW' },
  'not-transferable': { color: C.warn, label: 'Not transferable', dash: '1 4', short: 'NO TRANSFER' },
};

export const CATEGORY_LABEL: Record<DataCategory, string> = {
  published: 'PUBLISHED',
  hypothetical: 'HYPOTHETICAL',
  simulated: 'SIMULATED',
  illustrative: 'ILLUSTRATIVE',
  assumption: 'ASSUMPTION',
};

/** Standard motion timings (seconds). Keep transitions consistent across modules. */
export const MOTION = {
  fast: 0.16,
  base: 0.28,
  slow: 0.6,
  camera: 1.4,
  ease: [0.22, 0.61, 0.36, 1] as [number, number, number, number],
};

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
