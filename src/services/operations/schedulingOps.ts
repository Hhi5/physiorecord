// =======================================================================
// PhysioRecord — Appointments, Recurring Weekly Schedules & Waiting List
// =======================================================================

import type {
  AppointmentConflictResult,
  AppointmentStatus,
  CancellationNoShowStats,
  ClinicAppointment,
  ClosedDateRangeEntry,
  RecurringPatientSchedule,
  WaitingListEntry,
  WaitlistMatchSuggestion,
  WeeklyBreakWindow,
} from '../../types/clinicManagement';
import { getWeekdayFromDateStr, localDate } from '../../utils/date';
import { broadcastVaultEvent } from '../../utils/vaultEvents';
import { parseHhMmToMinutes } from './operationsConstants';
import type { OperationsRuntime } from './operationsTypes';
import { getClosedDateRangesOps, getWeeklyBreaksOps } from './settingsOps';

export function getClosedDateMatchesForDateOps(
  rt: OperationsRuntime,
  dateStr: string
): ClosedDateRangeEntry[] {
  const enabled = rt.getCache().moduleFlags.enableClosedDaysBreaks ?? true;
  if (!dateStr || !enabled) return [];
  return getClosedDateRangesOps(rt).filter(
    (entry) => dateStr >= entry.startDate && dateStr <= (entry.endDate || entry.startDate)
  );
}

export function getWeeklyBreakConflictsForSlotOps(
  rt: OperationsRuntime,
  dateStr: string,
  startTime: string,
  durationMinutes: number
): WeeklyBreakWindow[] {
  const enabled = rt.getCache().moduleFlags.enableClosedDaysBreaks ?? true;
  if (!dateStr || !enabled) return [];
  const weekday = getWeekdayFromDateStr(dateStr);
  if (weekday === null) return [];
  const slotStart = parseHhMmToMinutes(startTime);
  const slotEnd = slotStart + Math.max(5, durationMinutes || 45);
  return getWeeklyBreaksOps(rt).filter((brk) => {
    if (!brk.isActive || !brk.weekdays.includes(weekday)) return false;
    const brkStart = parseHhMmToMinutes(brk.startTime);
    const brkEnd = parseHhMmToMinutes(brk.endTime);
    return slotStart < brkEnd && brkStart < slotEnd;
  });
}

// ---------------------------------------------------------------------
// Appointments & Recurring Weekly Schedules (Encrypted Dexie Single-Record)
// ---------------------------------------------------------------------
export function getAppointmentsOps(rt: OperationsRuntime): ClinicAppointment[] {
  return rt.getCache().appointments.filter((a) => Boolean(a.patientId));
}

