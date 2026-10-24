// Therapeutic Design Engine + Virtual Screening.
// Everything in this module is ILLUSTRATIVE (designs) or SIMULATED (screening results).
// Candidates are fictional, not synthesis-ready, and no efficacy or safety claim is made.
import { useEffect, useMemo, useState } from 'react';
import type { Candidate, MechanismClass, StrategyId } from '../../domain/types';
import type { TherapyState as _TS } from '../../state/store';
import { useStore } from '../../state/store';
import { getPatient } from '../../data/patients';
import { getClassification, getVariant } from '../../data/variants';
import { regionById } from '../../data/published';
import {
  INSUFFICIENT_EVIDENCE,
  PROTEIN_LEVEL_TARGET,
  THERAPY_MODEL_VERSION,
  TRANSCRIPT_NOTE,
  generateCandidates,
  getStrategy,
  parameterGap,
  recommendStrategies,
  recommendationHeadline,
  targetRegionsFor,
  transcriptRegion,
} from '../../sim/therapy';
import {
  MAX_CANDIDATES_PER_PLATE,
  MEASUREMENT_UNIT,
  SCREENING_NOTE,
  SCREEN_THRESHOLDS,
  resultFor,
  screeningMetadata,
} from '../../sim/screening';
import { Workspace } from '../../ui/Workspace';
import { useTour } from '../../tour/tourStore';
import { Button, EmptyState, EvidenceBadge, Label, MechanismTag, SectionHeader, Segmented, cx, fmt } from '../../ui/primitives';
import { C } from '../../ui/tokens';
import { CandidateTable } from './CandidateTable';
import { CompareView } from './CompareView';
import { DesignCanvas } from './DesignCanvas';
import { DoseResponsePanel, PlateView } from './PlateView';
import { Note, OUTCOME_COLOR, OutcomeBadge, PLATFORM_COLOR, PLATFORM_LABEL, RelevanceTag, Row } from './shared';

type Stage = 'design' | 'compare' | 'screen';

const EMPTY_THERAPY: _TS = {
  strategyId: null,
  targetRegionId: null,
  nominated: [],
  rejected: {},
  screeningRun: null,
  selectedWellId: null,
  savedArtifactIds: [],
};

