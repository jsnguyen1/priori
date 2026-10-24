// Development-scenario engine. Every number here is an ILLUSTRATIVE SCENARIO ASSUMPTION, order-of-
// magnitude plausible for an individualized ASO program — not an observed Priori result.
// Plan totals derive from (task de-novo assumptions) × (scenario multiplier for each task's reuse
// class), scheduled on the task dependency DAG (earliest-start / longest path), never by summing.
import type {
  CostCategory,
  DevelopmentPlan,
  DevelopmentScenario,
  DevelopmentTask,
  EvidenceNodeId,
  ReuseAssessment,
  ReuseClass,
  ReuseScenarioId,
  ScheduledTask,
  UncertaintyRange,
} from '../domain/types';

const R = (low: number, mid: number, high: number, basis = 'scenario range (assumption)'): UncertaintyRange => ({ low, mid, high, basis });
const k = (x: number) => x * 1000;

const task = (
  id: string,
  name: string,
  nodeId: EvidenceNodeId,
  costCategory: CostCategory,
  effort: [number, number, number],
  duration: [number, number, number],
  costK: [number, number, number],
  dependsOn: string[],
  mandatory: boolean,
  assumptionNote: string,
): DevelopmentTask => ({
  id,
  name,
  nodeId,
  costCategory,
  effortWeeks: R(...effort),
  durationWeeks: R(...duration),
  costUsd: R(k(costK[0]), k(costK[1]), k(costK[2])),
  dependsOn,
  mandatory,
  assumptionNote,
  category: 'assumption',
});

export const TASKS: DevelopmentTask[] = [
  task('T01', 'Assay development', 'assay-protocol', 'evidence-generation', [10, 16, 24], [6, 10, 16], [80, 150, 250], [], false,
    'Voltage-clamp protocol suite, fitting pipeline and acceptance criteria. Assumes an existing electrophysiology core.'),
  task('T02', 'Reference cell system', 'reference-cell-system', 'evidence-generation', [6, 10, 16], [6, 10, 14], [50, 90, 150], [], false,
    'Heterologous NaV1.2 expression line and matched wild-type dataset.'),
  task('T03', 'Variant characterization', 'variant-characterization', 'evidence-generation', [6, 10, 16], [4, 6, 10], [40, 80, 140], ['T01', 'T02'], false,
    'Cloning, expression and full functional profile of the patient variant.'),
  task('T04', 'Mechanism determination', 'mechanism-evidence', 'evidence-generation', [3, 5, 8], [2, 4, 6], [15, 30, 60], ['T03'], false,
    'Rule-based mechanism classification and expert review.'),
  task('T05', 'Candidate design', 'therapeutic-design-strategy', 'evidence-generation', [6, 10, 16], [3, 6, 10], [60, 120, 200], ['T04'], false,
    'Strategy selection, target-region rationale and candidate sequence design.'),
  task('T06', 'Experimental screening', 'candidate-screening', 'evidence-generation', [10, 16, 26], [6, 10, 16], [120, 220, 400], ['T05', 'T01'], false,
    'Candidate synthesis at research scale and dose-response screen in variant-expressing cells.'),
  task('T07', 'CMC process development', 'chemistry-process', 'manufacturing', [12, 20, 32], [8, 12, 20], [200, 400, 700], ['T06'], false,
    'Synthesis / purification process for the selected sequence; platform chemistry assumed for reuse cases.'),
  task('T08', 'Patient-specific GMP synthesis', 'chemistry-process', 'manufacturing', [4, 8, 12], [6, 10, 14], [150, 300, 500], ['T07'], true,
    'Clinical-grade batch of the patient-specific sequence. Always required; never inherited.'),
  task('T09', 'QC / analytical methods', 'quality-control', 'manufacturing', [6, 10, 16], [6, 10, 14], [80, 150, 250], ['T07'], false,
    'Identity, purity, impurity and release methods; qualification per sequence.'),
  task('T10', 'Toxicology planning', 'safety-testing', 'evidence-generation', [2, 4, 6], [2, 4, 6], [20, 40, 70], ['T06'], false,
    'Study design informed by modality class-safety knowledge.'),
  task('T11', 'Sequence-specific toxicology studies', 'safety-testing', 'evidence-generation', [10, 16, 24], [10, 13, 20], [300, 600, 1000], ['T08', 'T09', 'T10'], true,
    'Nonclinical safety studies of the specific sequence. Mandatory; class knowledge does not replace them.'),
  task('T12', 'Regulatory · platform sections', 'regulatory-documentation', 'regulatory', [4, 8, 12], [4, 8, 12], [40, 80, 150], ['T09'], false,
    'Platform CMC and nonclinical documentation sections.'),
  task('T13', 'Regulatory · patient-specific sections', 'regulatory-documentation', 'regulatory', [3, 5, 8], [3, 4, 8], [30, 60, 100], ['T11', 'T12'], true,
    'Variant rationale, patient-specific safety data, clinical protocol. Always new for each individual.'),
  task('T14', 'Clinical evaluation', 'clinical-evidence', 'clinical', [20, 30, 50], [20, 26, 40], [300, 600, 1200], ['T13'], true,
    'Dosing, monitoring and initial follow-up in the individual patient. Mandatory and never reduced.'),
];

