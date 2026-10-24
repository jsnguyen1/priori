// ACT III — Evidence Reuse. Patient 001 required new research; patient 002 inherits what was learned.
import { useMemo, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { EvidenceArtifact, EvidenceNodeId } from '../../domain/types';
import { useStore, PRIMARY_PATIENT_ID, SECOND_PATIENT_ID } from '../../state/store';
import { Workspace } from '../../ui/Workspace';
import { Button, EvidenceBadge, Label, MechanismTag, SectionHeader, cx } from '../../ui/primitives';
import { C, MOTION } from '../../ui/tokens';
import { getPatient } from '../../data/patients';
import { getClassification, getVariant } from '../../data/variants';
import { regionById } from '../../data/published';
import { assessBaseline, transferableLibrary, NODE_LABELS } from '../../sim/reuse';
import { ReuseGraph, ReuseLegend } from './ReuseGraph';
import { NodeInspector } from './NodeInspector';
import { Pathways } from './Pathways';
import { SOURCE_LABEL, VALIDATION_LABEL, useTourScrollIntoView } from './shared';

// ─── Sidebar: the retained evidence library ──────────────────────────────

function LibrarySidebar({ library, highlight }: { library: EvidenceArtifact[]; highlight: string | null }) {
  const groups: { key: string; label: string; items: EvidenceArtifact[] }[] = [
    { key: 'seed', label: 'Pre-existing · published & atlas', items: library.filter((a) => a.provenance.originatingPatientId === null) },
    ...Array.from(new Set(library.map((a) => a.provenance.originatingPatientId).filter((x): x is string => !!x))).map((pid) => ({
      key: pid,
      label: `Generated in ${pid} program`,
      items: library.filter((a) => a.provenance.originatingPatientId === pid),
    })),
  ];
  return (
    <div data-tour="reuse.library">
      <SectionHeader title="Evidence library" right={<span className="font-mono text-2xs text-mute">{library.length} artifacts · retained</span>} />
      {groups.map((g) => (
        <div key={g.key} className="border-b border-line2">
          <div className="px-3 pt-2 pb-1 flex items-center justify-between">
            <Label>{g.label}</Label>
            <span className="font-mono text-2xs text-dim">{g.items.length}</span>
          </div>
          <AnimatePresence initial={false}>
            {g.items.map((a) => (
              <motion.div
                key={a.id}
                layout
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: MOTION.base, ease: MOTION.ease }}
                className={cx('px-3 py-1.5 border-t border-line2/60', highlight && a.kind === highlight && 'bg-surface2')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-2xs text-cyan">{a.id}</span>
                  <span className="font-mono text-[9px] text-dim uppercase tracking-[0.06em] truncate">{a.kind}</span>
                </div>
                <div className="text-xs text-ink leading-snug">{a.title}</div>
                <div className="font-mono text-[9px] text-dim">{SOURCE_LABEL[a.provenance.sourceType]} · {VALIDATION_LABEL[a.provenance.validationStatus]}</div>
              </motion.div>
            ))}
          </AnimatePresence>
          {g.items.length === 0 && <div className="px-3 pb-2 text-2xs text-dim">None.</div>}
        </div>
      ))}
    </div>
  );
}

// ─── Phase A: library summary + load new patient ─────────────────────────

