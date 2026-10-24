// Inspector for a single evidence node: class, explanation, condition checks, sources, required work.
import type { EvidenceArtifact, NodeReuseAssessment, ReuseAssessment } from '../../domain/types';
import { EvidenceBadge, KV, Label, ReuseTag, SectionHeader } from '../../ui/primitives';
import { C, REUSE_STYLE } from '../../ui/tokens';
import { conditionLabel, NODE_LABELS, tallyClasses } from '../../sim/reuse';
import { REUSE_ORDER, SOURCE_LABEL, VALIDATION_LABEL } from './shared';
import { ReuseLegend } from './ReuseGraph';

export function NodeInspector({ node, library, assessment }: { node: NodeReuseAssessment | null; library: EvidenceArtifact[]; assessment: ReuseAssessment | null }) {
  if (!assessment) {
    return (
      <div>
        <SectionHeader title="Reuse inspector" />
        <div className="p-3 space-y-3 text-xs text-mute">
          <p>No reuse assessment has been run for this patient. Run it to evaluate each evidence node against the library's typed reuse conditions.</p>
          <ReuseLegend className="flex-col !items-start" />
        </div>
      </div>
    );
  }
  if (!node) {
    const t = tallyClasses(assessment);
    return (
      <div>
        <SectionHeader title="Assessment summary" right={<EvidenceBadge category="illustrative" />} />
        <div className="p-3 space-y-3">
          <div>
            <KV k="Target" v={assessment.targetPatientId} />
            <KV k="Variant" v={assessment.targetVariantId} />
            <KV k="Mechanism (target)" v={assessment.targetMechanism} />
            <KV k="Library artifacts evaluated" v={assessment.libraryArtifactIds.length} />
            <KV k="Rules" v={assessment.rulesVersion} />
          </div>
          <div className="border-t border-line2 pt-2">
            {REUSE_ORDER.map((k) => (
              <div key={k} className="flex items-center justify-between py-[3px]">
                <ReuseTag reuseClass={k} />
                <span className="font-mono text-xs tabular-nums">{t[k]} <span className="text-dim">/ 11 nodes</span></span>
              </div>
            ))}
          </div>
          <p className="text-xs text-dim">Select a node in the graph to inspect its condition checks, source artifacts and required work.</p>
          <ReuseLegend className="flex-col !items-start" />
        </div>
      </div>
    );
  }
  const s = REUSE_STYLE[node.reuseClass];
  const sources = node.sourceArtifactIds.map((id) => library.find((a) => a.id === id)).filter((a): a is EvidenceArtifact => !!a);
  return (
    <div>
      <SectionHeader title={NODE_LABELS[node.nodeId]} right={<ReuseTag reuseClass={node.reuseClass} />} />
      <div className="p-3 space-y-4">
        <div className="border-l-2 pl-2.5 text-sm text-ink" style={{ borderColor: s.color }}>{node.explanation}</div>

        <div>
          <Label className="mb-1.5">Condition checks {node.checks.length > 0 && <span className="text-dim normal-case tracking-normal">· determining artifact</span>}</Label>
          {node.checks.length === 0 && <div className="text-xs text-dim">No applicable artifact — no conditions to evaluate.</div>}
          {node.checks.map((c, i) => (
            <div key={i} className="flex gap-2 py-1 border-b border-line2 last:border-0">
              <span className="font-mono text-xs w-3 shrink-0" style={{ color: c.satisfied ? C.cyan : C.warn }}>{c.satisfied ? '✓' : '✗'}</span>
              <div className="min-w-0">
                <div className="font-mono text-2xs text-ink uppercase tracking-[0.04em]">{conditionLabel(c.condition)}</div>
                <div className="text-2xs text-mute">{c.detail}</div>
              </div>
            </div>
          ))}
        </div>

        <div>
          <Label className="mb-1.5">Required work</Label>
          <ul className="space-y-1">
            {node.requiredWork.map((w, i) => (
              <li key={i} className="flex gap-2 text-xs text-ink"><span className="text-dim font-mono">{String(i + 1).padStart(2, '0')}</span>{w}</li>
            ))}
          </ul>
        </div>

        <div>
          <Label className="mb-1.5">Source artifacts ({sources.length})</Label>
          {sources.length === 0 && <div className="text-xs text-dim">None in the library for this node.</div>}
          {sources.map((a) => (
            <div key={a.id} className="border border-line2 rounded-sm p-2 mb-2 bg-surface">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono text-2xs text-cyan">{a.id}</span>
                <EvidenceBadge category={a.category} />
              </div>
              <div className="text-xs text-ink mb-1">{a.title}</div>
              <KV k="Source type" v={SOURCE_LABEL[a.provenance.sourceType]} />
              <KV k="Originating patient" v={a.provenance.originatingPatientId ?? '— (platform)'} />
              <KV k="Gene" v={a.provenance.gene} />
              <KV k="Mechanism" v={a.provenance.mechanism ?? '—'} />
              {a.provenance.variantId && <KV k="Variant" v={a.provenance.variantId} />}
              {a.provenance.domain && <KV k="Domain / region" v={`${a.provenance.domain} · ${a.provenance.regionKind ?? '—'}`} />}
              <KV k="Protocol version" v={a.provenance.protocolVersion ?? '—'} />
              {a.provenance.modality && <KV k="Modality" v={a.provenance.modality} />}
              <KV k="Validation" v={VALIDATION_LABEL[a.provenance.validationStatus]} />
              <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-dim">Reuse conditions</div>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {a.provenance.reuseConditions.map((c, i) => (
                  <span key={i} className="font-mono text-[9px] px-1 border border-line rounded-sm text-mute">{conditionLabel(c)}</span>
                ))}
              </div>
              {a.provenance.limitations.length > 0 && (
                <>
                  <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-dim">Limitations</div>
                  {a.provenance.limitations.map((l, i) => <div key={i} className="text-2xs text-mute">{l}</div>)}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
