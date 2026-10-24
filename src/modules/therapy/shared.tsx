// Shared visual vocabulary for the Therapeutic Design + Virtual Screening module.
import type { ReactNode } from 'react';
import type { ScreeningOutcome, StrategyRecommendation, TranscriptRegion } from '../../domain/types';
import { C } from '../../ui/tokens';
import { cx } from '../../ui/primitives';

export const OUTCOME_COLOR: Record<ScreeningOutcome, string> = {
  pass: C.cyan,
  mixed: C.gof,
  fail: C.warn,
  'excluded-uncertainty': C.indet,
};

export const RELEVANCE_COLOR: Record<StrategyRecommendation['relevance'], string> = {
  primary: C.cyan,
  secondary: C.gof,
  'not-indicated': C.dim,
};

export const REGION_STYLE: Record<TranscriptRegion['kind'], { fill: string; stroke: string; label: string }> = {
  exon: { fill: '#1E3140', stroke: '#2F4A5E', label: 'Coding exon' },
  intron: { fill: 'transparent', stroke: C.line, label: 'Intron (compressed)' },
  utr5: { fill: '#17242E', stroke: '#2A3A47', label: '5′ UTR' },
  utr3: { fill: '#17242E', stroke: '#2A3A47', label: '3′ UTR' },
  uorf: { fill: 'rgba(221,164,90,0.22)', stroke: C.gof, label: 'uORF / regulatory element' },
  'poison-exon': { fill: 'rgba(215,111,114,0.20)', stroke: C.warn, label: 'Poison exon (hypothetical)' },
  regulatory: { fill: 'rgba(165,140,227,0.20)', stroke: C.mixed, label: 'Regulatory element / splice site' },
};

export const PLATFORM_LABEL: Record<string, string> = {
  'shared-chemistry': 'SHARED CHEM',
  'modified-chemistry': 'MODIFIED CHEM',
  novel: 'NOVEL CHEM',
};

export const PLATFORM_COLOR: Record<string, string> = {
  'shared-chemistry': C.cyan,
  'modified-chemistry': C.gof,
  novel: C.warn,
};

export function OutcomeBadge({ outcome, label }: { outcome: ScreeningOutcome; label?: string }) {
  const color = OUTCOME_COLOR[outcome];
  return (
    <span
      className="inline-flex items-center h-[16px] px-1.5 border rounded-sm font-mono text-[9px] tracking-[0.08em] leading-none whitespace-nowrap"
      style={{ color, borderColor: `${color}80` }}
    >
      {label ?? outcome.replace('excluded-uncertainty', 'EXCLUDED').toUpperCase()}
    </span>
  );
}

export function RelevanceTag({ relevance }: { relevance: StrategyRecommendation['relevance'] }) {
  const color = RELEVANCE_COLOR[relevance];
  return (
    <span className="font-mono text-[9px] uppercase tracking-[0.1em] whitespace-nowrap" style={{ color }}>
      {relevance === 'not-indicated' ? 'NOT INDICATED' : relevance.toUpperCase()}
    </span>
  );
}

/** Dense 0–1 score bar with a threshold tick. */
export function ScoreBar({ value, width = 52, color = C.cyan, threshold }: { value: number; width?: number; color?: string; threshold?: number }) {
  return (
    <svg width={width} height={8} className="block">
      <rect x={0} y={2.5} width={width} height={3} fill="#15202A" stroke="none" />
      <rect x={0} y={2.5} width={Math.max(1, value * width)} height={3} fill={color} />
      {threshold !== undefined && <line x1={threshold * width} x2={threshold * width} y1={0} y2={8} stroke={C.mute} strokeWidth={1} />}
    </svg>
  );
}

/** Interval plot on a shared scale: [low, high] with a mid tick, plus optional zero line. */
export function Interval({
  low,
  mid,
  high,
  min,
  max,
  width = 110,
  color = C.cyan,
  zero,
}: { low: number; mid: number; high: number; min: number; max: number; width?: number; color?: string; zero?: number }) {
  const x = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min || 1)) * width;
  return (
    <svg width={width} height={10} className="block">
      <line x1={0} x2={width} y1={5} y2={5} stroke={C.line2} />
      {zero !== undefined && <line x1={x(zero)} x2={x(zero)} y1={0} y2={10} stroke={C.line} />}
      <line x1={x(low)} x2={x(high)} y1={5} y2={5} stroke={color} strokeWidth={3} strokeOpacity={0.35} />
      <line x1={x(mid)} x2={x(mid)} y1={1} y2={9} stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

export function Note({ children, tone = 'mute', className }: { children: ReactNode; tone?: 'mute' | 'warn'; className?: string }) {
  return (
    <div className={cx('text-[10px] leading-[14px]', tone === 'warn' ? 'text-warn/80' : 'text-dim', className)}>{children}</div>
  );
}

export function Row({ k, v, color, mono = true }: { k: ReactNode; v: ReactNode; color?: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[2px]">
      <span className="text-[11px] text-mute shrink-0">{k}</span>
      <span className={cx('text-[11px] text-ink text-right tabular-nums', mono && 'font-mono')} style={color ? { color } : undefined}>
        {v}
      </span>
    </div>
  );
}

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Linear colour ramp used by the plate heat encoding. */
export function ramp(t: number, from = '#152029', to = '#40D8D0'): string {
  const u = Math.min(1, Math.max(0, t));
  const a = hex(from);
  const b = hex(to);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * u));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export const nt = (x: number) => `${x.toLocaleString()} nt`;

// ─── Simple-view plain language ──────────────────────────────────────────

export const PLAIN_STRATEGY: Record<string, { name: string; what: string }> = {
  'rna-upregulation': {
    name: 'Make more of the healthy channel',
    what: 'A short custom strand (an ASO) helps cells read more of the gene message, so they build more working channels.',
  },
  'splice-modulation': {
    name: 'Fix how the gene message is cut',
    what: 'An ASO stops cells from cutting the message into a useless version, so more of it becomes working channel.',
  },
  'allele-selective-suppression': {
    name: 'Silence the faulty copy',
    what: 'An ASO turns down only the faulty copy of the gene, leaving the healthy copy alone.',
  },
  'small-molecule-mechanism-matched': {
    name: 'A pill that calms the channel',
    what: 'A small-molecule drug that dampens overactive sodium channels directly. It acts on the protein, not the gene message.',
  },
  'further-characterization': {
    name: 'Run more tests first',
    what: 'Collect more lab evidence before choosing any drug direction.',
  },
};

export const PLAIN_OUTCOME: Record<ScreeningOutcome, string> = {
  pass: 'Worked',
  mixed: 'Partly',
  fail: 'Failed',
  'excluded-uncertainty': 'Too uncertain',
};

/** Predicted fit = geometric mean of binding and specificity (illustrative model scores). */
export const predictedFit = (c: { bindingScore: number; specificityScore: number }) => Math.sqrt(c.bindingScore * c.specificityScore);

const PLAIN_REGION: Record<string, string> = {
  uorf: 'Brake switch at the start (uORF)',
  utr5: 'Front end of the message (5′ UTR)',
  utr3: 'Tail end of the message (3′ UTR)',
  'utr3-reg': 'Stability switch in the tail (3′ UTR)',
  'pe-3ss': 'Start of the faulty cut site',
  'poison-exon': 'Faulty "poison" section',
  'pe-5ss': 'End of the faulty cut site',
};

/** Plain-language region name for Simple view; falls back to the model label. */
export const plainRegion = (r: { id: string; label: string }) => PLAIN_REGION[r.id] ?? r.label.replace(/ \((approximate|schematic)\)/, '');
