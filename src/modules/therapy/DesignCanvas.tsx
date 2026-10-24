// RNA design canvas — SCHEMATIC. Transcript track (exons / introns / UTRs / uORF / poison exon),
// zoomable focus window, targetable-region selection, candidate binding-window overlays, and a
// schematic secondary-structure view of the selected region. No nucleotide sequence exists.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Candidate, GeneticVariant, StrategyId, TranscriptRegion } from '../../domain/types';
import {
  TRANSCRIPT,
  TRANSCRIPT_LENGTH,
  exonForResidue,
  schematicStructure,
  transcriptPosForResidue,
  transcriptRegion,
} from '../../sim/therapy';
import { C } from '../../ui/tokens';
import { Button, Label, cx } from '../../ui/primitives';
import { useSimple } from '../../ui/simple';
import { REGION_STYLE } from './shared';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(900);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(el.clientWidth || 900);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

const PAD = 14;
const MIN_SPAN = 90;

export function DesignCanvas({
  variant,
  strategyId,
  targetableIds,
  targetRegionId,
  candidates,
  nominated,
  rejected,
  selectedCandidateId,
  onSelectRegion,
  onSelectCandidate,
}: {
  variant: GeneticVariant;
  strategyId: StrategyId;
  targetableIds: string[];
  targetRegionId: string | null;
  candidates: Candidate[];
  nominated: string[];
  rejected: Record<string, string>;
  selectedCandidateId: string | null;
  onSelectRegion: (id: string) => void;
  onSelectCandidate: (id: string) => void;
}) {
  const { ref, w } = useWidth<HTMLDivElement>();
  const simple = useSimple();
  const [win, setWin] = useState<[number, number]>([1, TRANSCRIPT_LENGTH]);
  const variantNt = transcriptPosForResidue(variant.position);
  const variantExon = exonForResidue(variant.position);
  const target = targetRegionId ? transcriptRegion(targetRegionId) : undefined;

  // Focus the window on the selected target region (or the variant exon before one is chosen).
  useEffect(() => {
    const r = target ?? (targetableIds.length ? transcriptRegion(targetableIds[0]) : undefined);
    if (!r) return;
    const len = r.end - r.start + 1;
    const pad = Math.max(80, len * 1.1);
    setWin([Math.max(1, Math.round(r.start - pad)), Math.min(TRANSCRIPT_LENGTH, Math.round(r.end + pad))]);
  }, [targetRegionId, strategyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const innerW = Math.max(240, w - PAD * 2);
  const ovX = useCallback((p: number) => PAD + ((p - 1) / (TRANSCRIPT_LENGTH - 1)) * innerW, [innerW]);
  const fx = useCallback((p: number) => PAD + ((p - win[0]) / Math.max(1, win[1] - win[0])) * innerW, [innerW, win]);
  const fxInv = useCallback((px: number) => win[0] + ((px - PAD) / innerW) * (win[1] - win[0]), [innerW, win]);

  const zoom = (factor: number, centre?: number) => {
    setWin(([a, b]) => {
      const c = centre ?? (a + b) / 2;
      const span = Math.min(TRANSCRIPT_LENGTH - 1, Math.max(MIN_SPAN, (b - a) * factor));
      let lo = Math.round(c - span * ((c - a) / Math.max(1, b - a)));
      lo = Math.max(1, Math.min(TRANSCRIPT_LENGTH - span, lo));
      return [lo, Math.round(lo + span)];
    });
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    zoom(e.deltaY > 0 ? 1.25 : 0.8, fxInv(e.clientX - rect.left));
  };

  const drag = useRef<{ x: number; win: [number, number] } | null>(null);
  const onPanDown = (e: React.PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, win };
    (e.currentTarget as unknown as Element).setPointerCapture?.(e.pointerId);
  };
  const onPanMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const span = drag.current.win[1] - drag.current.win[0];
    const dNt = ((e.clientX - drag.current.x) / innerW) * span;
    let lo = Math.round(drag.current.win[0] - dNt);
    lo = Math.max(1, Math.min(TRANSCRIPT_LENGTH - span, lo));
    setWin([lo, lo + span]);
  };
  const onPanUp = () => {
    drag.current = null;
  };

  const inWindow = (r: { start: number; end: number }) => r.end >= win[0] && r.start <= win[1];
  const visible = useMemo(() => TRANSCRIPT.filter(inWindow), [win]);
  const structure = useMemo(() => (target ? schematicStructure(target.id) : []), [target?.id]);
  const windowCandidates = candidates.filter((c) => c.bindEnd > 0 && inWindow({ start: c.bindStart, end: c.bindEnd }));

  // ─ geometry ─
  const OV_H = 46;
  const FOCUS_H = 150;
  const STRUCT_H = 158;
  const trackY = 54;
  const trackH = 26;
  const barTop = 96;

  const candColor = (c: Candidate) =>
    rejected[c.id] ? C.warn : c.id === selectedCandidateId ? C.cyan : nominated.includes(c.id) ? C.gof : C.mute;

  return (
    <div ref={ref} className="flex flex-col min-h-0 h-full">
      {/* overview + controls */}
      <div className={cx('flex items-center justify-between px-3 border-b border-line2 shrink-0', simple ? 'h-9' : 'h-8')}>
        {simple ? (
          <span className="text-[13px] text-ink">
            The gene message (RNA) <span className="text-mute">· {targetRegionId ? 'drug designs are drawn under it' : 'click a dashed box to pick where a drug acts'}</span>
          </span>
        ) : (
          <Label>Transcript design canvas · schematic</Label>
        )}
        <div className="flex items-center gap-1.5">
          {!simple && (
            <span className="font-mono text-[10px] text-dim tabular-nums">
              {win[0].toLocaleString()}–{win[1].toLocaleString()} nt · {(win[1] - win[0] + 1).toLocaleString()} nt window
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={() => zoom(0.6)} title="Zoom in">+</Button>
          <Button size="sm" variant="ghost" onClick={() => zoom(1.7)} title="Zoom out">−</Button>
          <Button size="sm" variant="ghost" onClick={() => setWin([1, TRANSCRIPT_LENGTH])} title="Fit transcript">FIT</Button>
        </div>
      </div>

      <div className="shrink-0 border-b border-line2">
        <svg width={w} height={OV_H} className="block" onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const p = 1 + ((e.clientX - rect.left - PAD) / innerW) * (TRANSCRIPT_LENGTH - 1);
          const span = win[1] - win[0];
          const lo = Math.max(1, Math.min(TRANSCRIPT_LENGTH - span, Math.round(p - span / 2)));
          setWin([lo, lo + span]);
        }}>
          <text x={PAD} y={11} fill={C.dim} fontSize={9} fontFamily="IBM Plex Mono, monospace">
            {simple ? 'WHOLE GENE MESSAGE · BOX = ZOOMED VIEW BELOW' : `FULL TRANSCRIPT (SCHEMATIC) · ${TRANSCRIPT_LENGTH.toLocaleString()} nt · INTRONS COMPRESSED`}
          </text>
          <line x1={PAD} x2={PAD + innerW} y1={30} y2={30} stroke={C.line} />
          {TRANSCRIPT.map((r) => {
            const s = REGION_STYLE[r.kind];
            const x0 = ovX(r.start);
            const x1 = Math.max(x0 + 0.7, ovX(r.end));
            const h = r.kind === 'exon' ? 12 : r.kind === 'intron' ? 2 : 9;
            return <rect key={r.id} x={x0} y={30 - h / 2} width={x1 - x0} height={h} fill={s.fill === 'transparent' ? C.line : s.fill} stroke={r.kind === 'intron' ? 'none' : s.stroke} strokeWidth={0.6} />;
          })}
          <line x1={ovX(variantNt)} x2={ovX(variantNt)} y1={18} y2={42} stroke={C.lof} strokeWidth={1} />
          <rect
            x={ovX(win[0])}
            y={18}
            width={Math.max(2, ovX(win[1]) - ovX(win[0]))}
            height={24}
            fill="rgba(64,216,208,0.08)"
            stroke={C.cyan}
            strokeWidth={0.8}
          />
        </svg>
      </div>

      {/* focused track */}
      <div className="shrink-0 border-b border-line2">
        <svg
          width={w}
          height={FOCUS_H}
          className="block cursor-grab"
          onWheel={onWheel}
          onPointerDown={onPanDown}
          onPointerMove={onPanMove}
          onPointerUp={onPanUp}
          onPointerCancel={onPanUp}
        >
          {/* coordinate ticks */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const p = Math.round(win[0] + f * (win[1] - win[0]));
            return (
              <g key={f}>
                <line x1={fx(p)} x2={fx(p)} y1={14} y2={FOCUS_H - 10} stroke={C.line2} strokeDasharray="1 3" />
                {!simple && <text x={fx(p)} y={11} fill={C.dim} fontSize={8.5} fontFamily="IBM Plex Mono, monospace" textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}>
                  {p.toLocaleString()}
                </text>}
              </g>
            );
          })}

          {/* regions */}
          <line x1={PAD} x2={PAD + innerW} y1={trackY + trackH / 2} y2={trackY + trackH / 2} stroke={C.line} />
          {visible.map((r) => {
            const s = REGION_STYLE[r.kind];
            const x0 = fx(Math.max(r.start, win[0]));
            const x1 = fx(Math.min(r.end, win[1]));
            const wid = Math.max(1.2, x1 - x0);
            const isTargetable = targetableIds.includes(r.id);
            const isSelected = r.id === targetRegionId;
            if (r.kind === 'intron') {
              const y = trackY + trackH / 2;
              return (
                <g key={r.id}>
                  <line x1={x0} x2={x1} y1={y} y2={y} stroke={C.line} strokeWidth={1} />
                  {wid > 24 && <path d={`M${(x0 + x1) / 2 - 3},${y - 3.5} L${(x0 + x1) / 2 + 2},${y} L${(x0 + x1) / 2 - 3},${y + 3.5}`} fill="none" stroke={C.dim} strokeWidth={0.9} />}
                </g>
              );
            }
            const h = r.kind === 'exon' ? trackH : r.kind === 'poison-exon' ? trackH - 4 : trackH - 9;
            const y = trackY + (trackH - h) / 2;
            return (
              <g key={r.id} onClick={(e) => { e.stopPropagation(); if (isTargetable) onSelectRegion(r.id); }} className={isTargetable ? 'cursor-pointer' : undefined}>
                {isTargetable && (
                  <rect x={x0 - 2} y={y - 4} width={wid + 4} height={h + 8} fill="none" stroke={isSelected ? C.cyan : 'rgba(64,216,208,0.45)'} strokeWidth={isSelected ? 1.2 : 0.8} strokeDasharray={isSelected ? undefined : '3 2'} />
                )}
                <rect x={x0} y={y} width={wid} height={h} fill={isSelected ? 'rgba(64,216,208,0.18)' : s.fill} stroke={s.stroke} strokeWidth={0.8} />
                {wid > 30 && (
                  <text x={x0 + wid / 2} y={y + h / 2 + 3} fill={C.mute} fontSize={8.5} fontFamily="IBM Plex Mono, monospace" textAnchor="middle">
                    {r.kind === 'exon' ? r.label.replace('Exon ', 'EX').replace(' (approximate)', '') : r.kind === 'poison-exon' ? 'PE (HYPOTHETICAL)' : r.id.toUpperCase()}
                  </text>
                )}
              </g>
            );
          })}

          {/* variant marker */}
          {variantNt >= win[0] && variantNt <= win[1] && (
            <g>
              <line x1={fx(variantNt)} x2={fx(variantNt)} y1={trackY - 12} y2={trackY + trackH + 6} stroke={C.lof} strokeWidth={1.2} />
              <path d={`M${fx(variantNt) - 4},${trackY - 12} L${fx(variantNt) + 4},${trackY - 12} L${fx(variantNt)},${trackY - 5} Z`} fill={C.lof} />
              <text x={fx(variantNt) + 6} y={trackY - 13} fill={C.lof} fontSize={9} fontFamily="IBM Plex Mono, monospace">
                {simple ? "PATIENT'S CHANGE" : `${variant.hgvsP} · ${variantExon.label.replace(' (approximate)', '')}`}
              </text>
            </g>
          )}

          {/* candidate binding overlays */}
          <text x={PAD} y={barTop - 4} fill={C.dim} fontSize={8.5} fontFamily="IBM Plex Mono, monospace">
            {simple ? 'DRUG DESIGNS · WHERE EACH WOULD STICK' : 'CANDIDATE BINDING WINDOWS (SCHEMATIC · NO SEQUENCE)'}
          </text>
          {windowCandidates.map((c, i) => {
            const y = barTop + (i % 5) * 9;
            const x0 = fx(c.bindStart);
            const x1 = Math.max(x0 + 2, fx(c.bindEnd));
            const col = candColor(c);
            return (
              <g key={c.id} onClick={(e) => { e.stopPropagation(); onSelectCandidate(c.id); }} className="cursor-pointer">
                <rect x={x0} y={y} width={x1 - x0} height={5} fill={col} fillOpacity={rejected[c.id] ? 0.3 : 0.75} stroke={col} strokeWidth={0.6} strokeDasharray={rejected[c.id] ? '2 2' : undefined} />
                {x1 - x0 > 4 && (
                  <text x={x1 + 4} y={y + 5} fill={col} fontSize={8} fontFamily="IBM Plex Mono, monospace">
                    {c.id}
                  </text>
                )}
              </g>
            );
          })}
          {windowCandidates.length === 0 && (
            <text x={PAD} y={barTop + 12} fill={C.dim} fontSize={9} fontFamily="IBM Plex Mono, monospace">
              {targetRegionId ? 'NO CANDIDATE WINDOWS IN VIEW' : simple ? 'CLICK A DASHED BOX ABOVE TO DESIGN DRUGS FOR IT' : 'SELECT A TARGET REGION TO GENERATE CANDIDATES'}
            </text>
          )}
        </svg>
      </div>

      {simple && <SimpleLegend />}

      {/* schematic secondary structure */}
      {!simple && (
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
        <div className="flex items-center justify-between h-7 px-3 border-b border-line2">
          <Label>Secondary structure · schematic (not a folding prediction)</Label>
          <span className="font-mono text-[10px] text-dim">{target ? target.label : 'no region selected'}</span>
        </div>
        {target ? (
          <StructureView region={target} structure={structure} candidates={candidates} width={w} height={STRUCT_H} selectedCandidateId={selectedCandidateId} nominated={nominated} rejected={rejected} onSelectCandidate={onSelectCandidate} />
        ) : (
          <div className="p-3 text-[11px] text-dim">
            Select a highlighted target region on the transcript to view its schematic structure and candidate windows.
          </div>
        )}
        <Legend targetable={targetableIds.length} />
      </div>
      )}
    </div>
  );
}

