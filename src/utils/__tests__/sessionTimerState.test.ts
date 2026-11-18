import { describe, expect, it } from 'vitest';
import {
  formatElapsedMmSs,
  resolveInitialSessionTimerState,
  sanitizeSessionTimersMap,
  upsertBoundedSessionTimer,
  removeSessionTimerEntry,
  MAX_STORED_SESSION_TIMERS,
} from '../sessionTimerState';

describe('Session Timer State & Persistence Helpers', () => {
  it('starts at 00:00 and runs live on first entry even when scheduled duration is 45m', () => {
    const state = resolveInitialSessionTimerState({
      isFinalized: false,
      recordedSeconds: null,
    });
    expect(state).toEqual({
      elapsedSeconds: 0,
      savedSessionSeconds: null,
      timerRunning: true,
    });
    expect(formatElapsedMmSs(state.elapsedSeconds)).toBe('00:00');
  });

  it('restores recorded timing in paused state on subsequent re-entry', () => {
    const state = resolveInitialSessionTimerState({
      isFinalized: false,
      recordedSeconds: 185,
    });
    expect(state).toEqual({
      elapsedSeconds: 185,
      savedSessionSeconds: 185,
      timerRunning: false,
    });
    expect(formatElapsedMmSs(state.savedSessionSeconds!)).toBe('03:05');
  });

  it('keeps finalized sessions paused regardless of recorded time', () => {
    expect(resolveInitialSessionTimerState({ isFinalized: true, recordedSeconds: null })).toEqual({
      elapsedSeconds: 0,
      savedSessionSeconds: null,
      timerRunning: false,
    });
    expect(resolveInitialSessionTimerState({ isFinalized: true, recordedSeconds: 90 })).toEqual({
      elapsedSeconds: 90,
      savedSessionSeconds: 90,
      timerRunning: false,
    });
  });

  it('enforces bounded timer storage and cleanly removes reset entries', () => {
    let map: Record<string, number> = {};
    for (let i = 1; i <= MAX_STORED_SESSION_TIMERS + 5; i++) {
      map = upsertBoundedSessionTimer(map, `sess_${i}`, i * 10);
    }
    expect(Object.keys(map)).toHaveLength(MAX_STORED_SESSION_TIMERS);
    expect(map.sess_1).toBeUndefined();
    expect(map[`sess_${MAX_STORED_SESSION_TIMERS + 5}`]).toBe(
      (MAX_STORED_SESSION_TIMERS + 5) * 10
    );

    const afterReset = removeSessionTimerEntry(map, `sess_${MAX_STORED_SESSION_TIMERS + 5}`);
    expect(afterReset[`sess_${MAX_STORED_SESSION_TIMERS + 5}`]).toBeUndefined();

    expect(
      sanitizeSessionTimersMap({
        valid: 42.9,
        zero: 0,
        neg: -10,
        nan: Number.NaN,
        str: '45',
        '': 10,
      })
    ).toEqual({ valid: 42 });
  });
});
