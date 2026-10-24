// The reveal: two patient pathways side by side, each derived from a reuse assessment.
import { motion } from 'motion/react';
import type { ReuseAssessment } from '../../domain/types';
import { REUSE_STYLE, MOTION } from '../../ui/tokens';
import { NODE_IDS, NODE_SHORT, tallyClasses } from '../../sim/reuse';
import { PLAIN_CLASS, PLAIN_NODE, REUSE_ORDER, useReducedMotion } from './shared';

export function Pathways({ rows }: { rows: { label: string; sub: string; assessment: ReuseAssessment }[] }) {
  const reduced = useReducedMotion();
  return (
    <div className="w-full">
      <div className="grid gap-px" style={{ gridTemplateColumns: `120px repeat(${NODE_IDS.length}, minmax(0, 1fr)) 92px` }}>
        <div />
        {NODE_IDS.map((n) => (
          <div key={n} className="font-mono text-[8.5px] leading-[11px] tracking-[0.04em] text-dim px-0.5 pb-1 self-end">{NODE_SHORT[n]}</div>
        ))}
        <div />
        {rows.map((r, ri) => {
          const t = tallyClasses(r.assessment);
          return (
            <div key={r.label} className="contents">
              <div className="py-1.5 pr-2 border-t border-line2">
                <div className="font-mono text-xs text-ink">{r.label}</div>
                <div className="text-2xs text-dim leading-tight">{r.sub}</div>
              </div>
              {NODE_IDS.map((n, i) => {
                const node = r.assessment.nodes.find((x) => x.nodeId === n)!;
                const s = REUSE_STYLE[node.reuseClass];
                return (
                  <motion.div
                    key={n}
                    className="border-t border-line2 py-1.5 px-0.5 flex flex-col justify-center gap-1"
                    title={`${node.label} · ${s.label}`}
                    initial={reduced ? false : { opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: MOTION.base, delay: reduced ? 0 : ri * 0.5 + i * 0.05, ease: MOTION.ease }}
                  >
                    <div className="h-[14px] rounded-[1px] border" style={{ borderColor: s.color, borderStyle: node.reuseClass === 'reusable' ? 'solid' : node.reuseClass === 'reuse-with-validation' ? 'dashed' : 'dotted', background: `${s.color}${node.reuseClass === 'new-work' ? '10' : '22'}` }} />
                    <div className="font-mono text-[8.5px] tracking-[0.04em]" style={{ color: s.color }}>{s.short}</div>
                  </motion.div>
                );
              })}
              <div className="border-t border-line2 py-1.5 pl-2 font-mono text-[9.5px] leading-[13px] text-mute tabular-nums">
                {REUSE_ORDER.filter((k) => t[k] > 0).map((k) => (
                  <div key={k}><span style={{ color: REUSE_STYLE[k].color }}>{t[k]}</span> {REUSE_STYLE[k].short.toLowerCase()}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Simple view: two rows of 11 coloured blocks, one count per row. */
export function SimplePathways({ rows }: { rows: { label: string; sub: string; assessment: ReuseAssessment }[] }) {
  const reduced = useReducedMotion();
  return (
    <div className="space-y-3">
      <div className="flex justify-end text-[12px] text-dim -mb-1">carried over</div>
      {rows.map((r, ri) => {
        const t = tallyClasses(r.assessment);
        const carried = t.reusable + t['reuse-with-validation'];
        return (
          <div key={r.label} className="flex items-center gap-4">
            <div className="w-[96px] shrink-0">
              <div className="text-[14px] text-ink">{r.label}</div>
              <div className="text-[12px] text-dim">{r.sub}</div>
            </div>
            <div className="flex gap-[3px] flex-1 min-w-0">
              {NODE_IDS.map((n, i) => {
                const node = r.assessment.nodes.find((x) => x.nodeId === n)!;
                const s = REUSE_STYLE[node.reuseClass];
                return (
                  <motion.div
                    key={n}
                    title={`${PLAIN_NODE[n]} · ${PLAIN_CLASS[node.reuseClass].label}`}
                    className="h-[22px] flex-1 rounded-[2px] border"
                    style={{ borderColor: s.color, borderStyle: node.reuseClass === 'reusable' ? 'solid' : node.reuseClass === 'reuse-with-validation' ? 'dashed' : 'dotted', background: `${s.color}${node.reuseClass === 'new-work' ? '10' : '30'}` }}
                    initial={reduced ? false : { opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: MOTION.base, delay: reduced ? 0 : ri * 0.5 + i * 0.05, ease: MOTION.ease }}
                  />
                );
              })}
            </div>
            <div className="w-[64px] shrink-0 text-right font-mono text-[14px] tabular-nums whitespace-nowrap">
              <span style={{ color: carried ? REUSE_STYLE.reusable.color : undefined }} className={carried ? '' : 'text-mute'}>{carried}</span>
              <span className="text-dim"> / {NODE_IDS.length}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
