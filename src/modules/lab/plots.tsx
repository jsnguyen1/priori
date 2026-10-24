// Electrophysiology plots: voltage-clamp sweep family with command inset, and derived-curve small multiples.
// All data comes from sim/channel.ts (runProtocol / deriveCurves / fitCurves) — nothing is hand-drawn.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { scaleLinear, scaleLog, type ScaleLinear, type ScaleLogarithmic } from 'd3';
import type { ProtocolId } from '../../domain/types';
import type { CurvePoint, ProtocolRun } from '../../sim/channel';
import { C } from '../../ui/tokens';
import type { TraceMode } from '../../state/store';

// ─── Utilities ───────────────────────────────────────────────────────────

export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setW(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '');

type AnyScale = ScaleLinear<number, number> | ScaleLogarithmic<number, number>;

function XAxis({ scale, y, ticks, format, label, labelX }: { scale: AnyScale; y: number; ticks: number[]; format?: (v: number) => string; label?: string; labelX?: number }) {
  const [a, b] = scale.range();
  return (
    <g className="font-mono" fontSize={9} fill={C.dim}>
      <line x1={a} x2={b} y1={y} y2={y} stroke={C.line} />
      {ticks.map((t) => (
        <g key={t} transform={`translate(${scale(t)},${y})`}>
          <line y2={3} stroke={C.line} />
          <text y={12} textAnchor="middle">{format ? format(t) : t}</text>
        </g>
      ))}
      {label && <text x={labelX ?? b} y={y + 22} textAnchor="end" fill={C.mute}>{label}</text>}
    </g>
  );
}

function YAxis({ scale, x, ticks, format, label }: { scale: AnyScale; x: number; ticks: number[]; format?: (v: number) => string; label?: string }) {
  const [a, b] = scale.range();
  return (
    <g className="font-mono" fontSize={9} fill={C.dim}>
      <line x1={x} x2={x} y1={a} y2={b} stroke={C.line} />
      {ticks.map((t) => (
        <g key={t} transform={`translate(${x},${scale(t)})`}>
          <line x2={-3} stroke={C.line} />
          <text x={-5} dy="0.32em" textAnchor="end">{format ? format(t) : t}</text>
        </g>
      ))}
      {label && <text x={x + 4} y={Math.min(a, b) + 8} fill={C.mute}>{label}</text>}
    </g>
  );
}

function GridY({ scale, ticks, x0, x1 }: { scale: AnyScale; ticks: number[]; x0: number; x1: number }) {
  return (
    <g>
      {ticks.map((t) => (
        <line key={t} x1={x0} x2={x1} y1={scale(t)} y2={scale(t)} stroke={t === 0 ? C.line : C.line2} strokeDasharray={t === 0 ? undefined : '2 3'} />
      ))}
    </g>
  );
}

// ─── Voltage-clamp panel ─────────────────────────────────────────────────

const WINDOWS: Record<ProtocolId, [number, number]> = {
  activation: [0, 25],
  ssi: [97, 118],
  recovery: [0, 116],
  persistent: [0, 105],
};
const SAMPLE_MS = 0.1;
const MAX_PTS = 520;

interface Family {
  key: 'reference' | 'variant';
  color: string;
  run: ProtocolRun;
}

/** Index range of samples within [t0, t1]. */
const windowIdx = (n: number, [t0, t1]: [number, number]) => [Math.max(0, Math.floor(t0 / SAMPLE_MS)), Math.min(n - 1, Math.ceil(t1 / SAMPLE_MS))] as const;

function sweepPath(t: Float32Array, y: Float32Array, win: [number, number], sx: (v: number) => number, sy: (v: number) => number) {
  const [a, b] = windowIdx(t.length, win);
  if (b <= a) return '';
  const n = b - a + 1;
  const bucket = Math.max(1, Math.ceil(n / MAX_PTS));
  let d = '';
  let first = true;
  const push = (k: number) => {
    d += `${first ? 'M' : 'L'}${sx(t[k]).toFixed(1)},${sy(y[k]).toFixed(1)}`;
    first = false;
  };
  if (bucket === 1) {
    for (let k = a; k <= b; k++) push(k);
    return d;
  }
  // min/max decimation preserves fast peaks
  for (let k = a; k <= b; k += bucket) {
    let lo = k;
    let hi = k;
    const e = Math.min(b, k + bucket - 1);
    for (let q = k; q <= e; q++) {
      if (y[q] < y[lo]) lo = q;
      if (y[q] > y[hi]) hi = q;
    }
    if (lo < hi) { push(lo); push(hi); } else { push(hi); push(lo); }
  }
  return d;
}