function LibraryHandoff({ library }: { library: EvidenceArtifact[] }) {
  const loadNewPatient = useStore((s) => s.loadNewPatient);
  const setModule = useStore((s) => s.setModule);
  const loaded = useStore((s) => s.loadedPatientIds.includes(SECOND_PATIENT_ID));
  const fromP1 = library.filter((a) => a.provenance.originatingPatientId === PRIMARY_PATIENT_ID);
  const p2 = getPatient(SECOND_PATIENT_ID);
  const v2 = getVariant(p2.variantId)!;
  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className="max-w-[900px] mx-auto p-5 space-y-5">
        <div>
          <Label>Act III · Evidence reuse</Label>
          <div className="mt-1 text-md text-ink">What the {PRIMARY_PATIENT_ID} program left behind</div>
          <div className="text-xs text-mute mt-0.5">Every artifact carries structured provenance and typed reuse conditions. Nothing is copied forward by assumption — each item is re-evaluated against the next patient.</div>
        </div>

        <div className="border border-line2 rounded bg-surface">
          <SectionHeader title={`Artifacts originating from ${PRIMARY_PATIENT_ID}`} right={<span className="font-mono text-2xs text-mute">{fromP1.length}</span>} />
          {fromP1.length === 0 ? (
            <div className="p-4 text-xs text-gof">
              No artifacts from {PRIMARY_PATIENT_ID} are in the library yet (Molecular Lab characterization and screening evidence were not saved). The reuse assessment will honestly report mostly new work.
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => setModule('lab')}>Open Molecular Lab</Button>
                <Button size="sm" onClick={() => setModule('therapy')}>Open Therapy Design</Button>
              </div>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left font-mono text-[9px] uppercase tracking-[0.08em] text-dim">
                  {['ID', 'Evidence node', 'Source type', 'Mechanism', 'Protocol', 'Validation'].map((h) => <th key={h} className="px-3 py-1.5 font-normal border-b border-line2">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {fromP1.map((a) => (
                  <tr key={a.id} className="border-b border-line2/60 last:border-0">
                    <td className="px-3 py-1 font-mono text-2xs text-cyan">{a.id}</td>
                    <td className="px-3 py-1 text-ink">{NODE_LABELS[a.kind as EvidenceNodeId] ?? a.kind}</td>
                    <td className="px-3 py-1 text-mute">{SOURCE_LABEL[a.provenance.sourceType]}</td>
                    <td className="px-3 py-1 font-mono text-2xs text-mute">{a.provenance.mechanism ?? '—'}</td>
                    <td className="px-3 py-1 font-mono text-2xs text-mute">{a.provenance.protocolVersion ?? '—'}</td>
                    <td className="px-3 py-1 text-mute">{VALIDATION_LABEL[a.provenance.validationStatus]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border border-cyan/40 rounded bg-surface p-4 flex items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2">
              <Label>Incoming referral</Label>
              <EvidenceBadge category="hypothetical" />
            </div>
            <div className="mt-1 font-mono text-sm text-ink">{p2.id} · AGE {p2.ageAtPresentation} · {p2.presentation}</div>
            <div className="text-xs text-mute mt-0.5">{p2.scenario}</div>
            <div className="font-mono text-2xs text-dim mt-1">{v2.id} · {v2.hgvsP} · {regionById(v2.regionId)?.label}</div>
          </div>
          <Button data-tour="reuse.load" variant="primary" size="lg" onClick={() => loadNewPatient(SECOND_PATIENT_ID)}>
            {loaded ? `Resume ${SECOND_PATIENT_ID}` : 'Load new patient'}
          </Button>
        </div>
        <div className="text-2xs text-dim">The evidence library persists across patients. Loading {SECOND_PATIENT_ID} does not reset it.</div>
      </div>
    </div>
  );
}

// ─── Phase B: PX-002 reuse workflow ──────────────────────────────────────

function VariantContrast({ p1Characterized, p2Characterized }: { p1Characterized: boolean; p2Characterized: boolean }) {
  const v1 = getVariant(getPatient(PRIMARY_PATIENT_ID).variantId)!;
  const v2 = getVariant(getPatient(SECOND_PATIENT_ID).variantId)!;
  const r1 = regionById(v1.regionId)!;
  const r2 = regionById(v2.regionId)!;
  const rows: { k: string; a: ReactNode; b: ReactNode; same: boolean | null }[] = [
    { k: 'Gene / channel', a: 'SCN2A · NaV1.2', b: 'SCN2A · NaV1.2', same: true },
    { k: 'Variant', a: v1.hgvsP, b: v2.hgvsP, same: false },
    { k: 'Region', a: r1.label, b: r2.label, same: r1.id === r2.id },
    { k: 'Region kind', a: r1.kind, b: r2.kind, same: r1.kind === r2.kind },
    { k: 'Domain', a: r1.domain, b: r2.domain, same: r1.domain === r2.domain },
    {
      k: 'Mechanism',
      a: p1Characterized ? <MechanismTag mechanism={getClassification(v1.id).mechanism} /> : <span className="text-dim">not characterized</span>,
      b: p2Characterized ? <MechanismTag mechanism={getClassification(v2.id).mechanism} /> : <span className="text-dim">unknown · not characterized</span>,
      same: p1Characterized && p2Characterized ? getClassification(v1.id).mechanism === getClassification(v2.id).mechanism : null,
    },
  ];
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="font-mono text-[9px] uppercase tracking-[0.08em] text-dim text-left">
          <th className="font-normal py-1 w-[130px]" />
          <th className="font-normal py-1">{PRIMARY_PATIENT_ID} · prior program</th>
          <th className="font-normal py-1">{SECOND_PATIENT_ID} · new patient</th>
          <th className="font-normal py-1 w-[70px] text-right">Match</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.k} className="border-t border-line2">
            <td className="py-1 text-mute">{r.k}</td>
            <td className="py-1 font-mono text-2xs text-ink">{r.a}</td>
            <td className="py-1 font-mono text-2xs text-ink">{r.b}</td>
            <td className="py-1 font-mono text-2xs text-right" style={{ color: r.same === null ? C.dim : r.same ? C.cyan : C.gof }}>{r.same === null ? '?' : r.same ? 'SAME' : 'DIFFERENT'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Summary line under the contrast table — derived from data, never asserting a mechanism before characterization.
function contrastNote(p2Characterized: boolean): string {
  const v1 = getVariant(getPatient(PRIMARY_PATIENT_ID).variantId)!;
  const v2 = getVariant(getPatient(SECOND_PATIENT_ID).variantId)!;
  const r1 = regionById(v1.regionId);
  const r2 = regionById(v2.regionId);
  const where = r2 ? `${r2.kind}-region` : 'new';
  const mech = p2Characterized ? `${getClassification(v2.id).mechanism} (simulated) ${where} variant` : `${where} variant of unknown mechanism until characterized`;
  const diff = [v1.hgvsP !== v2.hgvsP && 'different residue', r1 && r2 && r1.domain !== r2.domain && 'different domain'].filter(Boolean).join(', ');
  return `Same channel. ${mech}.${diff ? ` ${diff[0].toUpperCase()}${diff.slice(1)}` : ''} — prior evidence cannot simply be assumed.`;
}

function StepRow({ n, title, status, children }: { n: string; title: string; status: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2 border-t border-line2">
      <span className="font-mono text-2xs text-dim w-5">{n}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-ink">{title}</div>
        <div className="font-mono text-2xs text-mute">{status}</div>
      </div>
      <div className="flex gap-2 shrink-0">{children}</div>
    </div>
  );
}

function SecondPatientFlow({ library }: { library: EvidenceArtifact[] }) {
  const analyses = useStore((s) => s.analyses);
  const therapy = useStore((s) => s.therapy);
  const assessment = useStore((s) => s.reuse[SECOND_PATIENT_ID] ?? null);
  const selected = useStore((s) => s.selectedReuseNode);
  const selectReuseNode = useStore((s) => s.selectReuseNode);
  const runAnalysis = useStore((s) => s.runAnalysis);
  const runReuseAssessment = useStore((s) => s.runReuseAssessment);
  const buildReuseContext = useStore((s) => s.buildReuseContext);
  const setModule = useStore((s) => s.setModule);
  const mechanismRevealed = useStore((s) => s.mechanismRevealed);

  const v1 = getVariant(getPatient(PRIMARY_PATIENT_ID).variantId)!;
  const v2 = getVariant(getPatient(SECOND_PATIENT_ID).variantId)!;
  const st2 = analyses[v2.id]?.status ?? 'idle';
  const p1Char = analyses[v1.id]?.status === 'complete' || mechanismRevealed;

  const ctx = useMemo(() => buildReuseContext(SECOND_PATIENT_ID), [buildReuseContext, analyses, therapy, library]);
  const baseline = useMemo(() => assessBaseline(buildReuseContext(PRIMARY_PATIENT_ID), library, 0), [buildReuseContext, library, analyses, therapy]);
  const stale = !!assessment && (assessment.targetMechanism !== ctx.mechanism || assessment.libraryArtifactIds.length !== transferableLibrary(ctx, library).length);
  const fromP1 = library.filter((a) => a.provenance.originatingPatientId === PRIMARY_PATIENT_ID).length;
  useTourScrollIntoView('reuse.');

  return (
    <Workspace
      sidebar={<LibrarySidebar library={library} highlight={selected} />}
      inspector={<NodeInspector assessment={assessment} library={library} node={assessment?.nodes.find((n) => n.nodeId === selected) ?? null} />}
      sidebarWidth={250}
      inspectorWidth={330}
    >
      <div className="absolute inset-0 overflow-y-auto scroll-thin">
        <div className="p-4 space-y-4 min-w-[660px]">
          {/* patient header */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: MOTION.slow, ease: MOTION.ease }} className="flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2"><Label>Act III · Patient 002</Label><EvidenceBadge category="hypothetical" /></div>
              <div className="font-mono text-md text-ink mt-0.5">{SECOND_PATIENT_ID} · AGE {getPatient(SECOND_PATIENT_ID).ageAtPresentation} · {getPatient(SECOND_PATIENT_ID).presentation}</div>
            </div>
            <div className="font-mono text-2xs text-mute text-right">Library retained · {library.length} artifacts<br />{fromP1} from {PRIMARY_PATIENT_ID}</div>
          </motion.div>

          <div className="grid grid-cols-[1.25fr_1fr] gap-4">
            <div className="border border-line2 rounded bg-surface px-3 py-2">
              <VariantContrast p1Characterized={p1Char} p2Characterized={st2 === 'complete'} />
              <div className="mt-1.5 text-2xs text-mute">{contrastNote(st2 === 'complete')}</div>
            </div>
            <div className="border border-line2 rounded bg-surface px-3 pb-1">
              <div className="h-8 flex items-center"><Label>Workflow</Label></div>
              <StepRow n="01" title={`Functional characterization · ${v2.hgvsP}`} status={st2 === 'complete' ? `complete · ${getClassification(v2.id).mechanism} (simulated)` : st2 === 'running' ? 'running synthetic patch-clamp…' : 'not run — mechanism unknown'}>
                <Button data-tour="reuse.characterize" size="sm" variant={st2 === 'idle' ? 'primary' : 'default'} disabled={st2 !== 'idle'} onClick={() => runAnalysis(v2.id)}>{st2 === 'running' ? 'Running' : st2 === 'complete' ? 'Done' : 'Characterize'}</Button>
                <Button size="sm" variant="ghost" onClick={() => setModule('lab')}>Lab</Button>
              </StepRow>
              <StepRow n="02" title="Reuse assessment vs evidence library" status={!assessment ? 'not run' : stale ? 'inputs changed — re-run to update' : `complete · ${assessment.rulesVersion}`}>
                <Button data-tour="reuse.assess" size="sm" variant={!assessment || stale ? 'primary' : 'default'} onClick={() => runReuseAssessment(SECOND_PATIENT_ID)}>{assessment ? 'Re-run assessment' : 'Run reuse assessment'}</Button>
              </StepRow>
              {st2 !== 'complete' && <div className="text-2xs text-gof py-1.5 border-t border-line2">Without characterization the target mechanism is unknown, so mechanism-dependent evidence cannot transfer.</div>}
            </div>
          </div>

          {/* graph */}
          <div className="border border-line2 rounded bg-surface">
            <SectionHeader title="Evidence inheritance graph" right={<><ReuseLegend /><EvidenceBadge category="illustrative" /></>} />
            <div data-tour="reuse.graph" className="p-2 overflow-x-auto scroll-thin">
              <ReuseGraph assessment={assessment} library={library} selected={selected} onSelect={(id) => selectReuseNode(id)} sourcePatientLabel={fromP1 ? PRIMARY_PATIENT_ID : 'EMPTY'} />
            </div>
            {!assessment && <div className="px-3 pb-2 text-2xs text-dim">Graph shows the evidence dependency structure. Run the reuse assessment to classify each node.</div>}
          </div>

          {/* reveal */}
          <AnimatePresence>
            {assessment && (
              <motion.div key="reveal" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: MOTION.slow, ease: MOTION.ease, delay: 0.3 }} className="border border-line2 rounded bg-surface">
                <SectionHeader title="Two patient pathways · derived from the same rules" right={<EvidenceBadge category="illustrative" />} />
                <div className="p-3 space-y-4">
                  <div data-tour="reuse.pathways">
                  <Pathways
                    rows={[
                      { label: PRIMARY_PATIENT_ID, sub: 'baseline · seed library only', assessment: baseline },
                      { label: SECOND_PATIENT_ID, sub: `library incl. ${PRIMARY_PATIENT_ID}`, assessment },
                    ]}
                  />
                  </div>
                  <div className="flex items-end justify-between gap-6 border-t border-line2 pt-3">
                    <div>
                      <div className="font-mono text-[15px] leading-[22px] tracking-[0.1em] text-ink">
                        DIFFERENT PATIENT.<br />DIFFERENT MUTATION.<br /><span className="text-cyan">LESS WORK REPEATED.</span>
                      </div>
                      <div className="mt-2 text-xs text-mute max-w-[460px]">
                        Mutation-specific confirmation, candidate efficacy in the new variant, sequence-specific safety studies and all clinical evidence remain new work for {SECOND_PATIENT_ID}. Classifications are rule-based and illustrative; no reuse has been validated experimentally.
                      </div>
                    </div>
                    <Button data-tour="reuse.openDev" variant="primary" size="lg" onClick={() => setModule('development')}>Open development comparison</Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Workspace>
  );
}

export function ReuseModule() {
  const active = useStore((s) => s.activePatientId);
  const library = useStore((s) => s.evidenceLibrary);
  const phase = active === SECOND_PATIENT_ID ? 'second' : 'handoff';
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={phase}
        className="absolute inset-0"
        initial={{ opacity: 0, x: phase === 'second' ? 24 : -24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: phase === 'second' ? -24 : 24 }}
        transition={{ duration: MOTION.base, ease: MOTION.ease }}
      >
        {phase === 'second' ? (
          <SecondPatientFlow library={library} />
        ) : (
          <Workspace sidebar={<LibrarySidebar library={library} highlight={null} />} sidebarWidth={250}>
            <div className="absolute inset-0"><LibraryHandoff library={library} /></div>
          </Workspace>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
