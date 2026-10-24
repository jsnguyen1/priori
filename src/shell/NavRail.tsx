import { Activity, Atom, Dna, FlaskConical, GitFork, GanttChartSquare, Command, ScrollText, ShieldCheck } from 'lucide-react';
import type { ModuleId } from '../domain/types';
import { useStore } from '../state/store';
import { cx } from '../ui/primitives';
import { useViewMode } from '../ui/viewMode';

export const MODULES: { id: ModuleId; num: string; label: string; plain: string; icon: typeof Activity; act: string }[] = [
  { id: 'patient', num: '01', label: 'PATIENT', plain: 'PATIENT', icon: Activity, act: 'I' },
  { id: 'atlas', num: '02', label: 'ATLAS', plain: 'MUTATION MAP', icon: Dna, act: 'I' },
  { id: 'lab', num: '03', label: 'MOLECULAR LAB', plain: 'TEST IT', icon: Atom, act: 'II' },
  { id: 'therapy', num: '04', label: 'THERAPY DESIGN', plain: 'DESIGN A DRUG', icon: FlaskConical, act: 'II' },
  { id: 'reuse', num: '05', label: 'EVIDENCE REUSE', plain: 'NEXT PATIENT', icon: GitFork, act: 'III' },
  { id: 'development', num: '06', label: 'DEVELOPMENT', plain: 'TIME & COST', icon: GanttChartSquare, act: 'III' },
];

export function NavRail() {
  const module = useStore((s) => s.module);
  const simple = useViewMode((v) => v.simple);
  const setModule = useStore((s) => s.setModule);
  const setPaletteOpen = useStore((s) => s.setPaletteOpen);
  const toggleLog = useStore((s) => s.toggleLog);
  const logOpen = useStore((s) => s.logOpen);
  const toggleProvenance = useStore((s) => s.toggleProvenance);
  const provOpen = useStore((s) => s.provenanceOpen);
  return (
    <nav className="w-[64px] shrink-0 border-r border-line2 bg-bg flex flex-col items-stretch py-2" aria-label="Modules">
      {MODULES.map((m) => {
        const Icon = m.icon;
        const active = module === m.id;
        return (
          <button
            key={m.id}
            onClick={() => setModule(m.id)}
            title={`${m.num} — ${m.label}`}
            className={cx(
              'relative flex flex-col items-center justify-center gap-1 h-[58px] mx-1.5 rounded transition-colors',
              active ? 'text-cyan bg-surface' : 'text-mute hover:text-ink hover:bg-surface/60',
            )}
          >
            {active && <span className="absolute left-[-6px] top-3 bottom-3 w-[2px] bg-cyan rounded-r" />}
            <Icon size={16} strokeWidth={1.5} />
            <span className="font-mono text-[9px] tracking-[0.1em]">{m.num}</span>
            <span className="font-mono text-[7.5px] tracking-[0.06em] leading-[9px] text-center px-0.5 opacity-80">{simple ? m.plain : m.label}</span>
          </button>
        );
      })}
      <div className="flex-1" />
      <button onClick={() => toggleProvenance()} title="Provenance & assumptions" className={cx('h-9 mx-1.5 rounded flex items-center justify-center', provOpen ? 'text-cyan bg-surface' : 'text-mute hover:text-ink')}>
        <ShieldCheck size={15} strokeWidth={1.5} />
      </button>
      <button onClick={() => toggleLog()} title="Experiment log (L)" className={cx('h-9 mx-1.5 rounded flex items-center justify-center', logOpen ? 'text-cyan bg-surface' : 'text-mute hover:text-ink')}>
        <ScrollText size={15} strokeWidth={1.5} />
      </button>
      <button onClick={() => setPaletteOpen(true)} title="Command palette (⌘K)" className="h-9 mx-1.5 rounded flex items-center justify-center text-mute hover:text-ink">
        <Command size={15} strokeWidth={1.5} />
      </button>
    </nav>
  );
}
