import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useStore } from '../state/store';
import type { LogEventType } from '../domain/types';
import { Segmented, fmt } from '../ui/primitives';
import { C, MOTION } from '../ui/tokens';

const TYPE_COLOR: Partial<Record<LogEventType, string>> = {
  'CLINICAL DECISION RECORDED': C.gof,
  'MECHANISM CLASSIFIED': C.cyan,
  'MECHANISM REVEALED': C.lof,
  'SIMULATED SCREEN COMPLETE': C.cyan,
  'EVIDENCE ARTIFACT CREATED': C.ink,
  'REUSE ASSESSMENT COMPLETED': C.cyan,
  'CANDIDATE REJECTED': C.warn,
  'DEMO RESET': C.warn,
};

export function ExperimentLog() {
  const open = useStore((s) => s.logOpen);
  const toggle = useStore((s) => s.toggleLog);
  const log = useStore((s) => s.log);
  const sessionStart = useStore((s) => s.sessionStart);
  const [filter, setFilter] = useState<'all' | 'PX-001' | 'PX-002' | 'evidence'>('all');
  const scroller = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    if (filter === 'all') return log;
    if (filter === 'evidence') return log.filter((e) => e.type === 'EVIDENCE ARTIFACT CREATED' || e.type === 'REUSE ASSESSMENT COMPLETED');
    return log.filter((e) => e.patientId === filter);
  }, [log, filter]);

  useEffect(() => {
    if (open) scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [open, rows.length]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: MOTION.base, ease: MOTION.ease }}
          className="fixed left-[64px] right-0 bottom-6 z-40 h-[260px] flex flex-col bg-bg border-t border-line shadow-[0_-12px_40px_rgba(0,0,0,0.45)]"
        >
          <div className="flex items-center gap-4 h-8 px-3 border-b border-line2 shrink-0">
            <span className="font-mono text-[10px] tracking-[0.14em] text-mute">EXPERIMENT LOG</span>
            <span className="font-mono text-[10px] text-dim">{log.length} EVENTS · SESSION {new Date(sessionStart).toISOString().slice(0, 19).replace('T', ' ')} UTC</span>
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'PX-001', label: 'PX-001' },
                { value: 'PX-002', label: 'PX-002' },
                { value: 'evidence', label: 'Evidence' },
              ]}
            />
            <div className="flex-1" />
            <button onClick={() => toggle(false)} className="text-mute hover:text-ink" title="Close (L)">
              <X size={14} />
            </button>
          </div>
          <div ref={scroller} className="flex-1 overflow-y-auto scroll-thin font-mono text-[11px]">
            <table className="w-full border-collapse">
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b border-line2/60 hover:bg-surface/60">
                    <td className="pl-3 pr-3 py-[3px] text-dim whitespace-nowrap w-[70px]">{fmt.time(e.t)}</td>
                    <td className="pr-3 py-[3px] text-dim whitespace-nowrap w-[80px]">{new Date(sessionStart + e.t).toTimeString().slice(0, 8)}</td>
                    <td className="pr-3 py-[3px] whitespace-nowrap w-[64px] text-mute">{e.patientId ?? 'n/a'}</td>
                    <td className="pr-3 py-[3px] whitespace-nowrap w-[230px]" style={{ color: TYPE_COLOR[e.type] ?? C.mute }}>
                      {e.type}
                    </td>
                    <td className="pr-3 py-[3px] text-ink/90">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
