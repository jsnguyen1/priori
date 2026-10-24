// First-load chooser: guided demo (default), presenter mode, or free exploration.
import { AnimatePresence, motion } from 'motion/react';
import { useTour } from './tourStore';
import { useStore } from '../state/store';
import { goToStep } from '../state/presentation';
import { MOTION } from '../ui/tokens';

export function TourIntro() {
  const introSeen = useTour((t) => t.introSeen);
  const active = useTour((t) => t.active);
  const start = useTour((t) => t.start);
  const dismiss = useTour((t) => t.dismissIntro);
  const open = !introSeen && !active;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-tour-ui
          className="fixed inset-0 z-[70] bg-canvas/[0.86] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: MOTION.base }}
        >
          <motion.div
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: MOTION.slow, ease: MOTION.ease, delay: 0.1 }}
            className="w-[560px] bg-surface border border-line rounded shadow-[0_24px_70px_rgba(0,0,0,0.6)]"
          >
            <div className="px-7 pt-6 pb-5">
              <div className="font-mono text-[10px] tracking-[0.18em] text-cyan">PRIORI · SCN2A PROGRAM</div>
              <div className="mt-3 text-[22px] leading-[29px] text-ink font-medium">The next patient shouldn’t start from zero.</div>
              <p className="mt-3 text-[13.5px] leading-[21px] text-ink/85">
                Children with rare genetic diseases often wait years while scientists work out what their mutation does and how to treat it — starting from scratch for every child.
              </p>
              <p className="mt-2 text-[13.5px] leading-[21px] text-ink/85">
                Priori keeps what was learned for one patient and reuses it, safely, for the next. In the next five minutes you’ll use the same software a Priori scientist would — and we’ll show you where to click.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-[10px] tracking-[0.06em] text-mute">
                {[
                  ['1', 'A newborn, an unknown mutation'],
                  ['2', 'Test it, design a treatment'],
                  ['3', 'A second child inherits it'],
                ].map(([n, t]) => (
                  <div key={n} className="border border-line2 rounded px-2.5 py-2 leading-[14px]">
                    <span className="text-cyan mr-1.5">{n}</span>
                    {t}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 px-5 py-4 border-t border-line2">
              <button
                autoFocus
                onClick={start}
                className="h-10 px-5 rounded border border-cyan text-cyan bg-cyan/[0.1] hover:bg-cyan/[0.18] font-mono text-[11px] tracking-[0.12em]"
              >
                START GUIDED DEMO →
              </button>
              <div className="flex-1" />
              <button
                onClick={() => {
                  dismiss();
                  useStore.getState().setPresentation({ active: true });
                  goToStep(0);
                }}
                className="h-10 px-3 rounded text-mute hover:text-ink hover:bg-surface2 font-mono text-[10px] tracking-[0.1em]"
                title="Presenter-driven narrative (P)"
              >
                PRESENTER MODE
              </button>
              <button onClick={dismiss} className="h-10 px-3 rounded text-mute hover:text-ink hover:bg-surface2 font-mono text-[10px] tracking-[0.1em]">
                EXPLORE FREELY
              </button>
            </div>
            <div className="px-7 pb-4 -mt-1 text-[11px] text-dim">All patients are hypothetical. All results are simulated or illustrative. Not for clinical use.</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
