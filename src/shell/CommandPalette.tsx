import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Search } from 'lucide-react';
import { PRIMARY_PATIENT_ID, useStore } from '../state/store';
import { PATIENTS } from '../data/patients';
import { ATLAS_VARIANTS, getClassification } from '../data/variants';
import { regionById } from '../data/published';
import { MODULES } from './NavRail';
import { STEPS, goToStep } from '../state/presentation';
import { resetEvents } from './useKeyboard';
import { cx } from '../ui/primitives';
import { MECH_COLOR, MOTION } from '../ui/tokens';

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  color?: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const setOpen = useStore((s) => s.setPaletteOpen);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const base = useMemo<Command[]>(() => {
    const s = () => useStore.getState();
    const cmds: Command[] = [
      ...MODULES.map((m, i) => ({ id: `nav-${m.id}`, group: 'Navigate', label: `${m.num} — ${m.label}`, hint: String(i + 1), run: () => s().setModule(m.id) })),
      ...PATIENTS.map((p) => ({
        id: `pt-${p.id}`,
        group: 'Patients (hypothetical)',
        label: `${p.id} · ${p.presentation}`,
        hint: p.role === 'second' ? 'load as new patient' : undefined,
        run: () => (p.role === 'second' ? s().loadNewPatient(p.id) : s().setActivePatient(p.id)),
      })),
      { id: 'run-analysis', group: 'Actions', label: 'Run voltage-clamp analysis for active variant', run: () => { const st = s(); st.runAnalysis(PATIENTS.find((p) => p.id === st.activePatientId)!.variantId); st.setModule('lab'); } },
      { id: 'reuse', group: 'Actions', label: 'Run reuse assessment for active patient', run: () => { const st = s(); st.runReuseAssessment(st.activePatientId); st.setModule('reuse'); } },
      { id: 'primary', group: 'Actions', label: 'Return to primary case (PX-001)', hint: 'H', run: () => { s().setActivePatient(PRIMARY_PATIENT_ID); s().setModule('patient'); } },
      { id: 'present', group: 'Presentation', label: 'Toggle presentation mode', hint: 'P', run: () => { const on = !s().presentation.active; s().setPresentation({ active: on }); if (on) goToStep(s().presentation.step); } },
      ...STEPS.map((st, i) => ({ id: `step-${st.id}`, group: 'Presentation', label: `Go to step ${i + 1}: ${st.title}`, hint: st.cue, run: () => { s().setPresentation({ active: true }); goToStep(i); } })),
      { id: 'log', group: 'View', label: 'Open experiment log', hint: 'L', run: () => s().toggleLog(true) },
      { id: 'prov', group: 'View', label: 'Open provenance & assumptions', run: () => s().toggleProvenance(true) },
      { id: 'reset', group: 'Session', label: 'Reset demo to initial state', hint: '⇧R', run: () => resetEvents.dispatchEvent(new Event('request')) },
    ];
    return cmds;
  }, []);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matched = needle ? base.filter((c) => `${c.group} ${c.label}`.toLowerCase().includes(needle)) : base;
    // Variant lookup by ID / position / hgvs
    let variants: Command[] = [];
    if (needle.length >= 2) {
      variants = ATLAS_VARIANTS.filter((v) => v.id.toLowerCase().includes(needle) || v.hgvsP.toLowerCase().includes(needle) || String(v.position) === needle)
        .slice(0, 8)
        .map((v) => {
          const c = getClassification(v.id);
          return {
            id: `var-${v.id}`,
            group: 'Variants (hypothetical)',
            label: `${v.id} ${v.hgvsP}`,
            hint: regionById(v.regionId)?.label,
            color: MECH_COLOR[c.mechanism],
            run: () => { const st = useStore.getState(); st.selectVariant(v.id, { focus: true }); st.setModule('atlas'); },
          };
        });
    }
    return [...matched, ...variants].slice(0, 40);
  }, [q, base]);

  useEffect(() => setIdx(0), [q]);

  const exec = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    c.run();
  };

  let lastGroup = '';
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 bg-black/50 flex justify-center pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: MOTION.fast }} onMouseDown={() => setOpen(false)}>
          <motion.div
            initial={{ y: -6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -6, opacity: 0 }}
            transition={{ duration: MOTION.fast, ease: MOTION.ease }}
            className="w-[620px] max-h-[60vh] flex flex-col bg-surface border border-line rounded shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-3 h-11 border-b border-line2">
              <Search size={14} className="text-mute" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
                  if (e.key === 'Enter') exec(results[idx]);
                  if (e.key === 'Escape') setOpen(false);
                }}
                placeholder="Navigate, select patient, search variant ID or position…"
                className="flex-1 bg-transparent outline-none text-base text-ink placeholder:text-dim"
              />
              <span className="font-mono text-[10px] text-dim">ESC</span>
            </div>
            <div className="overflow-y-auto scroll-thin py-1">
              {results.length === 0 && <div className="px-4 py-6 text-xs text-dim font-mono">NO MATCHES</div>}
              {results.map((c, i) => {
                const header = c.group !== lastGroup ? c.group : null;
                lastGroup = c.group;
                return (
                  <div key={c.id}>
                    {header && <div className="px-3 pt-2 pb-1 font-mono text-[9px] tracking-[0.14em] text-dim uppercase">{header}</div>}
                    <button
                      onMouseEnter={() => setIdx(i)}
                      onClick={() => exec(c)}
                      className={cx('w-full flex items-center gap-3 px-3 h-8 text-left text-sm', i === idx ? 'bg-surface2 text-ink' : 'text-mute')}
                    >
                      {c.color && <span className="w-[7px] h-[7px] rounded-[1px] shrink-0" style={{ background: c.color }} />}
                      <span className="flex-1 truncate font-mono text-xs">{c.label}</span>
                      {c.hint && <span className="font-mono text-[10px] text-dim">{c.hint}</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
