// Geometry preparation for the PDB 6J8E Cα trace (human NaV1.2, Pan et al. 2019).
// Pure data + three.js geometry builders — no React. Everything is deterministic and memoised.
//
// Notes
// - Coordinates are pre-aligned by scripts/build-structure.mjs: membrane normal = +Y (extracellular up),
//   membrane centre ≈ y = 0, pore axis ≈ x = z = 0. Units are Å.
// - Secondary structure uses the deposited `helices` ranges of the JSON (PDB HELIX records) when present;
//   otherwise it falls back to geometric assignment from the Cα trace itself (i→i+3 ≈ 5.0–5.6 Å and i→i+4 ≈ 6.2 Å for α-helices), which is standard for Cα-only models,
//   united with UniProt Q99250 helical transmembrane annotations.
import * as THREE from 'three';
import raw from '../../data/structure/nav12_6j8e.json';
import { REGIONS, regionAt } from '../../data/published';
import type { DomainId, ProteinRegion } from '../../domain/types';

type CaRow = [number, number, number, number, number];
interface RawStructure {
  provenance: { pdbId: string; title: string; method: string; citation: string; source: string; chain: string; processing: string };
  ca: CaRow[];
  helices?: [number, number][];
}
const STRUCT = raw as unknown as RawStructure;
export const STRUCTURE_PROVENANCE = STRUCT.provenance;
const DEPOSITED_HELICES: [number, number][] = Array.isArray(STRUCT.helices) ? STRUCT.helices.filter((h) => Array.isArray(h) && h.length === 2) : [];
export const HELIX_SOURCE: 'deposited' | 'geometric' = DEPOSITED_HELICES.length ? 'deposited' : 'geometric';
const inDepositedHelix = (res: number) => DEPOSITED_HELICES.some(([a, b]) => res >= a && res <= b);

export interface Residue {
  res: number; // UniProt Q99250 numbering
  pos: THREE.Vector3; // Cα, Å
  b: number;
  helix: boolean;
  seg: number; // contiguous resolved segment index
  idx: number; // index within segment
  regionId: string;
}

// ─── Residues, segments, secondary structure ─────────────────────────────

function buildResidues() {
  const segments: Residue[][] = [];
  let cur: Residue[] = [];
  let prev = -10;
  for (const [res, x, y, z, b] of STRUCT.ca) {
    if (res !== prev + 1 && cur.length) {
      segments.push(cur);
      cur = [];
    }
    cur.push({ res, pos: new THREE.Vector3(x, y, z), b, helix: false, seg: segments.length, idx: cur.length, regionId: regionAt(res).id });
    prev = res;
  }
  if (cur.length) segments.push(cur);

  if (HELIX_SOURCE === 'deposited') {
    for (const s of segments) for (const r of s) r.helix = inDepositedHelix(r.res) || regionAt(r.res).topology === 'transmembrane';
    return segments;
  }
  // Fallback: geometric α-helix assignment on the Cα trace.
  for (const s of segments) {
    const n = s.length;
    const flag = new Uint8Array(n);
    for (let j = 0; j + 4 < n; j++) {
      const d3 = s[j].pos.distanceTo(s[j + 3].pos);
      const d4 = s[j].pos.distanceTo(s[j + 4].pos);
      if (d3 > 4.7 && d3 < 5.6 && d4 > 5.6 && d4 < 6.6) for (let k = j; k <= j + 4; k++) flag[k] = 1;
    }
    // drop helical runs shorter than 6 residues
    let k = 0;
    while (k < n) {
      if (!flag[k]) { k++; continue; }
      let e = k;
      while (e < n && flag[e]) e++;
      if (e - k < 6) for (let q = k; q < e; q++) flag[q] = 0;
      k = e;
    }
    // Union with UniProt 'Helical' transmembrane annotations (S4 segments are partly 3₁₀ in cryo-EM).
    s.forEach((r, i) => (r.helix = !!flag[i] || regionAt(r.res).topology === 'transmembrane'));
  }
  return segments;
}

export const SEGMENTS: Residue[][] = buildResidues();
export const RESIDUES: Residue[] = SEGMENTS.flat();
const byRes = new Map(RESIDUES.map((r) => [r.res, r]));
export const residueAt = (res: number) => byRes.get(res);
export const SEGMENT_RANGES: [number, number][] = SEGMENTS.map((s) => [s[0].res, s[s.length - 1].res]);
export const HELIX_FRACTION = RESIDUES.filter((r) => r.helix).length / RESIDUES.length;

/** Nearest resolved residue by sequence position (structure gaps are unresolved linkers / termini). */
export function nearestResolved(position: number): { residue: Residue; resolved: boolean; offset: number } {
  const hit = byRes.get(position);
  if (hit) return { residue: hit, resolved: true, offset: 0 };
  let best = RESIDUES[0];
  for (const r of RESIDUES) if (Math.abs(r.res - position) < Math.abs(best.res - position)) best = r;
  return { residue: best, resolved: false, offset: best.res - position };
}