export function saveAppointmentOps(
  rt: OperationsRuntime,
  appt: Omit<ClinicAppointment, 'id'> & { id?: string }
): ClinicAppointment {
  if (!appt.patientId || !appt.patientId.trim()) {
    throw new Error('Patient ID is required for every clinic appointment.');
  }
  const cache = rt.getCache();
  const existing = appt.id ? cache.appointments.find((a) => a.id === appt.id) : undefined;
  const now = new Date().toISOString();
  const record: ClinicAppointment = {
    ...appt,
    patientId: appt.patientId.trim(),
    id: appt.id || `appt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    updatedAt: now,
    version: (existing?.version || 0) + 1,
  };

  const idx = cache.appointments.findIndex((a) => a.id === record.id);
  if (idx >= 0) {
    cache.appointments[idx] = record;
  } else {
    cache.appointments = [record, ...cache.appointments];
  }

  void rt.trackWrite(
    rt.putRecordEncrypted('appointments', record.id, [], record, { patientId: record.patientId })
  ).catch(() => undefined);

  rt.appendAuditLog({
    actionType: 'appointment_created',
    entityType: 'appointment',
    entityId: record.id,
    patientId: record.patientId,
    episodeId: record.episodeId,
    summaryAr: `حجز موعد جديد للمريض: ${record.patientName} (${record.date} الساعة ${record.startTime})`,
    summaryEn: `Scheduled appointment for ${record.patientName} (${record.date} at ${record.startTime})`,
  });
  rt.notifyListeners();
  return record;
}

export function markSkippedRecurringDateOps(
  rt: OperationsRuntime,
  scheduleId: string,
  date: string
): void {
  const id = `${scheduleId}_${date}`;
  const cache = rt.getCache();
  if (cache.recurringSkippedDates.has(id)) return;
  const rec = {
    scheduleId,
    date,
    updatedAt: new Date().toISOString(),
    version: 1,
  };
  cache.recurringSkippedDates.set(id, rec);
  void rt.trackWrite(
    rt.putRecordEncrypted(
      'recurringSkippedDates',
      id,
      [],
      rec,
      { scheduleId },
      { skipConcurrencyCheck: true }
    )
  ).catch(() => undefined);
}

export function unmarkSkippedRecurringDateOps(
  rt: OperationsRuntime,
  scheduleId: string,
  date: string
): void {
  const id = `${scheduleId}_${date}`;
  const cache = rt.getCache();
  if (!cache.recurringSkippedDates.has(id)) return;
  cache.recurringSkippedDates.delete(id);
  void rt.deleteRecordEncrypted('recurringSkippedDates', id).catch(() => undefined);
}

export function restoreAppointmentOps(
  rt: OperationsRuntime,
  appt: ClinicAppointment
): ClinicAppointment[] {
  if (appt.recurringScheduleId) {
    unmarkSkippedRecurringDateOps(rt, appt.recurringScheduleId, appt.date);
  }
  const cache = rt.getCache();
  const rest = cache.appointments.filter((a) => a.id !== appt.id);
  cache.appointments = [appt, ...rest];
  void rt.trackWrite(
    rt.putRecordEncrypted(
      'appointments',
      appt.id,
      [],
      appt,
      { patientId: appt.patientId },
      { skipConcurrencyCheck: true }
    )
  ).catch(() => undefined);
  rt.notifyListeners();
  return getAppointmentsOps(rt);
}

export function detectAppointmentConflictsOps(
  rt: OperationsRuntime,
  candidate: {
    id?: string;
    date: string;
    startTime: string;
    durationMinutes: number;
    therapistName: string;
    roomOrBed?: string;
    appointmentMode?: 'clinic' | 'home_visit';
    travelBufferBeforeMin?: number;
    travelBufferAfterMin?: number;
  }
): AppointmentConflictResult {
  const candCoreStart = parseHhMmToMinutes(candidate.startTime);
  const candCoreEnd = candCoreStart + Math.max(5, candidate.durationMinutes || 45);
  const candBufStart = candCoreStart - Math.max(0, candidate.travelBufferBeforeMin || 0);
  const candBufEnd = candCoreEnd + Math.max(0, candidate.travelBufferAfterMin || 0);
  const allOverlaps: ClinicAppointment[] = [];
  const therapistConflicts: ClinicAppointment[] = [];
  const roomConflicts: ClinicAppointment[] = [];
  const travelBufferConflicts: ClinicAppointment[] = [];
  const candRoom = (candidate.roomOrBed || '').trim().toLowerCase();
  const candTherapist = (candidate.therapistName || '').trim().toLowerCase();

  for (const appt of rt.getCache().appointments) {
    if (candidate.id && appt.id === candidate.id) continue;
    if (appt.date !== candidate.date) continue;
    if (appt.status === 'cancelled' || appt.status === 'no_show') continue;

    const existCoreStart = parseHhMmToMinutes(appt.startTime);
    const existCoreEnd = existCoreStart + Math.max(5, appt.durationMinutes || 45);
    const existBufStart = existCoreStart - Math.max(0, appt.travelBufferBeforeMin || 0);
    const existBufEnd = existCoreEnd + Math.max(0, appt.travelBufferAfterMin || 0);

    const coreOverlaps = candCoreStart < existCoreEnd && existCoreStart < candCoreEnd;
    const bufferedOverlaps = candBufStart < existBufEnd && existBufStart < candBufEnd;
    if (!bufferedOverlaps) continue;

    if (!coreOverlaps) {
      travelBufferConflicts.push(appt);
      continue;
    }

    allOverlaps.push(appt);

    if (candTherapist && appt.therapistName.trim().toLowerCase() === candTherapist) {
      therapistConflicts.push(appt);
    }
    if (candRoom && appt.roomOrBed && appt.roomOrBed.trim().toLowerCase() === candRoom) {
      roomConflicts.push(appt);
    }
  }

  const closedDayMatches = getClosedDateMatchesForDateOps(rt, candidate.date);
  const breakConflicts = getWeeklyBreakConflictsForSlotOps(
    rt,
    candidate.date,
    candidate.startTime,
    candidate.durationMinutes
  );

  return {
    hasConflict: allOverlaps.length > 0,
    allOverlaps,
    therapistConflicts,
    roomConflicts,
    travelBufferConflicts,
    breakConflicts,
    closedDayMatches,
    allowConcurrent: true,
  };
}

export function suggestWaitlistForFreedSlotOps(
  rt: OperationsRuntime,
  freedAppt: {
    date: string;
    startTime: string;
    therapistName?: string;
  }
): WaitlistMatchSuggestion[] {
  const waitlist = getWaitingListOps(rt);
  if (waitlist.length === 0) return [];
  const freedWeekday = getWeekdayFromDateStr(freedAppt.date);
  const weekdayKeywords: Record<number, string[]> = {
    0: ['أحد', 'احد', 'sun'],
    1: ['إثنين', 'اثنين', 'mon'],
    2: ['ثلاثاء', 'tue'],
    3: ['أربعاء', 'اربعاء', 'wed'],
    4: ['خميس', 'thu'],
    5: ['جمعة', 'fri'],
    6: ['سبت', 'sat'],
  };
  const [hourStr] = (freedAppt.startTime || '12:00').split(':');
  const hour = parseInt(hourStr || '12', 10) || 12;
  const slotWindow = hour < 12 ? 'morning' : hour >= 16 ? 'evening' : 'any';

  return waitlist
    .map((entry) => {
      let score = entry.priority === 'urgent' ? 30 : entry.priority === 'high' ? 20 : 10;
      const reasonsAr: string[] = [];
      const reasonsEn: string[] = [];

      if (entry.priority === 'urgent') {
        reasonsAr.push('حالة عاجلة');
        reasonsEn.push('Urgent priority');
      } else if (entry.priority === 'high') {
        reasonsAr.push('أولوية عالية');
        reasonsEn.push('High priority');
      }

      if (freedWeekday !== null) {
        const kws = weekdayKeywords[freedWeekday] || [];
        const prefLower = (entry.preferredDays || '').toLowerCase();
        if (kws.some((kw) => prefLower.includes(kw))) {
          score += 15;
          reasonsAr.push('يطابق اليوم المفضل');
          reasonsEn.push('Matches preferred day');
        }
      }

      if (entry.preferredTimeWindow === 'any' || entry.preferredTimeWindow === slotWindow) {
        score += 10;
        reasonsAr.push('يطابق الفترة الزمنية');
        reasonsEn.push('Matches time window');
      }

      if (
        entry.preferredTherapist &&
        freedAppt.therapistName &&
        entry.preferredTherapist === freedAppt.therapistName
      ) {
        score += 12;
        reasonsAr.push('نفس المعالج');
        reasonsEn.push('Same therapist');
      }

      return {
        entry,
        score,
        matchReasonAr: reasonsAr.join(' · ') || 'في قائمة الانتظار',
        matchReasonEn: reasonsEn.join(' · ') || 'Active waitlist patient',
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export function getCancellationAndNoShowStatsOps(
  rt: OperationsRuntime,
  dateFrom?: string,
  dateTo?: string
): CancellationNoShowStats {
  const scoped = getAppointmentsOps(rt).filter((a) => {
    if (dateFrom && a.date < dateFrom) return false;
    return !(dateTo && a.date > dateTo);
  });
  const total = scoped.length;
  const completed = scoped.filter((a) => a.status === 'completed').length;
  const cancelled = scoped.filter((a) => a.status === 'cancelled').length;
  const noShow = scoped.filter((a) => a.status === 'no_show').length;
  const activePending = scoped.filter(
    (a) => a.status === 'scheduled' || a.status === 'arrived' || a.status === 'in_session'
  ).length;

  const closedTotal = completed + cancelled + noShow;
  const denom = closedTotal > 0 ? closedTotal : total;
  const pct = (n: number) => (denom > 0 ? Math.round((n / denom) * 100) : 0);

  const tallyReasons = (items: string[]) => {
    const counts = new Map<string, number>();
    for (const r of items) {
      const clean = r.trim();
      if (!clean) continue;
      counts.set(clean, (counts.get(clean) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  };

  const topCancellationReasons = tallyReasons(
    scoped
      .filter((a) => a.status === 'cancelled')
      .map((a) => a.cancellationReason || 'غير محدد / Unspecified')
  );
  const topNoShowReasons = tallyReasons(
    scoped
      .filter((a) => a.status === 'no_show')
      .map((a) => a.noShowReason || 'غير محدد / Unspecified')
  );

  return {
    total,
    completed,
    cancelled,
    noShow,
    activePending,
    attendanceRatePercent: pct(completed),
    cancellationRatePercent: pct(cancelled),
    noShowRatePercent: pct(noShow),
    topCancellationReasons,
    topNoShowReasons,
  };
}

export function updateAppointmentStatusOps(
  rt: OperationsRuntime,
  id: string,
  status: AppointmentStatus,
  reason?: string
): ClinicAppointment[] {
  let target: ClinicAppointment | undefined;
  const cache = rt.getCache();
  const now = new Date().toISOString();
  const cleanReason = reason?.trim() || undefined;

  cache.appointments = cache.appointments.map((a) => {
    if (a.id !== id) return a;
    target = {
      ...a,
      status,
      statusUpdatedAt: now,
      ...(status === 'cancelled' && cleanReason ? { cancellationReason: cleanReason } : {}),
      ...(status === 'no_show' && cleanReason ? { noShowReason: cleanReason } : {}),
      updatedAt: now,
      version: (a.version || 0) + 1,
    };
    return target;
  });

  if (target) {
    void rt.trackWrite(
      rt.putRecordEncrypted('appointments', target.id, [], target, { patientId: target.patientId })
    ).catch(() => undefined);
    rt.appendAuditLog({
      actionType: 'appointment_status_changed',
      entityType: 'appointment',
      entityId: id,
      patientId: target.patientId,
      episodeId: target.episodeId,
      summaryAr: cleanReason
        ? `تحديث حالة موعد ${target.patientName} إلى: ${status} (${cleanReason})`
        : `تحديث حالة موعد ${target.patientName} إلى: ${status}`,
      summaryEn: cleanReason
        ? `Updated appointment status for ${target.patientName} to ${status} (${cleanReason})`
        : `Updated appointment status for ${target.patientName} to ${status}`,
    });
  }
  rt.notifyListeners();
  return getAppointmentsOps(rt);
}

export function deleteAppointmentOps(
  rt: OperationsRuntime,
  id: string,
  options?: { bypassRecycleBin?: boolean; deletedAtIso?: string }
): ClinicAppointment[] {
  const cache = rt.getCache();
  const target = cache.appointments.find((a) => a.id === id);
  if (target?.recurringScheduleId) {
    markSkippedRecurringDateOps(rt, target.recurringScheduleId, target.date);
  }
  if (target && !target.isDemo && !options?.bypassRecycleBin && rt.isTrashRecycleBinEnabled()) {
    rt.moveRecordToRecycleBin({
      itemType: 'appointment',
      originalId: target.id,
      titleAr: `${target.patientName} — ${target.date} ${target.startTime}`,
      titleEn: `${target.patientName} — ${target.date} ${target.startTime}`,
      subtitleAr: target.therapistName || target.notes || '',
      subtitleEn: target.therapistName || target.notes || '',
      payload: { ...target },
      nowIso: options?.deletedAtIso,
    });
  }
  cache.appointments = cache.appointments.filter((a) => a.id !== id);
  void rt.deleteRecordEncrypted('appointments', id).catch(() => undefined);
  rt.notifyListeners();
  return getAppointmentsOps(rt);
}

export function getRecurringSchedulesOps(rt: OperationsRuntime): RecurringPatientSchedule[] {
  return rt
    .getCache()
    .recurringSchedules.filter(
      (r) => Boolean(r.patientId) && Array.isArray(r.weekdays) && r.weekdays.length > 0
    );
}

export function getRecurringSchedulesForPatientOps(
  rt: OperationsRuntime,
  patientId: string
): RecurringPatientSchedule[] {
  return getRecurringSchedulesOps(rt).filter((r) => r.patientId === patientId);
}

export function saveRecurringScheduleOps(
  rt: OperationsRuntime,
  input: Omit<RecurringPatientSchedule, 'id' | 'createdAt'> & { id?: string }
): RecurringPatientSchedule {
  if (!input.patientId || !input.patientId.trim()) {
    throw new Error('Patient ID is required for every recurring schedule.');
  }
  if (!input.weekdays || input.weekdays.length === 0) {
    throw new Error('At least one weekday must be selected.');
  }
  const cache = rt.getCache();
  const existing = input.id
    ? cache.recurringSchedules.find((r) => r.id === input.id)
    : undefined;
  const record: RecurringPatientSchedule = {
    ...input,
    patientId: input.patientId.trim(),
    id: input.id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: existing?.createdAt || localDate(),
    updatedAt: new Date().toISOString(),
    version: (existing?.version || 0) + 1,
  };

  const idx = cache.recurringSchedules.findIndex((r) => r.id === record.id);
  if (idx >= 0) {
    cache.recurringSchedules[idx] = record;
  } else {
    cache.recurringSchedules = [record, ...cache.recurringSchedules];
  }

  void rt.trackWrite(
    rt.putRecordEncrypted('recurringSchedules', record.id, [], record, {
      patientId: record.patientId,
    })
  ).catch(() => undefined);

  const today = localDate();
  ensureRecurringAppointmentsForDateOps(rt, today);
  if (record.startDate && record.startDate !== today) {
    ensureRecurringAppointmentsForDateOps(rt, record.startDate);
  }
  rt.notifyListeners();
  return record;
}

export function toggleRecurringScheduleActiveOps(
  rt: OperationsRuntime,
  id: string
): RecurringPatientSchedule[] {
  let becameActive = false;
  let updatedRule: RecurringPatientSchedule | undefined;
  const cache = rt.getCache();

  cache.recurringSchedules = cache.recurringSchedules.map((r) => {
    if (r.id !== id) return r;
    becameActive = !r.isActive;
    updatedRule = {
      ...r,
      isActive: !r.isActive,
      updatedAt: new Date().toISOString(),
      version: (r.version || 0) + 1,
    };
    return updatedRule;
  });

  if (updatedRule) {
    void rt.trackWrite(
      rt.putRecordEncrypted('recurringSchedules', updatedRule.id, [], updatedRule, {
        patientId: updatedRule.patientId,
      })
    ).catch(() => undefined);
  }

  const today = localDate();
  if (!becameActive) {
    const removed = cache.appointments.filter(
      (a) => a.recurringScheduleId === id && a.status === 'scheduled' && a.date >= today
    );
    cache.appointments = cache.appointments.filter(
      (a) => !(a.recurringScheduleId === id && a.status === 'scheduled' && a.date >= today)
    );
    for (const r of removed) {
      void rt.deleteRecordEncrypted('appointments', r.id).catch(() => undefined);
    }
  } else {
    ensureRecurringAppointmentsForDateOps(rt, today);
  }

  rt.notifyListeners();
  return getRecurringSchedulesOps(rt);
}

export function deleteRecurringScheduleOps(
  rt: OperationsRuntime,
  id: string
): RecurringPatientSchedule[] {
  const cache = rt.getCache();
  cache.recurringSchedules = cache.recurringSchedules.filter((r) => r.id !== id);
  void rt.deleteRecordEncrypted('recurringSchedules', id).catch(() => undefined);

  const today = localDate();
  const removedAppts = cache.appointments.filter(
    (a) => a.recurringScheduleId === id && a.status === 'scheduled' && a.date >= today
  );
  cache.appointments = cache.appointments.filter(
    (a) => !(a.recurringScheduleId === id && a.status === 'scheduled' && a.date >= today)
  );
  for (const r of removedAppts) {
    void rt.deleteRecordEncrypted('appointments', r.id).catch(() => undefined);
  }

  for (const key of Array.from(cache.recurringSkippedDates.keys())) {
    if (key.startsWith(`${id}_`)) {
      cache.recurringSkippedDates.delete(key);
      void rt.deleteRecordEncrypted('recurringSkippedDates', key).catch(() => undefined);
    }
  }

  rt.notifyListeners();
  return getRecurringSchedulesOps(rt);
}

export function restoreRecurringScheduleOps(
  rt: OperationsRuntime,
  rule: RecurringPatientSchedule
): RecurringPatientSchedule[] {
  const cache = rt.getCache();
  const rest = cache.recurringSchedules.filter((r) => r.id !== rule.id);
  cache.recurringSchedules = [rule, ...rest];
  void rt.trackWrite(
    rt.putRecordEncrypted(
      'recurringSchedules',
      rule.id,
      [],
      rule,
      { patientId: rule.patientId },
      { skipConcurrencyCheck: true }
    )
  ).catch(() => undefined);
  ensureRecurringAppointmentsForDateOps(rt, localDate());
  rt.notifyListeners();
  return getRecurringSchedulesOps(rt);
}

export function ensureRecurringAppointmentsForDateOps(
  rt: OperationsRuntime,
  targetDate: string
): ClinicAppointment[] {
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return getAppointmentsOps(rt);
  }
  if (getClosedDateMatchesForDateOps(rt, targetDate).length > 0) {
    return getAppointmentsOps(rt);
  }
  const [y, m, d] = targetDate.split('-').map(Number);
  const weekday = new Date(y, m - 1, d, 12, 0, 0).getDay() as ClinicAppointment extends never
    ? never
    : number;

  const cache = rt.getCache();
  const rules = getRecurringSchedulesOps(rt);
  const existing = getAppointmentsOps(rt);
  const created: ClinicAppointment[] = [];

  for (const rule of rules) {
    if (!rule.isActive) continue;
    if (!rule.weekdays.includes(weekday as RecurringPatientSchedule['weekdays'][number])) continue;
    if (rule.startDate && targetDate < rule.startDate) continue;
    if (rule.endDate && targetDate > rule.endDate) continue;
    if (cache.recurringSkippedDates.has(`${rule.id}_${targetDate}`)) continue;

    const alreadyScheduled = existing.some(
      (a) =>
        (a.recurringScheduleId === rule.id && a.date === targetDate) ||
        (a.patientId === rule.patientId &&
          a.date === targetDate &&
          a.startTime === rule.startTime)
    );
    if (alreadyScheduled) continue;

    const newAppt: ClinicAppointment = {
      id: `appt_rec_${rule.id}_${targetDate}`,
      patientId: rule.patientId,
      isDemo: rule.isDemo,
      patientName: rule.patientName,
      patientPhone: rule.patientPhone,
      episodeId: rule.episodeId,
      episodeTitle: rule.episodeTitle,
      therapistName: rule.therapistName,
      date: targetDate,
      startTime: rule.startTime,
      durationMinutes: rule.durationMinutes,
      visitType: rule.visitType,
      appointmentMode: rule.appointmentMode,
      locationId: rule.locationId,
      homeVisitAddress: rule.homeVisitAddress,
      travelBufferBeforeMin: rule.travelBufferBeforeMin,
      travelBufferAfterMin: rule.travelBufferAfterMin,
      status: 'scheduled',
      roomOrBed: rule.roomOrBed,
      notes: rule.notes,
      recurringScheduleId: rule.id,
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    created.push(newAppt);
    void rt.trackWrite(
      rt.putRecordEncrypted(
        'appointments',
        newAppt.id,
        [],
        newAppt,
        { patientId: newAppt.patientId },
        { skipConcurrencyCheck: true, skipBroadcast: true }
      )
    ).catch(() => undefined);
  }

  if (created.length > 0) {
    cache.appointments = [...created, ...cache.appointments];
    broadcastVaultEvent({ type: 'OPERATIONS_UPDATED' });
  }
  return getAppointmentsOps(rt);
}

// ---------------------------------------------------------------------
// Waiting List
// ---------------------------------------------------------------------
export function getWaitingListOps(
  rt: OperationsRuntime,
  includeCompleted = false
): WaitingListEntry[] {
  return rt
    .getCache()
    .waitingList.filter(
      (w) => Boolean(w.patientId) && (includeCompleted || w.status !== 'completed')
    );
}

export function addWaitingListEntryOps(
  rt: OperationsRuntime,
  entry: Omit<WaitingListEntry, 'id' | 'addedAt'>
): WaitingListEntry[] {
  if (!entry.patientId || !entry.patientId.trim()) {
    throw new Error('Patient ID is required for every waiting list entry.');
  }
  const cache = rt.getCache();
  const newItem: WaitingListEntry = {
    ...entry,
    patientId: entry.patientId.trim(),
    id: `wait_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    addedAt: localDate(),
    updatedAt: new Date().toISOString(),
    version: 1,
  };
  cache.waitingList = [newItem, ...cache.waitingList];
  void rt.trackWrite(
    rt.putRecordEncrypted('waitingList', newItem.id, [], newItem, { patientId: newItem.patientId })
  ).catch(() => undefined);
  rt.notifyListeners();
  return getWaitingListOps(rt);
}

