import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../state/store';
import { resetEvents } from './useKeyboard';
import { goToStep } from '../state/presentation';
import { Button } from '../ui/primitives';
import { MOTION } from '../ui/tokens';

export function ResetDialog() {
  const [open, setOpen] = useState(false);
  const library = useStore((s) => s.evidenceLibrary.length);
  const events = useStore((s) => s.log.length);
  useEffect(() => {
    const onReq = () => setOpen(true);
    resetEvents.addEventListener('request', onReq);
    return () => resetEvents.removeEventListener('request', onReq);
  }, []);
  const confirm = () => {
    setOpen(false);
    useStore.getState().resetDemo();
    if (useStore.getState().presentation.active) goToStep(0);
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: MOTION.fast }}>
          <div
            className="w-[400px] bg-surface border border-line rounded p-5"
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirm();
              if (e.key === 'Escape') setOpen(false);
            }}
          >
            <div className="font-mono text-[10px] tracking-[0.14em] text-warn mb-2">RESET DEMO</div>
            <div className="text-sm text-ink mb-1">Restore the workspace to its initial state?</div>
            <div className="text-xs text-mute mb-5">
              Clears the recorded decision, {events} log events and {library} evidence artifacts (the seeded library is restored). Simulations are deterministic and will reproduce identically.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={confirm} autoFocus>
                Reset
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
