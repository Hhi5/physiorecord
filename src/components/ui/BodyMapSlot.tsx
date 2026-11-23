// =======================================================================
// PhysioRecord — Pluggable Body Map Slot (Phase 3.2')
// Renders null by default so neuro screening stays table-first without
// unverified body map SVGs, while preserving a clean drop-in extension
// slot for a future license-safe visual map without data-model changes.
// =======================================================================

import React from 'react';

export interface BodyMapSlotProps {
  region?: 'dermatomes' | 'pain';
  selectedRoot?: string;
  onSelectRoot?: (root: string) => void;
  renderer?: React.ReactNode;
  /** Archived inline markup kept off the active DOM unless an authentic verified asset renderer is explicitly plugged in. */
  legacyFallback?: () => React.ReactNode;
}

export const BodyMapSlot: React.FC<BodyMapSlotProps> = ({ renderer = null }) => {
  if (!renderer) {
    return null;
  }
  return renderer;
};
