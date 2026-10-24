// Post-decision reveal: the simulated functional evidence for PX-001's variant.
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { getPatient } from '../../data/patients';
import { getClassification, getProfile, getVariant } from '../../data/variants';
import { CITATIONS, PUBLISHED_FACTS, regionById } from '../../data/published';
import { MEASUREMENT_META } from '../../sim/channel';
import { PRIMARY_PATIENT_ID, type Decision } from '../../state/store';
import { Button, EvidenceBadge, Label, MechanismTag, fmt } from '../../ui/primitives';
import { C, MECH_COLOR, MOTION } from '../../ui/tokens';

interface Metric {
  label: string;
  value: string;
  unit: string;
  se: string;
  n: number;
  ref: string;
  /** signed rule score −1…+1 */
  score: number;
}

function buildMetrics(variantId: string): Metric[] {
  const prof = getProfile(variantId);
  const c = getClassification(variantId);
  const rule = (k: string) => c.rules.find((r) => r.key === k)!;
  const pk = prof.peakDensity;
  const act = prof.vHalfAct;
  const ina = prof.vHalfInact;
  const rec = prof.tauRecovery;
  return [
    {
      label: 'Peak current density ratio',
      value: fmt.num(pk.value / pk.reference, 2),
      unit: '× ref',
      se: fmt.num(pk.se / Math.abs(pk.reference), 2),
      n: pk.n,
      ref: `${fmt.num(pk.value, 0)} vs ${fmt.num(pk.reference, 0)} ${MEASUREMENT_META.peakDensity.unit}`,
      score: rule('peakDensity').score,
    },
    {
      label: 'ΔV½ activation',
      value: fmt.signed(act.value - act.reference, 1),
      unit: 'mV',
      se: fmt.num(act.se, 1),
      n: act.n,
      ref: `ref ${fmt.num(act.reference, 1)} ${MEASUREMENT_META.vHalfAct.unit}`,
      score: rule('vHalfAct').score,
    },
    {
      label: 'ΔV½ inactivation',
      value: fmt.signed(ina.value - ina.reference, 1),
      unit: 'mV',
      se: fmt.num(ina.se, 1),
      n: ina.n,
      ref: `ref ${fmt.num(ina.reference, 1)} ${MEASUREMENT_META.vHalfInact.unit}`,
      score: rule('vHalfInact').score,
    },
    {
      label: 'τ recovery ratio',
      value: fmt.num(rec.value / rec.reference, 2),
      unit: '× ref',
      se: fmt.num(rec.se / rec.reference, 2),
      n: rec.n,
      ref: `${fmt.num(rec.value, 1)} vs ${fmt.num(rec.reference, 1)} ${MEASUREMENT_META.tauRecovery.unit}`,
      score: rule('tauRecovery').score,
    },
  ];
}

function ScoreBar({ score }: { score: number }) {
  // centred bar: left = LoF contribution, right = GoF contribution
  const w = 64;
  const mid = w / 2;
  const len = Math.min(1, Math.abs(score)) * mid;
  const color = score < -0.05 ? MECH_COLOR.LoF : score > 0.05 ? MECH_COLOR.GoF : C.indet;
  return (
    <svg width={w} height={6} className="block">
      <line x1={0} x2={w} y1={3} y2={3} stroke={C.line} />
      <line x1={mid} x2={mid} y1={0} y2={6} stroke={C.mute} strokeOpacity={0.6} />
      <rect x={score < 0 ? mid - len : mid} y={1} width={Math.max(1, len)} height={4} fill={color} />
    </svg>
  );
}

const fade = (i: number) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: MOTION.slow, ease: MOTION.ease, delay: 0.12 + i * 0.22 },
});

