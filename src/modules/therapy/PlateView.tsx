// Virtual screening plate + dose-response small multiples — SIMULATED.
import type { ScreeningResult, ScreeningRun, Well } from '../../domain/types';
import { DOSE_SERIES, MEASUREMENT_UNIT, PLATE_COLS, REPLICATES, ROW_LETTERS, SCREEN_THRESHOLDS } from '../../sim/screening';
import { Label, cx } from '../../ui/primitives';
import { C } from '../../ui/tokens';
import { useSimple } from '../../ui/simple';
import { OUTCOME_COLOR, OutcomeBadge, ramp } from './shared';

const CELL = 26;
const GAP = 4;
const LEFT = 92;
const TOP = 34;

const KIND_LABEL: Record<Well['kind'], string> = {
  reference: 'Reference (WT)',
  'untreated-variant': 'Untreated variant',
  vehicle: 'Vehicle control',
  candidate: 'Candidate + dose',
  empty: 'Empty',
};

export function PlateView({
  run,
  selectedWellId,
  onSelectWell,
}: {
  run: ScreeningRun;
  selectedWellId: string | null;
  onSelectWell: (id: string | null) => void;
}) {
  const simple = useSimple();
  const cell = simple ? 34 : CELL;
  const unit = MEASUREMENT_UNIT[run.results[0]?.measurementKey ?? 'peakDensity'] ?? '';
  const ref = run.results[0]?.referenceMean ?? 0;
  const untr = run.results[0]?.untreatedMean ?? 0;
  const norm = (v: number) => (ref - untr !== 0 ? (v - untr) / (ref - untr) : 0);

  const rowCandidate = (row: number) => run.plate.find((wl) => wl.row === row && wl.kind === 'candidate')?.candidateId;

  const width = LEFT + PLATE_COLS * (cell + GAP) + 16;
  const height = TOP + ROW_LETTERS.length * (cell + GAP) + 28;

  return (
    <div className="flex flex-col min-h-0">
      {simple ? (
        <div className="flex items-center justify-between h-9 px-3 border-b border-line2 shrink-0">
          <span className="text-[13px] text-ink">Test plate <span className="text-mute">· each square is a dish of patient-like cells · click one</span></span>
        </div>
      ) : (
        <div className="flex items-center justify-between h-7 px-3 border-b border-line2 shrink-0">
          <Label>96-well plate · simulated · {run.id}</Label>
          <span className="font-mono text-[10px] text-dim">
            response = {run.results[0]?.measurementKey === 'persistentPct' ? 'persistent current' : 'peak current density'} ({unit})
          </span>
        </div>
      )}
      <div className={cx('overflow-auto scroll-thin', simple && 'px-3 pt-2')} data-tour="therapy.plate">
        <svg width={width} height={height} className="block">
          {/* column headers + dose groups */}
          {Array.from({ length: PLATE_COLS }, (_, c) => (
            <text key={c} x={LEFT + c * (cell + GAP) + cell / 2} y={26} fill={C.dim} fontSize={9} fontFamily="IBM Plex Mono, monospace" textAnchor="middle">
              {String(c + 1).padStart(2, '0')}
            </text>
          ))}
          {DOSE_SERIES.map((d, i) => {
            const x0 = LEFT + i * REPLICATES * (cell + GAP);
            const wid = REPLICATES * (cell + GAP) - GAP;
            return (
              <g key={d}>
                <line x1={x0} x2={x0 + wid} y1={12} y2={12} stroke={C.line} />
                <text x={x0 + wid / 2} y={9} fill={C.mute} fontSize={8.5} fontFamily="IBM Plex Mono, monospace" textAnchor="middle">
                  {simple ? `dose ${i + 1}` : `${d} nM`}
                </text>
              </g>
            );
          })}
          <text x={LEFT - 6} y={9} fill={C.dim} fontSize={8} fontFamily="IBM Plex Mono, monospace" textAnchor="end">
            {simple ? 'MORE DRUG →' : 'DOSE →'}
          </text>

          {/* rows */}
          {ROW_LETTERS.map((letter, row) => {
            const cid = rowCandidate(row);
            return (
              <g key={letter}>
                <text x={LEFT - 8} y={TOP + row * (cell + GAP) + cell / 2 + 3.5} fill={C.mute} fontSize={9} fontFamily="IBM Plex Mono, monospace" textAnchor="end">
                  {letter}
                  {cid ? ` ${cid.replace('PRI-', '')}` : row === 0 ? (simple ? ' CONTROLS' : ' CTRL') : ''}
                </text>
              </g>
            );
          })}

          {/* wells */}
          {run.plate.map((wl) => {
            const x = LEFT + wl.col * (cell + GAP);
            const y = TOP + wl.row * (cell + GAP);
            const selected = wl.id === selectedWellId;
            let fill: string = '#0C141B';
            let stroke: string = C.line2;
            let dash: string | undefined;
            if (wl.kind === 'reference') {
              fill = 'rgba(231,238,244,0.16)';
              stroke = C.ink;
            } else if (wl.kind === 'untreated-variant') {
              fill = 'rgba(215,111,114,0.14)';
              stroke = C.warn;
              dash = '3 2';
            } else if (wl.kind === 'vehicle') {
              fill = 'rgba(138,156,169,0.12)';
              stroke = C.mute;
              dash = '1 2';
            } else if (wl.kind === 'candidate') {
              fill = ramp(norm(wl.response ?? untr));
              stroke = C.line;
            }
            return (
              <g key={wl.id} onClick={() => onSelectWell(selected ? null : wl.id)} className={wl.kind === 'empty' ? undefined : 'cursor-pointer'}>
                <rect
                  x={x}
                  y={y}
                  width={cell}
                  height={cell}
                  rx={2}
                  fill={wl.kind === 'empty' ? 'none' : fill}
                  stroke={selected ? C.cyan : stroke}
                  strokeWidth={selected ? 1.6 : 0.8}
                  strokeDasharray={selected ? undefined : wl.kind === 'empty' ? '1 3' : dash}
                />
                {wl.kind === 'reference' && <circle cx={x + cell / 2} cy={y + cell / 2} r={2.2} fill={C.ink} />}
                {wl.kind === 'untreated-variant' && <line x1={x + 7} x2={x + cell - 7} y1={y + cell / 2} y2={y + cell / 2} stroke={C.warn} strokeWidth={1.2} />}
                {wl.kind === 'vehicle' && (
                  <>
                    <line x1={x + 7} x2={x + cell - 7} y1={y + 7} y2={y + cell - 7} stroke={C.mute} strokeWidth={0.8} />
                    <line x1={x + cell - 7} x2={x + 7} y1={y + 7} y2={y + cell - 7} stroke={C.mute} strokeWidth={0.8} />
                  </>
                )}
                {selected && <rect x={x - 2.5} y={y - 2.5} width={cell + 5} height={cell + 5} rx={3} fill="none" stroke={C.cyan} strokeWidth={0.6} strokeOpacity={0.6} />}
              </g>
            );
          })}

          {/* dose group separators */}
          {[1, 2, 3].map((i) => {
            const x = LEFT + i * REPLICATES * (cell + GAP) - GAP / 2;
            return <line key={i} x1={x} x2={x} y1={TOP - 4} y2={TOP + ROW_LETTERS.length * (cell + GAP) - GAP + 4} stroke={C.line2} />;
          })}
        </svg>
      </div>
      {simple ? <SimplePlateLegend /> : <PlateLegend unit={unit} ref0={untr} ref1={ref} />}
    </div>
  );
}

