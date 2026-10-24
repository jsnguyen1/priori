// Evidence-inheritance dependency graph: hand-laid-out two-lane DAG of the 11 evidence nodes.
// Library source chips (artifacts originating from other patients) flow into the target nodes.
import { motion } from 'motion/react';
import type { EvidenceArtifact, EvidenceNodeId, ReuseAssessment, ReuseClass } from '../../domain/types';
import { C, REUSE_STYLE } from '../../ui/tokens';
import { EDGES, NODE_SHORT } from '../../sim/reuse';
import { useReducedMotion, useWidth } from './shared';

type Lane = 'A' | 'B';
const LAYOUT: Record<EvidenceNodeId, { lane: Lane; row: number }> = {
  'assay-protocol': { lane: 'A', row: 0 },
  'reference-cell-system': { lane: 'B', row: 0 },
  'variant-characterization': { lane: 'A', row: 1 },
  'mechanism-evidence': { lane: 'A', row: 2 },
  'therapeutic-design-strategy': { lane: 'A', row: 3 },
  'candidate-screening': { lane: 'A', row: 4 },
  'chemistry-process': { lane: 'B', row: 4 },
  'quality-control': { lane: 'B', row: 5 },
  'safety-testing': { lane: 'A', row: 6 },
  'clinical-evidence': { lane: 'A', row: 7 },
  'regulatory-documentation': { lane: 'B', row: 7 },
};

const ROW_H = 42;
const NODE_H = 28;
const TOP = 26;
const CHIP_W = 118;