export const TASK_BY_ID: Record<string, DevelopmentTask> = Object.fromEntries(TASKS.map((t) => [t.id, t]));

export const SCENARIOS: Record<ReuseScenarioId, DevelopmentScenario> = {
  conservative: {
    id: 'conservative',
    label: 'Conservative',
    multipliers: { reusable: 0.15, 'reuse-with-validation': 0.55, 'new-work': 1, 'not-transferable': 1 },
    validationOverheadUsd: 40_000,
    category: 'assumption',
  },
  optimistic: {
    id: 'optimistic',
    label: 'Optimistic',
    multipliers: { reusable: 0.05, 'reuse-with-validation': 0.35, 'new-work': 1, 'not-transferable': 1 },
    validationOverheadUsd: 20_000,
    category: 'assumption',
  },
};

/** Minimum calendar duration of any task that still runs (weeks). */
const MIN_DURATION = 0.5;
const COST_CATEGORIES: CostCategory[] = ['evidence-generation', 'manufacturing', 'clinical', 'regulatory'];
export { COST_CATEGORIES };

/** Reuse class a task actually runs under: mandatory tasks always run at full de-novo scope. */
export function effectiveClass(t: DevelopmentTask, nodeClass: ReuseClass): ReuseClass {
  if (!t.mandatory) return nodeClass;
  return nodeClass === 'not-transferable' ? 'not-transferable' : 'new-work';
}

type Point = 'low' | 'mid' | 'high';

interface Sized { id: string; dependsOn: string[]; duration: number }

/** Earliest-start forward pass + latest-start backward pass on the task DAG. */
export function schedule(items: Sized[]): { start: Record<string, number>; end: Record<string, number>; critical: Set<string>; makespan: number } {
  const start: Record<string, number> = {};
  const end: Record<string, number> = {};
  const byId = new Map(items.map((x) => [x.id, x]));
  const visit = (id: string): number => {
    if (end[id] !== undefined) return end[id];
    const x = byId.get(id)!;
    const s = Math.max(0, ...x.dependsOn.filter((d) => byId.has(d)).map(visit));
    start[id] = s;
    end[id] = s + x.duration;
    return end[id];
  };
  items.forEach((x) => visit(x.id));
  const makespan = Math.max(0, ...Object.values(end));
  // backward pass: latest finish
  const lf: Record<string, number> = {};
  const succ = new Map<string, string[]>();
  items.forEach((x) => x.dependsOn.forEach((d) => succ.set(d, [...(succ.get(d) ?? []), x.id])));
  const late = (id: string): number => {
    if (lf[id] !== undefined) return lf[id];
    const ss = succ.get(id) ?? [];
    lf[id] = ss.length ? Math.min(...ss.map((s) => late(s) - byId.get(s)!.duration)) : makespan;
    return lf[id];
  };
  const critical = new Set<string>();
  items.forEach((x) => {
    if (Math.abs(late(x.id) - end[x.id]) < 1e-6) critical.add(x.id);
  });
  return { start, end, critical, makespan };
}

export interface TaskSizing {
  reuseClass: ReuseClass;
  multiplier: number;
  effort: Record<Point, number>;
  duration: Record<Point, number>;
  cost: Record<Point, number>;
}

export function sizeTask(t: DevelopmentTask, nodeClass: ReuseClass, scenario: DevelopmentScenario): TaskSizing {
  const reuseClass = effectiveClass(t, nodeClass);
  const m = scenario.multipliers[reuseClass];
  const overhead = reuseClass === 'reuse-with-validation' ? scenario.validationOverheadUsd : 0;
  const pts: Point[] = ['low', 'mid', 'high'];
  const map = (f: (p: Point) => number) => Object.fromEntries(pts.map((p) => [p, f(p)])) as Record<Point, number>;
  return {
    reuseClass,
    multiplier: m,
    effort: map((p) => t.effortWeeks[p] * m),
    duration: map((p) => Math.max(MIN_DURATION, t.durationWeeks[p] * m)),
    cost: map((p) => t.costUsd[p] * m + overhead),
  };
}

