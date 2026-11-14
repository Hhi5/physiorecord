// =======================================================================
// PhysioRecord — Local-Only Clinic Analytics Engine (5.7)
// Computes caseload, attendance/no-show rate, sessions/episode,
// outcome improvement + MCID rate, and income vs expenses strictly locally.
// =======================================================================

import type {
  EpisodeRecord,
  PatientRecord,
  SessionRecord,
} from '../types/clinical';
import type {
  ClinicAppointment,
  ClinicExpenseIQD,
  EpisodeScopedClinicalStore,
  FinancialInvoiceIQD,
  LocalClinicAnalyticsSummary,
} from '../types/clinicManagement';
import { evaluateBaselineChange } from './outcomeMeasures';

export interface ComputeLocalAnalyticsInput {
  patients: PatientRecord[];
  episodes: EpisodeRecord[];
  sessions: SessionRecord[];
  appointments: ClinicAppointment[];
  episodeStores: EpisodeScopedClinicalStore[];
  invoices: FinancialInvoiceIQD[];
  expenses: ClinicExpenseIQD[];
}

export function computeLocalClinicAnalytics(
  input: ComputeLocalAnalyticsInput
): LocalClinicAnalyticsSummary {
  const {
    patients,
    episodes,
    sessions,
    appointments,
    episodeStores,
    invoices,
    expenses,
  } = input;

  // Exclude synthetic demo records from real clinic analytics when analyzing live caseload?
  // Note: Include non-demo rows, or if clinic only has demo rows let analytics show real vs demo transparently.
  // Keeping all decrypted non-archived active data accurate without fabricated metrics.
  const activePatients = patients.filter((p) => p.isArchived === 0).length;
  const activeEpisodes = episodes.filter(
    (e) => (e.data.status || 'active') === 'active'
  ).length;
  const completedEpisodes = episodes.filter(
    (e) => e.data.status === 'completed'
  ).length;

  const finalizedSessions = sessions.filter((s) => s.status === 'finalized').length;
  const nonCancelledSessions = sessions.filter((s) => s.status !== 'cancelled').length;
  const meanSessionsPerEpisode =
    episodes.length > 0
      ? Number((nonCancelledSessions / episodes.length).toFixed(1))
      : 0;

  // Attendance & No-Show Rates
  let attendedAppointments = 0;
  let cancelledAppointments = 0;
  let noShowAppointments = 0;
  for (const appt of appointments) {
    if (appt.status === 'completed') attendedAppointments++;
    else if (appt.status === 'cancelled') cancelledAppointments++;
    else if (appt.status === 'no_show') noShowAppointments++;
  }
  const concludedAppointments =
    attendedAppointments + cancelledAppointments + noShowAppointments;
  const attendanceRatePercent =
    concludedAppointments > 0
      ? Math.round((attendedAppointments / concludedAppointments) * 100)
      : 0;
  const noShowRatePercent =
    concludedAppointments > 0
      ? Math.round((noShowAppointments / concludedAppointments) * 100)
      : 0;

  // Outcome Measures Improvement & MCID Achievement
  let outcomesEvaluatedCount = 0;
  let outcomesImprovedCount = 0;
  let outcomesMcidAchievedCount = 0;

  for (const store of episodeStores) {
    const history = store.functionalScales?.history || [];
    if (history.length >= 2) {
      const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
      const first = sorted[0];
      const latest = sorted[sorted.length - 1];
      const firstRaw = typeof first.rawScore === 'number' ? first.rawScore : first.scorePercentage;
      const latestRaw =
        typeof latest.rawScore === 'number' ? latest.rawScore : latest.scorePercentage;
      const evalRes = evaluateBaselineChange(
        latest.scaleId,
        firstRaw,
        latestRaw,
        first.scorePercentage,
        latest.scorePercentage,
        store.functionalScales?.customMeasureConfig
      );

      outcomesEvaluatedCount++;
      if (evalRes.improved) outcomesImprovedCount++;
      if (evalRes.mcidMet) outcomesMcidAchievedCount++;
    } else if ((store.snapshots?.length || 0) >= 2) {
      const sortedSnaps = [...store.snapshots].sort((a, b) =>
        a.recordedDate.localeCompare(b.recordedDate)
      );
      const firstPain = sortedSnaps[0].painNrsRest;
      const lastPain = sortedSnaps[sortedSnaps.length - 1].painNrsRest;
      if (typeof firstPain === 'number' && typeof lastPain === 'number') {
        outcomesEvaluatedCount++;
        const delta = firstPain - lastPain;
        if (delta > 0) outcomesImprovedCount++;
        if (delta >= 2) outcomesMcidAchievedCount++;
      }
    }
  }

  const outcomeImprovementRatePercent =
    outcomesEvaluatedCount > 0
      ? Math.round((outcomesImprovedCount / outcomesEvaluatedCount) * 100)
      : 0;
  const outcomeMcidRatePercent =
    outcomesEvaluatedCount > 0
      ? Math.round((outcomesMcidAchievedCount / outcomesEvaluatedCount) * 100)
      : 0;

  // Finance: Income vs Expenses + Monthly Breakdown
  let totalInvoicedIQD = 0;
  let totalCollectedIQD = 0;
  const monthlyMap = new Map<string, { incomeIQD: number; expensesIQD: number }>();

  for (const inv of invoices) {
    if (inv.status === 'void') continue;
    totalInvoicedIQD += inv.netAmountIQD || 0;
    for (const pay of inv.payments || []) {
      totalCollectedIQD += pay.amountIQD || 0;
      const monthKey = (pay.date || inv.date || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(monthKey)) {
        const cur = monthlyMap.get(monthKey) || { incomeIQD: 0, expensesIQD: 0 };
        cur.incomeIQD += pay.amountIQD || 0;
        monthlyMap.set(monthKey, cur);
      }
    }
  }

  let totalExpensesIQD = 0;
  for (const exp of expenses) {
    totalExpensesIQD += exp.amountIQD || 0;
    const monthKey = (exp.date || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(monthKey)) {
      const cur = monthlyMap.get(monthKey) || { incomeIQD: 0, expensesIQD: 0 };
      cur.expensesIQD += exp.amountIQD || 0;
      monthlyMap.set(monthKey, cur);
    }
  }

  const collectionRatePercent =
    totalInvoicedIQD > 0
      ? Math.min(100, Math.round((totalCollectedIQD / totalInvoicedIQD) * 100))
      : 0;

  const monthlyCashflow = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([monthKey, vals]) => ({
      monthKey,
      incomeIQD: vals.incomeIQD,
      expensesIQD: vals.expensesIQD,
      netIQD: vals.incomeIQD - vals.expensesIQD,
    }));

  return {
    totalPatients: patients.length,
    activePatients,
    totalEpisodes: episodes.length,
    activeEpisodes,
    completedEpisodes,
    totalSessions: nonCancelledSessions,
    finalizedSessions,
    meanSessionsPerEpisode,
    totalAppointments: appointments.length,
    attendedAppointments,
    cancelledAppointments,
    noShowAppointments,
    attendanceRatePercent,
    noShowRatePercent,
    outcomesEvaluatedCount,
    outcomesImprovedCount,
    outcomesMcidAchievedCount,
    outcomeImprovementRatePercent,
    outcomeMcidRatePercent,
    totalInvoicedIQD,
    totalCollectedIQD,
    totalExpensesIQD,
    netCashflowIQD: totalCollectedIQD - totalExpensesIQD,
    collectionRatePercent,
    monthlyCashflow,
  };
}
