// ACT I — the opening clinical scene for hypothetical patient PX-001.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { getPatient } from '../../data/patients';
import { getClassification } from '../../data/variants';
import { plainMech } from './plain';
import { PRIMARY_PATIENT_ID, useStore, type Decision } from '../../state/store';
import { Workspace } from '../../ui/Workspace';
import { MOTION, prefersReducedMotion } from '../../ui/tokens';
import { EegTrace } from './EegTrace';
import { MonitorHeader } from './MonitorHeader';
import { DecisionControls } from './DecisionControls';
import { MechanismReveal } from './MechanismReveal';
import { CaseSidebar } from './CaseSidebar';
import { AtlasTransition, TRANSITION_MS } from './AtlasTransition';
import { getAtlasIndex } from '../atlas/atlasData';
import { Headline, useSimple } from '../../ui/simple';
import { Scn2aExplainer } from './Scn2aExplainer';

const REVEAL_DELAY_MS = 1100;

export function PatientModule() {
  const decision = useStore((s) => s.decision);
  const revealed = useStore((s) => s.mechanismRevealed);
  const decide = useStore((s) => s.decide);
  const revealMechanism = useStore((s) => s.revealMechanism);
  const setModule = useStore((s) => s.setModule);
  const selectVariant = useStore((s) => s.selectVariant);
  const [leaving, setLeaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const p = getPatient(PRIMARY_PATIENT_ID);

  // Reveal once, after the trace has visibly frozen.
  useEffect(() => {
    if (!decision || revealed) return;
    const t = setTimeout(() => revealMechanism(), prefersReducedMotion() ? 0 : REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, [decision, revealed, revealMechanism]);

  // Bring the reveal into view.
  useEffect(() => {
    if (!revealed || !decision) return;
    const el = scrollRef.current;
    if (!el) return;
    const reduced = prefersReducedMotion();
    // Once the staggered reveal has landed, make sure the punchline + OPEN ATLAS button are on screen.
    const t = setTimeout(() => {
      const target = el.querySelector<HTMLElement>('[data-mech-punchline]');
      if (target) target.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    }, reduced ? 60 : 1500);
    return () => clearTimeout(t);
  }, [revealed, decision]);

  // Warm the atlas classification table while the user reads the scenario.
  useEffect(() => {
    const run = () => void getAtlasIndex();
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(run, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(run, 800);
    return () => clearTimeout(id);
  }, []);

  const onDecide = useCallback((c: Decision['choice']) => decide(c), [decide]);

  // Keyboard: A / W before a decision is recorded.
  useEffect(() => {
    if (decision) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'a' || e.key === 'A') onDecide('administer');
      if (e.key === 'w' || e.key === 'W') onDecide('withhold');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decision, onDecide]);

  const openAtlas = useCallback(() => {
    if (leaving) return;
    selectVariant(p.variantId, { focus: true });
    if (prefersReducedMotion()) {
      setModule('atlas');
      return;
    }
    setLeaving(true);
    setTimeout(() => setModule('atlas'), TRANSITION_MS);
  }, [leaving, p.variantId, selectVariant, setModule]);

  const showReveal = !!decision && revealed;
  const simple = useSimple();
  const mech = getClassification(p.variantId).mechanism;

  return (
    <Workspace sidebar={<CaseSidebar />} sidebarWidth={268}>
      <div className="absolute inset-0 overflow-hidden bg-[#030507]">
        <EegTrace frozen={!!decision} dimmed={showReveal} />
        <motion.div
          className="relative z-10 h-full flex flex-col"
          animate={leaving ? { opacity: 0, scale: 0.985 } : { opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: MOTION.ease }}
        >
          <MonitorHeader characterized={revealed} />
          <div className="shrink-0 bg-gradient-to-b from-[#030507] via-[#030507]/90 to-transparent">
            <Headline
              step="1 / 6"
              className="max-w-[860px] mx-auto w-full px-8"
              title={
                showReveal
                  ? mech === 'GoF' || mech === 'LoF'
                    ? `The simulated test result: this gene change makes the sodium channel ${plainMech(mech, true)}.`
                    : 'The simulated test result: the effect of this gene change is still unclear.'
                  : 'A newborn is having seizures. A genetic test found a change in one gene, but nobody knows what it does.'
              }
              sub={
                showReveal
                  ? mech === 'LoF'
                    ? 'The usual drug helps when the channel is too active. Here it would push the wrong way.'
                    : 'The usual drug helps when the channel is too active.'
                  : 'The usual seizure drug blocks the gate this gene builds. Do you give it?'
              }
            />
            {simple && !showReveal && (
              <div className="max-w-[860px] mx-auto w-full px-8">
                <Scn2aExplainer />
              </div>
            )}
          </div>
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scroll-thin">
            <div className={showReveal ? (simple ? 'max-w-[860px] mx-auto px-8 py-3' : 'max-w-[860px] mx-auto px-8 py-5') : 'max-w-[860px] mx-auto px-8 min-h-full flex flex-col justify-center py-10'}>
              <motion.div layout="position" transition={{ duration: MOTION.slow, ease: MOTION.ease }} className="bg-[#030507]/80">
                {!simple && <div className="font-mono text-2xs tracking-[0.14em] text-dim mb-2">SCENARIO · {p.id} · HYPOTHETICAL</div>}
                {!showReveal && !simple && (
                  <>
                    <p className="text-[17px] text-ink leading-[27px] max-w-[640px]">{p.scenario}</p>
                    <div className="mt-6 mb-3 font-mono text-2xs tracking-[0.14em] text-dim">QUESTION</div>
                    <p className="text-md text-ink leading-[22px] mb-4">Would you administer a sodium-channel blocker based on the available information?</p>
                  </>
                )}
                <DecisionControls decision={decision} onDecide={onDecide} />
              </motion.div>

              <AnimatePresence>
                {decision && !revealed && (
                  <motion.div
                    key="pending"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mt-6 font-mono text-2xs tracking-[0.14em] text-mute"
                  >
                    {simple ? 'RUNNING THE SIMULATED LAB TEST…' : 'RETRIEVING SIMULATED FUNCTIONAL CHARACTERIZATION…'}
                  </motion.div>
                )}
              </AnimatePresence>

              {showReveal && (
                <div className="mt-5">
                  <MechanismReveal decision={decision!} onOpenAtlas={openAtlas} />
                </div>
              )}
            </div>
          </div>
        </motion.div>
        <AnimatePresence>{leaving && <AtlasTransition />}</AnimatePresence>
      </div>
    </Workspace>
  );
}
