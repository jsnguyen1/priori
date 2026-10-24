// The opening decision: two deliberate, neutral controls.
import { motion } from 'motion/react';
import type { Decision } from '../../state/store';
import { cx, fmt } from '../../ui/primitives';
import { MOTION } from '../../ui/tokens';
import { useSimple } from '../../ui/simple';

const OPTIONS: { choice: Decision['choice']; label: string; sub: string; plainSub: string; key: string }[] = [
  { choice: 'administer', label: 'ADMINISTER', sub: 'Sodium-channel blocker', plainSub: 'Give a common seizure drug that blocks sodium channels', key: 'A' },
  { choice: 'withhold', label: 'WITHHOLD / SEEK FURTHER EVIDENCE', sub: 'Defer pending functional characterization', plainSub: 'Wait and gather more evidence', key: 'W' },
];

export function DecisionControls({ decision, onDecide }: { decision: Decision | null; onDecide: (c: Decision['choice']) => void }) {
  const simple = useSimple();
  return (
    <div>
      <div data-tour="patient.decision" className="grid grid-cols-2 gap-3">
        {OPTIONS.map((o) => {
          const chosen = decision?.choice === o.choice;
          const other = decision && !chosen;
          return (
            <motion.button
              key={o.choice}
              disabled={!!decision}
              onClick={() => onDecide(o.choice)}
              animate={{ opacity: other ? 0.28 : 1 }}
              transition={{ duration: MOTION.base, ease: MOTION.ease }}
              className={cx(
                'group relative h-[76px] text-left px-5 border rounded bg-black/50 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan',
                chosen ? 'border-ink/70' : 'border-line',
                !decision && 'hover:border-ink/45 hover:bg-surface/70',
                decision && 'cursor-default',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-md tracking-[0.1em] text-ink">{o.label}</span>
                <span className="font-mono text-2xs text-dim border border-line2 rounded-sm px-1">{chosen ? 'SELECTED' : o.key}</span>
              </div>
              <div className={simple ? 'mt-1.5 text-[14px] text-mute' : 'mt-1.5 text-xs text-mute'}>{simple ? o.plainSub : o.sub}</div>
            </motion.button>
          );
        })}
      </div>
      {!simple && (
      <div className="h-6 mt-2 flex items-center font-mono text-2xs tracking-[0.1em] text-dim">
        {decision ? (
          <span>
            DECISION RECORDED · {fmt.time(decision.at)} · {decision.choice === 'administer' ? 'ADMINISTER' : 'WITHHOLD / SEEK FURTHER EVIDENCE'} · LOGGED
          </span>
        ) : (
          <span>SELECT ONE · THE DECISION IS RECORDED IN THE EXPERIMENT LOG · EDUCATIONAL SIMULATION</span>
        )}
      </div>
      )}
    </div>
  );
}
