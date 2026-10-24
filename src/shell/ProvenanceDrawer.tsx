// Auditable view of what is real, what is simulated, and what is assumed.
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useStore } from '../state/store';
import { CITATIONS, PUBLISHED_FACTS, UNIPROT_SOURCE } from '../data/published';
import { PATIENTS } from '../data/patients';
import { ATLAS_VARIANTS, getVariant } from '../data/variants';
import { MODEL_VERSION, PROTOCOLS, PROTOCOL_SUITE_VERSION, REFERENCE_PARAMS, CELL_SYSTEM } from '../sim/channel';
import { CLASSIFIER_VERSION, RULES, THRESHOLDS } from '../sim/classifier';
import { GLOBAL_SEED } from '../sim/rng';
import { REUSE_RULES_VERSION } from '../sim/reuse';
import { SCENARIOS, TASKS } from '../sim/development';
import structure from '../data/structure/nav12_6j8e.json';
import type { DataCategory, EvidenceArtifact } from '../domain/types';
import { EvidenceBadge, Label, Segmented, cx, fmt } from '../ui/primitives';
import { MOTION } from '../ui/tokens';

type Tab = 'categories' | 'library' | 'limits';

function Block({ category, title, children }: { category: DataCategory; title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line2 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <EvidenceBadge category={category} />
        <span className="text-sm text-ink">{title}</span>
      </div>
      <div className="text-xs text-mute space-y-1.5">{children}</div>
    </section>
  );
}

