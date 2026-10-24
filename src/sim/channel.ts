// Illustrative deterministic NaV1.2 gating model and voltage-clamp simulator.
//
// Hodgkin–Huxley-style formulation: I = ḡ · m³ · [(1 − p)·h + p] · (V − E_Na)
//   m — activation gate, h — inactivation gate, p — non-inactivating (persistent) fraction.
// Gates relax exponentially toward Boltzmann steady states with voltage-dependent time constants;
// integration uses the exact exponential update per time step, so results are deterministic.
//
// This is a teaching-grade model with parameters chosen to be broadly consistent with published
// NaV1.2 heterologous-expression biophysics. It is NOT fitted to any specific dataset.
import type {
  ChannelParams,
  ExperimentalProtocol,
  FunctionalMeasurement,
  FunctionalProfile,
  MeasurementKey,
  ProtocolId,
  Trace,
} from '../domain/types';
import { gaussian, rngFor } from './rng';

export const MODEL_VERSION = 'NAV-HH-ILLUSTRATIVE v1.2';
export const E_NA = 60; // mV
const DT = 0.02; // ms integration step
const SAMPLE_EVERY = 5; // store one sample per 0.1 ms

export const REFERENCE_PARAMS: ChannelParams = {
  gmaxScale: 1,
  vHalfAct: -38,
  kAct: 7,
  vHalfInact: -62,
  kInact: 6.5,
  tauInact: 0.7,
  tauRecovery: 5.5,
  persistentFrac: 0.005,
};

export const CELL_SYSTEM = 'HEK293T · transient SCN2A cDNA (illustrative)';
export const PROTOCOL_SUITE_VERSION = 'PRI-VC v1.0';

// ─── Gate kinetics ───────────────────────────────────────────────────────

const mInf = (v: number, p: ChannelParams) => 1 / (1 + Math.exp(-(v - p.vHalfAct) / p.kAct));
const hInf = (v: number, p: ChannelParams) => 1 / (1 + Math.exp((v - p.vHalfInact) / p.kInact));
const tauM = (v: number) => 0.03 + 0.35 * Math.exp(-(((v + 38) / 22) ** 2));
const tauH = (v: number, p: ChannelParams) =>
  p.tauInact + (p.tauRecovery - p.tauInact) / (1 + Math.exp((v + 55) / 9));

// Conductance density calibrated once so the reference peak is ≈ −260 pA/pF at its I–V minimum.
let G_BAR = 1;

// ─── Protocols ───────────────────────────────────────────────────────────

const range = (a: number, b: number, step: number) => {
  const out: number[] = [];
  for (let x = a; step > 0 ? x <= b : x >= b; x += step) out.push(x);
  return out;
};

const RECOVERY_INTERVALS = [0.5, 1, 2, 3, 5, 8, 12, 20, 30, 50, 80];

export const PROTOCOLS: Record<ProtocolId, ExperimentalProtocol> = {
  activation: {
    id: 'activation',
    name: 'Activation (I–V / G–V)',
    version: `${PROTOCOL_SUITE_VERSION} · ACT`,
    description: 'Hold −120 mV; 20 ms test steps −80 to +40 mV in 5 mV increments.',
    holdingMv: -120,
    sweeps: range(-80, 40, 5).map((v) => ({
      label: `${v} mV`,
      segments: [{ durMs: 2, mv: -120 }, { durMs: 20, mv: v }, { durMs: 3, mv: -120 }],
    })),
    measureSegment: 1,
    cellSystem: CELL_SYSTEM,
    temperatureC: 22,
  },
  ssi: {
    id: 'ssi',
    name: 'Steady-state inactivation',
    version: `${PROTOCOL_SUITE_VERSION} · SSI`,
    description: '100 ms conditioning prepulse −130 to −20 mV, then 15 ms test pulse to 0 mV.',
    holdingMv: -120,
    sweeps: range(-130, -20, 10).map((v) => ({
      label: `${v} mV`,
      segments: [{ durMs: 100, mv: v }, { durMs: 15, mv: 0 }, { durMs: 3, mv: -120 }],
    })),
    measureSegment: 1,
    cellSystem: CELL_SYSTEM,
    temperatureC: 22,
  },
  recovery: {
    id: 'recovery',
    name: 'Recovery from inactivation',
    version: `${PROTOCOL_SUITE_VERSION} · REC`,
    description: 'P1 to 0 mV (20 ms), recovery at −100 mV for Δt = 0.5–80 ms, P2 to 0 mV (10 ms).',
    holdingMv: -120,
    sweeps: RECOVERY_INTERVALS.map((dt) => ({
      label: `Δt ${dt} ms`,
      segments: [
        { durMs: 2, mv: -120 },
        { durMs: 20, mv: 0 },
        { durMs: dt, mv: -100 },
        { durMs: 10, mv: 0 },
        { durMs: 3, mv: -120 },
      ],
    })),
    measureSegment: 3,
    cellSystem: CELL_SYSTEM,
    temperatureC: 22,
  },
  persistent: {
    id: 'persistent',
    name: 'Persistent current',
    version: `${PROTOCOL_SUITE_VERSION} · PER`,
    description: 'Hold −120 mV; 100 ms step to −10 mV. Persistent current = mean I(80–100 ms) / peak.',
    holdingMv: -120,
    sweeps: [{ label: '−10 mV', segments: [{ durMs: 2, mv: -120 }, { durMs: 100, mv: -10 }, { durMs: 3, mv: -120 }] }],
    measureSegment: 1,
    cellSystem: CELL_SYSTEM,
    temperatureC: 22,
  },
};

