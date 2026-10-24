// Development comparison: conventional bespoke research vs Priori evidence reuse, for one patient.
// Every value is an ILLUSTRATIVE SCENARIO ASSUMPTION — not an observed Priori result.
import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import type { DevelopmentPlan, ReuseAssessment, ReuseScenarioId } from '../../domain/types';
import { useStore, PRIMARY_PATIENT_ID, SECOND_PATIENT_ID } from '../../state/store';
import { Workspace } from '../../ui/Workspace';
import { Button, EvidenceBadge, KV, Label, ReuseTag, SectionHeader, Segmented, Term, UncertaintyBar, fmt } from '../../ui/primitives';
import { C, MOTION, REUSE_STYLE } from '../../ui/tokens';
import { assessBaseline, assessReuse, NODE_LABELS } from '../../sim/reuse';
import { COST_CATEGORIES, SCENARIOS, TASKS, TASK_BY_ID, nodeClassFor, planDevelopment, sizeTask, totalCost } from '../../sim/development';
import { DualGantt, GanttLegend } from './Gantt';
import { CohortChart } from './CohortChart';
import { REUSE_ORDER, useTourScrollIntoView } from '../reuse/shared';

const CAT_LABEL = { 'evidence-generation': 'Evidence generation', manufacturing: 'Manufacturing (CMC)', clinical: 'Clinical', regulatory: 'Regulatory' } as const;

/** Assessment used for the Priori plan of a patient, plus how it was obtained. */
function useAssessment(pid: string): { assessment: ReuseAssessment; provenance: 'run' | 'provisional' | 'baseline' } {
  const stored = useStore((s) => s.reuse[pid]);
  const library = useStore((s) => s.evidenceLibrary);
  const analyses = useStore((s) => s.analyses);
  const therapy = useStore((s) => s.therapy);
  const build = useStore((s) => s.buildReuseContext);
  return useMemo(() => {
    if (pid === PRIMARY_PATIENT_ID) return { assessment: assessBaseline(build(pid), library, 0), provenance: 'baseline' as const };
    if (stored) return { assessment: stored, provenance: 'run' as const };
    return { assessment: assessReuse(build(pid), library, 0), provenance: 'provisional' as const };
  }, [pid, stored, library, analyses, therapy, build]);
}

const r = (v: { low: number; mid: number; high: number }, f: (x: number) => string) => `${f(v.low)}–${f(v.high)}`;
const wk = (x: number) => x.toFixed(0);

function Metric({ label, value, unit, range, compare, bar }: { label: ReactNode; value: string; unit: string; range?: string; compare?: string; bar?: ReactNode }) {
  return (
    <div className="px-3 py-2 border-r border-line2 last:border-r-0 min-w-0">
      <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-mute truncate">{label}</div>
      <div className="mt-0.5 font-mono text-[17px] leading-[22px] text-ink tabular-nums">{value}<span className="text-2xs text-dim ml-1">{unit}</span></div>
      {range && <div className="font-mono text-2xs text-mute tabular-nums">range {range}</div>}
      {bar && <div className="mt-1">{bar}</div>}
      {compare && <div className="font-mono text-[9.5px] text-dim truncate">{compare}</div>}
    </div>
  );
}

function Metrics({ bespoke, priori }: { bespoke: DevelopmentPlan; priori: DevelopmentPlan }) {
  const eMax = bespoke.totalEffortWeeks.high;
  const tMax = Math.max(bespoke.timelineWeeks.high, priori.timelineWeeks.high);
  const cMax = Math.max(bespoke.preclinicalEvidenceCostUsd.high, priori.preclinicalEvidenceCostUsd.high);
  return (
    <div className="grid grid-cols-5 border border-line2 rounded bg-surface">
      <Metric label="Total research effort · Priori" value={wk(priori.totalEffortWeeks.mid)} unit="FTE-wk" range={r(priori.totalEffortWeeks, wk)} compare={`bespoke ${wk(bespoke.totalEffortWeeks.mid)} (${r(bespoke.totalEffortWeeks, wk)})`}
        bar={<UncertaintyBar {...priori.totalEffortWeeks} min={0} max={eMax} width={130} />} />
      <Metric label="Duplicated work avoided" value={wk(priori.duplicatedEffortAvoidedWeeks)} unit="FTE-wk" compare={`${fmt.pct(priori.duplicatedEffortAvoidedWeeks / bespoke.totalEffortWeeks.mid)} of bespoke mid effort`} />
      <Metric label="Additional validation required" value={wk(priori.validationEffortWeeks)} unit="FTE-wk" compare="included in Priori effort" />
      <Metric label="Preclinical evidence cost" value={fmt.usd(priori.preclinicalEvidenceCostUsd.mid)} unit="USD" range={r(priori.preclinicalEvidenceCostUsd, fmt.usd)} compare={`bespoke ${fmt.usd(bespoke.preclinicalEvidenceCostUsd.mid)}`}
        bar={<UncertaintyBar {...priori.preclinicalEvidenceCostUsd} min={0} max={cMax} width={130} />} />
      <Metric label={<Term k="criticalPath">Timeline · critical path</Term>} value={wk(priori.timelineWeeks.mid)} unit="weeks" range={r(priori.timelineWeeks, wk)} compare={`bespoke ${wk(bespoke.timelineWeeks.mid)} (${r(bespoke.timelineWeeks, wk)})`}
        bar={<UncertaintyBar {...priori.timelineWeeks} min={0} max={tMax} width={130} />} />
    </div>
  );
}

