// Pure Canvas2D renderer for the Mechanism Atlas. Semantic zoom:
//   LANDSCAPE   (wide)   — centred stacked density per mechanism class
//   VARIANTS    (mid)    — individual records at position × net classifier score
//   MEASUREMENTS (close) — per-variant synthetic measurement glyphs (± SE) and reference sequence
import type { ScaleLinear } from 'd3';
import type { ProteinRegion } from '../../domain/types';
import { DOMAIN_SPANS, REGIONS, SCN2A_LENGTH, SCN2A_SEQUENCE } from '../../data/published';
import { THRESHOLDS } from '../../sim/classifier';
import { C, MECH_COLOR } from '../../ui/tokens';
import { type AtlasIndex, MECHS, lowerBound } from './atlasData';

export const MARGIN = { left: 92, right: 16 };
export const NET_DOMAIN: [number, number] = [-3.2, 3.2];
export const MIN_SPAN = 24;

export interface Layout {
  W: number;
  H: number;
  L: number;
  R: number;
  axisY: number;
  topo: { y0: number; y1: number; labelY: number; bracketY: number; extraY: number; memTop: number; memBot: number; cytoY: number; ifmY: number };
  main: { y0: number; y1: number; zero: number };
  meas: { y0: number; y1: number; rowH: number };
  map: { y0: number; y1: number };
}

export function computeLayout(W: number, H: number, simple = false): Layout {
  const L = MARGIN.left;
  const R = Math.max(L + 50, W - MARGIN.right);
  const ty0 = 28;
  const topo = { y0: ty0, y1: ty0 + 72, labelY: ty0 + 9, bracketY: ty0 + 14, extraY: ty0 + 25, memTop: ty0 + 32, memBot: ty0 + 50, cytoY: ty0 + 58, ifmY: ty0 + 69 };
  const mapH = 30;
  const map = { y0: H - 8 - mapH, y1: H - 8 };
  // Simple view drops the per-variant measurement sub-plot; the main plot takes its space.
  const rowH = simple ? 0 : 22;
  const meas = simple ? { y0: map.y0 - 22, y1: map.y0 - 22, rowH } : { y0: map.y0 - 16 - rowH * 4, y1: map.y0 - 16, rowH };
  const main = { y0: topo.y1 + 14, y1: meas.y0 - (simple ? 4 : 16), zero: 0 };
  main.zero = (main.y0 + main.y1) / 2;
  return { W, H, L, R, axisY: 22, topo, main, meas, map };
}

export interface DrawState {
  xs: ScaleLinear<number, number>;
  x0: ScaleLinear<number, number>;
  index: AtlasIndex;
  mask: Uint8Array | null;
  hidden: Set<number>;
  selected: number;
  hover: HoverTarget | null;
  layout: Layout;
  /** Simple view: plain-English labels, no measurement sub-plot. */
  simple?: boolean;
}

export type HoverTarget =
  | { kind: 'variant'; i: number }
  | { kind: 'bin'; a: number; b: number; counts: number[] }
  | { kind: 'region'; region: ProteinRegion };

const smooth = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function levelAlphas(span: number) {
  return {
    density: 0.14 * smooth(span, 140, 300) + 0.86 * smooth(span, 300, 650),
    marks: 1 - smooth(span, 420, 800),
    meas: 1 - smooth(span, 80, 150),
    seq: 1 - smooth(span, 70, 110),
  };
}

export function levelOf(span: number): 'LANDSCAPE' | 'VARIANTS' | 'MEASUREMENTS' {
  if (span > 600) return 'LANDSCAPE';
  if (span > 120) return 'VARIANTS';
  return 'MEASUREMENTS';
}

const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
};
const MECH_HEX = MECHS.map((m) => MECH_COLOR[m]);
const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const BIN_STEPS = [1, 2, 5, 10, 20, 25, 50, 100];

export function binResFor(span: number, plotW: number) {
  const target = (span / plotW) * 6;
  return BIN_STEPS.find((b) => b >= target) ?? 100;
}

export function slotOffset(index: AtlasIndex, i: number, pxPerRes: number) {
  const n = index.slotN[i];
  if (n <= 1 || pxPerRes < 3) return 0;
  const step = Math.min((pxPerRes * 0.8) / n, 7);
  return (index.slot[i] - (n - 1) / 2) * step;
}

export function netY(layout: Layout, net: number) {
  const { y0, y1 } = layout.main;
  const t = (Math.min(NET_DOMAIN[1], Math.max(NET_DOMAIN[0], net)) - NET_DOMAIN[0]) / (NET_DOMAIN[1] - NET_DOMAIN[0]);
  return y1 - 5 - t * (y1 - y0 - 10);
}