// ─── Region statistics ───────────────────────────────────────────────────

export interface RegionGeom {
  region: ProteinRegion;
  resolved: number;
  total: number;
  centroid: THREE.Vector3 | null;
  radius: number;
}

export const REGION_GEOM: Map<string, RegionGeom> = (() => {
  const m = new Map<string, RegionGeom>();
  for (const region of REGIONS) {
    const rs = RESIDUES.filter((r) => r.res >= region.start && r.res <= region.end);
    let centroid: THREE.Vector3 | null = null;
    let radius = 0;
    if (rs.length) {
      centroid = rs.reduce((acc, r) => acc.add(r.pos), new THREE.Vector3()).multiplyScalar(1 / rs.length);
      for (const r of rs) radius = Math.max(radius, r.pos.distanceTo(centroid));
    }
    m.set(region.id, { region, resolved: rs.length, total: region.end - region.start + 1, centroid, radius });
  }
  return m;
})();

// ─── Colours (repeat domains; muted hues distinct from mechanism colours) ─

export const DOMAIN_COLOR: Record<DomainId, string> = {
  DI: '#7C9C82', // sage
  DII: '#A99A78', // sand
  DIII: '#8390AE', // dusty slate
  DIV: '#A88294', // dusty mauve
  linker: '#56636E',
  termini: '#56636E',
};
export const DOMAIN_LEGEND: { id: DomainId; label: string }[] = [
  { id: 'DI', label: 'DI' },
  { id: 'DII', label: 'DII' },
  { id: 'DIII', label: 'DIII' },
  { id: 'DIV', label: 'DIV' },
  { id: 'linker', label: 'Linkers' },
];

// ─── Tube geometry ───────────────────────────────────────────────────────

export type TubeStyle = 'cartoon' | 'trace';

const STYLE = {
  cartoon: { perRes: 5, radial: 12, helixR: 1.85, loopR: 0.5, smoothHelix: true },
  trace: { perRes: 4, radial: 6, helixR: 0.32, loopR: 0.32, smoothHelix: false },
} as const;

interface SampledSegment {
  P: THREE.Vector3[];
  N: THREE.Vector3[];
  B: THREE.Vector3[];
  R: number[];
  perRes: number;
}

/** Path control points: in cartoon mode helices are drawn along their local axis (cylinder cartoon). */
function controlPoints(seg: Residue[], smooth: boolean): { pts: THREE.Vector3[]; w: number[] } {
  const n = seg.length;
  const h = seg.map((r) => (r.helix ? 1 : 0));
  // smoothed helix weight for gentle transitions
  const w = h.map((_, i) => {
    let s = 0;
    let c = 0;
    for (let k = -1; k <= 1; k++) {
      const j = i + k;
      if (j >= 0 && j < n) { s += h[j]; c++; }
    }
    return h[i] ? Math.max(0.5, s / c) : (s / c) * 0.6;
  });
  if (!smooth) return { pts: seg.map((r) => r.pos.clone()), w };
  const pts = seg.map((r, i) => {
    if (w[i] <= 0) return r.pos.clone();
    // Helix axis ≈ weighted mean over one turn (3.6 residues) centred on i.
    const kern = [0.5, 1, 1, 1, 0.5];
    const acc = new THREE.Vector3();
    let ws = 0;
    for (let k = -2; k <= 2; k++) {
      const j = Math.min(n - 1, Math.max(0, i + k));
      acc.addScaledVector(seg[j].pos, kern[k + 2]);
      ws += kern[k + 2];
    }
    acc.multiplyScalar(1 / ws);
    return r.pos.clone().lerp(acc, w[i]);
  });
  return { pts, w };
}

function sampleSegment(seg: Residue[], style: TubeStyle): SampledSegment {
  const st = STYLE[style];
  const { pts, w } = controlPoints(seg, st.smoothHelix);
  const n = pts.length;
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const count = (n - 1) * st.perRes + 1;
  const P: THREE.Vector3[] = [];
  const R: number[] = [];
  for (let s = 0; s < count; s++) {
    const u = n > 1 ? s / (count - 1) : 0;
    P.push(n > 1 ? curve.getPoint(u) : pts[0].clone());
    const fi = u * (n - 1);
    const i0 = Math.floor(fi);
    const i1 = Math.min(n - 1, i0 + 1);
    const f = fi - i0;
    const ww = w[i0] * (1 - f) + w[i1] * f;
    R.push(st.loopR + (st.helixR - st.loopR) * ww);
  }
  // Parallel-transport frames (no Frenet flips).
  const T = P.map((_, s) => {
    const a = P[Math.max(0, s - 1)];
    const b = P[Math.min(count - 1, s + 1)];
    const t = b.clone().sub(a);
    return t.lengthSq() > 1e-9 ? t.normalize() : new THREE.Vector3(0, 1, 0);
  });
  const N: THREE.Vector3[] = [];
  const B: THREE.Vector3[] = [];
  let prevN = new THREE.Vector3(1, 0, 0);
  if (Math.abs(T[0].dot(prevN)) > 0.9) prevN = new THREE.Vector3(0, 0, 1);
  for (let s = 0; s < count; s++) {
    const t = T[s];
    const nn = prevN.clone().addScaledVector(t, -t.dot(prevN));
    if (nn.lengthSq() < 1e-8) nn.set(t.y, -t.x, 0);
    nn.normalize();
    N.push(nn);
    B.push(new THREE.Vector3().crossVectors(t, nn).normalize());
    prevN = nn;
  }
  return { P, N, B, R, perRes: st.perRes };
}

