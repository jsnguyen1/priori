// Candidate table — ILLUSTRATIVE. Fictional, non-actionable candidate records.
import { useState } from 'react';
import type { Candidate, GeneticVariant } from '../../domain/types';
import { overlapsVariantSite } from '../../sim/therapy';
import { Button, Label, Tip, cx, fmt } from '../../ui/primitives';
import { C } from '../../ui/tokens';
import { useSimple } from '../../ui/simple';
import { SCREEN_THRESHOLDS } from '../../sim/screening';
import { Interval, PLATFORM_COLOR, PLATFORM_LABEL, ScoreBar, predictedFit } from './shared';

export const REJECT_REASONS = [
  'Low specificity',
  'High model uncertainty',
  'Novel chemistry, no platform reuse',
  'Overlaps variant site',
  'Predicted effect interval too wide',
];

const TH = 'px-2 py-[5px] font-mono text-[9px] uppercase tracking-[0.1em] text-dim text-left whitespace-nowrap';
const TD = 'px-2 py-[5px] align-middle whitespace-nowrap';
const TD_SIMPLE = 'px-3 py-[7px] align-middle whitespace-nowrap';

export function CandidateTable({
  candidates,
  variant,
  nominated,
  rejected,
  selectedCandidateId,
  onSelect,
  onToggleNominate,
  onReject,
  onRestore,
}: {
  candidates: Candidate[];
  variant: GeneticVariant;
  nominated: string[];
  rejected: Record<string, string>;
  selectedCandidateId: string | null;
  onSelect: (id: string) => void;
  onToggleNominate: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  onRestore: (id: string) => void;
}) {
  const [picker, setPicker] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const simple = useSimple();
  const td = simple ? TD_SIMPLE : TD;

  const effLow = Math.min(0, ...candidates.map((c) => c.predictedEffect.low));
  const effHigh = Math.max(0, ...candidates.map((c) => c.predictedEffect.high));

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className={cx('flex items-center justify-between px-3 border-b border-line2 shrink-0', simple ? 'h-9' : 'h-7')}>
        {simple ? (
          <>
            <span className="text-[13px] text-ink">Candidate drug designs <span className="text-mute">· pick 2–3 to test</span></span>
            <span className="font-mono text-[11px] text-mute tabular-nums">
              <span className="text-gof">{nominated.length}</span> picked of {candidates.length}
            </span>
          </>
        ) : (
          <>
            <Label>Candidate designs · illustrative · fictional identifiers</Label>
            <span className="font-mono text-[10px] text-dim">
              {candidates.length} designs · {nominated.length} nominated · {Object.keys(rejected).length} rejected
            </span>
          </>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto scroll-thin">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-line">
              <th className={cx(TH, 'sticky left-0 z-20 bg-surface')}>Action</th>
              <th className={TH}>Candidate</th>
              {simple ? (
                <>
                  <th className={TH}>Predicted fit</th>
                  <th className={TH}>Confidence</th>
                </>
              ) : (<>
              <th className={TH}>Window (nt)</th>
              <th className={TH}>Binding</th>
              <th className={TH}>Specificity</th>
              <th className={TH}>Uncertainty</th>
              <th className={TH}>Platform</th>
              <th className={TH}>Predicted effect (Δ param)</th>
              <th className={TH}>Requirements</th>
              </>)}
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => {
              const isRejected = !!rejected[c.id];
              const isNominated = nominated.includes(c.id);
              const selected = c.id === selectedCandidateId;
              const overlaps = overlapsVariantSite(c, variant);
              return (
                <tr
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={cx(
                    'border-b border-line2 cursor-pointer transition-colors',
                    selected ? 'bg-cyan/[0.07]' : 'hover:bg-surface2/60',
                    isRejected && 'opacity-55',
                  )}
                >
                  <td className={cx(td, 'sticky left-0 z-[5] bg-surface')} onClick={(e) => e.stopPropagation()}>
                    {isRejected ? (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[9px] text-warn uppercase tracking-[0.06em] max-w-[120px] truncate" title={rejected[c.id]}>
                          {rejected[c.id]}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => onRestore(c.id)}>Restore</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant={isNominated ? 'primary' : 'default'} onClick={() => onToggleNominate(c.id)}>
                          {isNominated ? 'Nominated' : 'Nominate'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setPicker(picker === c.id ? null : c.id); setCustom(''); }}>
                          Reject
                        </Button>
                      </div>
                    )}
                    {picker === c.id && !isRejected && (
                      <div className="mt-1 p-2 border border-line bg-surface2 rounded text-left">
                        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-dim mb-1">Rejection reason</div>
                        <div className="flex flex-col items-stretch gap-1">
                          {REJECT_REASONS.map((r) => (
                            <button
                              key={r}
                              onClick={() => { onReject(c.id, r); setPicker(null); }}
                              className="h-6 px-2 text-left border border-line2 rounded text-[11px] text-ink hover:border-warn/60 hover:text-warn"
                            >
                              {r}
                            </button>
                          ))}
                          <div className="flex items-center gap-1 pt-1">
                            <input
                              value={custom}
                              onChange={(e) => setCustom(e.target.value)}
                              placeholder="Custom reason…"
                              className="flex-1 h-6 px-2 bg-canvas border border-line2 rounded text-[11px] text-ink placeholder:text-dim focus:outline-none focus:border-cyan/60"
                            />
                            <Button size="sm" variant="danger" disabled={!custom.trim()} onClick={() => { onReject(c.id, custom.trim()); setPicker(null); }}>
                              Reject
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className={td}>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-[6px] h-[6px] rounded-[1px]" style={{ background: isRejected ? C.warn : isNominated ? C.gof : C.line }} />
                      <span className="font-mono text-[11px] text-ink">{c.id}</span>
                    </div>
                  </td>
                  {simple ? (
                    <>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <ScoreBar value={predictedFit(c)} width={120} />
                          <span className="font-mono text-[12px] text-ink tabular-nums">{Math.round(predictedFit(c) * 100)}</span>
                        </div>
                      </td>
                      <td className={td}>
                        {c.uncertainty >= SCREEN_THRESHOLDS.maxUncertainty ? (
                          <span className="text-[12px] text-warn">Low, too unsure</span>
                        ) : (
                          <span className="text-[12px] text-ink">{c.uncertainty < 0.25 ? 'High' : 'Medium'}</span>
                        )}
                      </td>
                    </>
                  ) : (<>
                  <td className={cx(TD, 'font-mono text-[10px] text-mute tabular-nums')}>
                    {c.bindEnd > 0 ? `${c.bindStart.toLocaleString()}–${c.bindEnd.toLocaleString()}` : 'n/a'}
                    {overlaps && <span className="ml-1 text-warn">⚑</span>}
                  </td>
                  <td className={TD}>
                    <div className="flex items-center gap-1.5">
                      <ScoreBar value={c.bindingScore} />
                      <span className="font-mono text-[10px] text-ink tabular-nums">{c.bindingScore.toFixed(2)}</span>
                    </div>
                  </td>
                  <td className={TD}>
                    <div className="flex items-center gap-1.5">
                      <ScoreBar value={c.specificityScore} threshold={0.7} color={c.specificityScore < 0.7 ? C.gof : C.cyan} />
                      <span className="font-mono text-[10px] text-ink tabular-nums">{c.specificityScore.toFixed(2)}</span>
                    </div>
                  </td>
                  <td className={TD}>
                    <div className="flex items-center gap-1.5">
                      <ScoreBar value={c.uncertainty} color={c.uncertainty >= 0.42 ? C.warn : C.mute} threshold={0.42} />
                      <span className="font-mono text-[10px] tabular-nums" style={{ color: c.uncertainty >= 0.42 ? C.warn : C.ink }}>
                        {c.uncertainty.toFixed(2)}
                      </span>
                    </div>
                  </td>
                  <td className={TD}>
                    <span className="font-mono text-[9px] tracking-[0.08em]" style={{ color: PLATFORM_COLOR[c.platformCompatibility] }}>
                      {PLATFORM_LABEL[c.platformCompatibility]}
                    </span>
                  </td>
                  <td className={TD}>
                    <div className="flex items-center gap-1.5">
                      <Interval low={c.predictedEffect.low} mid={c.predictedEffect.mid} high={c.predictedEffect.high} min={effLow} max={effHigh} zero={0} width={96} />
                      <span className="font-mono text-[10px] text-ink tabular-nums">
                        {fmt.signed(c.predictedEffect.mid * 100, 0)}%
                      </span>
                    </div>
                  </td>
                  <td className={TD}>
                    <Tip
                      side="top"
                      content={
                        <span className="block max-w-[320px] whitespace-normal text-left">
                          {c.developmentRequirements.map((r) => (
                            <span key={r} className="block">· {r}</span>
                          ))}
                        </span>
                      }
                    >
                      <span className="font-mono text-[10px] text-mute border-b border-dotted border-mute/50">{c.developmentRequirements.length} items</span>
                    </Tip>
                  </td>
                  </>)}
                </tr>
              );
            })}
          </tbody>
        </table>
        {candidates.length === 0 && (
          <div className="p-3 text-[11px] text-dim">No candidates: select a strategy and a target region.</div>
        )}
        {simple ? (
          <div className="px-3 py-2 text-[11px] text-dim">Invented designs. Scores are model guesses, not proof a drug works.</div>
        ) : (
        <div className="px-3 py-2 text-[10px] leading-[14px] text-dim border-t border-line2">
          Candidate identifiers, binding windows and scores are FICTIONAL and ILLUSTRATIVE. No nucleotide sequences exist in this
          workspace; nothing here is synthesis-ready, and the scores are not efficacy or safety predictions. ⚑ marks a window
          overlapping the variant site.
        </div>
        )}
      </div>
    </div>
  );
}