/** Position of a record's mark in the main plot (hidden-mechanism patient variants sit on the zero line). */
export function markXY(s: DrawState, i: number): [number, number] {
  const pxPerRes = (s.layout.R - s.layout.L) / (s.xs.domain()[1] - s.xs.domain()[0]);
  const x = s.xs(s.index.pos[i]) + slotOffset(s.index, i, pxPerRes);
  const y = s.hidden.has(i) ? s.layout.main.zero : netY(s.layout, s.index.net[i]);
  return [x, y];
}

function text(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, color: string, size = 9, align: CanvasTextAlign = 'left', base: CanvasTextBaseline = 'middle') {
  ctx.font = `${size}px ${MONO}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(t, x, y);
}

const regionLevel = (r: ProteinRegion, t: Layout['topo']) =>
  r.topology === 'extracellular' ? t.extraY : r.topology === 'cytoplasmic' ? t.cytoY : r.topology === 'intramembrane' ? t.memTop + (t.memBot - t.memTop) * 0.55 : null;

export function draw(ctx: CanvasRenderingContext2D, s: DrawState) {
  const { layout: Lo, xs, index } = s;
  const { W, H, L, R } = Lo;
  const [d0, d1] = xs.domain();
  const span = d1 - d0;
  const plotW = R - L;
  const pxPerRes = plotW / span;
  const A = levelAlphas(span);
  ctx.clearRect(0, 0, W, H);

  const iLo = lowerBound(index.pos, Math.floor(d0) - 1);
  const iHi = lowerBound(index.pos, Math.ceil(d1) + 2);

  // ── left-margin track titles
  if (s.simple) {
    text(ctx, 'outside', L - 8, Lo.topo.extraY, C.mute, 9, 'right');
    text(ctx, 'membrane', L - 8, (Lo.topo.memTop + Lo.topo.memBot) / 2, C.mute, 9, 'right');
    text(ctx, 'inside', L - 8, Lo.topo.cytoY, C.mute, 9, 'right');
  } else {
    text(ctx, 'RESIDUE', 12, 12, C.dim, 8.5);
    text(ctx, 'TOPOLOGY', 12, Lo.topo.labelY, C.dim, 8.5);
    text(ctx, 'OUT', L - 8, Lo.topo.extraY, C.dim, 8, 'right');
    text(ctx, 'MEM', L - 8, (Lo.topo.memTop + Lo.topo.memBot) / 2, C.dim, 8, 'right');
    text(ctx, 'IN', L - 8, Lo.topo.cytoY, C.dim, 8, 'right');
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(L, 0, plotW, H);
  ctx.clip();

  drawAxis(ctx, s, d0, d1, pxPerRes, A.seq);
  drawTopology(ctx, s, pxPerRes);
  drawMain(ctx, s, A, iLo, iHi, pxPerRes, span);
  if (!s.simple) drawMeasurements(ctx, s, A.meas, iLo, iHi, pxPerRes);
  drawGuides(ctx, s, pxPerRes);
  ctx.restore();

  drawMainAxisLabels(ctx, s, A);
  if (s.simple) drawSimpleFooter(ctx, s);
  else drawMeasLabels(ctx, s, A.meas);
  drawMinimap(ctx, s, d0, d1);
}

function drawAxis(ctx: CanvasRenderingContext2D, s: DrawState, d0: number, d1: number, pxPerRes: number, seqA: number) {
  const { xs, layout: Lo } = s;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Lo.L, Lo.axisY + 0.5);
  ctx.lineTo(Lo.R, Lo.axisY + 0.5);
  ctx.stroke();
  const ticks = xs.ticks(Math.max(4, Math.floor((Lo.R - Lo.L) / 90))).filter((t) => Number.isInteger(t) && t >= 1 && t <= SCN2A_LENGTH);
  ctx.beginPath();
  for (const t of ticks) {
    const x = Math.round(xs(t)) + 0.5;
    ctx.moveTo(x, Lo.axisY - 4);
    ctx.lineTo(x, Lo.axisY);
  }
  ctx.stroke();
  for (const t of ticks) text(ctx, t.toLocaleString('en-US'), xs(t), seqA > 0.05 ? 7 : 11, C.mute, 9, 'center');
  if (seqA > 0.02) {
    ctx.globalAlpha = seqA;
    const p0 = Math.max(1, Math.floor(d0));
    const p1 = Math.min(SCN2A_LENGTH, Math.ceil(d1));
    const size = Math.min(10, Math.max(7, pxPerRes * 0.75));
    for (let p = p0; p <= p1; p++) text(ctx, SCN2A_SEQUENCE[p - 1], xs(p), 16, p % 10 === 0 ? C.ink : C.dim, size, 'center');
    ctx.globalAlpha = 1;
  }
}

function drawTopology(ctx: CanvasRenderingContext2D, s: DrawState, pxPerRes: number) {
  const { xs, layout: Lo, hover } = s;
  const t = Lo.topo;
  // membrane band
  ctx.fillStyle = 'rgba(37,53,66,0.16)';
  ctx.fillRect(Lo.L, t.memTop, Lo.R - Lo.L, t.memBot - t.memTop);
  ctx.strokeStyle = C.line2;
  ctx.beginPath();
  ctx.moveTo(Lo.L, t.memTop + 0.5);
  ctx.lineTo(Lo.R, t.memTop + 0.5);
  ctx.moveTo(Lo.L, t.memBot + 0.5);
  ctx.lineTo(Lo.R, t.memBot + 0.5);
  ctx.stroke();

  // hovered region highlight
  if (hover?.kind === 'region') {
    const r = hover.region;
    ctx.fillStyle = 'rgba(231,238,244,0.06)';
    ctx.fillRect(xs(r.start - 0.5), t.y0 + 16, xs(r.end + 0.5) - xs(r.start - 0.5), t.y1 - t.y0 - 16);
  }

  // domain brackets
  for (const d of DOMAIN_SPANS) {
    const a = xs(d.start - 0.5);
    const b = xs(d.end + 0.5);
    if (b < Lo.L || a > Lo.R) continue;
    ctx.strokeStyle = C.line;
    ctx.beginPath();
    ctx.moveTo(a + 0.5, t.bracketY + 3);
    ctx.lineTo(a + 0.5, t.bracketY + 0.5);
    ctx.lineTo(b - 0.5, t.bracketY + 0.5);
    ctx.lineTo(b - 0.5, t.bracketY + 3);
    ctx.stroke();
    const cx = Math.min(Math.max((a + b) / 2, Lo.L + 16), Lo.R - 16);
    text(ctx, d.label, Math.min(Math.max(cx, a + 12), b - 12), t.labelY - 1, C.mute, 9.5, 'center');
  }

  // backbone polyline through loops (transmembrane segments connect diagonally underneath blocks)
  ctx.strokeStyle = 'rgba(138,156,169,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  let first = true;
  for (const r of REGIONS) {
    const y = regionLevel(r, t);
    if (y === null) continue;
    const a = xs(r.start - 0.5);
    const b = xs(r.end + 0.5);
    if (first) {
      ctx.moveTo(a, y);
      first = false;
    } else ctx.lineTo(a, y);
    ctx.lineTo(b, y);
  }
  ctx.stroke();

  // segments
  for (const r of REGIONS) {
    const a = xs(r.start - 0.5);
    const b = xs(r.end + 0.5);
    if (b < Lo.L - 2 || a > Lo.R + 2) continue;
    const w = b - a;
    if (r.topology === 'transmembrane') {
      ctx.fillStyle = r.kind === 'S4' ? '#26384A' : '#1B2934';
      ctx.fillRect(a, t.memTop - 2, w, t.memBot - t.memTop + 4);
      ctx.strokeStyle = r.kind === 'S4' ? '#3A5163' : '#2C3E4C';
      ctx.strokeRect(a + 0.5, t.memTop - 1.5, Math.max(0, w - 1), t.memBot - t.memTop + 3);
      if (w >= 15) text(ctx, r.kind, (a + b) / 2, (t.memTop + t.memBot) / 2, r.kind === 'S4' ? C.ink : C.mute, w >= 26 ? 9 : 8, 'center');
    } else if (r.topology === 'intramembrane') {
      const yb = t.memTop + (t.memBot - t.memTop) * 0.6;
      ctx.fillStyle = '#1B2934';
      ctx.fillRect(a, t.memTop - 2, w, yb - t.memTop + 2);
      ctx.strokeStyle = '#2C3E4C';
      ctx.strokeRect(a + 0.5, t.memTop - 1.5, Math.max(0, w - 1), yb - t.memTop + 1);
      if (w >= 15) text(ctx, 'P', (a + b) / 2, (t.memTop + yb) / 2, C.mute, 8.5, 'center');
    } else if (w > 84 && r.kind !== 'inactivation-gate') {
      const y = regionLevel(r, t)!;
      const label = r.kind === 'domain-linker' || r.kind === 'N-term' || r.kind === 'C-term' ? r.label : r.label.replace(/^D[IV]+ /, '');
      text(ctx, label, Math.min(Math.max((a + b) / 2, Lo.L + 40), Lo.R - 40), r.topology === 'extracellular' ? y - 6 : y + 7, C.dim, 8.5, 'center');
    }
  }

  // IFM motif
  const ifm = REGIONS.find((r) => r.id === 'IFM');
  if (ifm) {
    const a = xs(ifm.start - 0.5);
    const b = xs(ifm.end + 0.5);
    ctx.fillStyle = C.ink;
    ctx.fillRect(a, t.cytoY - 2, Math.max(2, b - a), 4);
    text(ctx, 'IFM', (a + b) / 2, t.ifmY, C.mute, 8.5, 'center');
  }
  void pxPerRes;
}

function drawMain(ctx: CanvasRenderingContext2D, s: DrawState, A: ReturnType<typeof levelAlphas>, iLo: number, iHi: number, pxPerRes: number, span: number) {
  const { xs, layout: Lo, index, mask } = s;
  const m = Lo.main;
  const half = (m.y1 - m.y0) / 2;

  // frame lines
  ctx.strokeStyle = C.line2;
  ctx.beginPath();
  ctx.moveTo(Lo.L, m.y0 + 0.5);
  ctx.lineTo(Lo.R, m.y0 + 0.5);
  ctx.moveTo(Lo.L, m.y1 + 0.5);
  ctx.lineTo(Lo.R, m.y1 + 0.5);
  ctx.stroke();

  // domain shading (alternating) for orientation
  for (const d of DOMAIN_SPANS) {
    ctx.fillStyle = 'rgba(22,33,43,0.35)';
    ctx.fillRect(xs(d.start - 0.5), m.y0 + 1, xs(d.end + 0.5) - xs(d.start - 0.5), m.y1 - m.y0 - 1);
  }

  // ── density (centred stack: GoF up · mixed/indet core · LoF down)
  if (A.density > 0.01) {
    const binRes = binResFor(span, Lo.R - Lo.L);
    const b0 = Math.floor((Math.max(1, Math.floor(d0of(xs))) - 1) / binRes);
    const b1 = Math.floor((Math.min(SCN2A_LENGTH, Math.ceil(d1of(xs))) - 1) / binRes);
    const nb = b1 - b0 + 1;
    const acc = new Float32Array(nb * 4);
    const jLo = lowerBound(index.pos, b0 * binRes + 1);
    const jHi = lowerBound(index.pos, (b1 + 1) * binRes + 1);
    for (let i = jLo; i < jHi; i++) {
      if (mask && !mask[i]) continue;
      if (s.hidden.has(i)) continue;
      const b = Math.floor((index.pos[i] - 1) / binRes) - b0;
      if (b >= 0 && b < nb) acc[b * 4 + index.mech[i]]++;
    }
    const unit = (half * 0.92) / index.densHalfMax; // px per (record / 10 aa)
    const k = 10 / binRes;
    for (let b = 0; b < nb; b++) {
      const gof = acc[b * 4] * k * unit;
      const lof = acc[b * 4 + 1] * k * unit;
      const mix = acc[b * 4 + 2] * k * unit;
      const ind = acc[b * 4 + 3] * k * unit;
      if (gof + lof + mix + ind === 0) continue;
      const start = (b0 + b) * binRes + 1;
      let xa = xs(start - 0.5);
      let xb = xs(start + binRes - 0.5);
      if (xb - xa > 4) {
        xa += 0.5;
        xb -= 0.5;
      }
      const w = xb - xa;
      const z = m.zero;
      const core = mix + ind;
      const cl = (h: number) => Math.min(h, half - 1);
      ctx.fillStyle = hexA(C.mixed, 0.8 * A.density);
      ctx.fillRect(xa, z - cl(mix / 2), w, cl(mix / 2) * 2);
      ctx.fillStyle = hexA(C.indet, 0.38 * A.density);
      ctx.fillRect(xa, z - cl(core / 2), w, cl(core / 2) - cl(mix / 2));
      ctx.fillRect(xa, z + cl(mix / 2), w, cl(core / 2) - cl(mix / 2));
      ctx.fillStyle = hexA(C.gof, 0.85 * A.density);
      ctx.fillRect(xa, z - cl(core / 2 + gof), w, cl(core / 2 + gof) - cl(core / 2));
      ctx.fillStyle = hexA(C.lof, 0.85 * A.density);
      ctx.fillRect(xa, z + cl(core / 2), w, cl(core / 2 + lof) - cl(core / 2));
    }
  }

  // ── net score frame (fades in with marks)
  if (A.marks > 0.01) {
    const yP = netY(Lo, THRESHOLDS.directional);
    const yN = netY(Lo, -THRESHOLDS.directional);
    ctx.fillStyle = `rgba(231,238,244,${0.025 * A.marks})`;
    ctx.fillRect(Lo.L, yP, Lo.R - Lo.L, yN - yP);
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = hexA(C.mute, 0.45 * A.marks);
    ctx.beginPath();
    ctx.moveTo(Lo.L, Math.round(yP) + 0.5);
    ctx.lineTo(Lo.R, Math.round(yP) + 0.5);
    ctx.moveTo(Lo.L, Math.round(yN) + 0.5);
    ctx.lineTo(Lo.R, Math.round(yN) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = s.simple ? 0 : A.marks;
    text(ctx, `GoF CALL · net ≥ +${THRESHOLDS.directional}`, Lo.R - 4, yP - 7, hexA(C.gof, 0.8), 8.5, 'right');
    text(ctx, `LoF CALL · net ≤ −${THRESHOLDS.directional}`, Lo.R - 4, yN + 8, hexA(C.lof, 0.85), 8.5, 'right');
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = C.line;
  ctx.beginPath();
  ctx.moveTo(Lo.L, Math.round(m.zero) + 0.5);
  ctx.lineTo(Lo.R, Math.round(m.zero) + 0.5);
  ctx.stroke();

  // ── individual records
  if (A.marks > 0.01) {
    const grow = 1 + 0.5 * (1 - smooth(span, 40, 300));
    const radius = [2.7 * grow, 2.2 * grow, 2.3 * grow, 2.3 * grow];
    // group paths: [dim][mech][ev]
    const paths: Path2D[] = [];
    const used: boolean[] = [];
    for (let i = iLo; i < iHi; i++) {
      if (index.patientIdx.includes(i)) continue;
      const x = xs(index.pos[i]) + slotOffset(index, i, pxPerRes);
      if (x < Lo.L - 6 || x > Lo.R + 6) continue;
      const y = netY(Lo, index.net[i]);
      const dim = mask && !mask[i] ? 1 : 0;
      const ev = Math.min(2, index.ev[i]);
      const g = dim * 12 + index.mech[i] * 3 + ev;
      const p = (paths[g] ??= new Path2D());
      used[g] = true;
      const r = radius[ev];
      p.moveTo(x + r, y);
      p.arc(x, y, r, 0, Math.PI * 2);
    }
    for (let g = 0; g < 24; g++) {
      if (!used[g]) continue;
      const dim = g >= 12;
      const mech = Math.floor((g % 12) / 3);
      const ev = g % 3;
      const a = A.marks * (dim ? 0.1 : 1);
      const col = MECH_HEX[mech];
      if (ev === 0) {
        ctx.fillStyle = hexA(col, 0.95 * a);
        ctx.fill(paths[g]);
      } else if (ev === 1) {
        ctx.fillStyle = hexA(col, 0.42 * a);
        ctx.fill(paths[g]);
        ctx.strokeStyle = hexA(col, 0.55 * a);
        ctx.lineWidth = 0.75;
        ctx.stroke(paths[g]);
      } else {
        ctx.strokeStyle = hexA(col, 0.6 * a);
        ctx.lineWidth = 1;
        ctx.stroke(paths[g]);
      }
    }
  }
}

const d0of = (xs: ScaleLinear<number, number>) => xs.domain()[0];
const d1of = (xs: ScaleLinear<number, number>) => xs.domain()[1];

const MEAS_ROWS: { key: 'peakL2' | 'dAct' | 'dInact' | 'persL2'; se: 'peakL2Se' | 'dActSe' | 'dInactSe' | 'persL2Se'; label: string; unit: string; dom: number; scale: string }[] = [
  { key: 'peakL2', se: 'peakL2Se', label: 'PEAK', unit: 'log₂ ×ref', dom: 2, scale: '±2' },
  { key: 'dAct', se: 'dActSe', label: 'ΔV½ ACT', unit: 'mV', dom: 15, scale: '±15' },
  { key: 'dInact', se: 'dInactSe', label: 'ΔV½ INACT', unit: 'mV', dom: 15, scale: '±15' },
  { key: 'persL2', se: 'persL2Se', label: 'PERSIST', unit: 'log₂ ×ref', dom: 3, scale: '±3' },
];

function drawMeasurements(ctx: CanvasRenderingContext2D, s: DrawState, a: number, iLo: number, iHi: number, pxPerRes: number) {
  const { xs, layout: Lo, index, mask, hidden, selected } = s;
  const M = Lo.meas;
  for (let r = 0; r < 4; r++) {
    const mid = M.y0 + M.rowH * (r + 0.5);
    ctx.strokeStyle = r === 0 ? C.line : C.line2;
    ctx.beginPath();
    ctx.moveTo(Lo.L, Math.round(M.y0 + M.rowH * r) + 0.5);
    ctx.lineTo(Lo.R, Math.round(M.y0 + M.rowH * r) + 0.5);
    ctx.stroke();
    ctx.strokeStyle = hexA(C.line, 0.6);
    ctx.setLineDash([1, 3]);
    ctx.beginPath();
    ctx.moveTo(Lo.L, Math.round(mid) + 0.5);
    ctx.lineTo(Lo.R, Math.round(mid) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = C.line;
  ctx.beginPath();
  ctx.moveTo(Lo.L, Math.round(M.y1) + 0.5);
  ctx.lineTo(Lo.R, Math.round(M.y1) + 0.5);
  ctx.stroke();

  if (a < 0.02) {
    text(ctx, 'PER-VARIANT SYNTHETIC MEASUREMENTS · ZOOM BELOW 150 RESIDUES TO RESOLVE', (Lo.L + Lo.R) / 2, (M.y0 + M.y1) / 2, C.dim, 9, 'center');
    return;
  }
  for (let i = iLo; i < iHi; i++) {
    const n = index.slotN[i];
    const bw = Math.max(2, Math.min(7, (pxPerRes * 0.8) / n - 1));
    const x = xs(index.pos[i]) + slotOffset(index, i, pxPerRes);
    if (x < Lo.L - 8 || x > Lo.R + 8) continue;
    const dimmed = mask && !mask[i];
    const ev = Math.min(2, index.ev[i]);
    const alpha = a * (dimmed ? 0.12 : 1) * (ev === 0 ? 0.95 : ev === 1 ? 0.6 : 0.55);
    if (hidden.has(i)) {
      for (let r = 0; r < 4; r++) text(ctx, '?', x, M.y0 + M.rowH * (r + 0.5), hexA(C.ink, 0.7 * a), 9, 'center');
      continue;
    }
    const col = MECH_HEX[index.mech[i]];
    for (let r = 0; r < 4; r++) {
      const row = MEAS_ROWS[r];
      const mid = M.y0 + M.rowH * (r + 0.5);
      const hh = M.rowH / 2 - 2.5;
      const v = index[row.key][i];
      const h = Math.max(-1, Math.min(1, v / row.dom)) * hh;
      const y = h >= 0 ? mid - h : mid;
      const hgt = Math.max(1, Math.abs(h));
      if (ev === 2) {
        ctx.strokeStyle = hexA(col, alpha);
        ctx.lineWidth = 1;
        ctx.strokeRect(x - bw / 2 + 0.5, y + 0.5, Math.max(1, bw - 1), Math.max(0, hgt - 1));
      } else {
        ctx.fillStyle = hexA(col, alpha);
        ctx.fillRect(x - bw / 2, y, bw, hgt);
      }
      if (bw >= 3 && a > 0.3 && !dimmed) {
        const se = (index[row.se][i] / row.dom) * hh;
        const yv = mid - h;
        ctx.strokeStyle = `rgba(231,238,244,${(0.4 * a).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, Math.max(mid - hh - 1.5, yv - se));
        ctx.lineTo(Math.round(x) + 0.5, Math.min(mid + hh + 1.5, yv + se));
        ctx.stroke();
      }
    }
    if (i === selected) {
      ctx.strokeStyle = hexA(C.ink, 0.8 * a);
      ctx.strokeRect(x - bw / 2 - 2.5, M.y0 + 1.5, bw + 5, M.y1 - M.y0 - 3);
    }
  }
}