function Assumptions({ scenarioId, bespoke, priori }: { scenarioId: ReuseScenarioId; bespoke: DevelopmentPlan; priori: DevelopmentPlan }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-line2 rounded bg-surface">
      <button className="w-full h-8 px-3 flex items-center justify-between border-b border-line2 hover:bg-surface2" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Label>{open ? '▾' : '▸'} Assumptions &amp; methodology</Label>
        <EvidenceBadge category="assumption" />
      </button>
      {open && (
        <div className="p-3 grid grid-cols-[1fr_1.3fr] gap-5 text-xs text-mute">
          <div className="space-y-3">
            <div>
              <Label className="mb-1">Remaining fraction of de-novo scope by reuse class</Label>
              <table className="w-full font-mono text-2xs">
                <thead><tr className="text-dim text-left"><th className="font-normal py-0.5">Class</th>{(['conservative', 'optimistic'] as const).map((s) => <th key={s} className={`font-normal text-right ${s === scenarioId ? 'text-cyan' : ''}`}>{SCENARIOS[s].label}</th>)}</tr></thead>
                <tbody>
                  {REUSE_ORDER.map((k) => (
                    <tr key={k} className="border-t border-line2"><td className="py-0.5"><ReuseTag reuseClass={k} /></td>{(['conservative', 'optimistic'] as const).map((s) => <td key={s} className="text-right text-ink">×{SCENARIOS[s].multipliers[k].toFixed(2)}</td>)}</tr>
                  ))}
                  <tr className="border-t border-line2"><td className="py-0.5">Validation overhead / task</td>{(['conservative', 'optimistic'] as const).map((s) => <td key={s} className="text-right text-ink">{fmt.usd(SCENARIOS[s].validationOverheadUsd)}</td>)}</tr>
                </tbody>
              </table>
            </div>
            <p>Each task carries de-novo effort (FTE-weeks), duration (calendar weeks) and cost (USD) as low / mid / high ranges. Its reuse class comes from the reuse-assessment node it maps to; the scenario multiplier scales effort, duration and cost, and reuse-with-validation adds a fixed validation overhead. Mandatory tasks (REQ) always run at full scope.</p>
            <p>Timelines are scheduled on the task dependency graph by earliest start (forward pass) — a task starts when all predecessors finish. The timeline is the longest (critical) path, computed separately at low, mid and high durations; it is not the sum of task durations. Critical-path tasks have zero slack in a backward pass.</p>
            <p>Cost categories are kept separate: evidence generation (preclinical research incl. toxicology), manufacturing (CMC, QC, GMP), regulatory and clinical. "Preclinical evidence cost" is the evidence-generation category only.</p>
            <p>Bespoke plan: {bespoke.tasks.length} tasks, all new work. Priori plan: classes taken from the reuse assessment. Ranges are scenario ranges, not statistical confidence intervals.</p>
          </div>
          <div>
            <Label className="mb-1">De-novo task assumptions (illustrative, individualized ASO program)</Label>
            <table className="w-full font-mono text-[9.5px]">
              <thead><tr className="text-dim text-left"><th className="font-normal py-0.5">Task</th><th className="font-normal text-right">Effort FTE-wk</th><th className="font-normal text-right">Duration wk</th><th className="font-normal text-right">Cost</th><th className="font-normal text-right">Class</th></tr></thead>
              <tbody>
                {TASKS.map((t) => {
                  const st = priori.tasks.find((x) => x.task.id === t.id)!;
                  return (
                    <tr key={t.id} className="border-t border-line2 text-mute">
                      <td className="py-0.5 text-ink truncate max-w-[170px]">{t.id} {t.name}{t.mandatory && <span className="text-warn"> REQ</span>}</td>
                      <td className="text-right">{t.effortWeeks.low}–{t.effortWeeks.high}</td>
                      <td className="text-right">{t.durationWeeks.low}–{t.durationWeeks.high}</td>
                      <td className="text-right">{fmt.usd(t.costUsd.low)}–{fmt.usd(t.costUsd.high)}</td>
                      <td className="text-right" style={{ color: REUSE_STYLE[st.reuseClass].color }}>{REUSE_STYLE[st.reuseClass].short}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskInspector({ taskId, bespoke, priori, assessment, scenarioId, onSelect }: { taskId: string | null; bespoke: DevelopmentPlan; priori: DevelopmentPlan; assessment: ReuseAssessment; scenarioId: ReuseScenarioId; onSelect: (id: string) => void }) {
  const library = useStore((s) => s.evidenceLibrary);
  if (!taskId) {
    const tb = totalCost(bespoke);
    const tp = totalCost(priori);
    return (
      <div>
        <SectionHeader title="Program cost by category" right={<EvidenceBadge category="assumption" />} />
        <div className="p-3 space-y-3">
          <table className="w-full font-mono text-2xs">
            <thead><tr className="text-dim text-left"><th className="font-normal py-0.5">Category</th><th className="font-normal text-right">Bespoke</th><th className="font-normal text-right">Priori</th></tr></thead>
            <tbody>
              {COST_CATEGORIES.map((c) => (
                <tr key={c} className="border-t border-line2"><td className="py-1 text-mute">{CAT_LABEL[c]}</td><td className="text-right text-ink">{fmt.usd(bespoke.costByCategory[c].mid)}</td><td className="text-right text-ink">{fmt.usd(priori.costByCategory[c].mid)}</td></tr>
              ))}
              <tr className="border-t border-line"><td className="py-1 text-mute">Total (mid)</td><td className="text-right text-ink">{fmt.usd(tb.mid)}</td><td className="text-right text-cyan">{fmt.usd(tp.mid)}</td></tr>
              <tr><td className="py-0.5 text-dim">Range</td><td className="text-right text-dim">{r(tb, fmt.usd)}</td><td className="text-right text-dim">{r(tp, fmt.usd)}</td></tr>
            </tbody>
          </table>
          <p className="text-xs text-dim">Select a bar in either timeline to inspect a task: effort, cost, dependencies, reuse class and supporting evidence. Hover a bar to trace its dependencies.</p>
          <p className="text-2xs text-dim">All figures are scenario assumptions for an illustrative individualized ASO program. They are not observed Priori results or quotes.</p>
        </div>
      </div>
    );
  }
  const t = TASK_BY_ID[taskId];
  const sb = bespoke.tasks.find((x) => x.task.id === taskId)!;
  const sp = priori.tasks.find((x) => x.task.id === taskId)!;
  const scenario = SCENARIOS[scenarioId];
  const nodeClass = nodeClassFor(assessment, t.nodeId);
  const sz = sizeTask(t, nodeClass, scenario);
  const node = assessment.nodes.find((n) => n.nodeId === t.nodeId);
  const srcs = node ? node.sourceArtifactIds.filter((id) => library.find((a) => a.id === id)?.provenance.originatingPatientId !== null) : [];
  return (
    <div>
      <SectionHeader title={`${t.id} · ${t.name}`} right={<ReuseTag reuseClass={sp.reuseClass} />} />
      <div className="p-3 space-y-3">
        <div>
          <KV k="Evidence node" v={NODE_LABELS[t.nodeId]} />
          <KV k="Cost category" v={CAT_LABEL[t.costCategory]} />
          <KV k="Mandatory" v={t.mandatory ? 'YES — never skipped or reduced' : 'no'} color={t.mandatory ? C.warn : undefined} />
          <KV k="Critical path (Priori)" v={sp.onCriticalPath ? 'yes' : 'no'} />
        </div>
        <div className="border-t border-line2 pt-2">
          <table className="w-full font-mono text-2xs">
            <thead><tr className="text-dim text-left"><th className="font-normal py-0.5" /><th className="font-normal text-right">De novo</th><th className="font-normal text-right">Priori</th></tr></thead>
            <tbody>
              <tr className="border-t border-line2"><td className="py-1 text-mute">Effort</td><td className="text-right">{t.effortWeeks.mid} <span className="text-dim">FTE-wk</span></td><td className="text-right text-ink">{sz.effort.mid.toFixed(1)} <span className="text-dim">FTE-wk</span></td></tr>
              <tr><td className="py-0.5 text-dim">range</td><td className="text-right text-dim">{t.effortWeeks.low}–{t.effortWeeks.high}</td><td className="text-right text-dim">{sz.effort.low.toFixed(1)}–{sz.effort.high.toFixed(1)}</td></tr>
              <tr className="border-t border-line2"><td className="py-1 text-mute">Duration</td><td className="text-right">{t.durationWeeks.mid} <span className="text-dim">wk</span></td><td className="text-right text-ink">{sz.duration.mid.toFixed(1)} <span className="text-dim">wk</span></td></tr>
              <tr><td className="py-0.5 text-dim">range</td><td className="text-right text-dim">{t.durationWeeks.low}–{t.durationWeeks.high}</td><td className="text-right text-dim">{sz.duration.low.toFixed(1)}–{sz.duration.high.toFixed(1)}</td></tr>
              <tr className="border-t border-line2"><td className="py-1 text-mute">Cost</td><td className="text-right">{fmt.usd(t.costUsd.mid)}</td><td className="text-right text-ink">{fmt.usd(sz.cost.mid)}</td></tr>
              <tr><td className="py-0.5 text-dim">range</td><td className="text-right text-dim">{r(t.costUsd, fmt.usd)}</td><td className="text-right text-dim">{r({ low: sz.cost.low, mid: 0, high: sz.cost.high }, fmt.usd)}</td></tr>
              <tr className="border-t border-line2"><td className="py-1 text-mute">Schedule</td><td className="text-right">wk {sb.startWeek.toFixed(0)}–{sb.endWeek.toFixed(0)}</td><td className="text-right text-ink">wk {sp.startWeek.toFixed(0)}–{sp.endWeek.toFixed(0)}</td></tr>
            </tbody>
          </table>
          <div className="mt-1 font-mono text-[9.5px] text-dim">Multiplier ×{sz.multiplier.toFixed(2)} ({scenario.label}){sz.reuseClass === 'reuse-with-validation' ? ` + ${fmt.usd(scenario.validationOverheadUsd)} validation overhead` : ''}{t.mandatory && nodeClass !== sp.reuseClass ? ` · node class ${REUSE_STYLE[nodeClass].short} overridden: mandatory` : ''}</div>
        </div>
        <div>
          <Label className="mb-1">Depends on</Label>
          {t.dependsOn.length === 0 ? <div className="text-2xs text-dim">— (start of program)</div> : (
            <div className="flex flex-wrap gap-1">
              {t.dependsOn.map((d) => <button key={d} onClick={() => onSelect(d)} className="font-mono text-2xs px-1.5 h-[18px] border border-line rounded-sm text-mute hover:text-ink hover:border-mute">{d} {TASK_BY_ID[d].name}</button>)}
            </div>
          )}
        </div>
        <div>
          <Label className="mb-1">Supporting evidence</Label>
          {node && <div className="text-xs text-ink border-l-2 pl-2" style={{ borderColor: REUSE_STYLE[node.reuseClass].color }}>{node.explanation}</div>}
          <div className="mt-1 font-mono text-2xs text-mute">{srcs.length ? srcs.join(' · ') : 'No inherited artifacts.'}</div>
        </div>
        <div>
          <Label className="mb-1">Assumption</Label>
          <div className="text-xs text-mute">{t.assumptionNote}</div>
          <div className="text-2xs text-dim mt-1">Uncertainty: low–high spans {t.effortWeeks.low}–{t.effortWeeks.high} FTE-wk de novo; scenario range, not a confidence interval.</div>
        </div>
      </div>
    </div>
  );
}

function FinalMessage() {
  const lines = ['Patient 001 required new research.', 'Patient 002 inherited what we learned.', 'Patient 1,000 shouldn’t have to start from zero.'];
  return (
    <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.6 }} transition={{ duration: MOTION.slow, ease: MOTION.ease }} className="border-t border-line2 pt-10 pb-12 px-2">
      <div className="font-mono text-[26px] leading-[34px] tracking-[0.12em] text-ink">THE NEXT PATIENT SHOULDN’T<br />START FROM ZERO.</div>
      <div className="mt-5 space-y-1">
        {lines.map((l, i) => (
          <motion.div key={l} initial={{ opacity: 0, x: -6 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: MOTION.base, delay: 0.4 + i * 0.45, ease: MOTION.ease }} className={`font-mono text-sm ${i === 1 ? 'text-cyan' : 'text-mute'}`}>{l}</motion.div>
        ))}
      </div>
      <div className="mt-6 text-2xs text-dim max-w-[620px]">Hypothetical patients, synthetic measurements and illustrative scenario assumptions throughout. No Priori-designed therapy has been tested, and no reuse estimate on this page has been validated.</div>
    </motion.div>
  );
}

export function DevelopmentModule() {
  const dev = useStore((s) => s.development);
  const setScenario = useStore((s) => s.setScenario);
  const setPatient = useStore((s) => s.setDevelopmentPatient);
  const selectTask = useStore((s) => s.selectTask);
  const setModule = useStore((s) => s.setModule);
  const runReuseAssessment = useStore((s) => s.runReuseAssessment);
  const pid = dev.patientId === PRIMARY_PATIENT_ID ? PRIMARY_PATIENT_ID : SECOND_PATIENT_ID;
  const { assessment, provenance } = useAssessment(pid);
  const bespoke = useMemo(() => planDevelopment(pid, 'bespoke', null, dev.scenarioId), [pid, dev.scenarioId]);
  const priori = useMemo(() => planDevelopment(pid, 'priori', assessment, dev.scenarioId), [pid, assessment, dev.scenarioId]);

  useTourScrollIntoView('dev.');

  return (
    <Workspace
      inspector={<TaskInspector taskId={dev.selectedTaskId} bespoke={bespoke} priori={priori} assessment={assessment} scenarioId={dev.scenarioId} onSelect={selectTask} />}
      inspectorWidth={330}
    >
      <div className="absolute inset-0 overflow-y-auto scroll-thin">
        <div className="p-4 space-y-4 min-w-[700px]">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2"><Label>Development comparison</Label><EvidenceBadge category="assumption" /><EvidenceBadge category="illustrative" /></div>
              <div className="text-md text-ink mt-0.5">Conventional bespoke research vs Priori evidence reuse · {pid}</div>
            </div>
            <div className="flex items-center gap-2">
              <Segmented value={pid} onChange={(v) => setPatient(v)} options={[{ value: PRIMARY_PATIENT_ID, label: PRIMARY_PATIENT_ID }, { value: SECOND_PATIENT_ID, label: SECOND_PATIENT_ID }]} />
              <span data-tour="dev.scenario" className="inline-flex"><Segmented value={dev.scenarioId} onChange={setScenario} options={[{ value: 'conservative', label: 'Conservative' }, { value: 'optimistic', label: 'Optimistic' }]} /></span>
            </div>
          </div>

          {provenance === 'provisional' && (
            <div className="flex items-center justify-between gap-3 border border-gof/50 border-dashed rounded px-3 py-2 text-xs text-gof">
              <span>PROVISIONAL — NOT RUN. The reuse assessment for {pid} has not been run; classes below are computed on the fly from the current library and may change after characterization.</span>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" onClick={() => runReuseAssessment(pid)}>Run assessment</Button>
                <Button size="sm" variant="ghost" onClick={() => setModule('reuse')}>Reuse</Button>
              </div>
            </div>
          )}
          {provenance === 'baseline' && (
            <div className="border border-line2 rounded px-3 py-2 text-xs text-mute">
              {PRIMARY_PATIENT_ID} was the first program: the library held only published biology and the atlas prior, so the reuse engine classifies every task as new work and both timelines coincide.
            </div>
          )}

          <div data-tour="dev.summary"><Metrics bespoke={bespoke} priori={priori} /></div>

          <div data-tour="dev.timelines" className="border border-line2 rounded bg-surface">
            <SectionHeader title="Program timelines · shared week axis" right={<GanttLegend />} />
            <div className="p-3 overflow-x-auto scroll-thin">
              <DualGantt
                plans={[
                  { title: 'CONVENTIONAL BESPOKE RESEARCH', sub: 'every task de novo', plan: bespoke, ghost: false },
                  { title: 'PRIORI EVIDENCE REUSE', sub: provenance === 'run' ? `classes from reuse assessment · ${assessment.rulesVersion}` : provenance === 'provisional' ? 'classes from provisional assessment (not run)' : 'classes from baseline assessment (seed library only)', plan: priori, ghost: true },
                ]}
                selectedTaskId={dev.selectedTaskId}
                onSelect={selectTask}
              />
            </div>
          </div>

          <Assumptions scenarioId={dev.scenarioId} bespoke={bespoke} priori={priori} />

          <div data-tour="dev.cohort" className="border border-line2 rounded bg-surface">
            <SectionHeader title="Long-term scalability · cumulative cost vs cohort size" right={<span className="font-mono text-2xs text-mute">{SCENARIOS[dev.scenarioId].label} scenario</span>} />
            <div className="p-3"><CohortChart scenarioId={dev.scenarioId} /></div>
          </div>

          <FinalMessage />
        </div>
      </div>
    </Workspace>
  );
}
