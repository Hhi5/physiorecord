export interface SessionTimerState {
  elapsedSeconds: number;
  savedSessionSeconds: number | null;
  timerRunning: boolean;
}

export const MAX_STORED_SESSION_TIMERS = 250;

/**
 * Formats an elapsed second count as MM:SS (e.g. 00:00, 05:23, 62:09).
 */
export function formatElapsedMmSs(totalSec: number): string {
  const safe = Number.isFinite(totalSec) && totalSec > 0 ? Math.floor(totalSec) : 0;
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Resolves the initial timer state when opening a treatment session.
 *
 * Rules:
 * - First entry (no prior recorded timer seconds for this sessionId):
 *   Never falls back to `sessionDurationMinutes` (which is the scheduled slot duration, e.g. 45m).
 *   Starts fresh at `00:00` with `timerRunning = !isFinalized`.
 * - Subsequent entry (recordedSeconds > 0 stored from an earlier visit/pause/save):
 *   Restores the recorded timing in paused state (`savedSessionSeconds = recordedSeconds`,
 *   `elapsedSeconds = recordedSeconds`, `timerRunning = false`) so the clinician sees the
 *   recorded session duration with options to resume or reset.
 */
export function resolveInitialSessionTimerState(params: {
  isFinalized: boolean;
  recordedSeconds: number | null | undefined;
}): SessionTimerState {
  const { isFinalized, recordedSeconds } = params;
  const validRecorded =
    typeof recordedSeconds === 'number' && Number.isFinite(recordedSeconds) && recordedSeconds > 0
      ? Math.floor(recordedSeconds)
      : null;

  if (validRecorded !== null) {
    return {
      elapsedSeconds: validRecorded,
      savedSessionSeconds: validRecorded,
      timerRunning: false,
    };
  }

  return {
    elapsedSeconds: 0,
    savedSessionSeconds: null,
    timerRunning: !isFinalized,
  };
}

/**
 * Sanitizes a raw sessionTimers map loaded from encrypted storage.
 */
export function sanitizeSessionTimersMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const entries = Object.entries(raw as Record<string, unknown>)
    .filter(([key, val]) => {
      return (
        typeof key === 'string' &&
        key.trim().length > 0 &&
        typeof val === 'number' &&
        Number.isFinite(val) &&
        val > 0
      );
    })
    .slice(-MAX_STORED_SESSION_TIMERS)
    .map(([key, val]) => [key, Math.floor(val as number)] as const);

  return Object.fromEntries(entries);
}

/**
 * Returns an updated bounded sessionTimers map with the session's latest elapsed seconds.
 * Moves the updated key to the end so older entries are evicted first when over the cap.
 */
export function upsertBoundedSessionTimer(
  existing: Record<string, number> | undefined,
  sessionId: string,
  seconds: number
): Record<string, number> {
  const cleanId = sessionId.trim();
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const next: Record<string, number> = { ...(existing || {}) };

  if (!cleanId || safeSeconds <= 0) {
    return next;
  }

  delete next[cleanId];
  next[cleanId] = safeSeconds;

  const keys = Object.keys(next);
  if (keys.length > MAX_STORED_SESSION_TIMERS) {
    const excess = keys.length - MAX_STORED_SESSION_TIMERS;
    for (let i = 0; i < excess; i++) {
      delete next[keys[i]];
    }
  }
  return next;
}

/**
 * Removes a session entry from the sessionTimers map (e.g. when the user resets the timer).
 */
export function removeSessionTimerEntry(
  existing: Record<string, number> | undefined,
  sessionId: string
): Record<string, number> {
  const next: Record<string, number> = { ...(existing || {}) };
  delete next[sessionId.trim()];
  return next;
}