function drawGuides(ctx: CanvasRenderingContext2D, s: DrawState, pxPerRes: number) {
  const { xs, layout: Lo, index, hidden, selected, hover } = s;
  // patient variants: guide + label + distinct diamond
  const sorted = [...index.patientIdx].sort((a, b) => index.pos[a] - index.pos[b]);
  const rowEnd: number[] = [];
  for (const i of sorted) {
    const v = index.variants[i];
    const [x, y] = markXY(s, i);
    if (x < Lo.L - 40 || x > Lo.R + 40) continue;
    ctx.strokeStyle = 'rgba(231,238,244,0.26)';
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, Lo.topo.y0 + 16);
    ctx.lineTo(Math.round(x) + 0.5, Lo.meas.y1);
    ctx.stroke();
    ctx.setLineDash([]);
    // label (stacked to avoid overlap)
    const label = v.patientIds[0];
    ctx.font = `9px ${MONO}`;
    const tw = ctx.measureText(label).width + 8;
    let row = 0;
    while (rowEnd[row] !== undefined && rowEnd[row] > x - 2) row++;
    rowEnd[row] = x + tw;
    const ly = Lo.main.y0 + 4 + row * 15;
    ctx.fillStyle = C.canvas;
    ctx.fillRect(x + 0.5, ly, tw, 13);
    ctx.strokeStyle = 'rgba(231,238,244,0.45)';
    ctx.strokeRect(x + 0.5, ly + 0.5, tw, 12);
    text(ctx, label, x + 4.5, ly + 7, C.ink, 9);
    // diamond
    const r = 5.5;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    if (hidden.has(i)) {
      ctx.fillStyle = C.canvas;
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, '?', x, y + 0.5, C.ink, 8, 'center');
      if (pxPerRes > 0.6) {
        if (s.simple) text(ctx, 'NOT MEASURED YET', x + 17, y, C.ink, 9);
        else text(ctx, 'UNCHARACTERIZED', x + 9, y, C.mute, 8.5);
      }
    } else {
      ctx.fillStyle = MECH_HEX[index.mech[i]];
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // topology tick
    ctx.fillStyle = C.ink;
    ctx.fillRect(Math.round(x) - 0.5, Lo.topo.cytoY + 5, 2, 5);
  }

  // selection
  if (selected >= 0) {
    const [x, y] = markXY(s, selected);
    if (x >= Lo.L - 10 && x <= Lo.R + 10) {
      ctx.strokeStyle = 'rgba(231,238,244,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, Lo.axisY);
      ctx.lineTo(Math.round(x) + 0.5, Lo.topo.y0 + 16);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 8.5, 0, Math.PI * 2);
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      // crosshair ticks
      ctx.beginPath();
      ctx.moveTo(x - 13, y);
      ctx.lineTo(x - 10, y);
      ctx.moveTo(x + 10, y);
      ctx.lineTo(x + 13, y);
      ctx.moveTo(x, y - 13);
      ctx.lineTo(x, y - 10);
      ctx.moveTo(x, y + 10);
      ctx.lineTo(x, y + 13);
      ctx.stroke();
      ctx.lineWidth = 1;
      // axis caret
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.moveTo(x - 4, Lo.axisY + 0.5);
      ctx.lineTo(x + 4, Lo.axisY + 0.5);
      ctx.lineTo(x, Lo.axisY + 5);
      ctx.closePath();
      ctx.fill();
    }
  }

  // hover
  if (hover?.kind === 'variant') {
    const [x, y] = markXY(s, hover.i);
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(231,238,244,0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(231,238,244,0.18)';
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, Lo.main.y0);
    ctx.lineTo(Math.round(x) + 0.5, Lo.meas.y1);
    ctx.stroke();
  } else if (hover?.kind === 'bin') {
    const a = xs(hover.a - 0.5);
    const b = xs(hover.b + 0.5);
    ctx.strokeStyle = 'rgba(231,238,244,0.5)';
    ctx.strokeRect(a + 0.5, Lo.main.y0 + 1.5, b - a - 1, Lo.main.y1 - Lo.main.y0 - 3);
  }
}

