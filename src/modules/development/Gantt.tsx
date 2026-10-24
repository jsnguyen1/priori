// Two horizontally aligned Gantt timelines on a shared week axis.
import { useState } from 'react';
import { motion } from 'motion/react';
import type { DevelopmentPlan, ScheduledTask } from '../../domain/types';
import { C, MOTION, REUSE_STYLE } from '../../ui/tokens';
import { useReducedMotion, useWidth } from '../reuse/shared';

const LABEL_W = 210;
const ROW_H = 15;
const HEAD_H = 24;
const GAP = 14;
const AXIS_H = 22;
const RIGHT_PAD = 56;

export function DualGantt({
  plans,
  selectedTaskId,
  onSelect,
}: {
  plans: { title: string; sub: string; plan: DevelopmentPlan; ghost: boolean }[];
  selectedTaskId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { ref, w } = useWidth<HTMLDivElement>(900);
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  const W = Math.max(640, w);
  const maxEnd = Math.max(...plans.flatMap((p) => p.plan.tasks.map((t) => Math.max(t.endWeek, t.startWeek + t.task.durationWeeks.mid))));
  const maxWeek = Math.ceil(maxEnd / 10) * 10;
  const plotW = W - LABEL_W - RIGHT_PAD;
  const x = (wk: number) => LABEL_W + (wk / maxWeek) * plotW;
  const n = plans[0].plan.tasks.length;
  const blockH = HEAD_H + n * ROW_H;
  const H = plans.length * blockH + (plans.length - 1) * GAP + AXIS_H;
  const ticks = Array.from({ length: maxWeek / 10 + 1 }, (_, i) => i * 10);
  const focus = hover ?? selectedTaskId;

  return (
    <div ref={ref} className="w-full">
      <svg width={W} height={H} className="block select-none" onMouseLeave={() => setHover(null)}>
        {/* grid */}
        {ticks.map((t) => (
          <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={H - AXIS_H} stroke={C.line2} />
        ))}
        {plans.map((p, bi) => {
          const y0 = bi * (blockH + GAP);
          const rowY = (i: number) => y0 + HEAD_H + i * ROW_H;
          const idx = new Map(p.plan.tasks.map((t, i) => [t.task.id, i]));
          const focusTask = focus ? p.plan.tasks.find((t) => t.task.id === focus) : null;
          return (
            <g key={p.title}>
              <text x={0} y={y0 + 14} className="font-mono" fontSize={10} letterSpacing="0.1em" fill={C.ink}>{p.title}</text>
              <text x={LABEL_W} y={y0 + 14} className="font-mono" fontSize={9.5} fill={C.mute}>{p.sub}</text>
              <text x={W} y={y0 + 14} textAnchor="end" className="font-mono" fontSize={9.5} fill={C.ink}>
                {p.plan.timelineWeeks.mid.toFixed(0)} wk
              </text>
              <line x1={0} x2={W} y1={y0 + HEAD_H - 3} y2={y0 + HEAD_H - 3} stroke={C.line} />
              {p.plan.tasks.map((t, i) => (
                <Row
                  key={t.task.id}
                  t={t}
                  y={rowY(i)}
                  x={x}
                  W={W}
                  ghost={p.ghost}
                  selected={selectedTaskId === t.task.id}
                  hovered={focus === t.task.id}
                  delay={reduced ? 0 : bi * 0.25 + i * 0.03}
                  reduced={reduced}
                  onHover={setHover}
                  onClick={() => onSelect(selectedTaskId === t.task.id ? null : t.task.id)}
                />
              ))}
              {/* dependencies for focused task */}
              {focusTask &&
                focusTask.task.dependsOn.map((d) => {
                  const di = idx.get(d);
                  if (di === undefined) return null;
                  const dep = p.plan.tasks[di];
                  const fi = idx.get(focusTask.task.id)!;
                  const x1 = x(dep.endWeek);
                  const y1 = rowY(di) + ROW_H / 2;
                  const x2 = x(focusTask.startWeek);
                  const y2 = rowY(fi) + ROW_H / 2;
                  const mx = Math.max(x1 + 4, x2 - 6);
                  return (
                    <path key={d} d={`M${x1},${y1} L${mx},${y1} L${mx},${y2} L${x2},${y2}`} fill="none" stroke={C.ink} strokeOpacity={0.55} strokeWidth={1} pointerEvents="none" />
                  );
                })}
            </g>
          );
        })}
        {/* shared axis */}
        <g transform={`translate(0, ${H - AXIS_H})`}>
          <line x1={LABEL_W} x2={LABEL_W + plotW} y1={0} y2={0} stroke={C.line} />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={0} y2={4} stroke={C.line} />
              <text x={x(t)} y={15} textAnchor="middle" className="font-mono" fontSize={9} fill={C.dim}>{t}</text>
            </g>
          ))}
          <text x={LABEL_W + plotW + 6} y={15} className="font-mono" fontSize={9} fill={C.dim}>weeks</text>
        </g>
      </svg>
    </div>
  );
}

