import React, { useMemo } from 'react';
import {
  Activity,
  ArrowLeft,
  Award,
  Dumbbell,
  Edit3,
  Gauge,
  Play,
  Stethoscope,
  Target,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import type { EpisodeRecord, PatientRecord, SessionRecord } from '../../../types/clinical';
import type { EpisodeScopedClinicalStore } from '../../../types/clinicManagement';
import { formatDateDDMMYYYY } from '../../../utils/date';
import { localizeDemoText } from '../../../utils/demoLocalization';
import type { SessionPainPointInput } from '../../organui/OrganClinicalCharts';
import { Fraction, Num } from '../../ui/Primitives';
import { ChartSessionsTab } from './ChartSessionsTab';

export interface ChartOverviewTabProps {
  patient: PatientRecord;
  patientAge: number | undefined;
  genderLabel: string;
  activeEpisode: EpisodeRecord | null;
  episodeStore: EpisodeScopedClinicalStore;
  episodeSessions: SessionRecord[];
  sessionPainPoints?: SessionPainPointInput[];
  onOpenEditPersonalInfo: () => void;
  onOpenEditClinicalSummary: () => void;
  onOpenMmtModal: () => void;
  onOpenRomModal: () => void;
  onOpenNeuroModal: () => void;
  onOpenSpecialTestsModal: () => void;
  onOpenSession: (sessionId: string) => void;
  onOpenNewSession?: () => void;
  onViewAllSessions: () => void;
  onOpenFullEvaluation?: () => void;
  isContextCollapsed?: boolean;
}

export const ChartOverviewTab: React.FC<ChartOverviewTabProps> = ({
  patient,
  activeEpisode,
  episodeStore,
  episodeSessions,
  sessionPainPoints = [],
  onOpenEditClinicalSummary,
  onOpenMmtModal,
  onOpenRomModal,
  onOpenNeuroModal,
  onOpenSpecialTestsModal,
  onOpenSession,
  isContextCollapsed = false,
}) => {
  const { language, bi } = useLanguage();

  // Active open draft session (highest session number / latest date)
  const latestDraftSession = useMemo(() => {
    const drafts = episodeSessions.filter((s) => {
      const status = s.status ?? s.data?.status ?? 'draft';
      return status !== 'finalized' && status !== 'cancelled';
    });
    if (drafts.length === 0) return null;
    return [...drafts].sort((a, b) => {
      const numA = a.sessionNumber ?? a.data?.sessionNumber ?? 0;
      const numB = b.sessionNumber ?? b.data?.sessionNumber ?? 0;
      if (numB !== numA) return numB - numA;
      const dateA = a.sessionDate ?? a.data?.sessionDate ?? '';
      const dateB = b.sessionDate ?? b.data?.sessionDate ?? '';
      return dateB.localeCompare(dateA);
    })[0];
  }, [episodeSessions]);

  // Pain NPRS trajectory strictly from real recorded scores (eval baseline / first -> latest session)
  const painTrajectory = useMemo(() => {
    const sorted = [...sessionPainPoints].sort((a, b) => {
      if (a.sessionNumber !== b.sessionNumber) return a.sessionNumber - b.sessionNumber;
      return a.date.localeCompare(b.date);
    });
    const evalPain =
      episodeStore.painOnActivityNrs > 0
        ? episodeStore.painOnActivityNrs
        : episodeStore.painAtRestNrs > 0
        ? episodeStore.painAtRestNrs
        : undefined;

    if (sorted.length >= 2) {
      return {
        first: sorted[0].pain,
        latest: sorted[sorted.length - 1].pain,
        isRange: sorted[0].pain !== sorted[sorted.length - 1].pain,
      };
    }
    if (sorted.length === 1) {
      const single = sorted[0].pain;
      if (evalPain !== undefined && evalPain !== single) {
        return { first: evalPain, latest: single, isRange: true };
      }
      return { first: single, latest: single, isRange: false };
    }
    if (evalPain !== undefined) {
      return { first: evalPain, latest: evalPain, isRange: false };
    }
    return null;
  }, [sessionPainPoints, episodeStore.painOnActivityNrs, episodeStore.painAtRestNrs]);

  const mmtEntries = episodeStore.objective?.mmtBattery?.entries || [];
  const romEntries = episodeStore.objective?.romBattery?.entries || [];
  const hasNeuro = Boolean(
    episodeStore.objective?.neuroScreening?.dermatomes ||
      episodeStore.objective?.neuroScreening?.reflexes ||
      episodeStore.objective?.neuroScreening?.myotomes
  );
  const specialTests = episodeStore.specialTests || [];
  const hasRecordedObjective =
    mmtEntries.length > 0 || romEntries.length > 0 || hasNeuro || specialTests.length > 0;

  // Avoid repeating episode title already shown in the header episode selector
  const episodeTitle = localizeDemoText(activeEpisode?.data.title || '', language);
  const rawDiagnosis = localizeDemoText(activeEpisode?.data.medicalDiagnosis || '', language);
  const diagnosisText =
    rawDiagnosis && rawDiagnosis !== episodeTitle ? rawDiagnosis : '';
  const rawImpression = localizeDemoText(episodeStore.clinicalImpression || '', language);
  const impressionText =
    rawImpression &&
    rawImpression !== episodeTitle &&
    rawImpression !== diagnosisText
      ? rawImpression
      : '';
  const rawComplaint = localizeDemoText(episodeStore.chiefComplaint || '', language);
  const complaintText =
    rawComplaint &&
    rawComplaint !== episodeTitle &&
    rawComplaint !== diagnosisText &&
    rawComplaint !== impressionText
      ? rawComplaint
      : '';

  const summaryLine =
    diagnosisText ||
    impressionText ||
    complaintText ||
    bi('ملخص الحالة والأهداف', 'Clinical summary & goals', 'پوختەی کلینیکی و ئامانجەکان');
  const secondaryNote =
    diagnosisText && impressionText
      ? impressionText
      : !diagnosisText && impressionText && complaintText
      ? complaintText
      : '';
  const goalsText = localizeDemoText(episodeStore.patientPersonalGoals || '', language);

  return (
    <div className="max-w-7xl mx-auto space-y-3.5">
      {/* 1. Prominent 1-Tap Resume Draft Session CTA */}
      {latestDraftSession && (
        <div className="pr-surface rounded-2xl px-4 py-3 sm:px-5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="size-9 rounded-xl bg-primary/10 text-primary font-mono text-xs font-extrabold flex items-center justify-center shrink-0">
              <bdi dir="ltr">
                #{latestDraftSession.sessionNumber ?? latestDraftSession.data?.sessionNumber ?? 1}
              </bdi>
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="text-xs sm:text-sm font-extrabold text-foreground truncate">
                {bi('جلسة مفتوحة', 'Open Session', 'دانیشتنی کراوە')}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground-1 tabular-nums whitespace-nowrap">
                <bdi dir="ltr">
                  {formatDateDDMMYYYY(
                    latestDraftSession.sessionDate ?? latestDraftSession.data?.sessionDate ?? ''
                  )}
                </bdi>
                <span>·</span>
                <span>
                  <Num value={latestDraftSession.data?.sessionDurationMinutes || 45} />{' '}
                  <span className="sm:hidden">{bi('د', 'm', 'خ')}</span>
                  <span className="hidden sm:inline">{bi('دقيقة', 'min', 'خولەک')}</span>
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenSession(latestDraftSession.id)}
            className="compact-btn h-9 px-3.5 sm:px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          >
            <Play className="size-3.5 fill-current shrink-0" />
            <span className="sm:hidden">
              {bi(
                `استئناف #${
                  latestDraftSession.sessionNumber ?? latestDraftSession.data?.sessionNumber ?? 1
                }`,
                `Resume #${
                  latestDraftSession.sessionNumber ?? latestDraftSession.data?.sessionNumber ?? 1
                }`,
                `بەردەوامبوون #${
                  latestDraftSession.sessionNumber ?? latestDraftSession.data?.sessionNumber ?? 1
                }`
              )}
            </span>
            <span className="hidden sm:inline">
              {bi(
                `استئناف جلسة #${
                  latestDraftSession.sessionNumber ?? latestDraftSession.data?.sessionNumber ?? 1
                }`,
                `Resume Session #${
                  latestDraftSession.sessionNumber ?? latestDraftSession.data?.sessionNumber ?? 1
                }`,
                `بەردەوامبوون #${
                  latestDraftSession.sessionNumber ?? latestDraftSession.data?.sessionNumber ?? 1
                }`
              )}
            </span>
          </button>
        </div>
      )}

      {/* 2. Compact 1-Block Clinical Summary & Recorded-Only Objective Findings */}
      {!isContextCollapsed && (
        <div className="pr-surface rounded-2xl overflow-hidden divide-y divide-black/[0.045] dark:divide-white/[0.06]">
          <div className="px-4 py-3.5 sm:px-5 space-y-2">
            <div className="flex items-start gap-3 min-w-0">
              <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                <Stethoscope className="size-4.5" />
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs sm:text-sm font-extrabold text-foreground leading-snug">
                  {summaryLine}
                </p>

                {secondaryNote && (
                  <p className="text-xs text-muted-foreground-1 leading-relaxed">{secondaryNote}</p>
                )}

                {goalsText && (
                  <div className="flex items-center gap-1.5 text-xs text-foreground/85 font-medium">
                    <Target className="size-3.5 text-primary shrink-0" />
                    <span>{goalsText}</span>
                  </div>
                )}

                {/* Inline Footer Row: Pain Trajectory + Sessions + Quiet Edit Button */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {painTrajectory && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-primary tabular-nums">
                        <Activity className="size-3.5 shrink-0" />
                        <span>{bi('الألم:', 'NPRS:', 'ئازار:')}</span>
                        {painTrajectory.isRange ? (
                          <span className="inline-flex items-center gap-1">
                            <Num value={painTrajectory.first} />
                            <ArrowLeft className="size-3 rtl:rotate-0 ltr:rotate-180 shrink-0" />
                            <Fraction value={painTrajectory.latest} total={10} />
                          </span>
                        ) : (
                          <Fraction value={painTrajectory.latest} total={10} />
                        )}
                      </span>
                    )}

                    {episodeSessions.length > 0 && (
                      <span className="text-xs font-semibold text-muted-foreground-1 tabular-nums">
                        <Num value={episodeSessions.length} /> {bi('جلسات', 'sessions', 'دانیشتن')}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={onOpenEditClinicalSummary}
                    className="compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-surface text-xs font-bold text-primary inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  >
                    <Edit3 className="size-3 shrink-0" />
                    <span>{bi('تعديل', 'Edit', 'دەستکاری')}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Recorded-Only Objective Findings (clickable rows, zero empty-state buttons) */}
          {hasRecordedObjective && (
            <div className="divide-y divide-black/[0.045] dark:divide-white/[0.06]">
              {romEntries.length > 0 && (
                <div
                  onClick={onOpenRomModal}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenRomModal();
                    }
                  }}
                  className="px-4 py-2.5 sm:px-5 hover:bg-surface/60 transition-colors cursor-pointer flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground shrink-0">
                    <Gauge className="size-4 text-primary shrink-0" />
                    <span>{bi('المدى الحركي (ROM):', 'ROM:', 'مەودای جووڵە:')}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs flex-1 justify-end">
                    {romEntries.slice(0, 4).map((entry: any, idx: number) => {
                      const jointLabel = bi(
                        `${entry.jointNameAr || ''} ${
                          entry.movementNameAr ? `(${entry.movementNameAr})` : ''
                        }`.trim() ||
                          entry.label ||
                          'مفصل',
                        `${entry.jointNameEn || ''} ${
                          entry.movementNameEn ? `(${entry.movementNameEn})` : ''
                        }`.trim() ||
                          entry.label ||
                          'Joint'
                      );
                      const side =
                        entry.laterality === 'right'
                          ? bi('يمين', 'R')
                          : entry.laterality === 'left'
                          ? bi('يسار', 'L')
                          : '';
                      const angle =
                        entry.measuredAngleDegrees ?? entry.activeDegrees ?? entry.passiveDegrees;
                      return (
                        <span key={idx} className="text-xs font-semibold inline-flex items-center gap-1">
                          <span className="text-foreground/85">
                            {jointLabel} {side ? `(${side})` : ''}:
                          </span>
                          <strong className="text-primary font-bold tabular-nums">
                            {angle !== undefined && angle !== null ? `${angle}°` : '—'}
                          </strong>
                        </span>
                      );
                    })}
                    {romEntries.length > 4 && (
                      <span className="text-xs text-muted-foreground-1 font-medium">
                        +{romEntries.length - 4}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {mmtEntries.length > 0 && (
                <div
                  onClick={onOpenMmtModal}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenMmtModal();
                    }
                  }}
                  className="px-4 py-2.5 sm:px-5 hover:bg-surface/60 transition-colors cursor-pointer flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground shrink-0">
                    <Dumbbell className="size-4 text-primary shrink-0" />
                    <span>{bi('القوة العضلية (MMT):', 'MMT:', 'هێزی ماسولکەکان:')}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs flex-1 justify-end">
                    {mmtEntries.slice(0, 4).map((entry: any, idx: number) => {
                      const muscleLabel = bi(
                        entry.label || entry.muscleNameAr || entry.actionNameAr || 'عضلة',
                        entry.label || entry.muscleNameEn || entry.actionNameEn || 'Muscle'
                      );
                      const side =
                        entry.laterality === 'right'
                          ? bi('(يمين)', '(R)')
                          : entry.laterality === 'left'
                          ? bi('(يسار)', '(L)')
                          : '';
                      const grade = entry.gradeValue ?? entry.grade ?? '—';
                      return (
                        <span key={idx} className="text-xs font-semibold inline-flex items-center gap-1">
                          <span className="text-foreground/85">
                            {muscleLabel} {side}:
                          </span>
                          <strong className="text-primary font-bold tabular-nums">{grade}/5</strong>
                        </span>
                      );
                    })}
                    {mmtEntries.length > 4 && (
                      <span className="text-xs text-muted-foreground-1 font-medium">
                        +{mmtEntries.length - 4}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {hasNeuro && (
                <div
                  onClick={onOpenNeuroModal}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenNeuroModal();
                    }
                  }}
                  className="px-4 py-2.5 sm:px-5 hover:bg-surface/60 transition-colors cursor-pointer flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground shrink-0">
                    <Zap className="size-4 text-primary shrink-0" />
                    <span>{bi('الفحص العصبي (Neuro):', 'Neuro:', 'پشکنینی دەماری:')}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5 text-xs">
                    {episodeStore.objective?.neuroScreening?.dermatomes && (
                      <span className="font-semibold text-foreground/85">
                        {bi('الإحساس الجلدي (Dermatomes)', 'Dermatomes', 'دەمارە هەستەوەرەکان')}
                      </span>
                    )}
                    {episodeStore.objective?.neuroScreening?.reflexes && (
                      <span className="font-semibold text-foreground/85">
                        {bi('المنعكسات (Reflexes)', 'Reflexes', 'ڕەفڵەکس')}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {specialTests.length > 0 && (
                <div
                  onClick={onOpenSpecialTestsModal}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenSpecialTestsModal();
                    }
                  }}
                  className="px-4 py-2.5 sm:px-5 hover:bg-surface/60 transition-colors cursor-pointer flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground shrink-0">
                    <Award className="size-4 text-primary shrink-0" />
                    <span>{bi('الفحوصات الخاصة:', 'Special Tests:', 'پشکنینە تایبەتەکان:')}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5 text-xs flex-1 justify-end">
                    {specialTests.slice(0, 4).map((test, idx) => (
                      <span
                        key={idx}
                        className={`text-xs font-bold ${
                          test.outcome === 'positive'
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-foreground/85'
                        }`}
                      >
                        {bi(test.nameAr, test.nameEn)}:{' '}
                        {test.outcome === 'positive'
                          ? bi('إيجابي (+)', 'Positive (+)', 'پۆزەتیڤ')
                          : bi('سلبي (-)', 'Negative (-)', 'نێگەتیڤ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. Unified Treatment Sessions Timeline & Weekly Recurring Schedule */}
      <ChartSessionsTab
        patient={patient}
        activeEpisode={activeEpisode}
        episodeSessions={episodeSessions}
        onOpenSession={onOpenSession}
      />
    </div>
  );
};