function drawMainAxisLabels(ctx: CanvasRenderingContext2D, s: DrawState, A: ReturnType<typeof levelAlphas>) {
  const Lo = s.layout;
  const m = Lo.main;
  const dA = 1 - A.marks;
  if (s.simple) {
    // One plain label per band; no score ticks or density scale.
    const top = A.marks > 0.5 ? netY(Lo, 2.2) : m.zero - (m.y1 - m.y0) * 0.25;
    const bot = A.marks > 0.5 ? netY(Lo, -2.2) : m.zero + (m.y1 - m.y0) * 0.25;
    text(ctx, '↑ TOO', 12, top - 7, hexA(C.gof, 0.95), 10);
    text(ctx, '  ACTIVE', 12, top + 7, hexA(C.gof, 0.95), 10);
    text(ctx, 'UNCLEAR', 12, m.zero, C.mute, 10);
    text(ctx, '↓ TOO', 12, bot - 7, hexA(C.lof, 0.95), 10);
    text(ctx, '  WEAK', 12, bot + 7, hexA(C.lof, 0.95), 10);
    return;
  }
  if (A.marks > 0.02) {
    ctx.globalAlpha = A.marks;
    text(ctx, 'NET SCORE', 12, m.y0 + 8, C.dim, 8.5);
    for (const t of [-3, -2, -1, 0, 1, 2, 3]) {
      const y = netY(Lo, t);
      text(ctx, t > 0 ? `+${t}` : t < 0 ? `−${-t}` : '0', Lo.L - 8, y, t === 0 ? C.mute : C.dim, 9, 'right');
      ctx.strokeStyle = C.line;
      ctx.beginPath();
      ctx.moveTo(Lo.L - 4, Math.round(y) + 0.5);
      ctx.lineTo(Lo.L, Math.round(y) + 0.5);
      ctx.stroke();
    }
    text(ctx, '↑ GoF', 12, netY(Lo, 2.2), hexA(C.gof, 0.85), 8.5);
    text(ctx, '↓ LoF', 12, netY(Lo, -2.2), hexA(C.lof, 0.9), 8.5);
    ctx.globalAlpha = 1;
  }
  if (dA > 0.02) {
    ctx.globalAlpha = dA;
    text(ctx, 'DENSITY', 12, m.y0 + 8, C.dim, 8.5);
    text(ctx, 'records/10 aa', 12, m.y0 + 20, C.dim, 8);
    text(ctx, 'GoF', 12, m.zero - (m.y1 - m.y0) * 0.25, hexA(C.gof, 0.9), 9);
    text(ctx, 'mixed · ind.', 12, m.zero, C.mute, 8.5);
    text(ctx, 'LoF', 12, m.zero + (m.y1 - m.y0) * 0.25, hexA(C.lof, 0.95), 9);
    const half = (m.y1 - m.y0) / 2;
    const yTop = m.zero - half * 0.92;
    ctx.strokeStyle = C.line;
    ctx.beginPath();
    ctx.moveTo(Lo.L - 4, Math.round(yTop) + 0.5);
    ctx.lineTo(Lo.L, Math.round(yTop) + 0.5);
    ctx.moveTo(Lo.L - 4, Math.round(m.zero) + 0.5);
    ctx.lineTo(Lo.L, Math.round(m.zero) + 0.5);
    ctx.stroke();
    text(ctx, String(s.index.densHalfMax), Lo.L - 8, yTop, C.dim, 8.5, 'right');
    ctx.globalAlpha = 1;
  }
}