function ArtifactRow({ a }: { a: EvidenceArtifact }) {
  const [open, setOpen] = useState(false);
  const p = a.provenance;
  return (
    <div className="border-b border-line2">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-surface/60">
        <span className="font-mono text-[11px] text-cyan w-[60px] shrink-0">{a.id}</span>
        <span className="flex-1 min-w-0 truncate text-xs text-ink">{a.title}</span>
        <EvidenceBadge category={a.category} />
      </button>
      {open && (
        <div className="px-4 pb-3 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 font-mono text-[10.5px]">
          {(
            [
              ['kind', a.kind],
              ['source type', p.sourceType],
              ['origin', p.originatingPatientId ?? p.originatingProgram],
              ['gene', p.gene],
              ['mechanism', p.mechanism ?? 'n/a'],
              ['variant', p.variantId ? `${p.variantId} ${getVariant(p.variantId)?.hgvsP ?? ''}` : 'n/a'],
              ['protocol', p.protocolVersion ?? 'n/a'],
              ['cell system', p.cellSystem ?? 'n/a'],
              ['modality', p.modality ?? 'n/a'],
              ['validation', p.validationStatus],
              ['created', fmt.time(a.createdAt)],
              ['depends on', a.dependsOn.join(', ') || 'n/a'],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="contents">
              <span className="text-dim">{k}</span>
              <span className="text-ink/90 break-words">{v}</span>
            </div>
          ))}
          <span className="text-dim">reuse conditions</span>
          <span className="text-ink/90">{p.reuseConditions.map((c) => ('version' in c ? `${c.kind}(${c.version})` : 'cellSystem' in c ? `${c.kind}` : 'modality' in c ? `${c.kind}(${c.modality})` : 'regionId' in c ? `${c.kind}(${c.regionId})` : c.kind)).join(' ∧ ')}</span>
          <span className="text-dim">limitations</span>
          <span className="text-mute font-sans text-[11px]">{p.limitations.join(' ')}</span>
          {p.citation && (
            <>
              <span className="text-dim">citation</span>
              <span className="text-mute font-sans text-[11px]">{p.citation}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ProvenanceDrawer() {
  const open = useStore((s) => s.provenanceOpen);
  const toggle = useStore((s) => s.toggleProvenance);
  const library = useStore((s) => s.evidenceLibrary);
  const [tab, setTab] = useState<Tab>('categories');
  const prov = structure.provenance;

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0 }}
          transition={{ duration: MOTION.base, ease: MOTION.ease }}
          className="fixed top-11 right-0 bottom-6 z-40 w-[520px] flex flex-col bg-bg border-l border-line shadow-[-12px_0_40px_rgba(0,0,0,0.45)]"
        >
          <div className="flex items-center gap-3 h-10 px-4 border-b border-line2 shrink-0">
            <Label>Provenance & assumptions</Label>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'categories', label: 'Data categories' },
                { value: 'library', label: `Library (${library.length})` },
                { value: 'limits', label: 'Limitations' },
              ]}
            />
            <div className="flex-1" />
            <button onClick={() => toggle(false)} className="text-mute hover:text-ink">
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scroll-thin">
            {tab === 'categories' && (
              <>
                <Block category="published" title="Published biological facts">
                  {PUBLISHED_FACTS.map((f) => (
                    <div key={f.id}>
                      {f.statement} <span className="font-mono text-[10px] text-dim">[{f.citationIds.map((c) => CITATIONS[c].short).join('; ')}]</span>
                    </div>
                  ))}
                  <div className="pt-1 font-mono text-[10px] text-dim">Topology & sequence: {UNIPROT_SOURCE}</div>
                  <div className="font-mono text-[10px] text-dim">
                    Structure: PDB {prov.pdbId} · {prov.title} · {prov.method} · {prov.chain}. {prov.processing}
                  </div>
                </Block>
                <Block category="hypothetical" title="Hypothetical patients & variants">
                  <div>{PATIENTS.length} invented patient cases ({PATIENTS.map((p) => p.id).join(', ')}). No real individuals. Variant substitutions are hypothetical; the reference residue is taken from the published sequence. Any resemblance to reported variants is coincidental and does not represent their data.</div>
                  <div>{ATLAS_VARIANTS.length.toLocaleString()} Atlas records generated from region-dependent priors (seed 0x{GLOBAL_SEED.toString(16).toUpperCase()}).</div>
                </Block>
                <Block category="simulated" title="Synthetic experimental measurements">
                  <div>{MODEL_VERSION}: Hodgkin–Huxley-style m³h gating model with persistent fraction, integrated with exact exponential updates (Δt 0.02 ms). Reference parameters: V½(m) {REFERENCE_PARAMS.vHalfAct} mV, V½(h) {REFERENCE_PARAMS.vHalfInact} mV, τ_rec {REFERENCE_PARAMS.tauRecovery} ms.</div>
                  <div>Protocols {PROTOCOL_SUITE_VERSION}: {Object.values(PROTOCOLS).map((p) => p.name).join(' · ')}. Cell system: {CELL_SYSTEM}.</div>
                  <div>Measured values = model fit + seeded sampling error of the mean (n cells). Patient variants use full protocol simulation; Atlas summary records use a calibrated analytic approximation; computational-prior records carry 3× inflated uncertainty.</div>
                </Block>
                <Block category="illustrative" title="Illustrative model predictions">
                  <div>
                    {CLASSIFIER_VERSION}: {RULES.length} rules; directional call at |net| ≥ {THRESHOLDS.directional}; mixed when both sides ≥ {THRESHOLDS.mixedEach}; confidence from {THRESHOLDS.draws} seeded perturbation draws (min {THRESHOLDS.minConfidence}).
                  </div>
                  {RULES.map((r) => (
                    <div key={r.key} className="font-mono text-[10px] text-dim">
                      {r.label} (w {r.weight}): {r.boundary}
                    </div>
                  ))}
                  <div>Therapeutic strategies, candidate records, binding/specificity scores and the transcript map are illustrative and non-actionable. No sequences are provided. {REUSE_RULES_VERSION} decides evidence transfer from typed provenance conditions.</div>
                </Block>
                <Block category="assumption" title="Financial & scheduling assumptions">
                  <div>{TASKS.length} development tasks with effort, duration and cost ranges; timelines are computed from task dependencies (critical path). Scenarios: {Object.values(SCENARIOS).map((s) => s.label).join(' / ') || 'n/a'}.</div>
                  <div>These are scenario assumptions for discussion, not observed Priori results, quotes or forecasts.</div>
                </Block>
              </>
            )}
            {tab === 'library' && (
              <div>
                <div className="px-4 py-2 text-xs text-mute border-b border-line2">Every artifact carries structured provenance. The reuse engine evaluates these fields and typed conditions, never titles or free text.</div>
                {library.map((a) => (
                  <ArtifactRow key={a.id} a={a} />
                ))}
              </div>
            )}
            {tab === 'limits' && (
              <div className="px-4 py-3 space-y-3 text-xs text-mute">
                {[
                  ['Not clinically validated', 'PRIORI is a proposed platform. Nothing here is clinical decision support. No Priori-designed therapy has been tested in humans.'],
                  ['No regulatory endorsement', 'No FDA endorsement or approval is claimed or implied. Draft regulatory guidance on individualized therapies does not guarantee any future approval.'],
                  ['Shared mechanism ≠ shared efficacy', 'A shared molecular mechanism does not establish that the same therapy is safe or effective for another patient. Variant-specific confirmation and patient-specific safety evidence remain required.'],
                  ['Model scope', 'The gating model is a teaching-grade abstraction. Neuronal excitability, developmental expression (NaV1.2 vs NaV1.6), isoforms and β subunits are not modelled.'],
                  ['Open research problems', 'Predicting variant mechanism without measurement; translating channel-level rescue to neuronal and clinical benefit; qualifying platform processes so reuse is acceptable to regulators.'],
                ].map(([t, d]) => (
                  <div key={t}>
                    <div className={cx('font-mono text-[10px] tracking-[0.1em] uppercase text-ink mb-0.5')}>{t}</div>
                    <div>{d}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