// ─── Simulation ──────────────────────────────────────────────────────────

export interface SweepResult {
  trace: Trace;
  /** start/end sample index of each segment (in stored samples) */
  segmentBounds: [number, number][];
  /** peak (most negative) current within each segment, pA/pF */
  segmentPeaks: number[];
  /** mean current over the last 20% of each segment, pA/pF */
  segmentTailMeans: number[];
}

export function simulateSweep(params: ChannelParams, segments: { durMs: number; mv: number }[], holdingMv: number): SweepResult {
  const total = segments.reduce((s, x) => s + x.durMs, 0);
  const nStore = Math.ceil(total / DT / SAMPLE_EVERY) + 1;
  const t = new Float32Array(nStore);
  const v = new Float32Array(nStore);
  const iArr = new Float32Array(nStore);
  let m = mInf(holdingMv, params);
  let h = hInf(holdingMv, params);
  const g = G_BAR * params.gmaxScale;
  const pf = params.persistentFrac;

  const bounds: [number, number][] = [];
  const peaks: number[] = [];
  const tails: number[] = [];
  let step = 0;
  let stored = 0;
  let time = 0;
  for (const seg of segments) {
    const nSteps = Math.max(1, Math.round(seg.durMs / DT));
    const V = seg.mv;
    const am = 1 - Math.exp(-DT / tauM(V));
    const ah = 1 - Math.exp(-DT / tauH(V, params));
    const mi = mInf(V, params);
    const hi = hInf(V, params);
    const startStored = stored;
    let peak = 0;
    let tailSum = 0;
    let tailN = 0;
    const tailFrom = Math.floor(nSteps * 0.8);
    for (let k = 0; k < nSteps; k++) {
      m += (mi - m) * am;
      h += (hi - h) * ah;
      const I = g * m * m * m * ((1 - pf) * h + pf) * (V - E_NA);
      if (I < peak) peak = I;
      if (k >= tailFrom) {
        tailSum += I;
        tailN++;
      }
      if (step % SAMPLE_EVERY === 0 && stored < nStore) {
        t[stored] = time;
        v[stored] = V;
        iArr[stored] = I;
        stored++;
      }
      step++;
      time += DT;
    }
    bounds.push([startStored, stored - 1]);
    peaks.push(peak);
    tails.push(tailN ? tailSum / tailN : 0);
  }
  return {
    trace: { sweepLabel: '', t: t.subarray(0, stored), v: v.subarray(0, stored), i: iArr.subarray(0, stored) },
    segmentBounds: bounds,
    segmentPeaks: peaks,
    segmentTailMeans: tails,
  };
}

export interface ProtocolRun {
  protocol: ExperimentalProtocol;
  params: ChannelParams;
  sweeps: SweepResult[];
}

const runCache = new Map<string, ProtocolRun>();
const paramKey = (p: ChannelParams) =>
  [p.gmaxScale, p.vHalfAct, p.kAct, p.vHalfInact, p.kInact, p.tauInact, p.tauRecovery, p.persistentFrac].map((x) => x.toFixed(5)).join('|');

export function runProtocol(params: ChannelParams, protocolId: ProtocolId): ProtocolRun {
  const key = `${protocolId}#${paramKey(params)}`;
  const hit = runCache.get(key);
  if (hit) return hit;
  const protocol = PROTOCOLS[protocolId];
  const sweeps = protocol.sweeps.map((s) => {
    const r = simulateSweep(params, s.segments, protocol.holdingMv);
    r.trace.sweepLabel = s.label;
    return r;
  });
  const run = { protocol, params, sweeps };
  runCache.set(key, run);
  return run;
}

// ─── Analysis (curve fitting) ────────────────────────────────────────────

export interface CurvePoint { x: number; y: number }

export interface DerivedCurves {
  iv: CurvePoint[]; // mV → pA/pF
  gv: CurvePoint[]; // mV → G/Gmax
  ssi: CurvePoint[]; // mV → I/Imax
  recovery: CurvePoint[]; // ms → fraction recovered
  persistentTrace: { t: number; i: number }[]; // for the persistent protocol, normalised to peak
}