export function restoreWaitingListEntryOps(
  rt: OperationsRuntime,
  entry: WaitingListEntry
): WaitingListEntry[] {
  const cache = rt.getCache();
  const rest = cache.waitingList.filter((w) => w.id !== entry.id);
  cache.waitingList = [entry, ...rest];
  void rt.trackWrite(
    rt.putRecordEncrypted(
      'waitingList',
      entry.id,
      [],
      entry,
      { ...(entry.patientId ? { patientId: entry.patientId } : {}) },
      { skipConcurrencyCheck: true }
    )
  ).catch(() => undefined);
  rt.notifyListeners();
  return getWaitingListOps(rt);
}

export function removeWaitingListEntryOps(
  rt: OperationsRuntime,
  id: string,
  options?: { bypassRecycleBin?: boolean; deletedAtIso?: string }
): WaitingListEntry[] {
  const cache = rt.getCache();
  const target = cache.waitingList.find((w) => w.id === id);
  if (target && !target.isDemo && !options?.bypassRecycleBin && rt.isTrashRecycleBinEnabled()) {
    rt.moveRecordToRecycleBin({
      itemType: 'waiting_list',
      originalId: target.id,
      titleAr: `${target.patientName} — قائمة الانتظار`,
      titleEn: `${target.patientName} — Waiting List`,
      subtitleAr: target.notes || target.phone || '',
      subtitleEn: target.notes || target.phone || '',
      payload: { ...target },
      nowIso: options?.deletedAtIso,
    });
  }
  cache.waitingList = cache.waitingList.filter((w) => w.id !== id);
  void rt.deleteRecordEncrypted('waitingList', id).catch(() => undefined);
  rt.notifyListeners();
  return getWaitingListOps(rt);
}
