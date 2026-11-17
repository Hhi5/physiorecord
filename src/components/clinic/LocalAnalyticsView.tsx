// =======================================================================
// PhysioRecord — Local-Only Clinic Analytics Dashboard (5.7)
// Caseload, attendance/no-show rate, sessions/episode, outcome/MCID improvement,
// and income vs expenses — 100% locally computed on decrypted records (R1).
// =======================================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Users,
  CalendarCheck2,
  TrendingUp,
  Wallet,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { usePatients } from '../../context/PatientContext';
import { EpisodeService } from '../../services/episodeService';
import { SessionService } from '../../services/sessionService';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { computeLocalClinicAnalytics } from '../../utils/analyticsEngine';
import { formatIntlDate, formatIntlPercent } from '../../utils/i18nFormat';
import { Money, Num } from '../ui/Primitives';
import type { EpisodeRecord, SessionRecord } from '../../types/clinical';

export const LocalAnalyticsView: React.FC = () => {
  const { language, t } = useLanguage();
  const isEn = language === 'en';
  const { dek, isLocked } = useVault();
  const { patients } = usePatients();

  const [episodes, setEpisodes] = useState<EpisodeRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [opsTick, setOpsTick] = useState(0);

  useEffect(() => {
    return ClinicOperationsService.subscribe(() => setOpsTick((n) => n + 1));
  }, []);

  useEffect(() => {
    if (isLocked || !dek) {
      setEpisodes([]);
      setSessions([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const allEpisodes: EpisodeRecord[] = [];
        const allSessions: SessionRecord[] = [];
        for (const p of patients) {
          if (cancelled) return;
          const eps = await EpisodeService.getEpisodesByPatient(p.id, dek);
          allEpisodes.push(...eps);
          for (const ep of eps) {
            if (cancelled) return;
            const sess = await SessionService.getSessionsByEpisode(ep.id, dek);
            allSessions.push(...sess);
          }
        }
        if (!cancelled) {
          setEpisodes(allEpisodes);
          setSessions(allSessions);
        }
      } catch (err) {
        console.error('LocalAnalyticsView load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [patients, dek, isLocked, opsTick]);

  const appointments = useMemo(
    () => ClinicOperationsService.getAppointments(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opsTick]
  );
  const invoices = useMemo(
    () => ClinicOperationsService.getInvoicesIQD(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opsTick]
  );
  const expenses = useMemo(
    () => ClinicOperationsService.getExpensesIQD(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opsTick]
  );
  const episodeStores = useMemo(
    () => ClinicOperationsService.getAllEpisodeClinicalStores(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opsTick]
  );

  const summary = useMemo(
    () =>
      computeLocalClinicAnalytics({
        patients,
        episodes,
        sessions,
        appointments,
        episodeStores,
        invoices,
        expenses,
      }),
    [patients, episodes, sessions, appointments, episodeStores, invoices, expenses]
  );

  const maxMonthlyCash = useMemo(() => {
    let maxVal = 1;
    for (const m of summary.monthlyCashflow) {
      if (m.incomeIQD > maxVal) maxVal = m.incomeIQD;
      if (m.expensesIQD > maxVal) maxVal = m.expensesIQD;
    }
    return maxVal;
  }, [summary.monthlyCashflow]);

  const hasDemoPatients = useMemo(() => patients.some((p) => Boolean(p.data.isDemo)), [patients]);

  return (
    <div className="pr-container space-y-5">
      <div className="pr-page-header">
        <div className="flex items-start gap-3">
          <div className="pr-icon-chip">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="pr-page-title">
              {t('analytics.title')}
            </h1>
            <p className="pr-page-subtitle mt-0.5">
              {t('analytics.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
            <ShieldCheck className="w-4 h-4" />
            {isEn ? 'Zero Network Calls — 100% Local' : 'تحليل محلي بدون اتصال'}
          </span>
          {loading && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-muted-foreground-1">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              {isEn ? 'Computing…' : 'جاري الاحتساب…'}
            </span>
          )}
        </div>
      </div>

      {hasDemoPatients && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300">
          {isEn
            ? 'Note: Synthetic demo records currently inside your local vault are included in these local counts until cleared from Settings.'
            : 'تنبيه: السجلات التجريبية الموجودة حالياً في الخزينة تدخل ضمن الأرقام حتى يتم حذفها من الإعدادات.'}
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Caseload */}
        <div className="pr-surface p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground-1">
            <span>{isEn ? 'Active Caseload & Episodes' : 'المرضى والحلقات العلاجية'}</span>
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-foreground tabular-nums">
              <Num value={summary.activePatients} />
            </span>
            <span className="text-xs text-muted-foreground-1">
              {isEn ? `of ${summary.totalPatients} patients` : `من أصل ${summary.totalPatients} مريض`}
            </span>
          </div>
          <div className="pt-2 border-t border-card-divider text-xs text-muted-foreground-1 flex items-center justify-between">
            <span>{isEn ? 'Active / Completed Episodes' : 'حلقات نشطة / مكتملة'}</span>
            <bdi dir="ltr" className="font-bold text-foreground tabular-nums">
              <Num value={summary.activeEpisodes} /> / <Num value={summary.completedEpisodes} />
            </bdi>
          </div>
          <div className="text-xs text-muted-foreground-1 flex items-center justify-between">
            <span>{isEn ? 'Mean Sessions / Episode' : 'متوسط الجلسات / حلقة'}</span>
            <span className="font-bold text-foreground tabular-nums">
              <Num value={summary.meanSessionsPerEpisode} />
            </span>
          </div>
        </div>

        {/* Attendance & No-Show */}
        <div className="pr-surface p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground-1">
            <span>{isEn ? 'Attendance & No-Show' : 'الالتزام والغياب'}</span>
            <CalendarCheck2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-foreground">
              {formatIntlPercent(summary.attendanceRatePercent, language)}
            </span>
            <span className="text-xs text-muted-foreground-1">
              {isEn ? 'attendance' : 'حضور'}
            </span>
          </div>
          <div className="pt-2 border-t border-card-divider text-xs text-muted-foreground-1 flex items-center justify-between">
            <span>{isEn ? 'No-Show Rate' : 'نسبة عدم الحضور'}</span>
            <span
              className={`font-bold ${
                summary.noShowRatePercent > 0
                  ? 'text-rose-700 dark:text-rose-400'
                  : 'text-foreground'
              }`}
            >
              {formatIntlPercent(summary.noShowRatePercent, language)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground-1 flex items-center justify-between">
            <span>{isEn ? 'Completed / No-Show / Cancelled' : 'حضر / لم يحضر / ملغى'}</span>
            <bdi dir="ltr" className="font-bold text-foreground tabular-nums">
              {summary.attendedAppointments} / {summary.noShowAppointments} / {summary.cancelledAppointments}
            </bdi>
          </div>
        </div>

        {/* Clinical Outcome Improvement & MCID */}
        <div className="pr-surface p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground-1">
            <span>{isEn ? 'Outcome Improvement & MCID' : 'تحسن المقاييس الوظيفية'}</span>
            <TrendingUp className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-extrabold ${
                summary.outcomeImprovementRatePercent > 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-foreground'
              }`}
            >
              {formatIntlPercent(summary.outcomeImprovementRatePercent, language)}
            </span>
            <span className="text-xs text-muted-foreground-1">
              {isEn ? 'improved' : 'تحسّن سريري'}
            </span>
          </div>
          <div className="pt-2 border-t border-card-divider text-xs text-muted-foreground-1 flex items-center justify-between">
            <span>{isEn ? 'Achieved MCID Target' : 'حقق عتبة التحسن (MCID)'}</span>
            <span className="font-bold text-foreground">
              {formatIntlPercent(summary.outcomeMcidRatePercent, language)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground-1 flex items-center justify-between">
            <span>{isEn ? 'Evaluated Episodes (≥2 pts)' : 'حلقات بقياسين فأكثر'}</span>
            <span className="font-bold text-foreground">
              <Num value={summary.outcomesEvaluatedCount} />
            </span>
          </div>
        </div>

        {/* Income vs Expenses */}
        <div className="pr-surface p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground-1">
            <span>{isEn ? 'Net Local Cashflow' : 'صافي التدفق المالي'}</span>
            <Wallet className="w-4 h-4 text-amber-700 dark:text-amber-400" />
          </div>
          <div
            className={`text-2xl font-extrabold ${
              summary.netCashflowIQD < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-foreground'
            }`}
          >
            <Money amount={summary.netCashflowIQD} />
          </div>
          <div className="pt-2 border-t border-card-divider text-xs text-muted-foreground-1 flex items-center justify-between">
            <span>{isEn ? 'Collected / Expenses' : 'المقبوضات / المصاريف'}</span>
            <bdi dir="ltr" className="font-semibold text-foreground inline-flex items-center gap-1 tabular-nums">
              <Money amount={summary.totalCollectedIQD} />
              <span>/</span>
              <Money amount={summary.totalExpensesIQD} />
            </bdi>
          </div>
          <div className="text-xs text-muted-foreground-1 flex items-center justify-between">
            <span>{isEn ? 'Collection Rate' : 'نسبة التحصيل'}</span>
            <span className="font-bold text-foreground">
              {formatIntlPercent(summary.collectionRatePercent, language)}
            </span>
          </div>
        </div>
      </div>

      {/* Monthly Income vs Expenses Bar Comparison */}
      <div className="pr-surface p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="pr-section-title">
              {isEn ? 'Monthly Income vs Operating Expenses (Last 6 Months)' : 'الإيرادات مقابل المصاريف التشغيلية (آخر 6 أشهر)'}
            </h2>
            <p className="text-xs text-muted-foreground-1 mt-0.5">
              {isEn
                ? 'Calculated directly from encrypted local payments and expenses.'
                : 'محتسبة مباشرةً من المدفوعات والمصاريف المشفرة محلياً.'}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 text-foreground font-medium">
              <span className="w-3 h-3 rounded bg-primary inline-block" />
              {isEn ? 'Collected Income' : 'الإيرادات المحصّلة'}
            </span>
            <span className="inline-flex items-center gap-1.5 text-foreground font-medium">
              <span className="w-3 h-3 rounded bg-rose-500 inline-block" />
              {isEn ? 'Expenses' : 'المصاريف'}
            </span>
          </div>
        </div>

        {summary.monthlyCashflow.length === 0 ? (
          <div className="p-6 text-center rounded-xl bg-surface border border-card-divider text-xs text-muted-foreground-1">
            {isEn
              ? 'No monthly financial transactions recorded yet.'
              : 'لا توجد حركات مالية مسجلة حتى الآن لعرض الرسم الشهري.'}
          </div>
        ) : (
          <div className="space-y-3">
            {summary.monthlyCashflow.map((row) => {
              const incPct = Math.round((row.incomeIQD / maxMonthlyCash) * 100);
              const expPct = Math.round((row.expensesIQD / maxMonthlyCash) * 100);
              const monthLabel = formatIntlDate(`${row.monthKey}-01`, language, {
                year: 'numeric',
                month: 'short',
              });
              return (
                <div
                  key={row.monthKey}
                  className="p-3 rounded-xl bg-surface border border-card-divider space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-foreground">{monthLabel}</span>
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="text-primary font-semibold">
                        + <Money amount={row.incomeIQD} />
                      </span>
                      <span className="text-rose-700 dark:text-rose-400 font-semibold">
                        − <Money amount={row.expensesIQD} />
                      </span>
                      <span
                        className={`font-bold ${
                          row.netIQD < 0
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-foreground'
                        }`}
                      >
                        {isEn ? 'Net:' : 'الصافي:'} <Money amount={row.netIQD} />
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.max(incPct, row.incomeIQD > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-rose-500 transition-all"
                        style={{ width: `${Math.max(expPct, row.expensesIQD > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