export function ReuseGraph({
  assessment,
  library,
  selected,
  onSelect,
  sourcePatientLabel,
}: {
  assessment: ReuseAssessment | null;
  library: EvidenceArtifact[];
  selected: string | null;
  onSelect: (id: EvidenceNodeId | null) => void;
  sourcePatientLabel: string;
}) {
  const { ref, w } = useWidth<HTMLDivElement>(760);
  const reduced = useReducedMotion();
  const W = Math.max(640, w);
  const H = TOP + 8 * ROW_H + 6;
  const nodeW = Math.min(200, (W - 2 * CHIP_W - 120) / 2);
  const laneX: Record<Lane, number> = { A: CHIP_W + 40, B: W - CHIP_W - 40 - nodeW };
  const pos = (id: EvidenceNodeId) => {
    const l = LAYOUT[id];
    return { x: laneX[l.lane], y: TOP + l.row * ROW_H, lane: l.lane };
  };
  const byId = new Map(library.map((a) => [a.id, a]));
  const cls = (id: EvidenceNodeId): ReuseClass | null => assessment?.nodes.find((n) => n.nodeId === id)?.reuseClass ?? null;
  // animation order by row (topological layering)
  const delay = (row: number) => (reduced ? 0 : 0.15 + row * 0.16);
  const key = assessment ? `a-${assessment.computedAt}` : 'none';

  return (
    <div ref={ref} className="w-full">
      <svg width={W} height={H} className="block select-none" role="img" aria-label="Evidence inheritance graph">
        <defs>
          <marker id="rg-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" fill={C.dim} />
          </marker>
        </defs>
        {/* zone headers */}
        <text x={4} y={12} className="font-mono" fontSize={9} letterSpacing="0.1em" fill={C.dim}>LIBRARY · {sourcePatientLabel}</text>
        <text x={laneX.A} y={12} className="font-mono" fontSize={9} letterSpacing="0.1em" fill={C.dim}>BIOLOGY &amp; EFFICACY</text>
        <text x={laneX.B} y={12} className="font-mono" fontSize={9} letterSpacing="0.1em" fill={C.dim}>PLATFORM · CMC · REGULATORY</text>
        <text x={W - 4} y={12} textAnchor="end" className="font-mono" fontSize={9} letterSpacing="0.1em" fill={C.dim}>LIBRARY · {sourcePatientLabel}</text>

        {/* dependency edges */}
        <g key={`e-${key}`}>
          {EDGES.map((e, i) => {
            const a = pos(e.from);
            const b = pos(e.to);
            const c = cls(e.to);
            const s = c ? REUSE_STYLE[c] : null;
            let d: string;
            if (a.lane === b.lane) {
              const ra = LAYOUT[e.from].row;
              const rb = LAYOUT[e.to].row;
              const blocked = (Object.keys(LAYOUT) as EvidenceNodeId[]).some((n) => LAYOUT[n].lane === a.lane && LAYOUT[n].row > ra && LAYOUT[n].row < rb);
              if (blocked) {
                // bracket on the inner side of the lane, around intermediate nodes
                const side = a.lane === 'A' ? a.x + nodeW : a.x;
                const out = a.lane === 'A' ? side + 12 : side - 12;
                const y1 = a.y + NODE_H / 2 + 5;
                const y2 = b.y + NODE_H / 2 - 5;
                d = `M${side},${y1} L${out},${y1} L${out},${y2} L${side},${y2}`;
              } else {
                d = `M${a.x + nodeW / 2},${a.y + NODE_H} L${b.x + nodeW / 2},${b.y}`;
              }
            } else {
              const fromRight = a.lane === 'A';
              const x1 = fromRight ? a.x + nodeW : a.x;
              const x2 = fromRight ? b.x : b.x + nodeW;
              const y1 = a.y + NODE_H / 2;
              const y2 = b.y + NODE_H / 2;
              const mx = (x1 + x2) / 2;
              d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
            }
            const row = LAYOUT[e.to].row;
            return (
              <motion.path
                key={i}
                d={d}
                fill="none"
                stroke={s ? s.color : C.line}
                strokeOpacity={s ? 0.75 : 0.9}
                strokeWidth={1.2}
                strokeDasharray={s?.dash || undefined}
                markerEnd="url(#rg-arrow)"
                initial={assessment && !reduced ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: delay(row) }}
              />
            );
          })}
        </g>

        {/* source chips → nodes */}
        <g key={`c-${key}`}>
          {assessment?.nodes.map((n) => {
            const p = pos(n.nodeId);
            const srcs = n.sourceArtifactIds.map((id) => byId.get(id)).filter((a): a is EvidenceArtifact => !!a && a.provenance.originatingPatientId !== null);
            if (srcs.length === 0) return null;
            const s = REUSE_STYLE[n.reuseClass];
            const left = p.lane === 'A';
            const cx = left ? 4 : W - 4 - CHIP_W;
            const cy = p.y + 4;
            const x1 = left ? cx + CHIP_W : cx;
            const x2 = left ? p.x : p.x + nodeW;
            const y = cy + 10;
            const row = LAYOUT[n.nodeId].row;
            return (
              <g key={n.nodeId} className="cursor-pointer" onClick={() => onSelect(n.nodeId)}>
                <rect x={cx} y={cy} width={CHIP_W} height={20} rx={2} fill={C.surface} stroke={C.line} />
                <text x={cx + 6} y={cy + 13.5} className="font-mono" fontSize={9.5} fill={C.mute}>
                  {srcs[0].id}
                  <tspan fill={C.dim}> · {srcs[0].provenance.originatingPatientId}{srcs.length > 1 ? ` +${srcs.length - 1}` : ''}</tspan>
                </text>
                <motion.path
                  d={`M${x1},${y} L${x2},${y}`}
                  stroke={s.color}
                  strokeWidth={1.5}
                  strokeDasharray={s.dash || undefined}
                  fill="none"
                  initial={reduced ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.45, delay: delay(row) }}
                />
              </g>
            );
          })}
        </g>

        {/* nodes */}
        <g key={`n-${key}`}>
          {(Object.keys(LAYOUT) as EvidenceNodeId[]).map((id) => {
            const p = pos(id);
            const c = cls(id);
            const s = c ? REUSE_STYLE[c] : null;
            const sel = selected === id;
            const row = LAYOUT[id].row;
            return (
              <motion.g
                key={id}
                className="cursor-pointer"
                onClick={() => onSelect(sel ? null : id)}
                initial={assessment && !reduced ? { opacity: 0.35 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: delay(row) }}
                role="button"
                aria-label={`${NODE_SHORT[id]}${c ? ` — ${s!.label}` : ''}`}
              >
                <rect
                  x={p.x}
                  y={p.y}
                  width={nodeW}
                  height={NODE_H}
                  rx={2}
                  fill={s ? s.color : C.surface}
                  fillOpacity={s ? (sel ? 0.16 : 0.07) : 1}
                  stroke={s ? s.color : C.line}
                  strokeWidth={sel ? 2 : 1.2}
                  strokeDasharray={s?.dash || undefined}
                />
                {sel && <rect x={p.x - 3} y={p.y - 3} width={nodeW + 6} height={NODE_H + 6} rx={3} fill="none" stroke={C.ink} strokeOpacity={0.35} />}
                <text x={p.x + 8} y={p.y + 18} className="font-mono" fontSize={10} letterSpacing="0.04em" fill={C.ink}>{NODE_SHORT[id]}</text>
                <text x={p.x + nodeW - 7} y={p.y + 18} textAnchor="end" className="font-mono" fontSize={8.5} letterSpacing="0.06em" fill={s ? s.color : C.dim}>
                  {s ? s.short : '—'}
                </text>
              </motion.g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

export function ReuseLegend({ className }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${className ?? ''}`}>
      {(Object.keys(REUSE_STYLE) as ReuseClass[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5 font-mono text-2xs text-mute">
          <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke={REUSE_STYLE[k].color} strokeWidth="1.6" strokeDasharray={REUSE_STYLE[k].dash} /></svg>
          {REUSE_STYLE[k].label}
        </span>
      ))}
    </div>
  );
}