function SimplePlateLegend() {
  const sw = (fill: string, stroke: string, dash?: string) => (
    <svg width="14" height="14"><rect x={0.5} y={0.5} width={13} height={13} rx={2} fill={fill} stroke={stroke} strokeWidth={0.8} strokeDasharray={dash} /></svg>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 py-2.5 text-[12px] text-mute">
      <span className="inline-flex items-center gap-1.5">{sw('rgba(231,238,244,0.16)', C.ink)}Normal cells</span>
      <span className="inline-flex items-center gap-1.5">{sw('rgba(215,111,114,0.14)', C.warn, '3 2')}Patient cells, no drug</span>
      <span className="inline-flex items-center gap-1.5">{sw('rgba(138,156,169,0.12)', C.mute, '1 2')}Blank treatment</span>
      <span className="inline-flex items-center gap-1.5">
        Patient cells + drug:
        <span className="text-dim">no change</span>
        <svg width="70" height="10">
          {Array.from({ length: 35 }, (_, i) => (
            <rect key={i} x={i * 2} y={0} width={2} height={10} fill={ramp(i / 34)} />
          ))}
        </svg>
        <span className="text-cyan">back to normal</span>
      </span>
    </div>
  );
}

function PlateLegend({ unit, ref0, ref1 }: { unit: string; ref0: number; ref1: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 py-2 border-t border-line2">
      {(['reference', 'untreated-variant', 'vehicle', 'candidate'] as Well['kind'][]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.06em] text-mute">
          <svg width="12" height="12">
            <rect
              x={0.5}
              y={0.5}
              width={11}
              height={11}
              rx={2}
              fill={k === 'reference' ? 'rgba(231,238,244,0.16)' : k === 'untreated-variant' ? 'rgba(215,111,114,0.14)' : k === 'vehicle' ? 'rgba(138,156,169,0.12)' : ramp(0.7)}
              stroke={k === 'reference' ? C.ink : k === 'untreated-variant' ? C.warn : k === 'vehicle' ? C.mute : C.line}
              strokeWidth={0.8}
              strokeDasharray={k === 'untreated-variant' ? '3 2' : k === 'vehicle' ? '1 2' : undefined}
            />
          </svg>
          {KIND_LABEL[k]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.06em] text-mute">
        <span className="tabular-nums">{ref0.toFixed(0)}</span>
        <svg width="80" height="8">
          {Array.from({ length: 40 }, (_, i) => (
            <rect key={i} x={i * 2} y={0} width={2} height={8} fill={ramp(i / 39)} />
          ))}
        </svg>
        <span className="tabular-nums">{ref1.toFixed(0)}</span>
        {unit}
      </span>
    </div>
  );
}

// ─── Dose–response small multiples ───────────────────────────────────────

const PW = 190;
const PH = 128;
const M = { l: 34, r: 8, t: 16, b: 22 };

export function DoseResponsePanel({
  run,
  selectedCandidateId,
  onSelect,
}: {
  run: ScreeningRun;
  selectedCandidateId: string | null;
  onSelect: (candidateId: string) => void;
}) {
  const unit = MEASUREMENT_UNIT[run.results[0]?.measurementKey ?? 'peakDensity'] ?? '';
  const all = run.results.flatMap((r) => [r.referenceMean, r.untreatedMean, ...r.doseResponse.map((d) => d.mean + d.sd), ...r.doseResponse.map((d) => d.mean - d.sd)]);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || 1;
  const yMin = lo - pad;
  const yMax = hi + pad;

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between h-7 px-3 border-b border-line2 shrink-0">
        <Label>Dose–response per candidate · simulated · shared axes</Label>
        <span className="font-mono text-[10px] text-dim">
          pass ≥ {(SCREEN_THRESHOLDS.passRescue * 100).toFixed(0)}% rescue · fail &lt; {(SCREEN_THRESHOLDS.failRescue * 100).toFixed(0)}%
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-3 p-3">
        {run.results.map((r) => (
          <DosePlot key={r.candidateId} result={r} yMin={yMin} yMax={yMax} unit={unit} selected={r.candidateId === selectedCandidateId} onSelect={() => onSelect(r.candidateId)} />
        ))}
      </div>
    </div>
  );
}

