// Virtual screening — SIMULATED.
//
// A 96-well plate (8 rows × 12 columns) is laid out as:
//   row A : reference (4) | untreated variant (4) | vehicle control (4)
//   rows B–H : one candidate per row, 4 doses × 3 replicates
//
// Each well's response is computed from the illustrative gating model (sim/channel.ts): the
// variant parameter set is perturbed with `withEffect` by a deterministic Hill-type dose response
// scaled by the candidate's LATENT true effect — a seeded draw around its predicted effect that is
// sometimes far below it, so good illustrative scores do not guarantee a hit. Seeded well-level
// noise is then applied. Everything is deterministic: same inputs → identical plate and outcomes.
//
// No wet-lab data are involved and nothing here is an efficacy or safety prediction.
import type {
  Candidate,
  ChannelParams,
  GeneticVariant,
  MeasurementKey,
  ScreeningOutcome,
  ScreeningResult,
  ScreeningRun,
  TherapeuticStrategy,
  UncertaintyRange,
  Well,
} from '../domain/types';
import { CELL_SYSTEM, REFERENCE_PARAMS, approximateFit, withEffect } from './channel';
import { clamp, gaussian, hashSeed, rngFor } from './rng';

export const SCREENING_PROTOCOL_VERSION = 'PRI-VS v0.3';

export const PLATE_ROWS = 8;
export const PLATE_COLS = 12;
export const ROW_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** Dose series (nM, illustrative) and replicates per dose. */
export const DOSE_SERIES = [10, 30, 100, 300];
export const REPLICATES = 3;
export const MAX_CANDIDATES_PER_PLATE = PLATE_ROWS - 1;

export const SCREENING_NOTE =
  'SIMULATED screen. Responses are computed from an illustrative gating model, not measured. Concentrations, cell counts and variability are schematic.';

/** Decision thresholds, surfaced in the UI so outcomes are never unexplained. */
export const SCREEN_THRESHOLDS = {
  /** rescue fraction at top dose required for a pass */
  passRescue: 0.6,
  /** rescue fraction below which a candidate fails */
  failRescue: 0.25,
  /** candidate model uncertainty above which no call is made */
  maxUncertainty: 0.42,
  /** width of the rescue-fraction interval above which no call is made */
  maxIntervalWidth: 0.5,
  /** within-dose coefficient of variation tolerated for a pass */
  maxCv: 0.15,
  /** rescue fraction above which the response overshoots the reference level */
  overshoot: 1.25,
};

export const wellId = (row: number, col: number) => `${ROW_LETTERS[row]}${String(col + 1).padStart(2, '0')}`;

export const measurementKeyFor = (strategy: TherapeuticStrategy): MeasurementKey =>
  strategy.actsOn === 'persistentFrac' ? 'persistentPct' : 'peakDensity';

export const MEASUREMENT_UNIT: Record<string, string> = { peakDensity: 'pA/pF', persistentPct: '% of peak' };

/** Human-readable plate identifier derived from the run seed (deterministic). */
export const plateId = (seed: number) => `PL-${seed.toString(16).toUpperCase().padStart(8, '0').slice(-6)}`;

interface Latent {
  /** asymptotic fractional change in the targeted parameter actually achieved */
  trueEffect: number;
  ec50Nm: number;
  hill: number;
  /** trueEffect / predictedEffect.mid */
  attenuation: number;
  cv: number;
}

function latentFor(seedParts: (string | number)[], candidate: Candidate): Latent {
  const rand = rngFor(...seedParts, 'latent', candidate.id);
  const quality = 0.5 * candidate.bindingScore + 0.5 * candidate.specificityScore;
  // Poor illustrative scores and high model uncertainty raise the chance that the real effect is
  // far below the prediction — but the relationship is probabilistic, not deterministic.
  const pShortfall = clamp(0.58 - 0.5 * quality + 0.55 * candidate.uncertainty, 0.05, 0.82);
  const u = rand();
  const attenuation = u < pShortfall ? 0.04 + 0.26 * rand() : 0.58 + 0.62 * rand();
  return {
    trueEffect: candidate.predictedEffect.mid * attenuation,
    ec50Nm: Math.round(18 + 150 * rand()),
    hill: 0.9 + 0.9 * rand(),
    attenuation,
    cv: 0.055 + 0.08 * candidate.uncertainty + (u < pShortfall ? 0.03 : 0),
  };
}

const hill = (doseNm: number, l: Latent) => {
  const d = Math.pow(doseNm, l.hill);
  return d / (d + Math.pow(l.ec50Nm, l.hill));
};

/** Fractional change in the targeted parameter produced at a dose (illustrative). */
export const effectAtDose = (doseNm: number, l: Latent) => l.trueEffect * hill(doseNm, l);

