// Side-by-side comparison of nominated candidates — small multiples on shared scales.
import type { Candidate } from '../../domain/types';
import { Label, fmt } from '../../ui/primitives';
import { C } from '../../ui/tokens';
import { Interval, PLATFORM_COLOR, PLATFORM_LABEL } from './shared';

const BAR_W = 92;

function Bar({ value, color = C.cyan, threshold, invert = false }: { value: number; color?: string; threshold?: number; invert?: boolean }) {
  return (
    <svg width={BAR_W} height={9} className="block">
      <rect x={0} y={3} width={BAR_W} height={3} fill="#15202A" />
      <rect x={0} y={3} width={Math.max(1, value * BAR_W)} height={3} fill={color} />
      {threshold !== undefined && <line x1={threshold * BAR_W} x2={threshold * BAR_W} y1={0} y2={9} stroke={invert ? C.warn : C.mute} strokeWidth={1} />}
    </svg>
  );
}

export function CompareView({ candidates, selectedCandidateId, onSelect }: { candidates: Candidate[]; selectedCandidateId: string | null; onSelect: (id: string) => void }) {
  if (candidates.length === 0) {
    return (
      <div className="p-4 text-[11px] text-dim">
        No nominated candidates. Return to DESIGN and nominate candidates to compare them side by side.
      </div>
    );
  }
  const effLow = Math.min(0, ...candidates.map((c) => c.predictedEffect.low));
  const effHigh = Math.max(0, ...candidates.map((c) => c.predictedEffect.high));

  const metrics: { label: string; cell: (c: Candidate) => JSX.Element }[] = [
    {
      label: 'Binding (illustrative)',
      cell: (c) => (
        <div className="flex items-center gap-2">
          <Bar value={c.bindingScore} />
          <span className="font-mono text-[11px] text-ink tabular-nums">{c.bindingScore.toFixed(2)}</span>
        </div>
      ),
    },
    {
      label: 'Specificity (illustrative)',
      cell: (c) => (
        <div className="flex items-center gap-2">
          <Bar value={c.specificityScore} threshold={0.7} color={c.specificityScore < 0.7 ? C.gof : C.cyan} />
          <span className="font-mono text-[11px] text-ink tabular-nums">{c.specificityScore.toFixed(2)}</span>
        </div>
      ),
    },
    {
      label: 'Model uncertainty',
      cell: (c) => (
        <div className="flex items-center gap-2">
          <Bar value={c.uncertainty} threshold={0.42} color={c.uncertainty >= 0.42 ? C.warn : C.mute} invert />
          <span className="font-mono text-[11px] tabular-nums" style={{ color: c.uncertainty >= 0.42 ? C.warn : C.ink }}>{c.uncertainty.toFixed(2)}</span>
        </div>
      ),
    },
    {
      label: 'Predicted Δ parameter',
      cell: (c) => (
        <div className="flex items-center gap-2">
          <Interval low={c.predictedEffect.low} mid={c.predictedEffect.mid} high={c.predictedEffect.high} min={effLow} max={effHigh} zero={0} width={BAR_W} />
          <span className="font-mono text-[11px] text-ink tabular-nums">{fmt.signed(c.predictedEffect.mid * 100, 0)}%</span>
        </div>
      ),
    },
    {
      label: 'Platform compatibility',
      cell: (c) => (
        <span className="font-mono text-[9px] tracking-[0.08em]" style={{ color: PLATFORM_COLOR[c.platformCompatibility] }}>
          {PLATFORM_LABEL[c.platformCompatibility]}
        </span>
      ),
    },
    {
      label: 'Binding window (nt)',
      cell: (c) => <span className="font-mono text-[11px] text-mute tabular-nums">{c.bindEnd > 0 ? `${c.bindStart.toLocaleString()}–${c.bindEnd.toLocaleString()}` : '— protein-level'}</span>,
    },
    {
      label: 'Development requirements',
      cell: (c) => (
        <ul className="space-y-[2px]">
          {c.developmentRequirements.map((r) => (
            <li key={r} className="text-[10px] leading-[14px] text-mute">· {r}</li>
          ))}
        </ul>
      ),
    },
  ];

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between h-7 px-3 border-b border-line2 shrink-0">
        <Label>Nominated candidate comparison · shared scales · illustrative</Label>
        <span className="font-mono text-[10px] text-dim">{candidates.length} nominated</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto scroll-thin">
        <table className="border-collapse min-w-full">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-line">
              <th className="px-2 py-[6px] text-left font-mono text-[9px] uppercase tracking-[0.1em] text-dim w-[180px]">Metric</th>
              {candidates.map((c) => (
                <th
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className="px-2 py-[6px] text-left border-l border-line2 cursor-pointer"
                  style={{ background: c.id === selectedCandidateId ? 'rgba(64,216,208,0.07)' : undefined }}
                >
                  <span className="font-mono text-[11px] text-ink">{c.id}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.label} className="border-b border-line2 align-top">
                <td className="px-2 py-[6px] text-[11px] text-mute">{m.label}</td>
                {candidates.map((c) => (
                  <td key={c.id} className="px-2 py-[6px] border-l border-line2" style={{ background: c.id === selectedCandidateId ? 'rgba(64,216,208,0.05)' : undefined }}>
                    {m.cell(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2 text-[10px] leading-[14px] text-dim border-t border-line2">
          ILLUSTRATIVE comparison of fictional designs. Intervals are model intervals on a shared scale, not confidence
          intervals on measured data. Higher scores do not imply activity — the simulated screen is the next step.
        </div>
      </div>
    </div>
  );
}
