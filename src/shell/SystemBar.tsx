import { getPatient } from '../data/patients';
import { getClassification, getVariant } from '../data/variants';
import { regionById } from '../data/published';
import { useStore } from '../state/store';
import { cx } from '../ui/primitives';
import { useTour } from '../tour/tourStore';
import { useViewMode } from '../ui/viewMode';
import { MECH_COLOR } from '../ui/tokens';

const MECH_WORDS = { GoF: 'TOO ACTIVE (GoF)', LoF: 'TOO WEAK (LoF)', mixed: 'MIXED', indeterminate: 'UNCLEAR' } as const;

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col justify-center px-3 border-l border-line2 h-full min-w-0', className)}>
      <span className="font-mono text-[8.5px] tracking-[0.14em] text-dim leading-none mb-1 whitespace-nowrap">{label}</span>
      <span className="font-mono text-[11px] text-ink leading-none truncate whitespace-nowrap">{children}</span>
    </div>
  );
}

export function SystemBar() {
  const pid = useStore((s) => s.activePatientId);
  const analyses = useStore((s) => s.analyses);
  const library = useStore((s) => s.evidenceLibrary);
  const presenting = useStore((s) => s.presentation.active);
  const setPresentation = useStore((s) => s.setPresentation);
  const tourActive = useTour((t) => t.active);
  const simple = useViewMode((v) => v.simple);
  const toggleView = useViewMode((v) => v.toggle);
  const p = getPatient(pid);
  const v = getVariant(p.variantId)!;
  const revealed = useStore((s) => s.mechanismRevealed);
  const status = analyses[v.id]?.status ?? 'idle';
  const known = status === 'complete' || (revealed && p.role === 'primary');
  const mech = known ? getClassification(v.id).mechanism : null;

  return (
    <header className="h-11 shrink-0 flex items-stretch border-b border-line2 bg-bg select-none">
      <div className="flex items-center gap-3 pl-4 pr-4 w-[260px] shrink-0">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <rect x="0.5" y="0.5" width="17" height="17" rx="2" fill="none" stroke="#253542" />
          <path d="M5 13.5V4.5h4.6a2.6 2.6 0 010 5.2H5" fill="none" stroke="#40D8D0" strokeWidth="1.4" />
        </svg>
        <div className="font-mono text-[11px] tracking-[0.16em] text-ink">
          PRIORI <span className="text-dim">/</span> <span className="text-mute">RESEARCH WORKSPACE</span>
        </div>
      </div>
      <Field label="ACTIVE PATIENT">
        {p.id}
      </Field>
      <Field label="ACTIVE VARIANT">
        {v.hgvsP} <span className="text-dim">· {regionById(v.regionId)?.label}</span>
      </Field>
      <Field label="MECHANISM">
        {mech ? <span style={{ color: MECH_COLOR[mech] }}>{MECH_WORDS[mech]}</span> : <span className="text-mute">{status === 'running' ? 'MEASURING…' : 'UNKNOWN'}</span>}
      </Field>
      <Field label="EVIDENCE LIBRARY">{library.length} ARTIFACTS</Field>
      <div className="flex-1" />
      <div className="flex items-center gap-3 px-3 border-l border-line2">
        <span className="font-mono text-[9px] tracking-[0.12em] text-gof/90 border border-dashed border-gof/40 rounded-sm px-1.5 py-[3px] whitespace-nowrap">SIMULATED · NOT CLINICAL</span>
        <button
          onClick={toggleView}
          className="h-7 px-2.5 border border-line rounded font-mono text-[10px] tracking-[0.1em] whitespace-nowrap text-mute hover:text-ink"
          title="Simple view hides secondary panels; Detailed shows the full workstation"
        >
          {simple ? 'SIMPLE VIEW' : 'DETAILED VIEW'}
        </button>
        <button
          onClick={() => (tourActive ? useTour.getState().exit() : useTour.getState().start())}
          className={cx('h-7 px-2.5 border rounded font-mono text-[10px] tracking-[0.1em] whitespace-nowrap', tourActive ? 'border-cyan text-cyan bg-cyan/10' : 'border-cyan/60 text-cyan hover:bg-cyan/10')}
          title="Step-by-step guided demo"
        >
          {tourActive ? '● GUIDED DEMO' : 'GUIDED DEMO'}
        </button>
        <button
          onClick={() => setPresentation({ active: !presenting })}
          className={cx('h-7 px-2.5 border rounded font-mono text-[10px] tracking-[0.1em] whitespace-nowrap', presenting ? 'border-cyan text-cyan bg-cyan/10' : 'border-line text-mute hover:text-ink')}
          title="Toggle presentation mode (P)"
        >
          {presenting ? '● PRESENTING' : 'PRESENT'}
        </button>
      </div>
    </header>
  );
}