export function MechanismReveal({ decision, onOpenAtlas }: { decision: Decision; onOpenAtlas: () => void }) {
  const p = getPatient(PRIMARY_PATIENT_ID);
  const v = getVariant(p.variantId)!;
  const c = getClassification(v.id);
  const region = regionById(v.regionId);
  const metrics = buildMetrics(v.id);
  const facts = ['f-spectrum', 'f-scb'].map((id) => PUBLISHED_FACTS.find((f) => f.id === id)!);
  const administered = decision.choice === 'administer';

  return (
    <div className="space-y-5">
      <motion.section {...fade(0)} data-tour="patient.reveal" className="border border-line2 rounded bg-black/55">
        <div className="flex items-center justify-between h-8 px-3 border-b border-line2">
          <Label>Functional evidence · {v.hgvsP}</Label>
          <div className="flex items-center gap-1.5">
            <EvidenceBadge category="simulated" />
            <EvidenceBadge category="illustrative" />
          </div>
        </div>
        <div className="px-4 pt-3 pb-4">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <div className="text-xs text-mute">In this simulation, the hypothetical variant was modeled as</div>
              <div className="mt-1.5">
                <MechanismTag mechanism={c.mechanism} size="md" />
              </div>
            </div>
            <div className="text-right font-mono text-2xs text-dim leading-[15px]">
              <div>{region?.label} · res {v.position}</div>
              <div>
                net score {fmt.signed(c.netScore, 2)} · confidence {fmt.pct(c.confidence)}
              </div>
              <div>{c.modelVersion}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 border-t border-l border-line2">
            {metrics.map((m) => (
              <div key={m.label} className="border-r border-b border-line2 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-2xs text-mute leading-[13px]">{m.label}</span>
                </div>
                <div className="mt-1.5 font-mono text-md text-ink tabular-nums">
                  {m.value}
                  <span className="text-2xs text-dim ml-1">{m.unit}</span>
                </div>
                <div className="font-mono text-2xs text-dim tabular-nums">
                  ± {m.se} SE · n = {m.n}
                </div>
                <div className="font-mono text-[9.5px] text-dim truncate">{m.ref}</div>
                <div className="mt-1.5 flex items-center justify-between">
                  <ScoreBar score={m.score} />
                  <EvidenceBadge category="simulated" />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 font-mono text-[9.5px] text-dim">
            Synthetic voltage-clamp measurements · illustrative gating model · bars: rule contribution (← LoF · GoF →)
          </div>
        </div>
      </motion.section>

      <motion.section {...fade(1)} className="space-y-2">
        <p className="text-md text-ink leading-[22px]">
          {administered
            ? 'In this simulated case, the functional evidence argues against the selected strategy.'
            : 'In this simulated case, seeking further evidence was consistent with what the simulated functional evidence later showed.'}
        </p>
        <p className="text-sm text-mute leading-[19px]">
          {c.mechanism !== 'LoF'
            ? 'The functional evidence was not available at the time of the decision.'
            : administered
              ? 'A sodium-channel blocker further reduces sodium current. When a variant already reduces channel function, blocking the channel works in the same direction as the variant.'
              : 'A sodium-channel blocker further reduces sodium current. With a variant modeled as reducing channel function, the information that mattered was not available at the time of the decision.'}{' '}
          The broader clinical decision depends on real clinical circumstances, which this simulation does not represent.
        </p>
      </motion.section>

      <motion.section {...fade(2)} className="border border-line2 rounded bg-black/55">
        <div className="flex items-center justify-between h-8 px-3 border-b border-line2">
          <Label>Published context</Label>
          <EvidenceBadge category="published" />
        </div>
        <div className="px-4 py-3 space-y-2.5">
          {facts.map((f) => (
            <div key={f.id} className="flex gap-3">
              <span className="w-[2px] shrink-0 bg-ink/30" />
              <div>
                <p className="text-sm text-ink leading-[19px]">{f.statement}</p>
                <p className="mt-0.5 font-mono text-2xs text-dim">{f.citationIds.map((cid) => CITATIONS[cid]?.short ?? cid).join(' · ')}</p>
              </div>
            </div>
          ))}
          <p className="text-sm text-mute leading-[19px] pt-1 border-t border-line2">
            Early-onset seizures are more often associated with gain-of-function variants, which is why a sodium-channel blocker is a reasonable prior.{' '}
            <span className="text-ink">This hypothetical variant was not gain-of-function.</span>
          </p>
        </div>
      </motion.section>

      <motion.section {...fade(3)} data-mech-punchline className="pt-3 pb-2 flex items-center justify-between gap-6 border-t border-line2">
        <div className="font-mono text-base tracking-[0.12em] text-ink leading-[22px]">
          THE PROBLEM WASN&rsquo;T THE DECISION.
          <br />
          <span className="text-cyan">IT WAS THE MISSING EVIDENCE.</span>
        </div>
        <Button data-tour="patient.openAtlas" variant="primary" size="lg" onClick={onOpenAtlas} className="shrink-0">
          OPEN MECHANISM ATLAS <ArrowRight size={14} strokeWidth={1.5} />
        </Button>
      </motion.section>
    </div>
  );
}