const measure = (params: ChannelParams, key: MeasurementKey): number => approximateFit(params)[key];

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** Deterministic simulated 96-well screen of the given candidates against a variant. */
export function runScreening(
  patientId: string,
  variant: GeneticVariant,
  strategy: TherapeuticStrategy,
  candidates: Candidate[],
  now: number,
): ScreeningRun {
  const used = candidates.slice(0, MAX_CANDIDATES_PER_PLATE);
  const key = measurementKeyFor(strategy);
  const seed = hashSeed('screen', SCREENING_PROTOCOL_VERSION, patientId, variant.id, strategy.id, ...used.map((c) => c.id));
  const seedParts: (string | number)[] = ['screen', patientId, variant.id, strategy.id];

  const refTruth = measure(REFERENCE_PARAMS, key);
  const varTruth = measure(variant.params, key);

  const noisy = (base: number, id: string, cv: number) => {
    const r = rngFor('well', seed, id);
    return base * (1 + gaussian(r) * cv);
  };

  const plate: Well[] = [];

  // Row A — controls.
  for (let col = 0; col < PLATE_COLS; col++) {
    const id = wellId(0, col);
    const kind: Well['kind'] = col < 4 ? 'reference' : col < 8 ? 'untreated-variant' : 'vehicle';
    const base = kind === 'reference' ? refTruth : varTruth;
    // The vehicle control carries the same biology as the untreated variant plus handling noise.
    const cv = kind === 'vehicle' ? 0.06 : 0.05;
    plate.push({ id, row: 0, col, kind, response: noisy(base, id, cv), replicate: (col % 4) + 1 });
  }

  // Rows B… — one candidate per row, doses left → right.
  const latents = new Map<string, Latent>();
  for (let i = 0; i < used.length; i++) {
    const c = used[i];
    const l = latentFor(seedParts, c);
    latents.set(c.id, l);
    const row = i + 1;
    for (let col = 0; col < PLATE_COLS; col++) {
      const doseIdx = Math.floor(col / REPLICATES);
      const doseNm = DOSE_SERIES[doseIdx];
      const params = withEffect(variant.params, strategy.actsOn, effectAtDose(doseNm, l));
      const id = wellId(row, col);
      plate.push({
        id,
        row,
        col,
        kind: 'candidate',
        candidateId: c.id,
        doseNm,
        response: noisy(measure(params, key), id, l.cv),
        replicate: (col % REPLICATES) + 1,
      });
    }
  }

  // Unused rows stay empty so the plate geometry is always 96 wells.
  for (let row = used.length + 1; row < PLATE_ROWS; row++) {
    for (let col = 0; col < PLATE_COLS; col++) plate.push({ id: wellId(row, col), row, col, kind: 'empty' });
  }

  const responses = (pred: (w: Well) => boolean) => plate.filter((w) => pred(w) && w.response !== undefined).map((w) => w.response!);
  const refVals = responses((w) => w.kind === 'reference');
  const untrVals = responses((w) => w.kind === 'untreated-variant');
  const vehVals = responses((w) => w.kind === 'vehicle');
  const referenceMean = mean(refVals);
  const untreatedMean = mean(untrVals);
  const vehicleMean = mean(vehVals);
  const untreatedSe = sd(untrVals) / Math.sqrt(Math.max(1, untrVals.length));
  const referenceSe = sd(refVals) / Math.sqrt(Math.max(1, refVals.length));
  const gap = referenceMean - untreatedMean;
  // If the control separation is not large relative to replicate variability, this endpoint
  // cannot resolve any intervention and no candidate may be called.
  const controlNoise = Math.sqrt(referenceSe ** 2 + untreatedSe ** 2);
  const unresolvableGap = Math.abs(gap) < 3 * controlNoise;
  const unit = MEASUREMENT_UNIT[key] ?? '';

  const results: ScreeningResult[] = used.map((c) => {
    const doseResponse = DOSE_SERIES.map((doseNm) => {
      const vals = responses((w) => w.candidateId === c.id && w.doseNm === doseNm);
      return { doseNm, mean: mean(vals), sd: sd(vals), n: vals.length };
    });
    const top = doseResponse[doseResponse.length - 1];
    const topSe = top.sd / Math.sqrt(Math.max(1, top.n));
    const midRescue = gap !== 0 ? (top.mean - untreatedMean) / gap : 0;
    const se = Math.abs(gap) > 0 ? Math.sqrt(topSe ** 2 + untreatedSe ** 2) / Math.abs(gap) : 1;
    const rescueFraction: UncertaintyRange = {
      low: midRescue - 1.96 * se,
      mid: midRescue,
      high: midRescue + 1.96 * se,
      basis: '95% CI from replicate variability (simulated)',
    };

    // Monotonicity: each successive dose should move further toward the reference.
    // Steps are normalised by the reference–variant gap, so a positive step is movement toward
    // the reference regardless of the sign of the measurement.
    const MONOTONIC_TOL = 0.03;
    let violations = 0;
    for (let k = 1; k < doseResponse.length; k++) {
      const step = (doseResponse[k].mean - doseResponse[k - 1].mean) / (gap || 1);
      if (step < -MONOTONIC_TOL) violations++;
    }
    const cvMax = Math.max(...doseResponse.map((d) => (d.mean !== 0 ? d.sd / Math.abs(d.mean) : 1)));
    const intervalWidth = rescueFraction.high - rescueFraction.low;

    let outcome: ScreeningOutcome;
    let outcomeReason: string;
    const T = SCREEN_THRESHOLDS;
    if (unresolvableGap) {
      outcome = 'excluded-uncertainty';
      outcomeReason = `No call possible: the reference–variant separation on this endpoint (${Math.abs(gap).toFixed(1)} ${unit}) is not large relative to control variability (±${controlNoise.toFixed(1)} ${unit} SEM). The endpoint cannot resolve an intervention for this variant.`;
    } else if (c.uncertainty >= T.maxUncertainty) {
      outcome = 'excluded-uncertainty';
      outcomeReason = `Excluded before interpretation: candidate model uncertainty ${c.uncertainty.toFixed(2)} ≥ ${T.maxUncertainty}. The simulated response cannot be attributed to the design.`;
    } else if (intervalWidth > T.maxIntervalWidth) {
      outcome = 'excluded-uncertainty';
      outcomeReason = `Excluded: rescue-fraction interval ${(intervalWidth * 100).toFixed(0)} percentage points wide (> ${(T.maxIntervalWidth * 100).toFixed(0)}) at n = ${top.n} per dose. Replicate variability dominates the effect.`;
    } else if (midRescue > T.overshoot) {
      outcome = 'mixed';
      outcomeReason = `Overshoot: top-dose response is ${(midRescue * 100).toFixed(0)}% of the reference–variant gap, i.e. beyond the reference level. Exceeding reference function is itself a risk, not a success.`;
    } else if (midRescue >= T.passRescue && violations === 0 && cvMax <= T.maxCv) {
      outcome = 'pass';
      outcomeReason = `Monotonic dose response; ${(midRescue * 100).toFixed(0)}% of the reference–variant gap recovered at ${top.doseNm} nM (≥ ${(T.passRescue * 100).toFixed(0)}%), within-dose CV ≤ ${(T.maxCv * 100).toFixed(0)}%.`;
    } else if (midRescue >= T.passRescue) {
      outcome = 'mixed';
      outcomeReason = violations > 0
        ? `Rescue reaches ${(midRescue * 100).toFixed(0)}% but the dose response is non-monotonic (${violations} reversal${violations > 1 ? 's' : ''}); the concentration–effect relationship is not established.`
        : `Rescue reaches ${(midRescue * 100).toFixed(0)}% but within-dose variability is high (CV ${(cvMax * 100).toFixed(0)}% > ${(T.maxCv * 100).toFixed(0)}%).`;
    } else if (midRescue >= T.failRescue) {
      outcome = 'mixed';
      outcomeReason = `Partial rescue only: ${(midRescue * 100).toFixed(0)}% of the gap recovered at ${top.doseNm} nM (pass bar ${(T.passRescue * 100).toFixed(0)}%)${violations > 0 ? `; dose response non-monotonic` : ''}.`;
    } else {
      outcome = 'fail';
      outcomeReason = `No meaningful rescue: ${(midRescue * 100).toFixed(0)}% of the gap recovered at ${top.doseNm} nM (< ${(T.failRescue * 100).toFixed(0)}%). Simulated effect is far below the predicted effect for this design.`;
    }

    return {
      candidateId: c.id,
      patientId,
      variantId: variant.id,
      measurementKey: key,
      doseResponse,
      referenceMean,
      untreatedMean,
      vehicleMean,
      rescueFraction,
      outcome,
      outcomeReason,
      category: 'simulated',
    };
  });

  return {
    id: `VS-${patientId}-${String(seed % 10000).padStart(4, '0')}`,
    patientId,
    variantId: variant.id,
    candidateIds: used.map((c) => c.id),
    plate,
    results,
    protocolVersion: SCREENING_PROTOCOL_VERSION,
    completedAt: now,
    seed,
  };
}

/** Experiment metadata for the screening metadata panel. */
export function screeningMetadata(run: ScreeningRun) {
  return [
    { k: 'Run', v: run.id },
    { k: 'Plate', v: plateId(run.seed) },
    { k: 'Protocol', v: run.protocolVersion },
    { k: 'Cell system', v: CELL_SYSTEM },
    { k: 'Format', v: `${PLATE_ROWS} × ${PLATE_COLS} · ${DOSE_SERIES.length} doses × ${REPLICATES} replicates` },
    { k: 'Dose series', v: `${DOSE_SERIES.join(' · ')} nM` },
    { k: 'Seed', v: `0x${run.seed.toString(16).toUpperCase()}` },
    { k: 'Candidates', v: String(run.candidateIds.length) },
  ];
}

export const resultFor = (run: ScreeningRun, candidateId: string | null | undefined) =>
  candidateId ? run.results.find((r) => r.candidateId === candidateId) : undefined;

export const OUTCOME_LABEL: Record<ScreeningOutcome, string> = {
  pass: 'PASS',
  mixed: 'MIXED',
  fail: 'FAIL',
  'excluded-uncertainty': 'EXCLUDED · UNCERTAINTY',
};