function Row({
  t, y, x, W, ghost, selected, hovered, delay, reduced, onHover, onClick,
}: {
  t: ScheduledTask; y: number; x: (w: number) => number; W: number; ghost: boolean; selected: boolean; hovered: boolean; delay: number; reduced: boolean;
  onHover: (id: string | null) => void; onClick: () => void;
}) {
  const s = REUSE_STYLE[t.reuseClass];
  const bx = x(t.startWeek);
  const bw = Math.max(2, x(t.endWeek) - bx);
  const gw = x(t.startWeek + t.task.durationWeeks.mid) - bx;
  const h = ROW_H - 5;
  return (
    <g className="cursor-pointer" onMouseEnter={() => onHover(t.task.id)} onClick={onClick}>
      <rect x={0} y={y} width={W} height={ROW_H} fill={selected ? C.surface2 : hovered ? C.surface : 'transparent'} />
      <text x={0} y={y + 11} className="font-mono" fontSize={9} fill={C.dim}>{t.task.id}</text>
      <text x={26} y={y + 11} fontSize={10.5} fill={selected ? C.ink : C.mute}>{t.task.name}</text>
      {t.task.mandatory && <text x={LABEL_W - 26} y={y + 11} textAnchor="end" className="font-mono" fontSize={8} fill={C.warn}>REQ</text>}
      {t.onCriticalPath && <text x={LABEL_W - 6} y={y + 11} textAnchor="end" className="font-mono" fontSize={8} fill={C.ink}>CP</text>}
      {ghost && gw > bw + 0.5 && (
        <rect x={bx} y={y + 2.5} width={gw} height={h} rx={1} fill="none" stroke={C.dim} strokeOpacity={0.6} strokeDasharray="1 2" />
      )}
      <motion.rect
        x={bx}
        y={y + 2.5}
        height={h}
        rx={1}
        fill={s.color}
        fillOpacity={t.reuseClass === 'new-work' ? 0.16 : 0.28}
        stroke={s.color}
        strokeWidth={selected ? 1.6 : 1}
        strokeDasharray={s.dash || undefined}
        initial={reduced ? { width: bw } : { width: 0 }}
        animate={{ width: bw }}
        transition={{ duration: MOTION.slow, delay, ease: MOTION.ease }}
      />
      {t.onCriticalPath && <line x1={bx} x2={bx + bw} y1={y + ROW_H - 1.5} y2={y + ROW_H - 1.5} stroke={C.ink} strokeWidth={1.2} strokeOpacity={0.8} />}
    </g>
  );
}

export function GanttLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-2xs text-mute">
      {(Object.keys(REUSE_STYLE) as (keyof typeof REUSE_STYLE)[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <svg width="18" height="9"><rect x="0.5" y="0.5" width="17" height="8" rx="1" fill={REUSE_STYLE[k].color} fillOpacity={k === 'new-work' ? 0.16 : 0.28} stroke={REUSE_STYLE[k].color} strokeDasharray={REUSE_STYLE[k].dash} /></svg>
          {REUSE_STYLE[k].short}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5"><svg width="18" height="9"><rect x="0.5" y="0.5" width="17" height="8" fill="none" stroke={C.dim} strokeDasharray="1 2" /></svg>DE-NOVO GHOST</span>
      <span className="inline-flex items-center gap-1.5"><svg width="18" height="9"><line x1="0" x2="18" y1="7.5" y2="7.5" stroke={C.ink} strokeWidth="1.2" /></svg>CP · CRITICAL PATH</span>
      <span className="inline-flex items-center gap-1.5"><span className="text-warn">REQ</span> MANDATORY</span>
    </div>
  );
}