export function VoltageClampPanel({
  protocolId,
  mode,
  reference,
  variant,
  variantColor,
  reveal,
  variantPending,
  plain = false,
  plotHeight = 196,
}: {
  /** Simple view: plain-English axis and chip labels */
  plain?: boolean;
  plotHeight?: number;
  protocolId: ProtocolId;
  mode: TraceMode;
  reference: ProtocolRun;
  variant: ProtocolRun | null;
  variantColor: string;
  /** 0..1 progressive reveal of the variant family */
  reveal: number;
  variantPending: boolean;
}) {
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const clip = safeId(useId());
  const win = WINDOWS[protocolId];
  const families: Family[] = useMemo(() => {
    const out: Family[] = [];
    if (mode !== 'variant') out.push({ key: 'reference', color: C.mute, run: reference });
    if (mode !== 'reference' && variant) out.push({ key: 'variant', color: variantColor, run: variant });
    return out;
  }, [mode, reference, variant, variantColor]);

  const M = { l: 46, r: 10, t: 6, b: 26 };
  const insetH = 46;
  const plotH = plotHeight;
  const H = insetH + 10 + plotH + M.t + M.b;
  const iw = Math.max(10, W - M.l - M.r);
  const sx = useMemo(() => scaleLinear().domain(win).range([M.l, M.l + iw]), [win, iw, M.l]);

  // Voltage command inset
  const vDomain = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of reference.sweeps) {
      const [a, b] = windowIdx(s.trace.t.length, win);
      for (let k = a; k <= b; k++) {
        lo = Math.min(lo, s.trace.v[k]);
        hi = Math.max(hi, s.trace.v[k]);
      }
    }
    return [lo - 8, hi + 8] as [number, number];
  }, [reference, win]);
  const sv = useMemo(() => scaleLinear().domain(vDomain).range([M.t + insetH, M.t]), [vDomain, M.t]);

  // Current axis spans the families on screen (pending variant is excluded until revealed).
  const iDomain = useMemo(() => {
    let lo = 0;
    for (const f of families) for (const s of f.run.sweeps) {
      const [a, b] = windowIdx(s.trace.t.length, win);
      for (let k = a; k <= b; k++) lo = Math.min(lo, s.trace.i[k]);
    }
    if (lo === 0) lo = -1;
    return [lo * 1.06, -lo * 0.08] as [number, number];
  }, [families, win]);
  const top = M.t + insetH + 10;
  const sy = useMemo(() => scaleLinear().domain(iDomain).range([top + plotH, top]).nice(), [iDomain, top]);

  const paths = useMemo(
    () =>
      families.map((f) => ({
        key: f.key,
        color: f.color,
        sweeps: f.run.sweeps.map((s) => sweepPath(s.trace.t, s.trace.i, win, sx, sy)),
        cmd: f.key === 'reference' || families.length === 1 ? f.run.sweeps.map((s) => sweepPath(s.trace.t, s.trace.v, win, sx, sv)) : [],
      })),
    [families, win, sx, sy, sv],
  );

  // Hover crosshair
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const readout = useMemo(() => {
    if (!hover || !W) return null;
    const t = sx.invert(hover.x);
    if (t < win[0] || t > win[1]) return null;
    let best: { fam: Family; sweep: number; i: number; v: number; dist: number } | null = null;
    for (const f of families) {
      if (f.key === 'variant' && hover.x > M.l + iw * reveal) continue;
      f.run.sweeps.forEach((s, k) => {
        const idx = Math.min(s.trace.t.length - 1, Math.max(0, Math.round(t / SAMPLE_MS)));
        if (s.trace.t[idx] === undefined || Math.abs(s.trace.t[idx] - t) > 0.2) return;
        const i = s.trace.i[idx];
        const dist = Math.abs(sy(i) - hover.y);
        if (!best || dist < best.dist) best = { fam: f, sweep: k, i, v: s.trace.v[idx], dist };
      });
    }
    return { t, best: best as { fam: Family; sweep: number; i: number; v: number; dist: number } | null };
  }, [hover, families, sx, sy, win, W, reveal, iw, M.l]);
  const hiFam = readout?.best?.fam.key;
  const hiSweep = readout?.best?.sweep;

  const tTicks = sx.ticks(6);
  const iTicks = sy.ticks(5);
  const vTicks = sv.ticks(3);

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      {W > 0 && (
        <svg
          width={W}
          height={H}
          className="block"
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            setHover({ x: e.clientX - r.left, y: e.clientY - r.top });
          }}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <clipPath id={`rv-${clip}`}>
              <rect x={M.l} y={0} width={iw * reveal} height={H} />
            </clipPath>
            <clipPath id={`pl-${clip}`}>
              <rect x={M.l} y={0} width={iw} height={H} />
            </clipPath>
          </defs>

          {/* command inset */}
          <YAxis scale={sv} x={M.l} ticks={vTicks} />
          <text x={M.l + 4} y={M.t + 8} fontSize={9} className="font-mono" fill={C.mute}>{plain ? 'Voltage steps (mV)' : 'V cmd (mV)'}</text>
          <g clipPath={`url(#pl-${clip})`}>
            {(paths.find((p) => p.cmd.length) ?? paths[0])?.cmd.map((d, k) => (
              <path key={k} d={d} fill="none" stroke={C.dim} strokeWidth={0.8} strokeOpacity={hiSweep === k ? 1 : 0.55} />
            ))}
          </g>

          {/* current traces */}
          <GridY scale={sy} ticks={iTicks} x0={M.l} x1={M.l + iw} />
          <YAxis scale={sy} x={M.l} ticks={iTicks} label={plain ? 'Current (pA/pF)' : 'I (pA/pF)'} />
          <XAxis scale={sx} y={top + plotH} ticks={tTicks} label={plain ? 'time (ms)' : 't (ms)'} />
          <g clipPath={`url(#pl-${clip})`}>
            {paths.map((p) => (
              <g key={p.key} clipPath={p.key === 'variant' ? `url(#rv-${clip})` : undefined}>
                {p.sweeps.map((d, k) => (
                  <path
                    key={k}
                    d={d}
                    fill="none"
                    stroke={p.color}
                    strokeWidth={hiFam === p.key && hiSweep === k ? 1.6 : 1}
                    strokeOpacity={hiFam === p.key && hiSweep === k ? 1 : p.key === 'reference' && paths.length > 1 ? 0.45 : 0.75}
                  />
                ))}
              </g>
            ))}
          </g>

          {/* crosshair */}
          {readout && (
            <g pointerEvents="none">
              <line x1={hover!.x} x2={hover!.x} y1={M.t} y2={top + plotH} stroke={C.mute} strokeOpacity={0.5} strokeDasharray="2 2" />
              {readout.best && (
                <>
                  <line x1={M.l} x2={M.l + iw} y1={sy(readout.best.i)} y2={sy(readout.best.i)} stroke={C.mute} strokeOpacity={0.35} strokeDasharray="2 2" />
                  <circle cx={hover!.x} cy={sy(readout.best.i)} r={2.5} fill={readout.best.fam.color} />
                </>
              )}
            </g>
          )}
        </svg>
      )}

      {/* readout chip */}
      <div className="absolute right-2 font-mono text-[10px] text-right leading-[13px] pointer-events-none" style={{ top: M.t + insetH + 14 }}>
        {readout?.best ? (
          <div className="px-1.5 py-1 bg-bg/90 border border-line rounded">
            <div style={{ color: readout.best.fam.color }}>{readout.best.fam.key === 'reference' ? (plain ? 'NORMAL' : 'REFERENCE') : plain ? 'PATIENT' : 'VARIANT'} · {reference.protocol.sweeps[readout.best.sweep].label}</div>
            <div className="text-ink">t {readout.t.toFixed(2)} ms · I {readout.best.i.toFixed(1)} pA/pF</div>
            <div className="text-dim">V {readout.best.v.toFixed(0)} mV</div>
          </div>
        ) : variantPending && mode !== 'reference' ? (
          <div className="px-1.5 py-1 bg-bg/90 border border-line2 rounded text-dim">{plain ? 'PATIENT · NOT TESTED YET' : 'VARIANT · NOT YET CHARACTERIZED'}</div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Derived curve small multiple ────────────────────────────────────────

export interface Series {
  key: string;
  points: CurvePoint[];
  color: string;
  variant?: boolean;
  markers?: boolean;
}

export function MiniPlot({
  title,
  unitNote,
  series,
  xDomain,
  yDomain,
  xLog,
  xLabel,
  yLabel,
  vlines = [],
  reveal = 1,
  band,
  height = 124,
  children,
  yFormat,
}: {
  title: string;
  unitNote?: string;
  series: Series[];
  xDomain: [number, number];
  yDomain?: [number, number];
  xLog?: boolean;
  xLabel: string;
  yLabel: string;
  vlines?: { x: number; color: string; label?: string }[];
  reveal?: number;
  band?: [number, number];
  height?: number;
  children?: ReactNode;
  yFormat?: (v: number) => string;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const clip = safeId(useId());
  const M = { l: 34, r: 6, t: 4, b: 22 };
  const iw = Math.max(10, W - M.l - M.r);
  const ih = height - M.t - M.b;
  const sx = useMemo(() => (xLog ? scaleLog().domain(xDomain).range([M.l, M.l + iw]) : scaleLinear().domain(xDomain).range([M.l, M.l + iw])), [xLog, xDomain, iw, M.l]);
  const yd = useMemo(() => {
    if (yDomain) return yDomain;
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of series) for (const p of s.points) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
    if (!Number.isFinite(lo)) return [0, 1] as [number, number];
    return [Math.min(0, lo), Math.max(0, hi)] as [number, number];
  }, [series, yDomain]);
  const sy = useMemo(() => scaleLinear().domain(yd).range([M.t + ih, M.t]).nice(), [yd, ih, M.t]);
  const xt = xLog ? [0.5, 1, 2, 5, 10, 20, 50] : sx.ticks(4);
  const yt = sy.ticks(3);
  const line = (pts: CurvePoint[]) => pts.map((p, k) => `${k ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  return (
    <div className="border border-line2 rounded-sm bg-canvas/60">
      <div className="flex items-baseline justify-between px-2 pt-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute">{title}</span>
        {unitNote && <span className="font-mono text-[9px] text-dim">{unitNote}</span>}
      </div>
      <div ref={ref} className="w-full">
        {W > 0 && (
          <svg width={W} height={height} className="block">
            <defs>
              <clipPath id={`m-${clip}`}>
                <rect x={M.l} y={0} width={iw * reveal} height={height} />
              </clipPath>
              <clipPath id={`a-${clip}`}>
                <rect x={M.l - 3} y={M.t - 3} width={iw + 6} height={ih + 6} />
              </clipPath>
            </defs>
            {band && <rect x={sx(band[0])} width={Math.max(0, sx(band[1]) - sx(band[0]))} y={M.t} height={ih} fill={C.line2} />}
            <GridY scale={sy} ticks={yt} x0={M.l} x1={M.l + iw} />
            <YAxis scale={sy} x={M.l} ticks={yt} format={yFormat} />
            <XAxis scale={sx} y={M.t + ih} ticks={xt} label={xLabel} />
            <text x={M.l + 3} y={M.t + 8} fontSize={9} className="font-mono" fill={C.dim}>{yLabel}</text>
            {vlines.map((v, k) =>
              Number.isFinite(v.x) && v.x >= xDomain[0] && v.x <= xDomain[1] ? (
                <g key={k}>
                  <line x1={sx(v.x)} x2={sx(v.x)} y1={M.t} y2={M.t + ih} stroke={v.color} strokeDasharray="3 2" strokeOpacity={0.8} />
                  {v.label && (
                    <text x={sx(v.x) + 3} y={M.t + 18 + k * 10} fontSize={9} className="font-mono" fill={v.color}>
                      {v.label}
                    </text>
                  )}
                </g>
              ) : null,
            )}
            {series.map((s) => (
              <g key={s.key} clipPath={`url(#a-${clip})`}>
              <g clipPath={s.variant ? `url(#m-${clip})` : undefined}>
                <path d={line(s.points)} fill="none" stroke={s.color} strokeWidth={1.3} strokeOpacity={s.variant ? 1 : 0.8} />
                {s.markers && s.points.map((p, k) => <circle key={k} cx={sx(p.x)} cy={sy(p.y)} r={1.7} fill={s.color} fillOpacity={s.variant ? 1 : 0.8} />)}
              </g>
              </g>
            ))}
            {children}
          </svg>
        )}
      </div>
    </div>
  );
}