function drawMeasLabels(ctx: CanvasRenderingContext2D, s: DrawState, a: number) {
  const Lo = s.layout;
  const M = Lo.meas;
  for (let r = 0; r < 4; r++) {
    const row = MEAS_ROWS[r];
    const mid = M.y0 + M.rowH * (r + 0.5);
    text(ctx, row.label, 12, mid, a > 0.5 ? C.mute : C.dim, 8.5);
    if (a > 0.05) {
      ctx.globalAlpha = a;
      text(ctx, `${row.scale} ${row.unit.replace(' ×ref', '')}`, Lo.L - 6, mid, C.dim, 7.5, 'right');
      ctx.globalAlpha = 1;
    }
  }
  text(ctx, 'OVERVIEW', 12, (Lo.map.y0 + Lo.map.y1) / 2, C.dim, 8.5);
  text(ctx, 'SCROLL ZOOM · DRAG PAN · CLICK SELECT', Lo.R, Lo.map.y0 - 8, C.dim, 8, 'right');
  text(ctx, 'PEAK, PERSIST: log₂ ratio to matched reference · ΔV½: mV vs reference · whiskers ± 1 SE', Lo.L, Lo.map.y0 - 8, C.dim, 8, 'left');
}

function drawSimpleFooter(ctx: CanvasRenderingContext2D, s: DrawState) {
  const Lo = s.layout;
  text(ctx, 'WHOLE', 12, (Lo.map.y0 + Lo.map.y1) / 2 - 6, C.mute, 9);
  text(ctx, 'PROTEIN', 12, (Lo.map.y0 + Lo.map.y1) / 2 + 6, C.mute, 9);
  text(ctx, 'scroll to zoom · drag to move · click a dot', Lo.R, Lo.map.y0 - 9, C.mute, 9, 'right');
}