function tubeGeometry(sm: SampledSegment, s0: number, s1: number, radial: number): THREE.BufferGeometry {
  const rings = s1 - s0 + 1;
  const pos = new Float32Array(rings * radial * 3);
  const nor = new Float32Array(rings * radial * 3);
  const tmp = new THREE.Vector3();
  for (let r = 0; r < rings; r++) {
    const s = s0 + r;
    const c = sm.P[s];
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      tmp.copy(sm.N[s]).multiplyScalar(Math.cos(a)).addScaledVector(sm.B[s], Math.sin(a));
      const o = (r * radial + k) * 3;
      nor[o] = tmp.x; nor[o + 1] = tmp.y; nor[o + 2] = tmp.z;
      pos[o] = c.x + tmp.x * sm.R[s]; pos[o + 1] = c.y + tmp.y * sm.R[s]; pos[o + 2] = c.z + tmp.z * sm.R[s];
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rings - 1; r++) {
    for (let k = 0; k < radial; k++) {
      const a = r * radial + k;
      const b = r * radial + ((k + 1) % radial);
      const c = (r + 1) * radial + k;
      const d = (r + 1) * radial + ((k + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export interface Chunk {
  key: string;
  regionId: string;
  resStart: number;
  resEnd: number;
  geometry: THREE.BufferGeometry;
}

/**
 * One tube mesh per (segment × region) run. Chunks share boundary rings so the tube is continuous,
 * and each mesh maps directly to a ProteinRegion for picking / highlighting.
 */
export function buildChunks(style: TubeStyle): Chunk[] {
  const out: Chunk[] = [];
  const radial = STYLE[style].radial;
  for (const seg of SEGMENTS) {
    if (seg.length < 2) continue;
    const sm = sampleSegment(seg, style);
    const last = sm.P.length - 1;
    let a = 0;
    while (a < seg.length) {
      let b = a;
      while (b + 1 < seg.length && seg[b + 1].regionId === seg[a].regionId) b++;
      const s0 = Math.max(0, Math.round((a - 0.5) * sm.perRes));
      const s1 = Math.min(last, Math.round((b + 0.5) * sm.perRes));
      if (s1 > s0) {
        out.push({ key: `${style}-${seg[a].res}`, regionId: seg[a].regionId, resStart: seg[a].res, resEnd: seg[b].res, geometry: tubeGeometry(sm, s0, s1, radial) });
      }
      a = b + 1;
    }
  }
  return out;
}

// ─── Membrane headgroups ─────────────────────────────────────────────────

export const MEMBRANE = { halfThickness: 15, headgroupY: 17, radius: 74 };

const hash = (i: number, j: number, k: number) => {
  const x = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Deterministic lipid headgroup positions on a jittered hexagonal lattice (≈ 60 Å² per lipid),
 * leaving a hole where the protein's Cα footprint crosses each leaflet.
 */
export function lipidHeadgroups(): THREE.Vector3[] {
  const spacing = 7.8;
  const out: THREE.Vector3[] = [];
  const clear = 6.2;
  for (const [layer, sign] of [[0, 1], [1, -1]] as const) {
    const y0 = sign * MEMBRANE.headgroupY;
    const foot = RESIDUES.filter((r) => r.pos.y * sign > -4 && r.pos.y * sign < 27).map((r) => [r.pos.x, r.pos.z]);
    const rows = Math.ceil(MEMBRANE.radius / (spacing * 0.866));
    for (let j = -rows; j <= rows; j++) {
      for (let i = -rows - 1; i <= rows + 1; i++) {
        const x = (i + (j & 1 ? 0.5 : 0)) * spacing + (hash(i, j, layer) - 0.5) * 2.4;
        const z = j * spacing * 0.866 + (hash(j, i, layer + 7) - 0.5) * 2.4;
        const rr = x * x + z * z;
        if (rr > MEMBRANE.radius * MEMBRANE.radius || rr < 16 * 16) continue; // keep the pore domain clear
        let blocked = false;
        for (const [fx, fz] of foot) {
          const dx = fx - x;
          const dz = fz - z;
          if (dx * dx + dz * dz < clear * clear) { blocked = true; break; }
        }
        if (blocked) continue;
        out.push(new THREE.Vector3(x, y0 + (hash(i, j, layer + 3) - 0.5) * 1.2, z));
      }
    }
  }
  return out;
}
