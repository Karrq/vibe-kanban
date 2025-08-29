import { create } from 'zustand';

interface CompactState {
  compactedSummary: string | null;
  setCompactedSummary: (summary: string | null) => void;
  clearCompactedSummary: () => void;
}

export const useCompactState = create<CompactState>((set) => ({
  compactedSummary: null,
  setCompactedSummary: (summary) => set({ compactedSummary: summary }),
  clearCompactedSummary: () => set({ compactedSummary: null }),
}));