function drawMinimap(ctx: CanvasRenderingContext2D, s: DrawState, d0: number, d1: number) {
  const { x0, layout: Lo, index, mask, hidden } = s;
  const mp = Lo.map;
  const h = mp.y1 - mp.y0;
  ctx.fillStyle = C.bg;
  ctx.fillRect(Lo.L, mp.y0, Lo.R - Lo.L, h);
  for (const d of DOMAIN_SPANS) {
    ctx.fillStyle = 'rgba(37,53,66,0.35)';
    ctx.fillRect(x0(d.start - 0.5), mp.y1 - 3, x0(d.end + 0.5) - x0(d.start - 0.5), 3);
  }
  const binRes = 10;
  const nb = Math.ceil(SCN2A_LENGTH / binRes);
  const acc = new Float32Array(nb * 4);
  let mx = 1;
  for (let i = 0; i < index.n; i++) {
    if (mask && !mask[i]) continue;
    if (hidden.has(i)) continue;
    acc[Math.min(nb - 1, Math.floor((index.pos[i] - 1) / binRes)) * 4 + index.mech[i]]++;
  }
  for (let b = 0; b < nb; b++) mx = Math.max(mx, acc[b * 4] + acc[b * 4 + 1] + acc[b * 4 + 2] + acc[b * 4 + 3]);
  const unit = (h - 6) / mx;
  for (let b = 0; b < nb; b++) {
    const xa = x0(b * binRes + 0.5);
    const w = Math.max(0.5, x0((b + 1) * binRes + 0.5) - xa - 0.4);
    let y = mp.y1 - 3;
    for (const k of [1, 0, 2, 3]) {
      const hh = acc[b * 4 + k] * unit;
      if (!hh) continue;
      ctx.fillStyle = hexA(MECH_HEX[k], k === 3 ? 0.4 : 0.7);
      ctx.fillRect(xa, y - hh, w, hh);
      y -= hh;
    }
  }
  for (const i of index.patientIdx) {
    const x = Math.round(x0(index.pos[i])) + 0.5;
    ctx.strokeStyle = 'rgba(231,238,244,0.7)';
    ctx.beginPath();
    ctx.moveTo(x, mp.y0 - 3);
    ctx.lineTo(x, mp.y0 + 3);
    ctx.stroke();
  }
  const a = x0(d0);
  const b = x0(d1);
  const full = d1 - d0 >= SCN2A_LENGTH - 0.5;
  if (!full) {
    ctx.fillStyle = 'rgba(5,9,13,0.55)';
    ctx.fillRect(Lo.L, mp.y0, a - Lo.L, h);
    ctx.fillRect(b, mp.y0, Lo.R - b, h);
  }
  ctx.strokeStyle = 'rgba(231,238,244,0.6)';
  ctx.strokeRect(Math.round(a) + 0.5, mp.y0 + 0.5, Math.max(2, Math.round(b - a) - 1), h - 1);
  ctx.strokeStyle = C.line2;
  ctx.strokeRect(Lo.L + 0.5, mp.y0 + 0.5, Lo.R - Lo.L - 1, h - 1);
}