export const nodeClassFor = (assessment: ReuseAssessment | null, nodeId: EvidenceNodeId): ReuseClass =>
  assessment?.nodes.find((n) => n.nodeId === nodeId)?.reuseClass ?? 'new-work';

/** Schedule the task DAG for a patient. `assessment` null ⇒ everything is new work (bespoke). */
export function planDevelopment(patientId: string, approach: 'bespoke' | 'priori', assessment: ReuseAssessment | null, scenarioId: ReuseScenarioId): DevelopmentPlan {
  const scenario = SCENARIOS[scenarioId];
  const sizing = TASKS.map((t) => sizeTask(t, approach === 'bespoke' ? 'new-work' : nodeClassFor(assessment, t.nodeId), scenario));
  const sched = (p: Point) => schedule(TASKS.map((t, i) => ({ id: t.id, dependsOn: t.dependsOn, duration: sizing[i].duration[p] })));
  const sLow = sched('low');
  const sMid = sched('mid');
  const sHigh = sched('high');

  const tasks: ScheduledTask[] = TASKS.map((t, i) => ({
    task: t,
    reuseClass: sizing[i].reuseClass,
    effortWeeks: sizing[i].effort.mid,
    durationWeeks: sizing[i].duration.mid,
    costUsd: sizing[i].cost.mid,
    startWeek: sMid.start[t.id],
    endWeek: sMid.end[t.id],
    onCriticalPath: sMid.critical.has(t.id),
  }));

  const sum = (f: (i: number) => number) => TASKS.reduce((acc, _t, i) => acc + f(i), 0);
  const range = (f: (i: number, p: Point) => number, basis: string): UncertaintyRange => ({
    low: sum((i) => f(i, 'low')),
    mid: sum((i) => f(i, 'mid')),
    high: sum((i) => f(i, 'high')),
    basis,
  });
  const costByCategory = Object.fromEntries(
    COST_CATEGORIES.map((c) => [c, range((i, p) => (TASKS[i].costCategory === c ? sizing[i].cost[p] : 0), 'sum of task cost ranges (assumption)')]),
  ) as Record<CostCategory, UncertaintyRange>;

  return {
    patientId,
    approach,
    scenarioId,
    tasks,
    totalEffortWeeks: range((i, p) => sizing[i].effort[p], 'sum of task effort ranges, FTE-weeks (assumption)'),
    timelineWeeks: { low: sLow.makespan, mid: sMid.makespan, high: sHigh.makespan, basis: 'critical path of the task DAG at low / mid / high durations' },
    costByCategory,
    preclinicalEvidenceCostUsd: costByCategory['evidence-generation'],
    duplicatedEffortAvoidedWeeks: sum((i) => TASKS[i].effortWeeks.mid - sizing[i].effort.mid),
    validationEffortWeeks: sum((i) => (sizing[i].reuseClass === 'reuse-with-validation' ? sizing[i].effort.mid : 0)),
  };
}

export const totalCost = (p: DevelopmentPlan): UncertaintyRange => {
  const cs = Object.values(p.costByCategory);
  return { low: cs.reduce((a, c) => a + c.low, 0), mid: cs.reduce((a, c) => a + c.mid, 0), high: cs.reduce((a, c) => a + c.high, 0), basis: 'sum of categories' };
};

// ─── Cohort scalability model ────────────────────────────────────────────

/**
 * Reuse class each task tends toward once the library covers the relevant mechanism / modality.
 * Patient-specific tasks (mandatory) and variant-specific evidence stay new work regardless.
 */
export const MATURE_CLASS: Record<string, ReuseClass> = {
  T01: 'reusable',
  T02: 'reusable',
  T03: 'new-work',
  T04: 'reuse-with-validation',
  T05: 'reuse-with-validation',
  T06: 'not-transferable',
  T07: 'reuse-with-validation',
  T08: 'new-work',
  T09: 'reuse-with-validation',
  T10: 'reuse-with-validation',
  T11: 'new-work',
  T12: 'reuse-with-validation',
  T13: 'new-work',
  T14: 'not-transferable',
};

export interface CohortAssumptions {
  /** one-time platform build (library infrastructure, protocol qualification, platform CMC), USD */
  fixedInvestmentUsd: UncertaintyRange;
  /** per-patient platform overhead (curation, provenance QA, re-validation), USD */
  perPatientOverheadUsd: number;
  /** patients needed for library coverage to reach ~63% of its maximum (saturating exponential) */
  coverageScale: number;
  /** maximum attainable coverage (0–1) — never 1: libraries are incomplete */
  maxCoverage: number;
}

