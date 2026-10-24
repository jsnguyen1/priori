// Synthetic SCN2A variant atlas. Every record is HYPOTHETICAL.
// Biophysical parameters are drawn from region-dependent priors with a fixed seed; mechanism
// classes are never assigned directly — they are computed by sim/classifier.ts from the
// synthetic measurements derived from those parameters.
import type { ChannelParams, EvidenceLevel, FunctionalProfile, GeneticVariant, MechanismClassification, ProteinRegion } from '../domain/types';
import { REGIONS, SCN2A_LENGTH, SCN2A_SEQUENCE, THREE_LETTER, regionAt } from './published';
import { REFERENCE_PARAMS, approximateFit, fitCurves, synthesizeProfile } from '../sim/channel';
import { classify } from '../sim/classifier';
import { clamp, gaussian, rngFor } from '../sim/rng';

const AA = 'ARNDCQEGHILKMFPSTWYV';
export const ATLAS_SIZE = 3200;

const refAAAt = (pos: number) => SCN2A_SEQUENCE[pos - 1];
const hgvs = (ref: string, pos: number, alt: string) => `p.(${THREE_LETTER[ref]}${pos}${THREE_LETTER[alt]})`;

/** Relative sampling density by region kind (more atlas coverage in functional segments). */
function regionWeight(r: ProteinRegion): number {
  switch (r.kind) {
    case 'S4': return 3.2;
    case 'S5': case 'S6': case 'pore-loop': return 3.0;
    case 'inactivation-gate': return 4.0;
    case 'S1': case 'S2': case 'S3': return 1.8;
    case 'intracellular-loop': return 2.2; // includes S4–S5 linkers
    case 'extracellular-loop': return 1.0;
    case 'domain-linker': return r.id.startsWith('III-IV') ? 2.6 : 0.55;
    case 'N-term': return 0.8;
    case 'C-term': return 0.9;
  }
}

/** Region-dependent prior over parameter perturbations (illustrative). */
function drawParams(r: ProteinRegion, rand: () => number): ChannelParams {
  const p = { ...REFERENCE_PARAMS };
  const g = () => gaussian(rand);
  const severe = rand();
  switch (r.kind) {
    case 'S4': {
      // Voltage-sensor variants mostly shift gating, in either direction.
      const dir = rand() < 0.55 ? -1 : 1;
      p.vHalfAct += dir * (2 + Math.abs(g()) * 8);
      p.vHalfInact += (rand() < 0.5 ? -1 : 1) * Math.abs(g()) * 5;
      p.kAct *= 1 + g() * 0.12;
      if (severe < 0.2) p.gmaxScale *= clamp(0.5 + g() * 0.25, 0.05, 1);
      break;
    }
    case 'S5': case 'S6': case 'pore-loop': {
      // Pore variants frequently reduce conductance; S6 variants can impair inactivation.
      if (severe < 0.75) p.gmaxScale = clamp(0.92 - Math.abs(g()) * 0.6, 0.02, 1.1);
      if (r.kind === 'S6' && rand() < 0.45) {
        p.vHalfInact += 1.5 + Math.abs(g()) * 6;
        p.persistentFrac *= Math.exp(0.4 + Math.abs(g()) * 1.0);
      }
      p.vHalfAct += g() * 2.5;
      break;
    }
    case 'inactivation-gate': {
      p.persistentFrac *= Math.exp(Math.abs(g()) * 1.3 + 0.6);
      p.vHalfInact += Math.abs(g()) * 6;
      p.tauRecovery *= Math.exp(-Math.abs(g()) * 0.35);
      if (severe < 0.35) p.gmaxScale *= clamp(0.6 + g() * 0.2, 0.2, 1);
      break;
    }
    case 'intracellular-loop': {
      if (rand() < 0.5) {
        p.persistentFrac *= Math.exp(0.3 + Math.abs(g()) * 1.0);
        p.vHalfInact += g() * 5.5;
      } else {
        p.vHalfAct += g() * 5;
        p.gmaxScale *= clamp(1 - Math.abs(g()) * 0.4, 0.15, 1.2);
      }
      break;
    }
    case 'domain-linker': {
      if (r.id.startsWith('III-IV')) {
        p.persistentFrac *= Math.exp(0.3 + Math.abs(g()) * 1.0);
        p.vHalfInact += g() * 5;
      } else {
        p.gmaxScale *= clamp(1 + g() * 0.12, 0.4, 1.4);
        p.vHalfAct += g() * 1.2;
      }
      break;
    }
    case 'S1': case 'S2': case 'S3': {
      // Voltage-sensor scaffold: moderate gating shifts; some impair folding / surface expression.
      p.vHalfAct += g() * 6;
      p.vHalfInact += g() * 4;
      if (severe < 0.3) p.gmaxScale *= clamp(0.55 + g() * 0.25, 0.05, 1);
      break;
    }
    case 'extracellular-loop': {
      // Outer-vestibule loops flanking the pore loops often reduce conductance.
      const nearPore = r.id.endsWith('S5P') || r.id.endsWith('PS6');
      if (nearPore && severe < 0.6) p.gmaxScale = clamp(0.85 - Math.abs(g()) * 0.5, 0.05, 1.1);
      else p.gmaxScale *= clamp(1 + g() * 0.2, 0.3, 1.5);
      p.vHalfAct += g() * 2;
      break;
    }
    default: {
      p.gmaxScale *= clamp(1 + g() * 0.15, 0.3, 1.5);
      p.vHalfAct += g() * 1.5;
      p.vHalfInact += g() * 1.5;
      p.tauRecovery *= Math.exp(g() * 0.15);
    }
  }
  return p;
}