function SimpleLegend() {
  const items: { label: string; color: string; dashed?: boolean }[] = [
    { label: "Patient's genetic change", color: C.lof },
    { label: 'Where a drug could act (click)', color: C.cyan, dashed: true },
    { label: 'Picked design', color: C.gof },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-3 py-2">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-2 text-[12px] text-mute">
          <svg width="16" height="6">
            <line x1="0" y1="3" x2="16" y2="3" stroke={it.color} strokeWidth="2.5" strokeDasharray={it.dashed ? '3 2' : undefined} />
          </svg>
          {it.label}
        </span>
      ))}
      <span className="text-[11px] text-dim">Schematic drawing, not real sequence.</span>
    </div>
  );
}

function StructureView({
  region,
  structure,
  candidates,
  width,
  height,
  selectedCandidateId,
  nominated,
  rejected,
  onSelectCandidate,
}: {
  region: TranscriptRegion;
  structure: ReturnType<typeof schematicStructure>;
  candidates: Candidate[];
  width: number;
  height: number;
  selectedCandidateId: string | null;
  nominated: string[];
  rejected: Record<string, string>;
  onSelectCandidate: (id: string) => void;
}) {
  const innerW = Math.max(240, width - PAD * 2);
  const x = (p: number) => PAD + ((p - region.start) / Math.max(1, region.end - region.start)) * innerW;
  const baseY = height - 54;
  const inRegion = candidates.filter((c) => c.bindEnd > 0 && c.bindEnd >= region.start && c.bindStart <= region.end);

  return (
    <svg width={width} height={height} className="block">
      {/* accessibility shading per structural element */}
      {structure.map((s, i) => (
        <g key={i}>
          <rect x={x(s.stemAStart)} y={14} width={Math.max(2, x(s.stemBEnd) - x(s.stemAStart))} height={baseY - 14} fill={`rgba(64,216,208,${(0.03 + 0.14 * s.accessibility).toFixed(3)})`} />
          <text x={(x(s.stemAStart) + x(s.stemBEnd)) / 2} y={11} fill={C.dim} fontSize={8} fontFamily="IBM Plex Mono, monospace" textAnchor="middle">
            ACC {s.accessibility.toFixed(2)}
          </text>
        </g>
      ))}

      {/* backbone */}
      <line x1={PAD} x2={PAD + innerW} y1={baseY} y2={baseY} stroke={C.line} strokeWidth={1.2} />

      {/* hairpins */}
      {structure.map((s, i) => {
        const xa0 = x(s.stemAStart);
        const xa1 = x(s.stemAEnd);
        const xb0 = x(s.stemBStart);
        const xb1 = x(s.stemBEnd);
        const cxm = (xa1 + xb0) / 2;
        const stemH = 34;
        const top = baseY - stemH;
        const r = Math.max(5, Math.min(13, (xb0 - xa1) / 2));
        const col = `rgba(109,154,233,${(0.45 + 0.45 * (1 - s.accessibility)).toFixed(2)})`;
        const rungs = 4;
        return (
          <g key={i}>
            <path d={`M${xa0},${baseY} C${xa0 + 4},${baseY - 10} ${cxm - r - 2},${top + 12} ${cxm - r},${top}`} fill="none" stroke={col} strokeWidth={1.4} />
            <path d={`M${xb1},${baseY} C${xb1 - 4},${baseY - 10} ${cxm + r + 2},${top + 12} ${cxm + r},${top}`} fill="none" stroke={col} strokeWidth={1.4} />
            <path d={`M${cxm - r},${top} A${r},${r} 0 0 1 ${cxm + r},${top}`} fill="none" stroke={C.mixed} strokeWidth={1.4} />
            {Array.from({ length: rungs }, (_, k) => {
              const f = (k + 1) / (rungs + 1);
              const yk = baseY - stemH * f;
              const dx = (r + 2) * f + 3;
              return <line key={k} x1={cxm - dx} x2={cxm + dx} y1={yk} y2={yk} stroke={C.line} strokeWidth={0.8} />;
            })}
            <line x1={xa0} x2={xa1} y1={baseY} y2={baseY} stroke={C.lof} strokeWidth={2.2} strokeOpacity={0.5} />
            <line x1={xb0} x2={xb1} y1={baseY} y2={baseY} stroke={C.lof} strokeWidth={2.2} strokeOpacity={0.5} />
          </g>
        );
      })}

      {/* candidate windows overlaid on the region axis */}
      {inRegion.map((c, i) => {
        const y = baseY + 12 + (i % 4) * 9;
        const col = rejected[c.id] ? C.warn : c.id === selectedCandidateId ? C.cyan : nominated.includes(c.id) ? C.gof : C.mute;
        return (
          <g key={c.id} className="cursor-pointer" onClick={() => onSelectCandidate(c.id)}>
            <rect x={x(Math.max(c.bindStart, region.start))} y={y} width={Math.max(2, x(Math.min(c.bindEnd, region.end)) - x(Math.max(c.bindStart, region.start)))} height={5} fill={col} fillOpacity={0.7} stroke={col} strokeWidth={0.6} />
            <text x={x(Math.min(c.bindEnd, region.end)) + 4} y={y + 5} fill={col} fontSize={8} fontFamily="IBM Plex Mono, monospace">{c.id}</text>
          </g>
        );
      })}

      <text x={PAD} y={height - 6} fill={C.dim} fontSize={8.5} fontFamily="IBM Plex Mono, monospace">
        SCHEMATIC STEM–LOOPS · SHADING = ILLUSTRATIVE ACCESSIBILITY · {region.start.toLocaleString()}–{region.end.toLocaleString()} nt
      </text>
    </svg>
  );
}

function Legend({ targetable }: { targetable: number }) {
  const items: { label: string; color: string; dashed?: boolean }[] = [
    { label: 'Coding exon', color: REGION_STYLE.exon.stroke },
    { label: 'UTR', color: REGION_STYLE.utr5.stroke },
    { label: 'uORF / regulatory', color: C.gof },
    { label: 'Poison exon (hypothetical)', color: C.warn },
    { label: 'Splice site / element', color: C.mixed },
    { label: 'Variant position', color: C.lof },
    { label: `Targetable for strategy (${targetable})`, color: C.cyan, dashed: true },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 border-t border-line2">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.06em] text-mute">
          <svg width="14" height="6">
            <line x1="0" y1="3" x2="14" y2="3" stroke={it.color} strokeWidth="2.5" strokeDasharray={it.dashed ? '3 2' : undefined} />
          </svg>
          {it.label}
        </span>
      ))}
      <span className={cx('font-mono text-[9px] uppercase tracking-[0.06em] text-dim')}>Drag / wheel to pan &amp; zoom</span>
    </div>
  );
}
