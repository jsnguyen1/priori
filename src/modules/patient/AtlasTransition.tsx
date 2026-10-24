// Transition overlay: the monitor collapses into the protein coordinate axis that the Atlas opens on.
import { motion } from 'motion/react';
import { DOMAIN_SPANS, SCN2A_LENGTH } from '../../data/published';
import { getPatient } from '../../data/patients';
import { getVariant } from '../../data/variants';
import { PRIMARY_PATIENT_ID } from '../../state/store';
import { MOTION } from '../../ui/tokens';

export const TRANSITION_MS = 900;

export function AtlasTransition() {
  const v = getVariant(getPatient(PRIMARY_PATIENT_ID).variantId)!;
  const pct = (r: number) => `${((r - 0.5) / SCN2A_LENGTH) * 100}%`;
  return (
    <motion.div className="absolute inset-0 z-30 bg-canvas flex items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, ease: MOTION.ease }}>
      <div className="relative w-full mx-[76px] h-24">
        <motion.div
          className="absolute left-0 right-0 top-1/2 h-px bg-mute/70 origin-left"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.45, ease: MOTION.ease, delay: 0.1 }}
        />
        {DOMAIN_SPANS.map((d, i) => (
          <motion.div
            key={d.domain}
            className="absolute h-4 border border-line bg-surface2"
            style={{ top: 'calc(50% - 8px)', left: pct(d.start), width: `calc(${pct(d.end + 1)} - ${pct(d.start)})` }}
            initial={{ opacity: 0, scaleY: 0.2 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ duration: 0.3, ease: MOTION.ease, delay: 0.35 + i * 0.06 }}
          >
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-2xs text-mute">{d.label}</span>
          </motion.div>
        ))}
        <motion.div
          className="absolute top-0 bottom-0 w-px bg-ink/60"
          style={{ left: pct(v.position) }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.62 }}
        >
          <span className="absolute -bottom-4 left-1 font-mono text-2xs text-ink whitespace-nowrap">{PRIMARY_PATIENT_ID} · {v.hgvsP}</span>
        </motion.div>
        <motion.div
          className="absolute -bottom-10 left-0 font-mono text-2xs tracking-[0.12em] text-dim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, delay: 0.3 }}
        >
          LOADING MECHANISM ATLAS · SCN2A / NaV1.2 · RES 1–{SCN2A_LENGTH}
        </motion.div>
      </div>
    </motion.div>
  );
}
