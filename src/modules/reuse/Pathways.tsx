// The reveal: two patient pathways side by side, each derived from a reuse assessment.
import { motion } from 'motion/react';
import type { ReuseAssessment } from '../../domain/types';
import { REUSE_STYLE, MOTION } from '../../ui/tokens';
import { NODE_IDS, NODE_SHORT, tallyClasses } from '../../sim/reuse';
import { REUSE_ORDER, useReducedMotion } from './shared';

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
                    title={`${node.label} — ${s.label}`}
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
