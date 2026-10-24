// Transparent mechanism classifier. Each rule maps one measurement's deviation from the matched
// reference onto a signed score (+1 gain of function … −1 loss of function) using explicit
// decision boundaries. Confidence is estimated by re-classifying under seeded perturbations of
// every measurement by its standard error. Indeterminate outcomes are first-class.
import type {
  ClassificationRuleResult,
  FunctionalProfile,
  MeasurementKey,
  MechanismClass,
  MechanismClassification,
} from '../domain/types';
import { clamp, gaussian, rngFor } from './rng';

export const CLASSIFIER_VERSION = 'PRI-MECH rules v0.9 (illustrative)';

interface Rule {
  key: MeasurementKey;
  label: string;
  weight: number;
  /** deviation from reference */
  delta: (value: number, reference: number) => number;
  deltaUnit: string;
  /** signed score for a deviation */
  score: (delta: number) => number;
  boundary: string;
}

const ramp = (x: number, start: number, full: number) => clamp((x - start) / (full - start), 0, 1);

export const RULES: Rule[] = [
  {
    key: 'peakDensity',
    label: 'Peak current density',
    weight: 1.2,
    delta: (v, r) => (r !== 0 ? v / r : 1),
    deltaUnit: '× ref',
    score: (d) => -ramp(-d, -0.7, -0.3) + ramp(d, 1.4, 2.0),
    boundary: '< 0.70× → LoF (full at 0.30×) · > 1.40× → GoF (full at 2.0×)',
  },
  {
    key: 'vHalfAct',
    label: 'V½ activation shift',
    weight: 1.0,
    delta: (v, r) => v - r,
    deltaUnit: 'mV',
    score: (d) => ramp(-d, 3, 11) - ramp(d, 3, 11),
    boundary: '≤ −3 mV (hyperpolarised) → GoF · ≥ +3 mV → LoF (full at ±11 mV)',
  },
  {
    key: 'vHalfInact',
    label: 'V½ inactivation shift',
    weight: 0.9,
    delta: (v, r) => v - r,
    deltaUnit: 'mV',
    score: (d) => ramp(d, 3, 11) - ramp(-d, 3, 11),
    boundary: '≥ +3 mV (depolarised) → GoF · ≤ −3 mV → LoF (full at ±11 mV)',
  },
  {
    key: 'persistentPct',
    label: 'Persistent current',
    weight: 1.0,
    delta: (v, r) => (r > 0 ? v / r : 1),
    deltaUnit: '× ref',
    score: (d) => ramp(d, 1.8, 4.0),
    boundary: '> 1.8× → GoF (full at 4.0×) · no LoF contribution',
  },
  {
    key: 'tauRecovery',
    label: 'Recovery from inactivation',
    weight: 0.6,
    delta: (v, r) => (r > 0 ? v / r : 1),
    deltaUnit: '× ref',
    score: (d) => ramp(-d, -0.7, -0.4) - ramp(d, 1.4, 2.4),
    boundary: '< 0.70× (faster) → GoF · > 1.40× (slower) → LoF',
  },
];

export const THRESHOLDS = {
  /** |net| needed for a directional call */
  directional: 0.6,
  /** each side must exceed this to call 'mixed' */
  mixedEach: 0.6,
  /** total evidence below this → 'no significant deviation' */
  minEvidence: 0.3,
  /** perturbation agreement required to keep a directional or mixed call */
  minConfidence: 0.6,
  draws: 240,
};

interface CoreResult {
  mechanism: MechanismClass;
  net: number;
  gof: number;
  lof: number;
  rules: ClassificationRuleResult[];
}

