// Global keyboard shortcuts.
//   → / PageDown / Space (presenting)  next narrative step
//   ← / PageUp                          previous step
//   P                                   toggle presentation mode
//   Shift+R                             reset demo (with confirmation)
//   H                                   return to primary case (PX-001)
//   ⌘K / Ctrl+K                         command palette
//   L                                   experiment log
//   1–6                                 jump to module
//   Esc                                 close overlays
import { useEffect } from 'react';
import { PRIMARY_PATIENT_ID, useStore } from '../state/store';
import { STEPS, goToStep, nextStep, prevStep } from '../state/presentation';
import { presentationEvents } from './PresentationOverlay';
import { MODULES } from './NavRail';

export const resetEvents = new EventTarget();

const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        s.setPaletteOpen(!s.paletteOpen);
        return;
      }
      if (e.key === 'Escape') {
        if (s.paletteOpen) s.setPaletteOpen(false);
        else if (s.logOpen) s.toggleLog(false);
        else if (s.provenanceOpen) s.toggleProvenance(false);
        presentationEvents.dispatchEvent(new Event('escape'));
        return;
      }
      if (isTyping(e) || s.paletteOpen || e.metaKey || e.ctrlKey || e.altKey) return;

      const presenting = s.presentation.active;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || (presenting && e.key === ' ')) {
        if (!presenting) return;
        e.preventDefault();
        const r = nextStep();
        if (r.blocked) presentationEvents.dispatchEvent(new CustomEvent('blocked', { detail: r.blocked }));
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (!presenting) return;
        e.preventDefault();
        prevStep();
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'p') {
        const turningOn = !presenting;
        s.setPresentation({ active: turningOn });
        if (turningOn) goToStep(Math.min(s.presentation.step, STEPS.length - 1));
        return;
      }
      if (k === 'r' && e.shiftKey) {
        resetEvents.dispatchEvent(new Event('request'));
        return;
      }
      if (k === 'h') {
        s.setActivePatient(PRIMARY_PATIENT_ID);
        if (presenting) goToStep(0);
        else s.setModule('patient');
        return;
      }
      if (k === 'l') {
        s.toggleLog();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= MODULES.length) s.setModule(MODULES[n - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
