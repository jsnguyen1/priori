// The guided scenario. Plain English first; the instrument stays as-is underneath.
//
// Target ids (data-tour attributes that modules must expose):
//   patient.header, patient.finding, patient.decision, patient.reveal, patient.openAtlas
//   atlas.canvas, atlas.legend, atlas.search, atlas.inspector, atlas.inspect
//   lab.viewer, lab.run, lab.traces, lab.report, lab.explore
//   therapy.strategies, therapy.canvas, therapy.candidates, therapy.advance, therapy.plate, therapy.results, therapy.save, therapy.continue
//   reuse.library, reuse.load, reuse.characterize, reuse.assess, reuse.graph, reuse.pathways, reuse.openDev
//   dev.timelines, dev.scenario, dev.summary, dev.cohort
//   shell.systembar, shell.nav, shell.log
import type { TourChapter, TourStep } from './types';
import { getPatient } from '../data/patients';
import { getClassification, getVariant } from '../data/variants';
import { PRIMARY_PATIENT_ID, SECOND_PATIENT_ID } from '../state/store';
import { generateCandidates, recommendStrategies, targetRegionsFor } from '../sim/therapy';

const P1 = PRIMARY_PATIENT_ID;
const P2 = SECOND_PATIENT_ID;
const v1 = () => getPatient(P1).variantId;
const v2 = () => getPatient(P2).variantId;

export const CHAPTERS: TourChapter[] = [
  { id: 'patient', label: 'The patient' },
  { id: 'atlas', label: 'The Atlas' },
  { id: 'lab', label: 'The lab' },
  { id: 'therapy', label: 'Designing a therapy' },
  { id: 'second', label: 'A second patient' },
  { id: 'payoff', label: 'The payoff' },
];

// ── helpers that perform a step for the user ("Do it for me") ─────────────
const primaryStrategy = () => {
  const recs = recommendStrategies(getClassification(v1()));
  return (recs.find((r) => r.relevance === 'primary' && r.strategy.id !== 'further-characterization') ?? recs[0])?.strategy.id;
};
const ensureAnalysis = (s: Parameters<NonNullable<TourStep['autoDo']>>[0], vid: string) => {
  const st = s.analyses[vid]?.status;
  if (!st || st === 'idle') s.runAnalysis(vid, { immediate: true });
  else if (st === 'running') s.completeAnalysis(vid);
};