/**
 * Atlas records are enriched for disease-associated variants, so effects in functional segments
 * are scaled by a per-variant severity factor (additive params linearly, multiplicative in log space).
 */
function amplify(p: ChannelParams, r: ProteinRegion, rand: () => number): ChannelParams {
  const neutral = r.kind === 'N-term' || r.kind === 'C-term' || (r.kind === 'domain-linker' && !r.id.startsWith('III-IV'));
  const a = neutral ? 1 : 1.25 + rand() * 0.75;
  const R = REFERENCE_PARAMS;
  const lin = (x: number, ref: number) => ref + (x - ref) * a;
  const log = (x: number, ref: number) => ref * Math.pow(x / ref, a);
  return {
    gmaxScale: clamp(log(p.gmaxScale, R.gmaxScale), 0.02, 2.5),
    vHalfAct: lin(p.vHalfAct, R.vHalfAct),
    kAct: p.kAct,
    vHalfInact: lin(p.vHalfInact, R.vHalfInact),
    kInact: p.kInact,
    tauInact: p.tauInact,
    tauRecovery: log(p.tauRecovery, R.tauRecovery),
    persistentFrac: clamp(log(p.persistentFrac, R.persistentFrac), 0, 0.1),
  };
}

function drawEvidenceLevel(rand: () => number): { level: EvidenceLevel; n: number } {
  const u = rand();
  if (u < 0.16) return { level: 'synthetic-patch-clamp', n: 8 + Math.floor(rand() * 9) };
  if (u < 0.62) return { level: 'synthetic-summary', n: 4 + Math.floor(rand() * 5) };
  return { level: 'computational-prior', n: 0 };
}

// ─── Patient variants (hand-specified hypothetical parameters) ───────────

interface PatientVariantSpec {
  position: number;
  altAA: string;
  patientId: string;
  params: Partial<ChannelParams>;
  nCells: number;
}

const PATIENT_VARIANT_SPECS: PatientVariantSpec[] = [
  // PX-001 — DIV pore loop; reduced conductance, depolarised activation, slowed recovery.
  { position: 1714, altAA: 'P', patientId: 'PX-001', nCells: 14, params: { gmaxScale: 0.3, vHalfAct: -30, vHalfInact: -69, tauRecovery: 9 } },
  // PX-002 — DIII pore loop; related conductance-reducing mechanism, milder gating change.
  { position: 1420, altAA: 'D', patientId: 'PX-002', nCells: 12, params: { gmaxScale: 0.4, vHalfAct: -33, vHalfInact: -67, tauRecovery: 7.6 } },
  // PX-003 — DI S4 voltage sensor; hyperpolarised activation, enhanced persistent current.
  { position: 223, altAA: 'Q', patientId: 'PX-003', nCells: 13, params: { gmaxScale: 1.12, vHalfAct: -47, vHalfInact: -56, persistentFrac: 0.018, tauRecovery: 3.9 } },
  // PX-004 — DIII–DIV linker adjacent to IFM; opposing effects (reduced current, large persistent current).
  { position: 1495, altAA: 'R', patientId: 'PX-004', nCells: 9, params: { gmaxScale: 0.42, vHalfInact: -57, persistentFrac: 0.022 } },
];