export function TherapyModule() {
  const pid = useStore((s) => s.activePatientId);
  const patient = getPatient(pid);
  const variant = getVariant(patient.variantId)!;
  const classification = getClassification(variant.id);
  const analysisStatus = useStore((s) => s.analyses[variant.id]?.status);
  const t = useStore((s) => s.therapy[pid]) ?? EMPTY_THERAPY;
  const library = useStore((s) => s.evidenceLibrary);

  const setModule = useStore((s) => s.setModule);
  const selectStrategy = useStore((s) => s.selectStrategy);
  const selectTargetRegion = useStore((s) => s.selectTargetRegion);
  const toggleNominate = useStore((s) => s.toggleNominate);
  const rejectCandidate = useStore((s) => s.rejectCandidate);
  const restoreCandidate = useStore((s) => s.restoreCandidate);
  const advanceToScreening = useStore((s) => s.advanceToScreening);
  const selectWell = useStore((s) => s.selectWell);
  const saveScreeningEvidence = useStore((s) => s.saveScreeningEvidence);

  const [stage, setStage] = useState<Stage>('design');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  const recommendations = useMemo(() => recommendStrategies(classification), [classification]);
  const strategy = t.strategyId ? getStrategy(t.strategyId) : null;
  const regions = useMemo(() => (t.strategyId ? targetRegionsFor(t.strategyId, variant) : []), [t.strategyId, variant]);
  const proteinLevel = !!strategy && strategy.actsOn !== 'none' && regions.length === 0;

  // Strategies that act on the protein have no RNA target region; use the sentinel so the
  // screening step can still proceed.
  useEffect(() => {
    if (proteinLevel && t.targetRegionId !== PROTEIN_LEVEL_TARGET) selectTargetRegion(pid, PROTEIN_LEVEL_TARGET);
  }, [proteinLevel, t.targetRegionId, pid, selectTargetRegion]);

  const candidates = useMemo(
    () => (t.strategyId && t.targetRegionId ? generateCandidates(pid, variant, t.strategyId, t.targetRegionId) : []),
    [pid, variant, t.strategyId, t.targetRegionId],
  );
  const nominatedCandidates = candidates.filter((c) => t.nominated.includes(c.id) && !t.rejected[c.id]);
  const run = t.screeningRun;

  useEffect(() => {
    if (run) setStage('screen');
  }, [run?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Guided tour: keep the stage that holds the element the tour is spotlighting.
  const tourActive = useTour((s) => s.active);
  useEffect(() => {
    if (!tourActive) return;
    const want: Stage = run ? 'screen' : 'design';
    if (stage !== want) setStage(want);
  }, [tourActive, run?.id, stage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!run) setStage('design');
    setSelectedCandidateId(null);
  }, [t.strategyId, t.targetRegionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedWell = run && t.selectedWellId ? run.plate.find((w) => w.id === t.selectedWellId) : undefined;
  useEffect(() => {
    if (selectedWell?.candidateId) setSelectedCandidateId(selectedWell.candidateId);
  }, [selectedWell?.candidateId]);

  const selectedCandidate = candidates.find((c) => c.id === selectedCandidateId) ?? null;
  const savedArtifacts = library.filter((a) => t.savedArtifactIds.includes(a.id));

  // ── gate: mechanism must be characterized ──
  if (analysisStatus !== 'complete') {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="max-w-md border border-line2 bg-surface rounded p-5">
          <div className="flex items-center gap-2 mb-2">
            <Label>Therapeutic design · gated</Label>
            <EvidenceBadge category="illustrative" />
          </div>
          <div className="text-md text-ink mb-1.5">Mechanism not yet characterized — run analysis in Molecular Lab</div>
          <div className="text-xs text-mute mb-4">
            {patient.id} · {variant.hgvsP} · {regionById(variant.regionId)?.label ?? variant.regionId}. A therapeutic direction
            cannot be chosen before the variant's functional consequence has been established: the same gene yields opposite
            design decisions for gain- and loss-of-function mechanisms.
          </div>
          <Button variant="primary" onClick={() => setModule('lab')}>Go to molecular lab</Button>
        </div>
      </div>
    );
  }

  const canAdvance = !!t.strategyId && !!t.targetRegionId && nominatedCandidates.length > 0;

  return (
    <Workspace
      keepSidebar
      sidebarWidth={300}
      inspectorWidth={360}
      sidebar={
        <Sidebar
          pid={pid}
          patientLabel={`${patient.presentation}`}
          variantLabel={`${variant.hgvsP} · ${regionById(variant.regionId)?.label ?? variant.regionId}`}
          mechanism={classification.mechanism}
          confidence={classification.confidence}
          headline={recommendationHeadline(classification)}
          recommendations={recommendations}
          selectedStrategyId={t.strategyId}
          onSelectStrategy={(sid) => selectStrategy(pid, sid)}
          regions={regions.map((r) => ({ id: r.id, label: r.label, span: `${r.start.toLocaleString()}–${r.end.toLocaleString()} nt` }))}
          proteinLevel={proteinLevel}
          targetRegionId={t.targetRegionId}
          onSelectRegion={(id) => selectTargetRegion(pid, id)}
        />
      }
      inspector={
        stage === 'screen' && run ? (
          <ScreenInspector
            run={run}
            candidates={candidates}
            selectedWellId={t.selectedWellId}
            onSave={() => saveScreeningEvidence(pid)}
            savedArtifacts={savedArtifacts.map((a) => ({ id: a.id, title: a.title, kind: a.kind }))}
            onContinue={() => setModule('reuse')}
          />
        ) : (
          <DesignInspector
            strategyId={t.strategyId}
            targetRegionId={t.targetRegionId}
            candidate={selectedCandidate}
            gap={strategy ? parameterGap(variant, strategy) : 0}
            nominatedCount={nominatedCandidates.length}
            canAdvance={canAdvance}
            onAdvance={() => advanceToScreening(pid)}
          />
        )
      }
    >
      <div className="absolute inset-0 flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-2 h-9 px-3 border-b border-line2 bg-bg shrink-0 whitespace-nowrap overflow-hidden">
          <div className="flex items-center gap-2.5 min-w-0 shrink-0">
            <Segmented<Stage>
              value={stage}
              onChange={(v) => setStage(v)}
              options={[
                { value: 'design', label: '1 · Design' },
                { value: 'compare', label: '2 · Compare' },
                { value: 'screen', label: '3 · Screen', title: run ? undefined : 'Advance nominated candidates to virtual screening first' },
              ]}
            />
            <span className="shrink-0 cursor-help" title={stage === 'screen' ? SCREENING_NOTE : THERAPY_MODEL_VERSION}>
              <EvidenceBadge category={stage === 'screen' ? 'simulated' : 'illustrative'} />
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!run && (
              <Button
                size="sm"
                variant="primary"
                className="shrink-0 whitespace-nowrap"
                data-tour="therapy.advance"
                disabled={!canAdvance}
                onClick={() => advanceToScreening(pid)}
              >
                Advance to virtual screening
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {stage === 'design' && (
            <div className="h-full min-h-0 flex flex-col">
              <div className="h-[56%] min-h-0 border-b border-line2" data-tour="therapy.canvas">
                {t.strategyId ? (
                  <DesignCanvas
                    variant={variant}
                    strategyId={t.strategyId}
                    targetableIds={regions.map((r) => r.id)}
                    targetRegionId={t.targetRegionId === PROTEIN_LEVEL_TARGET ? null : t.targetRegionId}
                    candidates={candidates}
                    nominated={t.nominated}
                    rejected={t.rejected}
                    selectedCandidateId={selectedCandidateId}
                    onSelectRegion={(id) => selectTargetRegion(pid, id)}
                    onSelectCandidate={setSelectedCandidateId}
                  />
                ) : (
                  <EmptyState
                    title="No strategy selected"
                    detail={
                      <>
                        Choose a research strategy in the left panel. Relevance is derived from the modelled mechanism
                        ({classification.mechanism}) and its confidence — not from a preference.
                      </>
                    }
                  />
                )}
              </div>
              <div className="flex-1 min-h-0" data-tour="therapy.candidates">
                {proteinLevel ? (
                  <div className="flex flex-col h-full min-h-0">
                    <div className="px-3 py-2 border-b border-line2 text-[11px] text-mute">
                      This strategy acts on the channel protein: there is no RNA target region, so the transcript canvas is
                      informational only. Candidates below are fictional small-molecule records.
                    </div>
                    <div className="flex-1 min-h-0">
                      <CandidateTable
                        candidates={candidates}
                        variant={variant}
                        nominated={t.nominated}
                        rejected={t.rejected}
                        selectedCandidateId={selectedCandidateId}
                        onSelect={setSelectedCandidateId}
                        onToggleNominate={(id) => toggleNominate(pid, id)}
                        onReject={(id, reason) => rejectCandidate(pid, id, reason)}
                        onRestore={(id) => restoreCandidate(pid, id)}
                      />
                    </div>
                  </div>
                ) : (
                  <CandidateTable
                    candidates={candidates}
                    variant={variant}
                    nominated={t.nominated}
                    rejected={t.rejected}
                    selectedCandidateId={selectedCandidateId}
                    onSelect={setSelectedCandidateId}
                    onToggleNominate={(id) => toggleNominate(pid, id)}
                    onReject={(id, reason) => rejectCandidate(pid, id, reason)}
                    onRestore={(id) => restoreCandidate(pid, id)}
                  />
                )}
              </div>
            </div>
          )}

          {stage === 'compare' && (
            <div className="h-full min-h-0">
              <CompareView candidates={nominatedCandidates} selectedCandidateId={selectedCandidateId} onSelect={setSelectedCandidateId} />
            </div>
          )}

          {stage === 'screen' && (
            run ? (
              <div className="h-full min-h-0 overflow-y-auto scroll-thin">
                <PlateView run={run} selectedWellId={t.selectedWellId} onSelectWell={(id) => selectWell(pid, id)} />
                <div className="border-t border-line2">
                  <DoseResponsePanel run={run} selectedCandidateId={selectedCandidateId} onSelect={setSelectedCandidateId} />
                </div>
              </div>
            ) : (
              <EmptyState
                title="No screening run"
                detail="Nominate at least one candidate and advance to virtual screening."
                action={<Button variant="primary" disabled={!canAdvance} onClick={() => advanceToScreening(pid)}>Advance to virtual screening</Button>}
              />
            )
          )}
        </div>
      </div>
    </Workspace>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────

function Sidebar({
  pid,
  patientLabel,
  variantLabel,
  mechanism,
  confidence,
  headline,
  recommendations,
  selectedStrategyId,
  onSelectStrategy,
  regions,
  proteinLevel,
  targetRegionId,
  onSelectRegion,
}: {
  pid: string;
  patientLabel: string;
  variantLabel: string;
  mechanism: MechanismClass;
  confidence: number;
  headline: string;
  recommendations: ReturnType<typeof recommendStrategies>;
  selectedStrategyId: StrategyId | null;
  onSelectStrategy: (id: StrategyId) => void;
  regions: { id: string; label: string; span: string }[];
  proteinLevel: boolean;
  targetRegionId: string | null;
  onSelectRegion: (id: string) => void;
}) {
  const blocked = headline === INSUFFICIENT_EVIDENCE;
  return (
    <div className="flex flex-col">
      <SectionHeader title="Design context" right={<EvidenceBadge category="illustrative" />} />
      <div className="px-3 py-2 border-b border-line2">
        <div className="font-mono text-[11px] text-ink">{pid}</div>
        <div className="text-[11px] text-mute">{patientLabel}</div>
        <div className="font-mono text-[10px] text-mute mt-1">{variantLabel}</div>
        <div className="flex items-center justify-between mt-2">
          <MechanismTag mechanism={mechanism} />
          <span className="font-mono text-[10px] text-dim tabular-nums">conf {fmt.pct(confidence)}</span>
        </div>
      </div>
      <div className={cx('px-3 py-2 border-b border-line2', blocked && 'bg-warn/[0.05]')}>
        <Label className="mb-1">Design basis</Label>
        <div className={cx('text-[11px] leading-[15px]', blocked ? 'text-warn' : 'text-ink')}>{headline}</div>
      </div>

      <SectionHeader title="Research strategies" />
      <div className="border-b border-line2" data-tour="therapy.strategies">
        {recommendations.map((r) => {
          const selected = r.strategy.id === selectedStrategyId;
          const selectable = r.strategy.actsOn !== 'none';
          return (
            <button
              key={r.strategy.id}
              onClick={() => selectable && onSelectStrategy(r.strategy.id)}
              disabled={!selectable}
              className={cx(
                'w-full text-left px-3 py-2 border-b border-line2 last:border-b-0 transition-colors',
                selected ? 'bg-cyan/[0.07]' : selectable ? 'hover:bg-surface2/60' : 'opacity-80 cursor-default',
              )}
              style={selected ? { boxShadow: `inset 2px 0 0 ${C.cyan}` } : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={cx('text-[11px] leading-[15px]', selected ? 'text-cyan' : 'text-ink')}>{r.strategy.name}</span>
                <RelevanceTag relevance={r.relevance} />
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-dim">{r.strategy.modality}</span>
                {r.strategy.actsOn !== 'none' && (
                  <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-dim">acts on {r.strategy.actsOn}</span>
                )}
              </div>
              <div className="text-[10px] leading-[14px] text-mute mt-1">{r.reason}</div>
            </button>
          );
        })}
      </div>

      <SectionHeader title="Target regions" right={<span className="font-mono text-[9px] text-dim">{regions.length}</span>} />
      <div className="px-3 py-2">
        {!selectedStrategyId && <Note>Select a strategy to list targetable transcript regions.</Note>}
        {selectedStrategyId && proteinLevel && (
          <Note>
            No RNA target region: this strategy acts on the channel protein. Candidates are evaluated at the protein level and
            the transcript canvas is shown for orientation only.
          </Note>
        )}
        {regions.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelectRegion(r.id)}
            className={cx(
              'w-full text-left px-2 py-1.5 mb-1 border rounded transition-colors',
              r.id === targetRegionId ? 'border-cyan/70 bg-cyan/[0.06]' : 'border-line2 hover:border-line',
            )}
          >
            <div className={cx('text-[11px] leading-[15px]', r.id === targetRegionId ? 'text-cyan' : 'text-ink')}>{r.label}</div>
            <div className="font-mono text-[9px] text-dim tabular-nums">{r.id} · {r.span}</div>
          </button>
        ))}
      </div>
      <div className="px-3 pb-3">
        <Note>{TRANSCRIPT_NOTE}</Note>
      </div>
    </div>
  );
}

// ─── Design inspector ────────────────────────────────────────────────────

function DesignInspector({
  strategyId,
  targetRegionId,
  candidate,
  gap,
  nominatedCount,
  canAdvance,
  onAdvance,
}: {
  strategyId: StrategyId | null;
  targetRegionId: string | null;
  candidate: Candidate | null;
  gap: number;
  nominatedCount: number;
  canAdvance: boolean;
  onAdvance: () => void;
}) {
  const strategy = strategyId ? getStrategy(strategyId) : null;
  const region = targetRegionId ? transcriptRegion(targetRegionId) : undefined;
  return (
    <div className="flex flex-col">
      <SectionHeader title="Strategy detail" right={<EvidenceBadge category="illustrative" />} />
      {strategy ? (
        <div className="px-3 py-2 border-b border-line2">
          <div className="text-[12px] text-ink mb-1">{strategy.name}</div>
          <Row k="Modality" v={strategy.modality} />
          <Row k="Intended effect" v={strategy.intendedEffect.replace('-', ' ')} />
          <Row k="Acts on (model)" v={strategy.actsOn} />
          <Row k="Reference gap" v={`${fmt.signed(gap * 100, 0)}%`} color={C.cyan} />
          <div className="text-[10px] leading-[14px] text-mute mt-2">{strategy.rationale}</div>
          <Label className="mt-2 mb-1">Caveats</Label>
          <ul className="space-y-[2px]">
            {strategy.caveats.map((c) => (
              <li key={c} className="text-[10px] leading-[14px] text-warn/80">· {c}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="px-3 py-2 border-b border-line2"><Note>No strategy selected.</Note></div>
      )}

      <SectionHeader title="Target region" />
      <div className="px-3 py-2 border-b border-line2">
        {region ? (
          <>
            <div className="text-[11px] text-ink">{region.label}</div>
            <Row k="Region id" v={region.id} />
            <Row k="Kind" v={region.kind} />
            <Row k="Coordinates" v={`${region.start.toLocaleString()}–${region.end.toLocaleString()} nt`} />
            <Row k="Length" v={`${(region.end - region.start + 1).toLocaleString()} nt`} />
            {region.aaStart && <Row k="Residues (approx.)" v={`${region.aaStart}–${region.aaEnd}`} />}
            <Note className="mt-1.5">Schematic coordinates. Region boundaries are illustrative, not annotated positions.</Note>
          </>
        ) : targetRegionId === PROTEIN_LEVEL_TARGET ? (
          <Note>Protein-level target — no transcript region. Candidate records describe channel-directed small molecules.</Note>
        ) : (
          <Note>Select a highlighted region in the canvas.</Note>
        )}
      </div>

      <SectionHeader title="Candidate detail" />
      <div className="px-3 py-2 border-b border-line2">
        {candidate ? (
          <>
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[12px] text-ink">{candidate.id}</span>
              <span className="font-mono text-[9px] tracking-[0.08em]" style={{ color: PLATFORM_COLOR[candidate.platformCompatibility] }}>
                {PLATFORM_LABEL[candidate.platformCompatibility]}
              </span>
            </div>
            <Row k="Binding (illustrative)" v={candidate.bindingScore.toFixed(2)} />
            <Row k="Specificity (illustrative)" v={candidate.specificityScore.toFixed(2)} />
            <Row k="Model uncertainty" v={candidate.uncertainty.toFixed(2)} color={candidate.uncertainty >= SCREEN_THRESHOLDS.maxUncertainty ? C.warn : undefined} />
            <Row
              k="Predicted Δ parameter"
              v={`${fmt.signed(candidate.predictedEffect.mid * 100, 0)}% [${fmt.signed(candidate.predictedEffect.low * 100, 0)}, ${fmt.signed(candidate.predictedEffect.high * 100, 0)}]`}
            />
            <Row k="Window" v={candidate.bindEnd > 0 ? `${candidate.bindStart.toLocaleString()}–${candidate.bindEnd.toLocaleString()} nt` : '— protein-level'} />
            <Note className="mt-1">{candidate.predictedEffect.basis}</Note>
            <Label className="mt-2 mb-1">Development requirements</Label>
            <ul className="space-y-[2px]">
              {candidate.developmentRequirements.map((r) => (
                <li key={r} className="text-[10px] leading-[14px] text-mute">· {r}</li>
              ))}
            </ul>
          </>
        ) : (
          <Note>Select a candidate row or binding window.</Note>
        )}
      </div>

      <div className="px-3 py-3">
        <Button variant="primary" size="lg" className="w-full" disabled={!canAdvance} onClick={onAdvance}>
          Advance to virtual screening
        </Button>
        <Note className="mt-1.5">
          {nominatedCount} nominated · up to {MAX_CANDIDATES_PER_PLATE} candidates fit one simulated 96-well plate.
          Nomination records a research choice; it is not a decision to treat.
        </Note>
      </div>
    </div>
  );
}

// ─── Screening inspector ─────────────────────────────────────────────────

function ScreenInspector({
  run,
  candidates,
  selectedWellId,
  onSave,
  savedArtifacts,
  onContinue,
}: {
  run: NonNullable<_TS['screeningRun']>;
  candidates: Candidate[];
  selectedWellId: string | null;
  onSave: () => void;
  savedArtifacts: { id: string; title: string; kind: string }[];
  onContinue: () => void;
}) {
  const well = selectedWellId ? run.plate.find((w) => w.id === selectedWellId) : undefined;
  const result = resultFor(run, well?.candidateId);
  const any = run.results[0];
  const unit = MEASUREMENT_UNIT[any?.measurementKey ?? 'peakDensity'] ?? '';
  const candidate = candidates.find((c) => c.id === well?.candidateId);
  const doseStat = result && well?.doseNm ? result.doseResponse.find((d) => d.doseNm === well.doseNm) : undefined;
  const tally = run.results.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.outcome]: (acc[r.outcome] ?? 0) + 1 }), {});

  return (
    <div className="flex flex-col">
      <SectionHeader title="Well inspector" right={<EvidenceBadge category="simulated" />} />
      <div className="px-3 py-2 border-b border-line2">
        {well && well.kind !== 'empty' ? (
          <>
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[12px] text-ink">{well.id}</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-mute">{well.kind}</span>
            </div>
            {well.candidateId && <Row k="Candidate" v={well.candidateId} />}
            <Row k="Condition" v={well.kind === 'candidate' ? `${well.doseNm} nM` : well.kind === 'reference' ? 'reference channel (WT)' : well.kind === 'vehicle' ? 'vehicle, no compound' : 'variant, untreated'} />
            <Row k="Replicate" v={well.replicate ? `${well.replicate} of ${well.kind === 'candidate' ? 3 : 4}` : '—'} />
            <Row k="Response" v={`${well.response?.toFixed(1) ?? '—'} ${unit}`} color={C.cyan} />
            {any && <Row k="Reference mean" v={`${any.referenceMean.toFixed(1)} ${unit}`} />}
            {any && <Row k="Untreated variant mean" v={`${any.untreatedMean.toFixed(1)} ${unit}`} color={C.warn} />}
            {any && <Row k="Vehicle mean" v={`${any.vehicleMean.toFixed(1)} ${unit}`} />}
            {doseStat && (
              <>
                <Row k="Dose mean ± SD" v={`${doseStat.mean.toFixed(1)} ± ${doseStat.sd.toFixed(1)} ${unit}`} />
                <Row k="n (wells)" v={String(doseStat.n)} />
              </>
            )}
            {any && well.response !== undefined && (
              <Row
                k="Simulated treatment effect"
                v={`${fmt.signed(well.response - any.untreatedMean, 1)} ${unit} vs untreated`}
                color={OUTCOME_COLOR[result?.outcome ?? 'mixed']}
              />
            )}
            {candidate && <Row k="Candidate model uncertainty" v={candidate.uncertainty.toFixed(2)} />}
            {result && (
              <div className="mt-2">
                <div className="flex items-center justify-between">
                  <Label>Outcome</Label>
                  <OutcomeBadge outcome={result.outcome} />
                </div>
                <div className="text-[10px] leading-[14px] text-mute mt-1">{result.outcomeReason}</div>
                <Row k="Rescue fraction" v={`${(result.rescueFraction.mid * 100).toFixed(0)}% [${(result.rescueFraction.low * 100).toFixed(0)}, ${(result.rescueFraction.high * 100).toFixed(0)}]`} />
                <Note className="mt-1">{result.rescueFraction.basis}</Note>
              </div>
            )}
          </>
        ) : (
          <Note>Select a well in the plate to inspect its simulated response.</Note>
        )}
      </div>

      <div data-tour="therapy.results">
      <SectionHeader title="Outcome summary" />
      <div className="px-3 py-2 border-b border-line2">
        {(['pass', 'mixed', 'fail', 'excluded-uncertainty'] as const).map((k) => (
          <Row key={k} k={k.replace('excluded-uncertainty', 'excluded (uncertainty)')} v={String(tally[k] ?? 0)} color={OUTCOME_COLOR[k]} />
        ))}
        <Note className="mt-1">
          Thresholds: pass requires ≥ {(SCREEN_THRESHOLDS.passRescue * 100).toFixed(0)}% rescue with a monotonic dose response
          and within-dose CV ≤ {(SCREEN_THRESHOLDS.maxCv * 100).toFixed(0)}%. Candidates with model uncertainty ≥{' '}
          {SCREEN_THRESHOLDS.maxUncertainty} are not called at all.
        </Note>
      </div>
      </div>

      <SectionHeader title="Experiment metadata" />
      <div className="px-3 py-2 border-b border-line2">
        {screeningMetadata(run).map((m) => (
          <Row key={m.k} k={m.k} v={m.v} />
        ))}
      </div>

      <div className="px-3 py-3">
        {savedArtifacts.length === 0 ? (
          <>
            <Button variant="primary" size="lg" className="w-full" data-tour="therapy.save" onClick={onSave}>
              Save findings to evidence library
            </Button>
            <Note className="mt-1.5">
              Saving records the design strategy, the simulated screen and — for an oligonucleotide modality — the platform
              chemistry, analytical, class-safety and documentation artifacts, each with its own reuse conditions.
            </Note>
          </>
        ) : (
          <>
            <Label className="mb-1.5">Evidence artifacts created ({savedArtifacts.length})</Label>
            <ul className="space-y-1 mb-2">
              {savedArtifacts.map((a) => (
                <li key={a.id} className="flex items-start gap-2 border-b border-line2 pb-1">
                  <span className="font-mono text-[10px] text-cyan shrink-0">{a.id}</span>
                  <span className="text-[10px] leading-[14px] text-mute">
                    {a.title}
                    <span className="block font-mono text-[9px] text-dim uppercase tracking-[0.06em]">{a.kind}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Note className="mb-2">
              These artifacts are now in the evidence library and will be available to the next patient, where each one is
              re-assessed against its own reuse conditions — some transfer, some require revalidation, some never transfer.
            </Note>
            <Button variant="primary" size="lg" className="w-full" data-tour="therapy.continue" onClick={onContinue}>
              Continue to evidence reuse
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
