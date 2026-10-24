// Presenter-controlled narrative for the four-minute pitch. Each step declares the module it shows
// and an idempotent `apply` that establishes the minimum state the step needs — so the presenter can
// recover from any detour by pressing → again. Steps never undo work and never fabricate the
// judge's decision.
import type { ModuleId } from '../domain/types';
import { getPatient } from '../data/patients';
import { getClassification, getVariant } from '../data/variants';
import { generateCandidates, recommendStrategies, targetRegionsFor } from '../sim/therapy';
import { PRIMARY_PATIENT_ID, SECOND_PATIENT_ID, useStore } from './store';

export interface NarrativeStep {
  id: string;
  cue: string; // time cue in the 4-minute script
  act: 'I' | 'II' | 'III';
  title: string;
  presenterNote: string;
  module: ModuleId;
  /** If set, `next` is blocked until this returns true, with `waitingFor` shown as a hint. */
  gate?: () => boolean;
  waitingFor?: string;
  apply: () => void;
}

const S = () => useStore.getState();

function ensurePatient(pid: string) {
  if (S().activePatientId !== pid) S().setActivePatient(pid);
}

function ensureCharacterized(pid: string, immediate = false) {
  const vid = getPatient(pid).variantId;
  const st = S().analyses[vid]?.status;
  if (!st || st === 'idle') S().runAnalysis(vid, { immediate });
  else if (st === 'running' && immediate) S().completeAnalysis(vid);
}

/** Choose the primary recommended strategy and its first target region for a patient. */
function ensureStrategy(pid: string) {
  const vid = getPatient(pid).variantId;
  if (S().analyses[vid]?.status !== 'complete') ensureCharacterized(pid, true);
  const t = S().therapyFor(pid);
  const recs = recommendStrategies(getClassification(vid));
  const primary = recs.find((r) => r.relevance === 'primary' && r.strategy.id !== 'further-characterization') ?? recs.find((r) => r.relevance === 'primary');
  if (!primary) return;
  if (!t.strategyId) S().selectStrategy(pid, primary.strategy.id);
  const t2 = S().therapyFor(pid);
  if (!t2.targetRegionId && t2.strategyId) {
    const regions = targetRegionsFor(t2.strategyId, getVariant(vid)!);
    if (regions[0]) S().selectTargetRegion(pid, regions[0].id);
  }
}

function ensureScreen(pid: string) {
  ensureStrategy(pid);
  const t = S().therapyFor(pid);
  if (t.screeningRun || !t.strategyId || !t.targetRegionId) return;
  if (t.nominated.length === 0) {
    const cands = generateCandidates(pid, getVariant(getPatient(pid).variantId)!, t.strategyId, t.targetRegionId)
      .filter((c) => !t.rejected[c.id])
      .sort((a, b) => b.bindingScore * b.specificityScore - a.bindingScore * a.specificityScore);
    for (const c of cands.slice(0, 4)) S().toggleNominate(pid, c.id);
  }
  S().advanceToScreening(pid);
}

