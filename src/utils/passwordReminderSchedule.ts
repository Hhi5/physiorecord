// =======================================================================
// PhysioRecord — Signal-Style Spaced-Repetition Password Memory Reminders
// Gently prompts unlocked users to confirm their master password at
// expanding intervals (1d -> 3d -> 7d -> 14d -> 30d) so passwords stay
// fresh in memory and forgetfulness is caught BEFORE a lockout occurs.
// =======================================================================

export const PASSWORD_REMINDER_STORAGE_KEY = 'physiorecord_password_reminder_v1';

/** Expanding intervals in days: 1 day -> 3 days -> 1 week -> 2 weeks -> monthly */
export const PASSWORD_REMINDER_INTERVALS_DAYS: readonly number[] = [1, 3, 7, 14, 30];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PasswordReminderState {
  enabled: boolean;
  stageIndex: number; // 0..4 indexing into PASSWORD_REMINDER_INTERVALS_DAYS
  lastVerifiedAt: string; // ISO string
  nextDueAt: string; // ISO string
  snoozedUntil: string | null; // ISO string or null
}

function clampStageIndex(idx: number): number {
  if (!Number.isFinite(idx) || idx < 0) return 0;
  return Math.min(Math.floor(idx), PASSWORD_REMINDER_INTERVALS_DAYS.length - 1);
}

export function getReminderIntervalDays(stageIndex: number): number {
  return PASSWORD_REMINDER_INTERVALS_DAYS[clampStageIndex(stageIndex)] ?? 30;
}

function buildDefaultState(nowMs: number = Date.now()): PasswordReminderState {
  const intervalDays = PASSWORD_REMINDER_INTERVALS_DAYS[0];
  return {
    enabled: true,
    stageIndex: 0,
    lastVerifiedAt: new Date(nowMs).toISOString(),
    nextDueAt: new Date(nowMs + intervalDays * DAY_MS).toISOString(),
    snoozedUntil: null,
  };
}

function persistState(state: PasswordReminderState): PasswordReminderState {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(PASSWORD_REMINDER_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota/privacy-mode errors gracefully
    }
  }
  return state;
}

/**
 * Load persisted password reminder schedule, initializing cleanly on first use
 * with nextDueAt set 1 day ahead (so new vaults are never interrupted on Day 0).
 */
export function loadPasswordReminderState(nowMs: number = Date.now()): PasswordReminderState {
  if (typeof localStorage === 'undefined') {
    return buildDefaultState(nowMs);
  }
  try {
    const raw = localStorage.getItem(PASSWORD_REMINDER_STORAGE_KEY);
    if (!raw) {
      return persistState(buildDefaultState(nowMs));
    }
    const parsed = JSON.parse(raw) as Partial<PasswordReminderState>;
    const stageIndex = clampStageIndex(typeof parsed.stageIndex === 'number' ? parsed.stageIndex : 0);
    const enabled = typeof parsed.enabled === 'boolean' ? parsed.enabled : true;
    const lastVerifiedAt =
      typeof parsed.lastVerifiedAt === 'string' && !Number.isNaN(Date.parse(parsed.lastVerifiedAt))
        ? parsed.lastVerifiedAt
        : new Date(nowMs).toISOString();
    const nextDueAt =
      typeof parsed.nextDueAt === 'string' && !Number.isNaN(Date.parse(parsed.nextDueAt))
        ? parsed.nextDueAt
        : new Date(nowMs + getReminderIntervalDays(stageIndex) * DAY_MS).toISOString();
    const snoozedUntil =
      typeof parsed.snoozedUntil === 'string' && !Number.isNaN(Date.parse(parsed.snoozedUntil))
        ? parsed.snoozedUntil
        : null;

    return {
      enabled,
      stageIndex,
      lastVerifiedAt,
      nextDueAt,
      snoozedUntil,
    };
  } catch {
    return persistState(buildDefaultState(nowMs));
  }
}

/**
 * Returns true if the gentle password memory check banner should be surfaced.
 */
export function isPasswordReminderDue(
  state: PasswordReminderState,
  nowMs: number = Date.now()
): boolean {
  if (!state.enabled) return false;
  if (state.snoozedUntil) {
    const snoozeMs = Date.parse(state.snoozedUntil);
    if (Number.isFinite(snoozeMs) && nowMs < snoozeMs) {
      return false;
    }
  }
  const dueMs = Date.parse(state.nextDueAt);
  if (!Number.isFinite(dueMs)) return false;
  return nowMs >= dueMs;
}

/**
 * Called when the user confirms their master password during a memory check
 * (or unlocks manually using their master password after the check was due).
 * Advances along the Signal spaced-repetition ladder (1 -> 3 -> 7 -> 14 -> 30 days).
 */
export function recordPasswordMemoryVerified(nowMs: number = Date.now()): PasswordReminderState {
  const current = loadPasswordReminderState(nowMs);
  const nextStage = clampStageIndex(current.stageIndex + 1);
  const nextIntervalDays = getReminderIntervalDays(nextStage);
  return persistState({
    ...current,
    stageIndex: nextStage,
    lastVerifiedAt: new Date(nowMs).toISOString(),
    nextDueAt: new Date(nowMs + nextIntervalDays * DAY_MS).toISOString(),
    snoozedUntil: null,
  });
}

/**
 * Called whenever a brand-new master password is created, changed, or reset.
 * Resets the spaced-repetition ladder back to Stage 0 (first gentle check in 1 day)
 * so the new password quickly moves into long-term memory.
 */
export function recordPasswordChangedSchedule(nowMs: number = Date.now()): PasswordReminderState {
  const current = loadPasswordReminderState(nowMs);
  const firstIntervalDays = PASSWORD_REMINDER_INTERVALS_DAYS[0];
  return persistState({
    ...current,
    stageIndex: 0,
    lastVerifiedAt: new Date(nowMs).toISOString(),
    nextDueAt: new Date(nowMs + firstIntervalDays * DAY_MS).toISOString(),
    snoozedUntil: null,
  });
}

/**
 * Snooze the gentle reminder for N days (default 2 days) without resetting progress.
 */
export function snoozePasswordReminderState(
  days: number = 2,
  nowMs: number = Date.now()
): PasswordReminderState {
  const current = loadPasswordReminderState(nowMs);
  const safeDays = Math.max(1, Math.min(30, days));
  return persistState({
    ...current,
    snoozedUntil: new Date(nowMs + safeDays * DAY_MS).toISOString(),
  });
}

/**
 * Toggle spaced-repetition password reminders on/off from Security Settings.
 */
export function setPasswordReminderEnabledState(
  enabled: boolean,
  nowMs: number = Date.now()
): PasswordReminderState {
  const current = loadPasswordReminderState(nowMs);
  const nextIntervalDays = getReminderIntervalDays(current.stageIndex);
  const dueMs = Date.parse(current.nextDueAt);
  const nextDueAt =
    enabled && (!Number.isFinite(dueMs) || dueMs <= nowMs)
      ? new Date(nowMs + nextIntervalDays * DAY_MS).toISOString()
      : current.nextDueAt;

  return persistState({
    ...current,
    enabled,
    nextDueAt,
    snoozedUntil: enabled ? null : current.snoozedUntil,
  });
}