function makeVariant(position: number, altAA: string, params: ChannelParams, level: EvidenceLevel, nCells: number, patientIds: string[]): GeneticVariant {
  const ref = refAAAt(position);
  return {
    id: `SCN2A:HV-${String(position).padStart(4, '0')}${altAA}`,
    gene: 'SCN2A',
    position,
    refAA: ref,
    altAA,
    hgvsP: hgvs(ref, position, altAA),
    regionId: regionAt(position).id,
    params,
    evidenceLevel: level,
    nCells,
    patientIds,
    isHypothetical: true,
  };
}

export const PATIENT_VARIANTS: GeneticVariant[] = PATIENT_VARIANT_SPECS.map((s) =>
  makeVariant(s.position, s.altAA, { ...REFERENCE_PARAMS, ...s.params }, 'synthetic-patch-clamp', s.nCells, [s.patientId]),
);

// ─── Atlas generation ────────────────────────────────────────────────────

function generateAtlas(): GeneticVariant[] {
  const rand = rngFor('atlas-v1');
  // cumulative residue weights
  const cum = new Float64Array(SCN2A_LENGTH + 1);
  for (let p = 1; p <= SCN2A_LENGTH; p++) cum[p] = cum[p - 1] + regionWeight(regionAt(p));
  const total = cum[SCN2A_LENGTH];
  const pick = () => {
    const u = rand() * total;
    let lo = 1;
    let hi = SCN2A_LENGTH;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const taken = new Set(PATIENT_VARIANTS.map((v) => v.id));
  const out: GeneticVariant[] = [];
  let guard = 0;
  while (out.length < ATLAS_SIZE && guard++ < ATLAS_SIZE * 10) {
    const pos = pick();
    const ref = refAAAt(pos);
    let alt = AA[Math.floor(rand() * AA.length)];
    if (alt === ref) alt = AA[(AA.indexOf(alt) + 7) % AA.length];
    const region = regionAt(pos);
    const params = amplify(drawParams(region, rand), region, rand);
    const ev = drawEvidenceLevel(rand);
    const v = makeVariant(pos, alt, params, ev.level, ev.n, []);
    if (taken.has(v.id)) continue;
    taken.add(v.id);
    out.push(v);
  }
  return out;
}

export const ATLAS_VARIANTS: GeneticVariant[] = [...PATIENT_VARIANTS, ...generateAtlas()].sort((a, b) => a.position - b.position);

const byId = new Map(ATLAS_VARIANTS.map((v) => [v.id, v]));
export const getVariant = (id: string): GeneticVariant | undefined => byId.get(id);

// ─── Derived measurements & classifications (memoised, deterministic) ────

const profileCache = new Map<string, FunctionalProfile>();
const classCache = new Map<string, MechanismClassification>();

/**
 * Synthetic functional profile for a variant.
 * - Patient variants and 'synthetic-patch-clamp' records: fitted from the full protocol simulation.
 * - 'synthetic-summary': analytic approximation of the same protocols.
 * - 'computational-prior': analytic approximation with inflated uncertainty (no direct measurement).
 */
export function getProfile(variantId: string): FunctionalProfile {
  const hit = profileCache.get(variantId);
  if (hit) return hit;
  const v = byId.get(variantId);
  if (!v) throw new Error(`unknown variant ${variantId}`);
  let profile: FunctionalProfile;
  if (v.patientIds.length > 0) profile = synthesizeProfile(v.id, fitCurves(v.params), v.nCells);
  else if (v.evidenceLevel === 'computational-prior') profile = synthesizeProfile(v.id, approximateFit(v.params), 4, 3);
  else profile = synthesizeProfile(v.id, approximateFit(v.params), v.nCells);
  profileCache.set(variantId, profile);
  return profile;
}

export function getClassification(variantId: string): MechanismClassification {
  const hit = classCache.get(variantId);
  if (hit) return hit;
  const v = byId.get(variantId);
  if (!v) throw new Error(`unknown variant ${variantId}`);
  const c = classify(variantId, getProfile(variantId), { priorOnly: v.evidenceLevel === 'computational-prior' });
  classCache.set(variantId, c);
  return c;
}

/** Atlas-wide classification table (computed once, ~3k records). */
let atlasClassCache: MechanismClassification[] | null = null;
export function getAtlasClassifications(): MechanismClassification[] {
  if (!atlasClassCache) atlasClassCache = ATLAS_VARIANTS.map((v) => getClassification(v.id));
  return atlasClassCache;
}

export { REGIONS };