export const STEPS: TourStep[] = [
  // ── Chapter 1 · The patient ─────────────────────────────────────────────
  {
    id: 'welcome',
    chapter: 'patient',
    module: 'patient',
    placement: 'center',
    title: 'You’re looking at a scientist’s screen',
    body: 'This is the software a Priori researcher would use. It’s dense on purpose — real biology is. We’ll walk through one patient’s story together, one click at a time.',
    why: 'Look for the glowing outline: that’s where to click. Everything here is a simulation with invented patients.',
    prepare: (s) => {
      if (s.activePatientId !== P1) s.setActivePatient(P1);
    },
  },
  {
    id: 'monitor',
    chapter: 'patient',
    module: 'patient',
    target: 'patient.header',
    placement: 'bottom',
    title: 'A newborn is having seizures',
    body: 'Patient PX-001 is 12 hours old. The moving lines behind this text are a brain-activity monitor showing seizure bursts.',
    controls: [{ label: 'HYPOTHETICAL', meaning: 'This patient is invented for the demo.' }],
  },
  {
    id: 'finding',
    chapter: 'patient',
    module: 'patient',
    target: 'patient.finding',
    placement: 'bottom',
    title: 'Genetic testing found a change — but not what it does',
    body: 'Sequencing found a single-letter change in a gene called SCN2A. That gene builds a tiny gate in brain cells that lets sodium in to fire signals. Nobody has ever tested this exact change.',
    why: 'So doctors know where the problem is, but not whether the gate is now too open or too weak.',
  },
  {
    id: 'decide',
    chapter: 'patient',
    module: 'patient',
    target: 'patient.decision',
    placement: 'top',
    title: 'Your call, doctor',
    body: 'A common seizure drug works by blocking that sodium gate. It helps if the gate is too open — but could make things worse if the gate is already too weak.',
    controls: [
      { label: 'ADMINISTER', meaning: 'Give the gate-blocking drug now.' },
      { label: 'WITHHOLD', meaning: 'Wait and seek more evidence first.' },
    ],
    action: { instruction: 'Pick one: ADMINISTER or WITHHOLD.', done: (s) => s.decision !== null },
    autoDo: (s) => s.decide('administer'),
  },
  {
    id: 'reveal',
    chapter: 'patient',
    module: 'patient',
    target: 'patient.reveal',
    placement: 'left',
    title: 'What the lab would later find',
    body: 'In this simulation, the gate turned out to be too WEAK: it carries about 70% less current than normal. That’s called “loss of function” (blue).',
    why: 'A gate-blocker pushes in the wrong direction here. The problem wasn’t your decision — it was missing evidence.',
    controls: [
      { label: 'Peak current ratio 0.31×', meaning: 'The gate passes about a third of normal current.' },
      { label: '± SE · n = 14', meaning: 'Uncertainty, from 14 simulated cells.' },
      { label: 'SIMULATED', meaning: 'Produced by a computer model, not a real experiment.' },
    ],
    prepare: (s) => {
      if (!s.decision) s.decide('withhold');
    },
  },
  {
    id: 'openAtlas',
    chapter: 'patient',
    module: 'patient',
    target: 'patient.openAtlas',
    placement: 'top',
    title: 'What if that evidence already existed?',
    body: 'Priori builds a library of what genetic changes do — before a patient needs it. Let’s open it.',
    action: { instruction: 'Click OPEN MECHANISM ATLAS.', done: (s) => s.module === 'atlas' },
    autoDo: (s) => {
      s.selectVariant(v1(), { focus: true, silent: true });
      s.setModule('atlas');
    },
  },

  // ── Chapter 2 · The Atlas ───────────────────────────────────────────────
  {
    id: 'atlasOverview',
    chapter: 'atlas',
    module: 'atlas',
    target: 'atlas.canvas',
    placement: 'bottom',
    title: 'A map of thousands of genetic changes',
    body: 'Left to right is the length of the gate protein, from its first building block to its last. Each mark is a different (simulated) genetic change.',
    controls: [
      { label: 'Amber', meaning: 'Gate too open (gain of function).' },
      { label: 'Blue', meaning: 'Gate too weak (loss of function).' },
      { label: 'Violet', meaning: 'Mixed — some of each.' },
      { label: 'Gray', meaning: 'Unknown — not enough evidence yet.' },
      { label: 'Scroll / drag', meaning: 'Zoom in and pan along the protein.' },
    ],
  },
  {
    id: 'atlasPatient',
    chapter: 'atlas',
    module: 'atlas',
    target: 'atlas.inspector',
    placement: 'left',
    title: 'Our patient’s change, and its neighbours',
    body: 'The map zoomed to our patient’s change in the gate’s pore — its central opening. The panel on the right shows its measurements and what nearby changes tend to do.',
    why: 'Neighbours give a hint, not proof. Gray everywhere means the field still lacks evidence.',
    prepare: (s) => {
      if (s.selectedVariantId !== v1()) s.selectVariant(v1(), { focus: true, silent: true });
    },
  },
  {
    id: 'atlasInspect',
    chapter: 'atlas',
    module: 'atlas',
    target: 'atlas.inspect',
    placement: 'left',
    title: 'Look at the actual molecule',
    body: 'Next we go from map to molecule: the 3D structure of the gate, with our patient’s change on it.',
    action: { instruction: 'Click INSPECT MOLECULAR MECHANISM.', done: (s) => s.module === 'lab' },
    autoDo: (s) => {
      s.selectVariant(v1(), { silent: true });
      s.setModule('lab');
    },
  },

  // ── Chapter 3 · The lab ─────────────────────────────────────────────────
  {
    id: 'labViewer',
    chapter: 'lab',
    module: 'lab',
    target: 'lab.viewer',
    placement: 'right',
    title: 'The real 3D shape of the sodium gate',
    body: 'This shape comes from a published experiment (cryo-electron microscopy). The four colours are its four sections. The slab is the cell membrane; the small dots are sodium flowing through.',
    controls: [
      { label: 'Drag', meaning: 'Rotate the molecule.' },
      { label: 'Scroll', meaning: 'Zoom in and out.' },
      { label: 'Glowing marker', meaning: 'Where the patient’s change sits.' },
    ],
    prepare: (s) => {
      if (s.selectedVariantId !== v1()) s.selectVariant(v1(), { silent: true });
    },
  },
  {
    id: 'labRun',
    chapter: 'lab',
    module: 'lab',
    target: 'lab.run',
    placement: 'left',
    title: 'Run the experiment',
    body: 'Scientists test a gate by holding a cell at set voltages and measuring the current that flows. We simulate exactly that, for a normal gate and the patient’s.',
    controls: [{ label: 'Voltage clamp', meaning: 'Hold the voltage steady; record the current.' }],
    action: { instruction: 'Click RUN VOLTAGE-CLAMP ANALYSIS.', done: (s) => (s.analyses[v1()]?.status ?? 'idle') !== 'idle' },
    autoDo: (s) => s.runAnalysis(v1()),
  },
  {
    id: 'labTraces',
    chapter: 'lab',
    module: 'lab',
    target: 'lab.traces',
    placement: 'left',
    title: 'Smaller dips = weaker gate',
    body: 'Each curve is the current after a voltage step. Downward means sodium flowing in. Gray is a normal gate; colour is the patient’s. The patient’s dips are much shallower.',
    controls: [
      { label: 'pA/pF', meaning: 'Current per unit of cell size.' },
      { label: 'Overlay', meaning: 'Show normal and patient together.' },
    ],
    action: { instruction: 'Wait for the experiment to finish…', done: (s) => s.analyses[v1()]?.status === 'complete' },
    autoDo: (s) => ensureAnalysis(s, v1()),
  },
  {
    id: 'labReport',
    chapter: 'lab',
    module: 'lab',
    target: 'lab.report',
    placement: 'left',
    title: 'The verdict — with its uncertainty',
    body: 'Simple, published-style rules turn the measurements into a call: loss of function. The confidence shows how often the call holds if we jiggle every measurement by its uncertainty.',
    why: 'It can also say “indeterminate” — the software is allowed to say “we don’t know.”',
  },
  {
    id: 'labExplore',
    chapter: 'lab',
    module: 'lab',
    target: 'lab.explore',
    placement: 'left',
    title: 'From diagnosis to treatment ideas',
    body: 'Knowing the gate is too weak points to a different kind of treatment.',
    action: { instruction: 'Click EXPLORE THERAPEUTIC STRATEGIES.', done: (s) => s.module === 'therapy' },
    autoDo: (s) => {
      ensureAnalysis(s, v1());
      s.setModule('therapy');
    },
  },

  // ── Chapter 4 · Designing a therapy ─────────────────────────────────────
  {
    id: 'therapyStrategy',
    chapter: 'therapy',
    module: 'therapy',
    target: 'therapy.strategies',
    placement: 'right',
    title: 'Match the treatment to the problem',
    body: 'The gate is too weak, and the patient still has one healthy copy of the gene. So the idea is to make the cell produce more of the healthy gate. Strategies that don’t fit are greyed out.',
    controls: [
      { label: 'PRIMARY', meaning: 'Best fit for this mechanism.' },
      { label: 'NOT INDICATED', meaning: 'Wrong direction for this patient.' },
    ],
    action: { instruction: 'Click the PRIMARY strategy.', done: (s) => !!s.therapy[P1]?.strategyId },
    autoDo: (s) => {
      const id = primaryStrategy();
      if (id) s.selectStrategy(P1, id);
    },
    prepare: (s) => ensureAnalysis(s, v1()),
  },
  {
    id: 'therapyTarget',
    chapter: 'therapy',
    module: 'therapy',
    target: 'therapy.canvas',
    placement: 'bottom',
    title: 'Pick where on the gene message to act',
    body: 'Genes are copied into a message (RNA) that the cell reads to build the gate. The highlighted stretches are places a drug could latch onto to boost production.',
    controls: [{ label: 'ASO', meaning: 'A short custom-built strand that sticks to one spot on the RNA.' }],
    action: { instruction: 'Click a highlighted region on the gene message.', done: (s) => !!s.therapy[P1]?.targetRegionId },
    autoDo: (s) => {
      const sid = s.therapyFor(P1).strategyId ?? primaryStrategy();
      if (!sid) return;
      if (!s.therapyFor(P1).strategyId) s.selectStrategy(P1, sid);
      const r = targetRegionsFor(sid, getVariant(v1())!)[0];
      if (r) s.selectTargetRegion(P1, r.id);
    },
  },
  {
    id: 'therapyNominate',
    chapter: 'therapy',
    module: 'therapy',
    target: 'therapy.candidates',
    placement: 'top',
    title: 'Choose drug candidates to test',
    body: 'These are invented candidate designs with predicted scores. Pick a few to test — or reject ones that look risky. Predictions are just that: many won’t work.',
    controls: [
      { label: 'Binding', meaning: 'How well it’s predicted to stick to its target.' },
      { label: 'Specificity', meaning: 'How well it avoids sticking elsewhere.' },
      { label: 'Uncertainty', meaning: 'How unsure the model is.' },
      { label: 'Reject', meaning: 'Rule it out — the reason is logged.' },
    ],
    action: { instruction: 'Nominate at least 2 candidates.', done: (s) => (s.therapy[P1]?.nominated.length ?? 0) >= 2 },
    autoDo: (s) => {
      const t = s.therapyFor(P1);
      if (!t.strategyId || !t.targetRegionId) return;
      generateCandidates(P1, getVariant(v1())!, t.strategyId, t.targetRegionId)
        .filter((c) => !t.nominated.includes(c.id) && !t.rejected[c.id])
        .sort((a, b) => b.bindingScore * b.specificityScore - a.bindingScore * a.specificityScore)
        .slice(0, Math.max(0, 3 - t.nominated.length))
        .forEach((c) => s.toggleNominate(P1, c.id));
    },
  },
  {
    id: 'therapyAdvance',
    chapter: 'therapy',
    module: 'therapy',
    target: 'therapy.advance',
    placement: 'top',
    title: 'Test them on simulated cells',
    body: 'We put each candidate on patient-like cells at several doses and measure whether the current comes back toward normal.',
    action: { instruction: 'Click ADVANCE TO VIRTUAL SCREENING.', done: (s) => !!s.therapy[P1]?.screeningRun },
    autoDo: (s) => s.advanceToScreening(P1),
  },
  {
    id: 'therapyPlate',
    chapter: 'therapy',
    module: 'therapy',
    target: 'therapy.plate',
    placement: 'right',
    title: 'A 96-well test plate',
    body: 'Each circle is a tiny dish of cells. The top row holds controls: normal cells, untreated patient cells, and a blank treatment. The other rows test each candidate at rising doses.',
    action: { instruction: 'Click any well to inspect it.', done: (s) => !!s.therapy[P1]?.selectedWellId },
    autoDo: (s) => {
      const w = s.therapyFor(P1).screeningRun?.plate.find((x) => x.kind === 'candidate');
      if (w) s.selectWell(P1, w.id);
    },
  },
  {
    id: 'therapyResults',
    chapter: 'therapy',
    module: 'therapy',
    target: 'therapy.results',
    placement: 'left',
    title: 'Some fail. That’s the point.',
    body: 'Pass means current recovered toward normal. Mixed means partly. Fail means no real effect. Excluded means too uncertain to tell. Even a failure is valuable knowledge.',
  },
  {
    id: 'therapySave',
    chapter: 'therapy',
    module: 'therapy',
    target: 'therapy.save',
    placement: 'top',
    title: 'The key moment: save what we learned',
    body: 'Every result is saved with a label saying where it came from and when it may be reused for someone else. This is what makes the next patient faster.',
    action: { instruction: 'Click SAVE FINDINGS TO EVIDENCE LIBRARY.', done: (s) => (s.therapy[P1]?.savedArtifactIds.length ?? 0) > 0 },
    autoDo: (s) => s.saveScreeningEvidence(P1),
  },

  // ── Chapter 5 · A second patient ────────────────────────────────────────
  {
    id: 'toReuse',
    chapter: 'second',
    module: 'therapy',
    target: 'therapy.continue',
    placement: 'top',
    title: 'Months later, another family arrives',
    body: 'A different child, a different genetic change. Does Priori start from scratch?',
    action: { instruction: 'Click CONTINUE TO EVIDENCE REUSE.', done: (s) => s.module === 'reuse' },
    autoDo: (s) => s.setModule('reuse'),
  },
  {
    id: 'loadP2',
    chapter: 'second',
    module: 'reuse',
    target: 'reuse.load',
    placement: 'right',
    title: 'Meet patient PX-002',
    body: 'Different change, in a different part of the same gate. Notice the library of saved evidence stays.',
    action: { instruction: 'Click LOAD NEW PATIENT.', done: (s) => s.activePatientId === P2 },
    autoDo: (s) => s.loadNewPatient(P2),
  },
  {
    id: 'characterizeP2',
    chapter: 'second',
    module: 'reuse',
    target: 'reuse.characterize',
    placement: 'right',
    title: 'Test the new change first',
    body: 'We still measure this child’s exact change — that never gets skipped. But the test itself is already set up from last time.',
    action: { instruction: 'Run the characterization for PX-002.', done: (s) => s.analyses[v2()]?.status === 'complete' },
    autoDo: (s) => ensureAnalysis(s, v2()),
  },
  {
    id: 'assess',
    chapter: 'second',
    module: 'reuse',
    target: 'reuse.assess',
    placement: 'right',
    title: 'What can we reuse?',
    body: 'Priori checks every saved piece of evidence against strict rules: same gene? same type of problem? same test? same drug chemistry?',
    action: { instruction: 'Click RUN REUSE ASSESSMENT.', done: (s) => !!s.reuse[P2] },
    autoDo: (s) => {
      ensureAnalysis(s, v2());
      s.runReuseAssessment(P2);
    },
  },
  {
    id: 'graph',
    chapter: 'second',
    module: 'reuse',
    target: 'reuse.graph',
    placement: 'left',
    title: 'What carries over, and what doesn’t',
    body: 'Each box is one kind of work in developing a treatment. Colour tells you what PX-002 inherits.',
    controls: [
      { label: 'Cyan', meaning: 'Reused as-is.' },
      { label: 'Amber (dashed)', meaning: 'Reusable after a check.' },
      { label: 'White (dotted)', meaning: 'Must be done new.' },
      { label: 'Red', meaning: 'Can never transfer — e.g. whether a drug worked for someone else.' },
    ],
    action: { instruction: 'Click any box to see why.', done: (s) => s.selectedReuseNode !== null },
    autoDo: (s) => s.selectReuseNode('candidate-screening'),
  },
  {
    id: 'pathways',
    chapter: 'second',
    module: 'reuse',
    target: 'reuse.pathways',
    placement: 'top',
    title: 'Different patient. Different mutation. Less work repeated.',
    body: 'Patient 001 needed everything built from scratch. Patient 002 inherits the test setup, the reference cells and the drug chemistry — but still gets its own measurements and safety studies.',
    why: 'Shared knowledge speeds things up; it never replaces patient-specific safety.',
  },

  // ── Chapter 6 · The payoff ──────────────────────────────────────────────
  {
    id: 'toDev',
    chapter: 'payoff',
    module: 'reuse',
    target: 'reuse.openDev',
    placement: 'top',
    title: 'So what does that save?',
    body: 'Let’s turn the reuse map into time and cost.',
    action: { instruction: 'Click OPEN DEVELOPMENT COMPARISON.', done: (s) => s.module === 'development' },
    autoDo: (s) => {
      s.setDevelopmentPatient(P2);
      s.setModule('development');
    },
  },
  {
    id: 'timelines',
    chapter: 'payoff',
    module: 'development',
    target: 'dev.timelines',
    placement: 'bottom',
    title: 'Two timelines for the same patient',
    body: 'Top: starting from zero. Bottom: with Priori’s library. Each bar is a task; its length is how long it takes. Faded parts are work that didn’t need repeating.',
    controls: [
      { label: 'Critical path', meaning: 'The chain of tasks that sets the finish date.' },
      { label: 'Click a bar', meaning: 'See its cost, time and assumptions.' },
    ],
    prepare: (s) => {
      if (s.development.patientId !== P2) s.setDevelopmentPatient(P2);
    },
  },
  {
    id: 'scenario',
    chapter: 'payoff',
    module: 'development',
    target: 'dev.scenario',
    placement: 'bottom',
    title: 'Try a different assumption',
    body: 'These numbers are estimates, so we show a cautious and a hopeful version. Switch and watch the timelines recompute.',
    action: { instruction: 'Switch between CONSERVATIVE and OPTIMISTIC.', done: (s) => s.development.scenarioId === 'optimistic' },
    autoDo: (s) => s.setScenario('optimistic'),
  },
  {
    id: 'cohort',
    chapter: 'payoff',
    module: 'development',
    target: 'dev.cohort',
    placement: 'top',
    title: 'It gets better with every patient',
    body: 'The platform costs more up front. As the library grows, each new patient inherits more, and costs can cross below starting from scratch every time. Exactly where depends on the assumptions.',
  },
  {
    id: 'finale',
    chapter: 'payoff',
    module: 'development',
    placement: 'center',
    title: 'The next patient shouldn’t start from zero.',
    body: 'Patient 001 required new research. Patient 002 inherited what we learned. Patient 1,000 shouldn’t have to start from zero.',
    why: 'That’s Priori. Everything you saw is a transparent simulation — click the shield icon (bottom-left) to see exactly what’s real, simulated or assumed.',
  },
];
