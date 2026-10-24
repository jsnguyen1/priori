// Long-term scalability scenario: cumulative cost vs cohort size, bespoke vs platform.
import { useMemo, useState } from 'react';
import type { CostCategory, ReuseScenarioId } from '../../domain/types';
import { C } from '../../ui/tokens';
import { EvidenceBadge, Segmented, fmt } from '../../ui/primitives';
import { cohortModel, COST_CATEGORIES } from '../../sim/development';
import { useWidth } from '../reuse/shared';

type View = 'total' | CostCategory;
const VIEW_LABEL: Record<View, string> = {
  total: 'Total',
  'evidence-generation': 'Evidence',
  manufacturing: 'Mfg',
  clinical: 'Clinical',
  regulatory: 'Regulatory',
};
const N = 30;
const H_DETAIL = 230;
const H_SIMPLE = 210;
const M = { l: 52, r: 96, t: 14, b: 28 };

export function CohortChart({ scenarioId, simple = false }: { scenarioId: ReuseScenarioId; simple?: boolean }) {
  const { ref, w } = useWidth<HTMLDivElement>(900);
  const [viewState, setView] = useState<View>('total');
  const view: View = simple ? 'total' : viewState;
  const H = simple ? H_SIMPLE : H_DETAIL;
  const [hover, setHover] = useState<number | null>(null);
  const model = useMemo(() => cohortModel(scenarioId, N), [scenarioId]);
  const W = Math.max(560, w);
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;

  const series = model.points.map((p) => {
    if (view === 'total') return { n: p.n, b: p.bespokeTotal, p: p.platformTotal };
    const b = p.bespoke[view];
    const q = p.platform[view];
    return { n: p.n, b: { low: b, mid: b, high: b }, p: { low: q, mid: q, high: q } };
  });
  const yMax = Math.max(...series.map((s) => Math.max(s.b.high, s.p.high))) * 1.05 || 1;
  const x = (n: number) => M.l + (n / N) * pw;
  const y = (v: number) => M.t + ph - (v / yMax) * ph;
  const line = (f: (s: (typeof series)[number]) => number) => series.map((s, i) => `${i ? 'L' : 'M'}${x(s.n)},${y(f(s))}`).join('');
  const band = (lo: (s: (typeof series)[number]) => number, hi: (s: (typeof series)[number]) => number) =>
    `${series.map((s, i) => `${i ? 'L' : 'M'}${x(s.n)},${y(hi(s))}`).join('')}${[...series].reverse().map((s) => `L${x(s.n)},${y(lo(s))}`).join('')}Z`;
  const yTicks = niceTicks(yMax);
  const cross = view === 'total' ? model.crossoverN : null;
  const last = series[series.length - 1];
  const h = hover !== null ? series[hover] : null;
  const fixed = model.assumptions.fixedInvestmentUsd;

  return (
    <div>
      {simple ? (
        <div className="flex items-center gap-5 mb-2 text-[12px] text-mute">
          <span className="inline-flex items-center gap-1.5"><svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" stroke={C.mute} strokeWidth="2" /></svg>Starting from scratch every time</span>
          <span className="inline-flex items-center gap-1.5"><svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" stroke={C.cyan} strokeWidth="2" /></svg>With Priori</span>
        </div>
      ) : (
      <div className="flex items-center justify-between gap-3 mb-2">
        <Segmented value={view} onChange={setView} options={(['total', ...COST_CATEGORIES] as View[]).map((v) => ({ value: v, label: VIEW_LABEL[v] }))} />
        <div className="flex items-center gap-3 font-mono text-2xs text-mute">
          <span className="inline-flex items-center gap-1.5"><svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" stroke={C.mute} strokeWidth="2" /></svg>Bespoke · per-patient de novo</span>
          <span className="inline-flex items-center gap-1.5"><svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" stroke={C.cyan} strokeWidth="2" /></svg>Platform · evidence reuse</span>
          <EvidenceBadge category="assumption" />
        </div>
      </div>
      )}
      <div ref={ref} className="w-full relative">
        <svg
          width={W}
          height={H}
          className="block"
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const n = Math.round(((e.clientX - r.left - M.l) / pw) * N);
            setHover(n >= 0 && n <= N ? n : null);
          }}
          onMouseLeave={() => setHover(null)}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={M.l + pw} y1={y(t)} y2={y(t)} stroke={C.line2} />
              <text x={M.l - 6} y={y(t) + 3} textAnchor="end" className="font-mono" fontSize={9} fill={C.dim}>{fmtM(t)}</text>
            </g>
          ))}
          {[0, 5, 10, 15, 20, 25, 30].map((n) => (
            <text key={n} x={x(n)} y={H - 12} textAnchor="middle" className="font-mono" fontSize={9} fill={C.dim}>{n}</text>
          ))}
          <text x={M.l + pw} y={H - 1} textAnchor="end" className="font-mono" fontSize={9} fill={C.dim}>{simple ? 'number of patients treated' : 'patients in cohort'}</text>
          <line x1={M.l} x2={M.l + pw} y1={y(0)} y2={y(0)} stroke={C.line} />

          {view === 'total' && <path d={band((s) => s.b.low, (s) => s.b.high)} fill={C.mute} fillOpacity={0.08} />}
          {view === 'total' && <path d={band((s) => s.p.low, (s) => s.p.high)} fill={C.cyan} fillOpacity={0.1} />}
          <path d={line((s) => s.b.mid)} fill="none" stroke={C.mute} strokeWidth={2} />
          <path d={line((s) => s.p.mid)} fill="none" stroke={C.cyan} strokeWidth={2} />

          {/* fixed platform investment */}
          {view === 'total' && (
            <g>
              <line x1={x(0)} x2={x(0)} y1={y(fixed.low)} y2={y(fixed.high)} stroke={C.cyan} strokeWidth={3} strokeOpacity={0.5} />
              <circle cx={x(0)} cy={y(fixed.mid)} r={4} fill={C.cyan} stroke={C.canvas} strokeWidth={2} />
              <text x={x(0) + 8} y={y(fixed.mid) - (simple ? 16 : 6)} className="font-mono" fontSize={9} fill={C.ink}>{simple ? `upfront cost to build the library ${fmtM(fixed.mid)}` : `fixed platform investment ${fmt.usd(fixed.mid)}`}</text>
            </g>
          )}
          {cross !== null && (
            <g>
              <line x1={x(cross)} x2={x(cross)} y1={M.t} y2={y(0)} stroke={C.ink} strokeOpacity={0.5} strokeDasharray="2 3" />
              <text x={x(cross) + 4} y={M.t + 9} className="font-mono" fontSize={9} fill={C.ink}>{simple ? `cheaper overall from patient ${cross}` : `mid-case crossover n = ${cross} (scenario-dependent)`}</text>
            </g>
          )}
          {/* direct labels */}
          <text x={x(N) + 6} y={y(last.b.mid) + 3} className="font-mono" fontSize={9.5} fill={C.ink}>{simple ? 'Scratch' : 'Bespoke'} {fmtM(last.b.mid)}</text>
          <text x={x(N) + 6} y={y(last.p.mid) + (Math.abs(y(last.p.mid) - y(last.b.mid)) < 12 ? (last.p.mid < last.b.mid ? 14 : -8) : 3)} className="font-mono" fontSize={9.5} fill={C.ink}>{simple ? 'Priori' : 'Platform'} {fmtM(last.p.mid)}</text>

          {h && (
            <g pointerEvents="none">
              <line x1={x(h.n)} x2={x(h.n)} y1={M.t} y2={y(0)} stroke={C.ink} strokeOpacity={0.35} />
              <circle cx={x(h.n)} cy={y(h.b.mid)} r={4} fill={C.mute} stroke={C.canvas} strokeWidth={2} />
              <circle cx={x(h.n)} cy={y(h.p.mid)} r={4} fill={C.cyan} stroke={C.canvas} strokeWidth={2} />
            </g>
          )}
        </svg>
        {h && (
          <div className="absolute top-2 pointer-events-none bg-surface2 border border-line rounded px-2 py-1.5 font-mono text-2xs text-ink" style={{ left: Math.min(x(h.n) + 12, W - 230) }}>
            {simple ? (
              <>
                <div className="text-mute mb-0.5">After {h.n} patients · total spent</div>
                <div>From scratch {fmtM(h.b.mid)}</div>
                <div className="text-cyan">With Priori {fmtM(h.p.mid)}</div>
              </>
            ) : (
              <>
                <div className="text-mute mb-0.5">n = {h.n} patients · coverage {fmt.pct(model.points[h.n].coverage)}</div>
                <div>Bespoke {fmtM(h.b.mid)}{view === 'total' && <span className="text-dim"> ({fmtM(h.b.low)}–{fmtM(h.b.high)})</span>}</div>
                <div className="text-cyan">Platform {fmtM(h.p.mid)}{view === 'total' && <span className="text-dim"> ({fmtM(h.p.low)}–{fmtM(h.p.high)})</span>}</div>
              </>
            )}
          </div>
        )}
      </div>
      {simple ? (
        <div className="mt-2 text-[13px] text-mute leading-[19px]">
          {model.crossoverN !== null
            ? `Priori costs more at first, because the library has to be built. In this estimate it becomes cheaper overall from patient ${model.crossoverN}; where exactly depends on our assumptions.`
            : 'Priori costs more at first, because the library has to be built. In this estimate it does not pay that back within 30 patients; the answer depends on our assumptions.'}
        </div>
      ) : (
      <div className="mt-1.5 text-2xs text-dim leading-relaxed">
        Scenario model, not a guarantee. Cumulative cost, mid case with low–high scenario band. Platform = fixed investment ({fmt.usd(fixed.low)}–{fmt.usd(fixed.high)}) + per-patient marginal cost, where the reusable share grows with library coverage
        c(k) = {model.assumptions.maxCoverage.toFixed(2)}·(1 − e<sup>−(k−1)/{model.assumptions.coverageScale}</sup>) plus {fmt.usd(model.assumptions.perPatientOverheadUsd)}/patient curation overhead.
        {view === 'total'
          ? model.crossoverN !== null
            ? ` In this scenario the mid case crosses at n = ${model.crossoverN}${model.robustCrossoverN !== null ? `; the pessimistic platform case falls below the optimistic bespoke case at n = ${model.robustCrossoverN}` : '; the uncertainty bands still overlap within 30 patients'}.`
            : ' In this scenario the platform does not recover its fixed investment within 30 patients.'
          : ' Category view excludes the fixed platform investment.'}
        {' '}Manufacturing, clinical and regulatory costs are modelled separately from evidence generation; patient-specific GMP synthesis, sequence-specific toxicology and clinical evaluation never shrink.
      </div>
      )}
    </div>
  );
}

const fmtM = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : `$${Math.round(v / 1e3)}k`);

function niceTicks(max: number): number[] {
  const raw = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let t = 0; t <= max; t += step) out.push(t);
  return out;
}