function DosePlot({
  result,
  yMin,
  yMax,
  unit,
  selected,
  onSelect,
}: {
  result: ScreeningResult;
  yMin: number;
  yMax: number;
  unit: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const xs = DOSE_SERIES.map((d) => Math.log10(d));
  const x0 = Math.min(...xs) - 0.18;
  const x1 = Math.max(...xs) + 0.18;
  const X = (d: number) => M.l + ((Math.log10(d) - x0) / (x1 - x0)) * (PW - M.l - M.r);
  const Y = (v: number) => M.t + ((yMax - v) / (yMax - yMin || 1)) * (PH - M.t - M.b);
  const color = OUTCOME_COLOR[result.outcome];
  const path = result.doseResponse.map((d, i) => `${i === 0 ? 'M' : 'L'}${X(d.doseNm)},${Y(d.mean)}`).join(' ');

  return (
    <div
      onClick={onSelect}
      className={cx('border rounded cursor-pointer transition-colors', selected ? 'border-cyan/70 bg-cyan/[0.04]' : 'border-line2 hover:border-line')}
    >
      <div className="flex items-center justify-between px-2 h-6 border-b border-line2">
        <span className="font-mono text-[10px] text-ink">{result.candidateId}</span>
        <OutcomeBadge outcome={result.outcome} />
      </div>
      <svg width={PW} height={PH} className="block">
        {/* reference / untreated bands */}
        <line x1={M.l} x2={PW - M.r} y1={Y(result.referenceMean)} y2={Y(result.referenceMean)} stroke={C.ink} strokeWidth={0.9} strokeDasharray="4 3" />
        <text x={PW - M.r} y={Y(result.referenceMean) - 3} fill={C.mute} fontSize={7.5} fontFamily="IBM Plex Mono, monospace" textAnchor="end">REF</text>
        <line x1={M.l} x2={PW - M.r} y1={Y(result.untreatedMean)} y2={Y(result.untreatedMean)} stroke={C.warn} strokeWidth={0.9} strokeDasharray="4 3" />
        <text x={PW - M.r} y={Y(result.untreatedMean) + 9} fill={C.warn} fontSize={7.5} fontFamily="IBM Plex Mono, monospace" textAnchor="end">UNTREATED</text>
        <line x1={M.l} x2={PW - M.r} y1={Y(result.vehicleMean)} y2={Y(result.vehicleMean)} stroke={C.mute} strokeWidth={0.6} strokeDasharray="1 3" />

        {/* axes */}
        <line x1={M.l} x2={M.l} y1={M.t} y2={PH - M.b} stroke={C.line} />
        <line x1={M.l} x2={PW - M.r} y1={PH - M.b} y2={PH - M.b} stroke={C.line} />
        {[yMin, (yMin + yMax) / 2, yMax].map((v, i) => (
          <text key={i} x={M.l - 4} y={Y(v) + 3} fill={C.dim} fontSize={7.5} fontFamily="IBM Plex Mono, monospace" textAnchor="end">
            {v.toFixed(0)}
          </text>
        ))}
        {DOSE_SERIES.map((d) => (
          <text key={d} x={X(d)} y={PH - M.b + 10} fill={C.dim} fontSize={7.5} fontFamily="IBM Plex Mono, monospace" textAnchor="middle">
            {d}
          </text>
        ))}
        <text x={(M.l + PW - M.r) / 2} y={PH - 2} fill={C.dim} fontSize={7.5} fontFamily="IBM Plex Mono, monospace" textAnchor="middle">
          nM · {unit}
        </text>

        {/* data */}
        <path d={path} fill="none" stroke={color} strokeWidth={1.3} />
        {result.doseResponse.map((d) => (
          <g key={d.doseNm}>
            <line x1={X(d.doseNm)} x2={X(d.doseNm)} y1={Y(d.mean - d.sd)} y2={Y(d.mean + d.sd)} stroke={color} strokeWidth={0.9} />
            <line x1={X(d.doseNm) - 2.5} x2={X(d.doseNm) + 2.5} y1={Y(d.mean - d.sd)} y2={Y(d.mean - d.sd)} stroke={color} strokeWidth={0.8} />
            <line x1={X(d.doseNm) - 2.5} x2={X(d.doseNm) + 2.5} y1={Y(d.mean + d.sd)} y2={Y(d.mean + d.sd)} stroke={color} strokeWidth={0.8} />
            <rect x={X(d.doseNm) - 2} y={Y(d.mean) - 2} width={4} height={4} fill={color} />
          </g>
        ))}
      </svg>
      <div className="px-2 pb-1.5 w-[190px]">
        <div className="font-mono text-[9px] text-mute tabular-nums">
          rescue {(result.rescueFraction.mid * 100).toFixed(0)}% [{(result.rescueFraction.low * 100).toFixed(0)}, {(result.rescueFraction.high * 100).toFixed(0)}]
        </div>
      </div>
    </div>
  );
}