function core(values: Record<MeasurementKey, { value: number; reference: number }>): CoreResult {
  let gof = 0;
  let lof = 0;
  const rules: ClassificationRuleResult[] = RULES.map((r) => {
    const { value, reference } = values[r.key];
    const delta = r.delta(value, reference);
    const score = r.score(delta);
    const w = score * r.weight;
    if (w > 0) gof += w;
    else lof += -w;
    return {
      key: r.key,
      label: r.label,
      delta,
      deltaUnit: r.deltaUnit,
      score,
      weight: r.weight,
      boundary: r.boundary,
      direction: score > 0.05 ? 'GoF' : score < -0.05 ? 'LoF' : 'neutral',
    };
  });
  const net = gof - lof;
  let mechanism: MechanismClass;
  if (gof >= THRESHOLDS.mixedEach && lof >= THRESHOLDS.mixedEach) mechanism = 'mixed';
  else if (net >= THRESHOLDS.directional) mechanism = 'GoF';
  else if (net <= -THRESHOLDS.directional) mechanism = 'LoF';
  else mechanism = 'indeterminate';
  return { mechanism, net, gof, lof, rules };
}

export function classify(variantId: string, profile: FunctionalProfile, opts: { priorOnly?: boolean } = {}): MechanismClassification {
  const point = {} as Record<MeasurementKey, { value: number; reference: number }>;
  for (const r of RULES) point[r.key] = { value: profile[r.key].value, reference: profile[r.key].reference };
  const base = core(point);

  // Seeded perturbation analysis.
  const rand = rngFor('classify', variantId);
  const counts: Record<MechanismClass, number> = { GoF: 0, LoF: 0, mixed: 0, indeterminate: 0 };
  for (let d = 0; d < THRESHOLDS.draws; d++) {
    const draw = {} as Record<MeasurementKey, { value: number; reference: number }>;
    for (const r of RULES) {
      const m = profile[r.key];
      // reference SE is small relative to variant SE; perturb both
      draw[r.key] = { value: m.value + gaussian(rand) * m.se, reference: m.reference + gaussian(rand) * m.se * 0.25 };
    }
    counts[core(draw).mechanism]++;
  }
  let mechanism = base.mechanism;
  let confidence = counts[mechanism] / THRESHOLDS.draws;
  let indeterminateReason: MechanismClassification['indeterminateReason'];

  if (opts.priorOnly) {
    indeterminateReason = 'insufficient-data';
    if (mechanism !== 'indeterminate' && confidence < 0.8) {
      mechanism = 'indeterminate';
      confidence = counts.indeterminate / THRESHOLDS.draws;
    }
  }
  if (mechanism !== 'indeterminate' && confidence < THRESHOLDS.minConfidence) {
    mechanism = 'indeterminate';
    indeterminateReason = 'low-confidence';
    confidence = 1 - confidence; // probability that a directional call would be unsupported
  } else if (mechanism === 'indeterminate' && !indeterminateReason) {
    indeterminateReason = base.gof + base.lof < THRESHOLDS.minEvidence ? 'no-significant-deviation' : 'low-confidence';
  }
  if (mechanism !== 'indeterminate') indeterminateReason = undefined;

  const limitations = [
    'Synthetic measurements from an illustrative gating model; not experimental data.',
    'Heterologous expression (HEK293T) may not reflect neuronal context, splice isoform or β-subunit composition.',
    'Rules weight biophysical parameters independently; neuronal excitability depends on their interaction.',
  ];
  if (base.mechanism === 'mixed' || mechanism === 'mixed') limitations.push('Opposing effects: net neuronal consequence cannot be inferred from channel parameters alone.');
  if (indeterminateReason === 'low-confidence') limitations.push('Effect sizes are near decision boundaries relative to measurement uncertainty.');
  if (indeterminateReason === 'insufficient-data') limitations.push('No direct functional measurement — classification based on regional computational prior only.');
  if (profile.peakDensity.n < 8) limitations.push(`Small sample (n = ${profile.peakDensity.n} cells).`);

  return {
    variantId,
    mechanism,
    netScore: base.net,
    gofEvidence: base.gof,
    lofEvidence: base.lof,
    confidence,
    rules: base.rules,
    limitations,
    indeterminateReason,
    modelVersion: CLASSIFIER_VERSION,
    category: 'illustrative',
  };
}
