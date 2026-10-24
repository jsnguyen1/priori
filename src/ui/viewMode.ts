// Simple view (default) hides secondary context sidebars so each screen shows one main picture
// plus its results. Detailed view restores the full research workstation.
import { create } from 'zustand';

export const useViewMode = create<{ simple: boolean; toggle: () => void }>()((set) => ({
  simple: true,
  toggle: () => set((s) => ({ simple: !s.simple })),
}));
