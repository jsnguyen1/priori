import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useStore } from '../state/store';
import { STEPS, goToStep, nextStep, prevStep } from '../state/presentation';
import { cx } from '../ui/primitives';
import { MOTION } from '../ui/tokens';

export const presentationEvents = new EventTarget();

export function PresentationOverlay() {
  const active = useStore((s) => s.presentation.active);
  const step = useStore((s) => s.presentation.step);
  const decision = useStore((s) => s.decision);
  const [hint, setHint] = useState<string | null>(null);
  const [finalOpen, setFinalOpen] = useState(false);
  const cur = STEPS[step];

  useEffect(() => {
    const onBlocked = (e: Event) => setHint((e as CustomEvent<string>).detail);
    const onEscape = () => setFinalOpen(false);
    presentationEvents.addEventListener('blocked', onBlocked);
    presentationEvents.addEventListener('escape', onEscape);
    return () => {
      presentationEvents.removeEventListener('blocked', onBlocked);
      presentationEvents.removeEventListener('escape', onEscape);
    };
  }, []);
  useEffect(() => {
    setHint(null);
    setFinalOpen(active && cur.id === 'final');
  }, [step, active, cur.id]);
  useEffect(() => {
    if (decision) setHint(null);
  }, [decision]);

  return (
    <>
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ duration: MOTION.base, ease: MOTION.ease }}
            className="fixed bottom-9 left-1/2 -translate-x-1/2 z-40 flex items-stretch bg-surface/95 border border-line rounded shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-[2px]"
          >
            <button onClick={prevStep} className="px-2.5 text-mute hover:text-ink border-r border-line2" title="Previous (←)">
              <ChevronLeft size={15} />
            </button>
            <div className="px-4 py-2 min-w-[440px] max-w-[560px]">
              <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.12em]">
                <span className="text-cyan">ACT {cur.act}</span>
                <span className="text-dim">{cur.cue}</span>
                <span className="text-mute">
                  STEP {String(step + 1).padStart(2, '0')}/{String(STEPS.length).padStart(2, '0')}
                </span>
                <div className="flex gap-[3px] ml-auto">
                  {STEPS.map((s, i) => (
                    <button key={s.id} onClick={() => goToStep(i)} title={s.title} className={cx('w-[14px] h-[3px] rounded-[1px]', i < step ? 'bg-cyan/50' : i === step ? 'bg-cyan' : 'bg-line')} />
                  ))}
                </div>
              </div>
              <div className="text-md text-ink mt-1">{cur.title}</div>
              <div className="text-xs text-mute mt-0.5">{hint ? <span className="text-gof">{hint}, the judge must choose before continuing.</span> : cur.presenterNote}</div>
            </div>
            <button onClick={() => { const r = nextStep(); if (r.blocked) setHint(r.blocked); }} className="px-2.5 text-mute hover:text-cyan border-l border-line2" title="Next (→)">
              <ChevronRight size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {finalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MOTION.slow, ease: MOTION.ease }}
            className="fixed inset-0 z-30 bg-canvas/[0.93] flex items-center justify-center"
          >
            <button onClick={() => setFinalOpen(false)} className="absolute top-14 right-6 text-mute hover:text-ink" title="Close (Esc)">
              <X size={16} />
            </button>
            <div className="text-center">
              {['Patient 001 required new research.', 'Patient 002 inherited what we learned.', 'Patient 1,000 shouldn’t have to start from zero.'].map((line, i) => (
                <motion.div
                  key={line}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.7, duration: MOTION.slow, ease: MOTION.ease }}
                  className={cx('font-mono text-[15px] tracking-[0.04em] my-2', i === 0 ? 'text-lof' : i === 1 ? 'text-cyan' : 'text-ink')}
                >
                  {line}
                </motion.div>
              ))}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.6, duration: 1 }} className="mt-12">
                <div className="mx-auto w-16 h-px bg-line mb-8" />
                <div className="font-sans text-[26px] font-medium tracking-[0.18em] text-ink">THE NEXT PATIENT SHOULDN’T START FROM ZERO.</div>
                <div className="mt-6 font-mono text-[10px] tracking-[0.14em] text-dim">PRIORI · SCN2A PROGRAM · ALL PATIENTS HYPOTHETICAL · ALL RESULTS SIMULATED OR ILLUSTRATIVE</div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