/** Find x where a monotone sampled curve crosses y = target (linear interpolation). */
function crossing(points: CurvePoint[], target: number): number {
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1];
    const b = points[k];
    if ((a.y - target) * (b.y - target) <= 0 && a.y !== b.y) {
      return a.x + ((target - a.y) * (b.x - a.x)) / (b.y - a.y);
    }
  }
  return NaN;
}

export interface FitSummary {
  peakDensity: number; // pA/pF
  vHalfAct: number;
  kAct: number;
  vHalfInact: number;
  kInact: number;
  persistentPct: number;
  tauRecovery: number;
}

export function deriveCurves(params: ChannelParams): DerivedCurves {
  const act = runProtocol(params, 'activation');
  const iv = act.sweeps.map((s, k) => ({ x: act.protocol.sweeps[k].segments[1].mv, y: s.segmentPeaks[1] }));
  const g = iv.map((p) => ({ x: p.x, y: p.y / (p.x - E_NA) }));
  const gMax = Math.max(...g.map((p) => p.y));
  const gv = g.map((p) => ({ x: p.x, y: gMax > 0 ? p.y / gMax : 0 }));

  const ssiRun = runProtocol(params, 'ssi');
  const ssiPeaks = ssiRun.sweeps.map((s, k) => ({ x: ssiRun.protocol.sweeps[k].segments[0].mv, y: s.segmentPeaks[1] }));
  const ssiMax = Math.min(...ssiPeaks.map((p) => p.y));
  const ssi = ssiPeaks.map((p) => ({ x: p.x, y: ssiMax < 0 ? p.y / ssiMax : 0 }));

  const rec = runProtocol(params, 'recovery');
  const recovery = rec.sweeps.map((s, k) => ({
    x: RECOVERY_INTERVALS[k],
    y: s.segmentPeaks[1] < 0 ? s.segmentPeaks[3] / s.segmentPeaks[1] : 0,
  }));

  const per = runProtocol(params, 'persistent').sweeps[0];
  const [a, b] = per.segmentBounds[1];
  const peak = per.segmentPeaks[1];
  const persistentTrace: { t: number; i: number }[] = [];
  for (let k = a; k <= b; k += 2) persistentTrace.push({ t: per.trace.t[k] - per.trace.t[a], i: peak < 0 ? per.trace.i[k] / peak : 0 });

  return { iv, gv, ssi, recovery, persistentTrace };
}

export function fitCurves(params: ChannelParams, curves = deriveCurves(params)): FitSummary {
  const peakDensity = Math.min(...curves.iv.map((p) => p.y));
  const vHalfAct = crossing(curves.gv, 0.5);
  const kAct = (crossing(curves.gv, 0.75) - crossing(curves.gv, 0.25)) / (2 * Math.log(3));
  const vHalfInact = crossing(curves.ssi, 0.5);
  const kInact = (crossing(curves.ssi, 0.25) - crossing(curves.ssi, 0.75)) / (2 * Math.log(3));

  // Recovery: single-exponential fit through the origin on points with 5–95% recovery.
  let num = 0;
  let den = 0;
  for (const p of curves.recovery) {
    if (p.y > 0.05 && p.y < 0.95) {
      const l = Math.log(1 - p.y);
      num += p.x * p.x;
      den += p.x * l;
    }
  }
  const tauRecovery = den < 0 ? -num / den : NaN;

  const per = runProtocol(params, 'persistent').sweeps[0];
  const persistentPct = per.segmentPeaks[1] < 0 ? (100 * per.segmentTailMeans[1]) / per.segmentPeaks[1] : 0;

  return { peakDensity, vHalfAct, kAct, vHalfInact, kInact, persistentPct, tauRecovery };
}

// Calibrate ḡ against the reference.
(() => {
  const ref = fitCurves(REFERENCE_PARAMS);
  G_BAR = -260 / ref.peakDensity;
  runCache.clear();
})();

export const REFERENCE_FIT: FitSummary = fitCurves(REFERENCE_PARAMS);

// ─── Synthetic measurements ──────────────────────────────────────────────

/** Between-cell standard deviations used to synthesise sample means (illustrative). */
const CELL_SD: Record<MeasurementKey, (v: number) => number> = {
  peakDensity: (v) => 0.32 * Math.abs(v),
  vHalfAct: () => 3.2,
  vHalfInact: () => 3.6,
  persistentPct: (v) => 0.35 * Math.abs(v) + 0.25,
  tauRecovery: (v) => 0.3 * Math.abs(v),
};