export const COHORT_ASSUMPTIONS: Record<ReuseScenarioId, CohortAssumptions> = {
  conservative: { fixedInvestmentUsd: R(2.0e6, 3.0e6, 4.5e6), perPatientOverheadUsd: 80_000, coverageScale: 6, maxCoverage: 0.8 },
  optimistic: { fixedInvestmentUsd: R(1.2e6, 1.8e6, 2.6e6), perPatientOverheadUsd: 40_000, coverageScale: 3, maxCoverage: 0.95 },
};

/** Library coverage when the k-th patient (1-based) arrives: 0 for the first patient, saturating. */
export const coverageAt = (kth: number, a: CohortAssumptions) => a.maxCoverage * (1 - Math.exp(-(kth - 1) / a.coverageScale));

export interface CohortPoint {
  n: number;
  coverage: number;
  /** cumulative, by category, mid */
  bespoke: Record<CostCategory, number>;
  platform: Record<CostCategory, number>;
  /** platform fixed investment (counted separately, already incurred at n = 0) */
  platformFixed: number;
  bespokeTotal: UncertaintyRange;
  platformTotal: UncertaintyRange;
}

export interface CohortModel {
  scenarioId: ReuseScenarioId;
  assumptions: CohortAssumptions;
  points: CohortPoint[];
  /** first cohort size at which platform mid cumulative ≤ bespoke mid cumulative, if within range */
  crossoverN: number | null;
  /** first n at which the platform's pessimistic (high) total is still ≤ bespoke's optimistic (low) total */
  robustCrossoverN: number | null;
}

export function cohortModel(scenarioId: ReuseScenarioId, n: number): CohortModel {
  const scenario = SCENARIOS[scenarioId];
  const a = COHORT_ASSUMPTIONS[scenarioId];
  const zero = () => Object.fromEntries(COST_CATEGORIES.map((c) => [c, 0])) as Record<CostCategory, number>;
  const bes = zero();
  const pla = zero();
  const tot = { bLow: 0, bMid: 0, bHigh: 0, pLow: a.fixedInvestmentUsd.low, pMid: a.fixedInvestmentUsd.mid, pHigh: a.fixedInvestmentUsd.high };
  const points: CohortPoint[] = [{
    n: 0, coverage: 0, bespoke: zero(), platform: zero(), platformFixed: a.fixedInvestmentUsd.mid,
    bespokeTotal: R(0, 0, 0), platformTotal: { ...a.fixedInvestmentUsd },
  }];
  let crossoverN: number | null = null;
  let robustCrossoverN: number | null = null;
  for (let kth = 1; kth <= n; kth++) {
    const cov = coverageAt(kth, a);
    for (const t of TASKS) {
      const full = sizeTask(t, 'new-work', scenario).cost;
      const mature = sizeTask(t, MATURE_CLASS[t.id] ?? 'new-work', scenario).cost;
      // interpolate between de-novo cost and mature-library cost by coverage
      const at = (p: Point) => full[p] + cov * (mature[p] - full[p]);
      bes[t.costCategory] += full.mid;
      pla[t.costCategory] += at('mid');
      tot.bLow += full.low; tot.bMid += full.mid; tot.bHigh += full.high;
      tot.pLow += at('low'); tot.pMid += at('mid'); tot.pHigh += at('high');
    }
    pla['evidence-generation'] += a.perPatientOverheadUsd;
    tot.pLow += a.perPatientOverheadUsd; tot.pMid += a.perPatientOverheadUsd; tot.pHigh += a.perPatientOverheadUsd;
    const pt: CohortPoint = {
      n: kth,
      coverage: cov,
      bespoke: { ...bes },
      platform: { ...pla },
      platformFixed: a.fixedInvestmentUsd.mid,
      bespokeTotal: R(tot.bLow, tot.bMid, tot.bHigh, 'cumulative, scenario range'),
      platformTotal: R(tot.pLow, tot.pMid, tot.pHigh, 'cumulative incl. fixed investment, scenario range'),
    };
    points.push(pt);
    if (crossoverN === null && pt.platformTotal.mid <= pt.bespokeTotal.mid) crossoverN = kth;
    if (robustCrossoverN === null && pt.platformTotal.high <= pt.bespokeTotal.low) robustCrossoverN = kth;
  }
  return { scenarioId, assumptions: a, points, crossoverN, robustCrossoverN };
}
