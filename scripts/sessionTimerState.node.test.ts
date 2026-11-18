import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatElapsedMmSs,
  resolveInitialSessionTimerState,
  sanitizeSessionTimersMap,
  upsertBoundedSessionTimer,
  removeSessionTimerEntry,
  MAX_STORED_SESSION_TIMERS,
} from '../src/utils/sessionTimerState';

test('first entry into a draft session starts at 00:00 and runs live even when scheduled duration is 45m', () => {
  const state = resolveInitialSessionTimerState({
    isFinalized: false,
    recordedSeconds: null,
  });

  assert.deepEqual(state, {
    elapsedSeconds: 0,
    savedSessionSeconds: null,
    timerRunning: true,
  });
  assert.equal(formatElapsedMmSs(state.elapsedSeconds), '00:00');
});

test('first entry with undefined or 0 recordedSeconds starts fresh at 00:00', () => {
  assert.deepEqual(
    resolveInitialSessionTimerState({ isFinalized: false, recordedSeconds: undefined }),
    { elapsedSeconds: 0, savedSessionSeconds: null, timerRunning: true }
  );
  assert.deepEqual(
    resolveInitialSessionTimerState({ isFinalized: false, recordedSeconds: 0 }),
    { elapsedSeconds: 0, savedSessionSeconds: null, timerRunning: true }
  );
});

test('re-entering a session a second time restores recorded timing in paused state with reset option', () => {
  const state = resolveInitialSessionTimerState({
    isFinalized: false,
    recordedSeconds: 185,
  });

  assert.deepEqual(state, {
    elapsedSeconds: 185,
    savedSessionSeconds: 185,
    timerRunning: false,
  });
  assert.equal(formatElapsedMmSs(state.savedSessionSeconds!), '03:05');
});

test('finalized session never starts timer running', () => {
  const freshFinalized = resolveInitialSessionTimerState({
    isFinalized: true,
    recordedSeconds: null,
  });
  assert.equal(freshFinalized.timerRunning, false);
  assert.equal(freshFinalized.elapsedSeconds, 0);

  const recordedFinalized = resolveInitialSessionTimerState({
    isFinalized: true,
    recordedSeconds: 90,
  });
  assert.equal(recordedFinalized.timerRunning, false);
  assert.equal(recordedFinalized.savedSessionSeconds, 90);
});

test('upsertBoundedSessionTimer updates order and enforces max entries cap', () => {
  let map: Record<string, number> = {};
  for (let i = 1; i <= MAX_STORED_SESSION_TIMERS + 5; i++) {
    map = upsertBoundedSessionTimer(map, `sess_${i}`, i * 10);
  }
  assert.equal(Object.keys(map).length, MAX_STORED_SESSION_TIMERS);
  assert.equal(map.sess_1, undefined);
  assert.equal(map[`sess_${MAX_STORED_SESSION_TIMERS + 5}`], (MAX_STORED_SESSION_TIMERS + 5) * 10);

  const afterReset = removeSessionTimerEntry(map, `sess_${MAX_STORED_SESSION_TIMERS + 5}`);
  assert.equal(afterReset[`sess_${MAX_STORED_SESSION_TIMERS + 5}`], undefined);
});

test('sanitizeSessionTimersMap discards invalid or non-positive values', () => {
  const sanitized = sanitizeSessionTimersMap({
    valid: 42.9,
    zero: 0,
    neg: -15,
    nan: Number.NaN,
    str: '45',
    '': 10,
  });
  assert.deepEqual(sanitized, { valid: 42 });
});
