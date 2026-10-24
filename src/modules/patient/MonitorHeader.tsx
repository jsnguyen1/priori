// Top strip of the clinical monitoring scene.
import { getPatient } from '../../data/patients';
import { getVariant } from '../../data/variants';
import { PRIMARY_PATIENT_ID } from '../../state/store';
import { EvidenceBadge, cx } from '../../ui/primitives';
import { useSimple } from '../../ui/simple';
import { getClassification } from '../../data/variants';
import { MECH_COLOR } from '../../ui/tokens';
import { plainMech } from './plain';

function Cell({ label, value, className, valueClass, tour }: { label: string; value: string; className?: string; valueClass?: string; tour?: string }) {
  return (
    <div data-tour={tour} className={cx('flex flex-col justify-center px-4 py-2 border-r border-line2 min-w-0', className)}>
      <span className="font-mono text-[9px] tracking-[0.16em] text-dim leading-none mb-1.5">{label}</span>
      <span className={cx('font-mono text-sm tracking-[0.06em] text-ink leading-none truncate', valueClass)}>{value}</span>
    </div>
  );
}

export function MonitorHeader({ characterized }: { characterized: boolean }) {
  const p = getPatient(PRIMARY_PATIENT_ID);
  const v = getVariant(p.variantId)!;
  const simple = useSimple();
  if (simple) {
    const mech = getClassification(v.id).mechanism;
    const age = p.ageAtPresentation.toLowerCase();
    return (
      <div data-tour="patient.header" className="shrink-0 border-b border-line2 bg-black/60">
        <div className="flex items-center gap-x-5 h-[44px] px-6 text-[13px] text-mute">
          <span className="font-mono text-ink">{p.id}</span>
          <span>{age} old</span>
          <span>seizures</span>
          <span data-tour="patient.finding" className="text-ink">
            change in the <span className="font-mono">SCN2A</span> gene
          </span>
          <span>
            effect:{' '}
            {characterized ? (
              <span style={{ color: MECH_COLOR[mech] }}>{plainMech(mech, true)}</span>
            ) : (
              <span className="text-warn">unknown</span>
            )}
          </span>
          <span className="ml-auto font-mono text-[10px] tracking-[0.12em] text-dim">INVENTED PATIENT · SIMULATION</span>
        </div>
      </div>
    );
  }
  return (
    <div data-tour="patient.header" className="shrink-0 border-b border-line2 bg-black/60">
      <div className="flex items-stretch h-[52px]">
        <Cell label="PATIENT" value={p.id} />
        <Cell label="AGE" value={p.ageAtPresentation} />
        <Cell label="PRESENTATION" value={p.presentation} />
        <Cell tour="patient.finding" label="GENETIC FINDING" value={`SCN2A VARIANT · ${v.hgvsP}`} />
        <Cell
          label="FUNCTIONAL CHARACTERIZATION"
          value={characterized ? 'SIMULATED · AVAILABLE' : 'UNAVAILABLE'}
          valueClass={characterized ? 'text-cyan' : 'text-warn'}
          className="border-r-0 flex-1"
        />
      </div>
      <div className="flex items-center gap-2 h-6 px-4 border-t border-line2">
        <EvidenceBadge category="hypothetical" />
        <span className="font-mono text-[9.5px] tracking-[0.12em] text-dim">HYPOTHETICAL CASE · EDUCATIONAL SIMULATION · NOT CLINICAL DECISION SUPPORT</span>
      </div>
    </div>
  );
}