export const MEASUREMENT_META: Record<MeasurementKey, { label: string; unit: string; digits: number }> = {
  peakDensity: { label: 'Peak current density', unit: 'pA/pF', digits: 0 },
  vHalfAct: { label: 'V½ activation', unit: 'mV', digits: 1 },
  vHalfInact: { label: 'V½ steady-state inactivation', unit: 'mV', digits: 1 },
  persistentPct: { label: 'Persistent current', unit: '% of peak', digits: 2 },
  tauRecovery: { label: 'τ recovery (−100 mV)', unit: 'ms', digits: 2 },
};

export const MEASUREMENT_KEYS: MeasurementKey[] = ['peakDensity', 'vHalfAct', 'vHalfInact', 'persistentPct', 'tauRecovery'];

const N_REFERENCE_CELLS = 16;

/** The matched reference dataset (synthetic, seeded). */
export const REFERENCE_MEASURED: Record<MeasurementKey, { value: number; se: number }> = (() => {
  const rand = rngFor('reference-dataset');
  const out = {} as Record<MeasurementKey, { value: number; se: number }>;
  for (const k of MEASUREMENT_KEYS) {
    const truth = REFERENCE_FIT[k];
    const se = CELL_SD[k](truth) / Math.sqrt(N_REFERENCE_CELLS);
    out[k] = { value: truth + 0.5 * gaussian(rand) * se, se };
  }
  return out;
})();

/**
 * Produce the synthetic functional profile for a variant: the model's fitted value (population truth)
 * plus seeded sampling error of the mean across `nCells`. `fit` may be supplied from a full protocol
 * simulation (lab) or from the fast analytic approximation (atlas summary records).
 * `seInflation` widens SE for evidence that is not a direct measurement (e.g. computational priors).
 */
export function synthesizeProfile(
  variantId: string,
  fit: FitSummary,
  nCells: number,
  seInflation = 1,
): FunctionalProfile {
  const rand = rngFor('profile', variantId);
  const profile = {} as FunctionalProfile;
  for (const k of MEASUREMENT_KEYS) {
    const truth = fit[k];
    const se = (CELL_SD[k](truth) / Math.sqrt(Math.max(1, nCells))) * seInflation;
    const noise = gaussian(rand) * se * (seInflation > 1 ? 1 / seInflation : 1);
    const meta = MEASUREMENT_META[k];
    const m: FunctionalMeasurement = {
      key: k,
      label: meta.label,
      unit: meta.unit,
      value: truth + noise,
      se,
      n: nCells,
      reference: REFERENCE_MEASURED[k].value,
      category: 'simulated',
      protocolVersion: PROTOCOL_SUITE_VERSION,
    };
    profile[k] = m;
  }
  return profile;
}

/**
 * Fast analytic approximation of the protocol fits, used for the thousands of Atlas summary records
 * where running every protocol would be wasteful. Offsets are calibrated against the full simulation
 * of the reference so both paths agree for the reference channel.
 */
const ACT_OFFSET = REFERENCE_FIT.vHalfAct - REFERENCE_PARAMS.vHalfAct;
const INACT_OFFSET = REFERENCE_FIT.vHalfInact - REFERENCE_PARAMS.vHalfInact;
const PERSIST_SCALE = REFERENCE_FIT.persistentPct / REFERENCE_PARAMS.persistentFrac;
const REC_SCALE = REFERENCE_FIT.tauRecovery / REFERENCE_PARAMS.tauRecovery;

export function approximateFit(p: ChannelParams): FitSummary {
  // A depolarising activation shift reduces the peak reached within the I–V window modestly.
  const actPenalty = Math.exp(-Math.max(0, p.vHalfAct - REFERENCE_PARAMS.vHalfAct) / 40);
  return {
    peakDensity: REFERENCE_FIT.peakDensity * p.gmaxScale * actPenalty,
    vHalfAct: p.vHalfAct + ACT_OFFSET,
    kAct: REFERENCE_FIT.kAct * (p.kAct / REFERENCE_PARAMS.kAct),
    vHalfInact: p.vHalfInact + INACT_OFFSET,
    kInact: REFERENCE_FIT.kInact * (p.kInact / REFERENCE_PARAMS.kInact),
    persistentPct: p.persistentFrac * PERSIST_SCALE,
    tauRecovery: p.tauRecovery * REC_SCALE,
  };
}

/** Steady-state open probability helpers for visual use (e.g. ion flux rate in 3D). */
export function relativeConductanceAt(v: number, p: ChannelParams): number {
  const m = mInf(v, p);
  return p.gmaxScale * m * m * m * ((1 - p.persistentFrac) * hInf(-90, p) + p.persistentFrac);
}

/** Apply a hypothesised therapeutic effect to a parameter set (used by screening). */
export function withEffect(p: ChannelParams, actsOn: 'gmaxScale' | 'persistentFrac' | 'none', fractionalChange: number): ChannelParams {
  if (actsOn === 'none') return p;
  const next = { ...p };
  next[actsOn] = Math.max(0, p[actsOn] * (1 + fractionalChange));
  return next;
}
