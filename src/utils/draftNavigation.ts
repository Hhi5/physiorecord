// =======================================================================
// PhysioRecord — Pure Draft Restoration Navigation Resolver
// =======================================================================

import type { DraftRecordType } from '../types/clinical';

export type TodaySubTab = 'today' | 'eod' | 'schedule' | 'referrals_retention' | 'data_health';

export interface RestoredDraftNavTarget {
  activeNav: 'reception' | 'today' | 'schedule' | 'finance';
  todaySubTab: TodaySubTab | null;
}

/**
 * Resolves the target primary navigation tab (and TodayCommandView sub-tab in Solo Mode)
 * when restoring a recovered clinic-level draft (`invoice` or `appointment`).
 */
export function resolveRestoredDraftNavigation(
  draftType: DraftRecordType,
  isSoloMode: boolean
): RestoredDraftNavTarget {
  if (draftType === 'invoice') {
    return { activeNav: 'finance', todaySubTab: null };
  }
  if (draftType === 'appointment') {
    return isSoloMode
      ? { activeNav: 'today', todaySubTab: 'schedule' }
      : { activeNav: 'schedule', todaySubTab: null };
  }
  return {
    activeNav: isSoloMode ? 'today' : 'reception',
    todaySubTab: null,
  };
}

export const ACTIVE_MODAL_DIALOG_SELECTOR =
  '[role="dialog"], [role="alertdialog"], div.fixed.inset-0.z-50';

export interface EscapeShortcutState {
  isPrivacyCoverOpen: boolean;
  isGlobalSearchOpen: boolean;
  hasOpenDialog: boolean;
  lastEscapeAt: number;
  now: number;
  windowMs?: number;
}

export interface EscapeShortcutDecision {
  action: 'close_search' | 'ignored_modal' | 'toggle_privacy' | 'arm_double_escape';
  nextLastEscapeAt: number;
}

/**
 * Evaluates a global Escape key press so closing a modal or Global Command Palette
 * resets the double-Escape timer and never accidentally triggers Privacy Cover.
 */
export function evaluateEscapeShortcut(state: EscapeShortcutState): EscapeShortcutDecision {
  const windowMs = state.windowMs ?? 450;
  if (state.isGlobalSearchOpen) {
    return { action: 'close_search', nextLastEscapeAt: 0 };
  }
  if (!state.isPrivacyCoverOpen && state.hasOpenDialog) {
    return { action: 'ignored_modal', nextLastEscapeAt: 0 };
  }
  if (state.lastEscapeAt > 0 && state.now - state.lastEscapeAt <= windowMs) {
    return { action: 'toggle_privacy', nextLastEscapeAt: 0 };
  }
  return { action: 'arm_double_escape', nextLastEscapeAt: state.now };
}
