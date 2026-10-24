// Flat, typed-array index over the synthetic atlas for fast canvas drawing and hit-testing.
// Mechanism classes come exclusively from getClassification (rule-based classifier output).
import type { EvidenceLevel, GeneticVariant, MechanismClass, ProteinRegion } from '../../domain/types';
import { ATLAS_VARIANTS, getAtlasClassifications, getProfile } from '../../data/variants';
import { REGIONS, SCN2A_LENGTH } from '../../data/published';

export const MECHS: MechanismClass[] = ['GoF', 'LoF', 'mixed', 'indeterminate'];
export const EVIDENCE_LEVELS: EvidenceLevel[] = ['synthetic-patch-clamp', 'synthetic-summary', 'computational-prior'];
export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  'synthetic-patch-clamp': 'Synthetic patch-clamp',
  'synthetic-summary': 'Synthetic summary',
  'computational-prior': 'Computational prior',
  uncharacterized: 'Uncharacterized',
};

export interface AtlasIndex {
  n: number;
  variants: GeneticVariant[];
  idToIdx: Map<string, number>;
  pos: Int32Array;
  mech: Uint8Array; // index into MECHS
  ev: Uint8Array; // index into EVIDENCE_LEVELS (3 = uncharacterized)
  net: Float32Array;
  conf: Float32Array;
  /** log2(peak / ref) */
  peakL2: Float32Array;
  peakL2Se: Float32Array;
  dAct: Float32Array;
  dActSe: Float32Array;
  dInact: Float32Array;
  dInactSe: Float32Array;
  /** log2(persistent / ref) */
  persL2: Float32Array;
  persL2Se: Float32Array;
  /** slot among records at the same residue, and number of such records */
  slot: Uint8Array;
  slotN: Uint8Array;
  regionIdx: Int16Array;
  patientIdx: number[];
  counts: Record<MechanismClass, number>;
  evCounts: Record<string, number>;
  /** max over 10-residue bins of max(upper half, lower half) of the centred stacked density */
  densHalfMax: number;
}

let cache: AtlasIndex | null = null;

const L2 = Math.LN2;

export function getAtlasIndex(): AtlasIndex {
  if (cache) return cache;
  const variants = ATLAS_VARIANTS; // sorted by position
  const cls = getAtlasClassifications();
  const n = variants.length;
  const idx: AtlasIndex = {
    n,
    variants,
    idToIdx: new Map(),
    pos: new Int32Array(n),
    mech: new Uint8Array(n),
    ev: new Uint8Array(n),
    net: new Float32Array(n),
    conf: new Float32Array(n),
    peakL2: new Float32Array(n),
    peakL2Se: new Float32Array(n),
    dAct: new Float32Array(n),
    dActSe: new Float32Array(n),
    dInact: new Float32Array(n),
    dInactSe: new Float32Array(n),
    persL2: new Float32Array(n),
    persL2Se: new Float32Array(n),
    slot: new Uint8Array(n),
    slotN: new Uint8Array(n),
    regionIdx: new Int16Array(n),
    patientIdx: [],
    counts: { GoF: 0, LoF: 0, mixed: 0, indeterminate: 0 },
    evCounts: {},
    densHalfMax: 1,
  };
  const regionIndex = new Map(REGIONS.map((r, i) => [r.id, i]));
  for (let i = 0; i < n; i++) {
    const v = variants[i];
    const c = cls[i];
    const p = getProfile(v.id);
    idx.idToIdx.set(v.id, i);
    idx.pos[i] = v.position;
    idx.mech[i] = MECHS.indexOf(c.mechanism);
    const e = EVIDENCE_LEVELS.indexOf(v.evidenceLevel);
    idx.ev[i] = e < 0 ? 3 : e;
    idx.net[i] = c.netScore;
    idx.conf[i] = c.confidence;
    const pk = p.peakDensity;
    const ratio = Math.max(1e-3, pk.value / pk.reference);
    idx.peakL2[i] = Math.log(ratio) / L2;
    idx.peakL2Se[i] = pk.se / Math.max(1e-6, Math.abs(pk.value)) / L2;
    idx.dAct[i] = p.vHalfAct.value - p.vHalfAct.reference;
    idx.dActSe[i] = p.vHalfAct.se;
    idx.dInact[i] = p.vHalfInact.value - p.vHalfInact.reference;
    idx.dInactSe[i] = p.vHalfInact.se;
    const ps = p.persistentPct;
    idx.persL2[i] = Math.log(Math.max(1e-3, ps.value / ps.reference)) / L2;
    idx.persL2Se[i] = ps.se / Math.max(1e-6, Math.abs(ps.value)) / L2;
    idx.regionIdx[i] = regionIndex.get(v.regionId) ?? -1;
    if (v.patientIds.length) idx.patientIdx.push(i);
    idx.counts[c.mechanism]++;
    idx.evCounts[v.evidenceLevel] = (idx.evCounts[v.evidenceLevel] ?? 0) + 1;
  }
  // slots at shared residues
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && idx.pos[j] === idx.pos[i]) j++;
    for (let k = i; k < j; k++) {
      idx.slot[k] = k - i;
      idx.slotN[k] = j - i;
    }
    i = j;
  }
  // density normaliser
  const bins = Math.ceil(SCN2A_LENGTH / 10);
  const acc = new Float32Array(bins * 4);
  for (let k = 0; k < n; k++) acc[Math.min(bins - 1, Math.floor((idx.pos[k] - 1) / 10)) * 4 + idx.mech[k]]++;
  let mx = 1;
  for (let b = 0; b < bins; b++) {
    const core = (acc[b * 4 + 2] + acc[b * 4 + 3]) / 2;
    mx = Math.max(mx, acc[b * 4] + core, acc[b * 4 + 1] + core);
  }
  idx.densHalfMax = mx;
  cache = idx;
  return idx;
}

/** First index with pos >= p (records are sorted by position). */
export function lowerBound(pos: Int32Array, p: number): number {
  let lo = 0;
  let hi = pos.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pos[mid] < p) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export const regionOf = (index: AtlasIndex, i: number): ProteinRegion | undefined => REGIONS[index.regionIdx[i]];

export const shortId = (id: string) => id.replace('SCN2A:', '');