export const STEPS: NarrativeStep[] = [
  {
    id: 'decision',
    cue: '0:00–0:45',
    act: 'I',
    title: 'Patient decision',
    presenterNote: 'Hypothetical neonate PX-001. Ask the judge to choose. The choice is recorded and carried through the session.',
    module: 'patient',
    gate: () => S().decision !== null,
    waitingFor: 'Awaiting the judge’s decision',
    apply: () => ensurePatient(PRIMARY_PATIENT_ID),
  },
  {
    id: 'atlas',
    cue: '0:45–1:20',
    act: 'I',
    title: 'Mechanism Atlas',
    presenterNote: 'The variant landscape. Focus on PX-001’s variant; show what prior regional evidence suggests — and what it cannot establish.',
    module: 'atlas',
    apply: () => {
      ensurePatient(PRIMARY_PATIENT_ID);
      S().selectVariant(getPatient(PRIMARY_PATIENT_ID).variantId, { focus: true, silent: true });
    },
  },
  {
    id: 'lab',
    cue: '1:20–1:50',
    act: 'II',
    title: 'Molecular laboratory',
    presenterNote: 'Experimental NaV1.2 structure (PDB 6J8E). The mutation sits in the DIV pore loop.',
    module: 'lab',
    apply: () => {
      ensurePatient(PRIMARY_PATIENT_ID);
      S().requestCamera('mutation');
    },
  },
  {
    id: 'ephys',
    cue: '1:50–2:40',
    act: 'II',
    title: 'Electrophysiology & mechanism',
    presenterNote: 'Run the simulated voltage-clamp analysis. Peak current falls, activation shifts depolarised → rule-based loss-of-function call with stated confidence.',
    module: 'lab',
    apply: () => {
      ensurePatient(PRIMARY_PATIENT_ID);
      ensureCharacterized(PRIMARY_PATIENT_ID);
    },
  },
  {
    id: 'strategy',
    cue: '2:40–2:55',
    act: 'II',
    title: 'Therapeutic strategy',
    presenterNote: 'Mechanism determines strategy: loss of function → raise productive expression. Indeterminate cases get no candidate.',
    module: 'therapy',
    apply: () => {
      ensurePatient(PRIMARY_PATIENT_ID);
      ensureStrategy(PRIMARY_PATIENT_ID);
    },
  },
  {
    id: 'screen',
    cue: '2:55–3:05',
    act: 'II',
    title: 'Virtual screen',
    presenterNote: 'Fictional candidates screened in a simulated 96-well assay. Some fail, some are mixed, some are excluded for uncertainty.',
    module: 'therapy',
    apply: () => {
      ensurePatient(PRIMARY_PATIENT_ID);
      ensureScreen(PRIMARY_PATIENT_ID);
    },
  },
  {
    id: 'save',
    cue: '3:05–3:10',
    act: 'II',
    title: 'Save to Evidence Library',
    presenterNote: 'Findings become structured evidence artifacts with provenance and reuse conditions.',
    module: 'therapy',
    apply: () => {
      ensurePatient(PRIMARY_PATIENT_ID);
      ensureScreen(PRIMARY_PATIENT_ID);
      S().saveScreeningEvidence(PRIMARY_PATIENT_ID);
    },
  },
  {
    id: 'second',
    cue: '3:10–3:25',
    act: 'III',
    title: 'A second patient arrives',
    presenterNote: 'PX-002: different variant, DIII pore region. The Evidence Library is retained.',
    module: 'reuse',
    apply: () => {
      if (S().activePatientId !== SECOND_PATIENT_ID) S().loadNewPatient(SECOND_PATIENT_ID);
    },
  },
  {
    id: 'reuse',
    cue: '3:25–3:45',
    act: 'III',
    title: 'Evidence inheritance',
    presenterNote: 'What transfers, what needs validation, what must be new, and what never transfers.',
    module: 'reuse',
    apply: () => {
      if (S().activePatientId !== SECOND_PATIENT_ID) S().loadNewPatient(SECOND_PATIENT_ID);
      ensureCharacterized(SECOND_PATIENT_ID, true);
      S().runReuseAssessment(SECOND_PATIENT_ID);
    },
  },
  {
    id: 'development',
    cue: '3:45–3:55',
    act: 'III',
    title: 'Development comparison',
    presenterNote: 'Same task model, two approaches. Timeline from dependencies, not sums. Ranges, not promises.',
    module: 'development',
    apply: () => {
      if (!S().reuse[SECOND_PATIENT_ID]) {
        if (S().activePatientId !== SECOND_PATIENT_ID) S().loadNewPatient(SECOND_PATIENT_ID);
        ensureCharacterized(SECOND_PATIENT_ID, true);
        S().runReuseAssessment(SECOND_PATIENT_ID);
      }
      S().setDevelopmentPatient(SECOND_PATIENT_ID);
    },
  },
  {
    id: 'final',
    cue: '3:55–4:00',
    act: 'III',
    title: 'The next patient shouldn’t start from zero',
    presenterNote: 'Closing line.',
    module: 'development',
    apply: () => {
      if (!S().reuse[SECOND_PATIENT_ID]) {
        if (S().activePatientId !== SECOND_PATIENT_ID) S().loadNewPatient(SECOND_PATIENT_ID);
        ensureCharacterized(SECOND_PATIENT_ID, true);
        S().runReuseAssessment(SECOND_PATIENT_ID);
      }
      S().setDevelopmentPatient(SECOND_PATIENT_ID);
    },
  },
];

export function goToStep(i: number) {
  const idx = Math.max(0, Math.min(STEPS.length - 1, i));
  const step = STEPS[idx];
  step.apply();
  S().setModule(step.module);
  S().setPresentation({ step: idx });
}

export function nextStep(): { blocked?: string } {
  const { step } = S().presentation;
  const cur = STEPS[step];
  if (cur.gate && !cur.gate()) {
    // Re-apply current step (returns presenter to the right screen) but don't advance.
    goToStep(step);
    return { blocked: cur.waitingFor };
  }
  goToStep(step + 1);
  return {};
}

export function prevStep() {
  goToStep(S().presentation.step - 1);
}
