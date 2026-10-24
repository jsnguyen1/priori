// Left sidebar of the patient scene: case record, data-category key, compact case browser.
import { PATIENTS, getPatient } from '../../data/patients';
import { getClassification, getVariant } from '../../data/variants';
import { regionById } from '../../data/published';
import { PRIMARY_PATIENT_ID, useStore } from '../../state/store';
import { EvidenceBadge, KV, MechanismTag, SectionHeader, cx } from '../../ui/primitives';
import { characterizationStatus, mechanismKnown } from '../atlas/evidenceStatus';

function CaseRecord() {
  const p = getPatient(PRIMARY_PATIENT_ID);
  const v = getVariant(p.variantId)!;
  const region = regionById(v.regionId);
  const revealed = useStore((s) => s.mechanismRevealed);
  const decision = useStore((s) => s.decision);
  return (
    <div>
      <SectionHeader title="Case record" right={<EvidenceBadge category="hypothetical" />} />
      <div className="px-3 py-2">
        <KV k="Patient" v={p.id} />
        <KV k="Label" v={<span className="font-sans">{p.label}</span>} />
        <KV k="Age at presentation" v={p.ageAtPresentation} />
        <KV k="Inheritance" v={p.inheritance} />
        <KV k="Gene" v="SCN2A · NaV1.2" />
        <KV k="Variant" v={v.hgvsP} sub="hypothetical substitution" />
        <KV k="Record" v={v.id.replace('SCN2A:', '')} />
        <KV k="Region" v={region?.label ?? v.regionId} sub={`res ${v.position} · UniProt Q99250`} />
        <KV k="Clinical decision" v={decision ? (decision.choice === 'administer' ? 'ADMINISTER' : 'WITHHOLD') : 'PENDING'} />
        <div className="flex items-baseline justify-between gap-3 py-[3px]">
          <span className="text-xs text-mute">Functional evidence</span>
          {revealed ? <MechanismTag mechanism={getClassification(v.id).mechanism} /> : <span className="font-mono text-xs text-warn">UNAVAILABLE</span>}
        </div>
      </div>
    </div>
  );
}

function CategoryKey() {
  const rows: { c: 'hypothetical' | 'simulated' | 'published' | 'illustrative'; d: string }[] = [
    { c: 'hypothetical', d: 'Invented case and variant. No real individual.' },
    { c: 'simulated', d: 'Synthetic measurement from a deterministic gating model.' },
    { c: 'illustrative', d: 'Rule-based model output (classification).' },
    { c: 'published', d: 'Cited published biology.' },
  ];
  return (
    <div>
      <SectionHeader title="Data categories" />
      <div className="px-3 py-2 space-y-1.5">
        {rows.map((r) => (
          <div key={r.c} className="flex items-start gap-2">
            <EvidenceBadge category={r.c} className="w-[84px] justify-center shrink-0" />
            <span className="text-2xs text-mute leading-[15px]">{r.d}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CaseBrowser() {
  const active = useStore((s) => s.activePatientId);
  const setActive = useStore((s) => s.setActivePatient);
  const analyses = useStore((s) => s.analyses);
  const revealed = useStore((s) => s.mechanismRevealed);
  return (
    <div>
      <SectionHeader title="Case browser" right={<span className="font-mono text-2xs text-dim">{PATIENTS.length} CASES</span>} />
      <div className="py-1">
        {PATIENTS.map((p) => {
          const v = getVariant(p.variantId)!;
          const st = characterizationStatus(v, analyses, revealed);
          const on = p.id === active;
          return (
            <button
              key={p.id}
              onClick={() => setActive(p.id)}
              className={cx('w-full text-left px-3 py-1.5 border-l-2 transition-colors', on ? 'border-cyan bg-surface' : 'border-transparent hover:bg-surface/60')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cx('font-mono text-xs', on ? 'text-ink' : 'text-mute')}>{p.id}</span>
                <span className="font-mono text-2xs text-dim">{p.ageAtPresentation}</span>
              </div>
              <div className="text-2xs text-dim truncate">{p.presentation}</div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="font-mono text-2xs text-mute truncate">{v.hgvsP}</span>
                {mechanismKnown(st) ? (
                  <MechanismTag mechanism={getClassification(v.id).mechanism} />
                ) : (
                  <span className="font-mono text-[9px] tracking-[0.08em] text-dim">{st === 'running' ? 'ANALYSING' : 'UNCHARACTERIZED'}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {active !== PRIMARY_PATIENT_ID && (
        <div className="mx-3 mb-2 px-2 py-1.5 border border-line2 rounded text-2xs text-mute leading-[15px]">
          Active case is <span className="font-mono text-ink">{active}</span>. The opening decision scenario below remains{' '}
          <span className="font-mono text-ink">{PRIMARY_PATIENT_ID}</span>.
        </div>
      )}
    </div>
  );
}

export function CaseSidebar() {
  return (
    <div className="flex flex-col">
      <CaseRecord />
      <CaseBrowser />
      <CategoryKey />
      <div className="px-3 py-3 text-2xs text-dim leading-[15px]">
        Educational simulation. Not clinical decision support. All patients, variants and measurements shown here are hypothetical or synthetic.
      </div>
    </div>
  );
}
