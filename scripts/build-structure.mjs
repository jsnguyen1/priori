// Preprocesses the RCSB mmCIF for PDB 6J8E (human NaV1.2–β2–KIIIA, Pan et al. 2019)
// into a compact Cα trace aligned so the membrane normal is +Y (extracellular up).
// Usage: node scripts/build-structure.mjs path/to/6j8e.cif
import { readFileSync, writeFileSync } from 'node:fs';

const cifPath = process.argv[2];
if (!cifPath) throw new Error('usage: build-structure.mjs <6j8e.cif>');
const lines = readFileSync(cifPath, 'utf8').split('\n');

// Cα atoms of entity chain B (NaV1.2 α subunit), auth numbering = UniProt Q99250 numbering.
const ca = [];
for (const l of lines) {
  if (!l.startsWith('ATOM')) continue;
  const t = l.trim().split(/\s+/);
  if (t[3] !== 'CA' || t[6] !== 'B') continue;
  ca.push({ r: +t[16], x: +t[10], y: +t[11], z: +t[12], b: +t[14] });
}

// Helix ranges (auth numbering) for chain B.
const helices = [];
for (const l of lines) {
  if (!l.startsWith('HELX_P')) continue;
  const t = l.trim().split(/\s+/);
  if (t[4] !== 'B') continue;
  helices.push([+t[13], +t[16]]);
}

// Membrane normal: least-variance axis of transmembrane-segment Cα atoms.
const feats = JSON.parse(readFileSync(new URL('./q99250.features.json', import.meta.url))).features;
const tm = feats.filter((f) => f.type === 'Transmembrane').map((f) => [f.location.start.value, f.location.end.value]);
const inTM = (r) => tm.some(([a, b]) => r >= a && r <= b);
const tmAtoms = ca.filter((a) => inTM(a.r));
const c = [0, 1, 2].map((k) => tmAtoms.reduce((s, a) => s + [a.x, a.y, a.z][k], 0) / tmAtoms.length);
const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
for (const a of tmAtoms) {
  const d = [a.x - c[0], a.y - c[1], a.z - c[2]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += d[i] * d[j];
}
// Jacobi eigen-decomposition (3x3 symmetric).
function jacobi(A) {
  const a = A.map((r) => r.slice());
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-12) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = cs * akp - sn * akq; a[k][q] = sn * akp + cs * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = cs * apk - sn * aqk; a[q][k] = sn * apk + cs * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = cs * vkp - sn * vkq; v[k][q] = sn * vkp + cs * vkq;
      }
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], vectors: [0, 1, 2].map((i) => [v[0][i], v[1][i], v[2][i]]) };
}
const { values, vectors } = jacobi(cov);
const order = [0, 1, 2].sort((i, j) => values[j] - values[i]);
let ex = vectors[order[0]], ny = vectors[order[2]];
const dot = (u, w) => u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
const cross = (u, w) => [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];

// Orient normal toward the extracellular side (pore loops / S1-S2 loops are extracellular).
const extra = feats.filter((f) => f.type === 'Topological domain' && f.description === 'Extracellular')
  .map((f) => [f.location.start.value, f.location.end.value]);
const exAtoms = ca.filter((a) => extra.some(([s, e]) => a.r >= s && a.r <= e));
const exC = [0, 1, 2].map((k) => exAtoms.reduce((s, a) => s + [a.x, a.y, a.z][k], 0) / exAtoms.length);
if (dot([exC[0] - c[0], exC[1] - c[1], exC[2] - c[2]], ny) < 0) ny = ny.map((x) => -x);
const ez = cross(ex, ny);
ex = cross(ny, ez);

// Pore axis passes through the centroid of the four S6 helices; recentre there in-plane.
const s6 = tm.filter((_, i) => i % 6 === 5);
const s6Atoms = ca.filter((a) => s6.some(([s, e]) => a.r >= s && a.r <= e));
const s6C = [0, 1, 2].map((k) => s6Atoms.reduce((s, a) => s + [a.x, a.y, a.z][k], 0) / s6Atoms.length);
const origin = [s6C[0], s6C[1], s6C[2]];
const yShift = dot([c[0] - s6C[0], c[1] - s6C[1], c[2] - s6C[2]], ny); // membrane centre on y = 0

const out = ca.map((a) => {
  const d = [a.x - origin[0], a.y - origin[1], a.z - origin[2]];
  return [a.r, +dot(d, ex).toFixed(2), +(dot(d, ny) - yShift).toFixed(2), +dot(d, ez).toFixed(2), Math.round(a.b)];
});

const json = {
  provenance: {
    pdbId: '6J8E',
    title: 'Human Nav1.2-beta2-KIIIA ternary complex',
    method: 'Cryo-electron microscopy',
    citation: 'Pan X, Li Z, Huang X, et al. Molecular basis for pore blockade of human Na+ channel Nav1.2 by the μ-conotoxin KIIIA. Science 363:1309–1313 (2019).',
    source: 'RCSB Protein Data Bank, https://www.rcsb.org/structure/6J8E',
    chain: 'NaV1.2 α subunit (label_asym B); β2 subunit and KIIIA toxin omitted',
    processing: 'Cα atoms only; coordinates rotated so the least-variance axis of transmembrane Cα atoms is +Y (extracellular up), centred on the S6 bundle. Numbering follows UniProt Q99250.',
  },
  // [residue, x, y, z, B-factor] in Å
  ca: out,
  helices,
};
writeFileSync(new URL('../src/data/structure/nav12_6j8e.json', import.meta.url), JSON.stringify(json));
console.log(`wrote ${out.length} Cα atoms, ${helices.length} helices; eigenvalues`, values.map((v) => Math.round(v)));
const ys = out.map((a) => a[2]); console.log('y range', Math.min(...ys), Math.max(...ys));
