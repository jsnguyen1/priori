// Guided-demo progress. Separate from the scientific store: the tour observes app state, it never
// owns it.
import { create } from 'zustand';
import { STEPS } from './steps';
import { useStore } from '../state/store';

export interface TourState {
  active: boolean;
  /** whether the welcome card has been dismissed this session */
  introSeen: boolean;
  index: number;
  /** step ids completed by the user (true) or done for them (false) */
  done: Record<string, 'user' | 'auto'>;
  misclicks: number;
  startedAt: number | null;
  finishedAt: number | null;
  start: () => void;
  exit: () => void;
  goTo: (i: number) => void;
  next: () => void;
  back: () => void;
  markDone: (id: string, how: 'user' | 'auto') => void;
  misclick: () => void;
  dismissIntro: () => void;
}

const enterStep = (i: number) => {
  const step = STEPS[i];
  if (!step) return;
  const s = useStore.getState();
  step.prepare?.(s);
  if (step.module !== useStore.getState().module) useStore.getState().setModule(step.module);
};

export const useTour = create<TourState>()((set, get) => ({
  active: false,
  introSeen: false,
  index: 0,
  done: {},
  misclicks: 0,
  startedAt: null,
  finishedAt: null,
  start: () => {
    set({ active: true, introSeen: true, index: 0, done: {}, misclicks: 0, startedAt: Date.now(), finishedAt: null });
    useStore.getState().setPresentation({ active: false });
    enterStep(0);
  },
  exit: () => set({ active: false }),
  goTo: (i) => {
    const idx = Math.max(0, Math.min(STEPS.length - 1, i));
    set({ index: idx });
    enterStep(idx);
  },
  next: () => {
    const { index } = get();
    if (index >= STEPS.length - 1) {
      set({ finishedAt: get().finishedAt ?? Date.now() });
      return;
    }
    get().goTo(index + 1);
    if (index + 1 === STEPS.length - 1) set({ finishedAt: Date.now() });
  },
  back: () => get().goTo(get().index - 1),
  markDone: (id, how) => set((s) => (s.done[id] ? s : { done: { ...s.done, [id]: how } })),
  misclick: () => set((s) => ({ misclicks: s.misclicks + 1 })),
  dismissIntro: () => set({ introSeen: true }),
}));

// A demo reset also resets the tour.
let lastNonce = useStore.getState().resetNonce;
useStore.subscribe((s) => {
  if (s.resetNonce !== lastNonce) {
    lastNonce = s.resetNonce;
    useTour.setState({ active: false, index: 0, done: {}, misclicks: 0, startedAt: null, finishedAt: null, introSeen: false });
  }
});
