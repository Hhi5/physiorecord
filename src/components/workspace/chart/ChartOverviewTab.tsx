import React from 'react';
import {
  Activity,
  Award,
  Calendar,
  CalendarCheck2,
  CheckCircle2,
  ChevronLeft,
  Dumbbell,
  Edit3,
  Gauge,
  MapPin,
  Phone,
  ShieldCheck,
  Stethoscope,
  Target,
  User,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import type { EpisodeRecord, PatientRecord, SessionRecord } from '../../../types/clinical';
import type { EpisodeScopedClinicalStore } from '../../../types/clinicManagement';
import { formatClinicalDate, formatIraqiPhoneDisplay } from '../../../utils/date';
import { getPatientDisplayName } from '../../../utils/mrn';
import { Num } from '../../ui/Primitives';

export interface ChartOverviewTabProps {
  patient: PatientRecord;
  patientAge: number | undefined;
  genderLabel: string;
  activeEpisode: EpisodeRecord | null;
  episodeStore: EpisodeScopedClinicalStore;
  episodeSessions: SessionRecord[];
  onOpenEditPersonalInfo: () => void;
  onOpenEditClinicalSummary: () => void;
  onOpenMmtModal: () => void;
  onOpenRomModal: () => void;
  onOpenNeuroModal: () => void;
  onOpenSpecialTestsModal: () => void;
  onOpenSession: (sessionId: string) => void;
  onViewAllSessions: () => void;
}

export const ChartOverviewTab: React.FC<ChartOverviewTabProps> = ({
  patient,
  patientAge,
  genderLabel,
  activeEpisode,
  episodeStore,
  episodeSessions,
  onOpenEditPersonalInfo,
  onOpenEditClinicalSummary,
  onOpenMmtModal,
  onOpenRomModal,
  onOpenNeuroModal,
  onOpenSpecialTestsModal,
  onOpenSession,
  onViewAllSessions,
}) => {
  const { language, bi } = useLanguage();

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* 3 Metric Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-card-line shadow-2xs flex flex-col items-center justify-center text-center gap-1">
          <div className="size-9 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center mb-0.5">
            <Calendar className="size-4.5" />
          </div>
          <span className="text-xl sm:text-2xl font-black text-foreground tabular-nums">
            {patientAge ? <Num value={patientAge} /> : '—'}
          </span>
          <span className="text-xs text-muted-foreground-1 font-medium">
            {bi('سنة', 'Years', 'ساڵ')}
          </span>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-card-line shadow-2xs flex flex-col items-center justify-center text-center gap-1">
          <div className="size-9 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center mb-0.5">
            <User className="size-4.5" />
          </div>
          <span className="text-base sm:text-lg font-bold text-foreground">
            {genderLabel}
          </span>
          <span className="text-xs text-muted-foreground-1 font-medium">
            {bi('الجنس', 'Gender', 'ڕەگەز')}
          </span>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-card-line shadow-2xs flex flex-col items-center justify-center text-center gap-1">
          <div className="size-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-0.5">
            <ShieldCheck className="size-4.5" />
          </div>
          <span className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {bi('نشط', 'Active', 'چالاک')}
          </span>
          <span className="text-xs text-muted-foreground-1 font-medium">
            {bi('الحالة', 'Status', 'دۆخ')}
          </span>
        </div>
      </div>

      {/* Interactive Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Card 1: Personal Information */}
        <div
          onClick={onOpenEditPersonalInfo}
          className="relative p-4 sm:p-5 pt-6 rounded-2xl bg-card border border-card-line shadow-2xs hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer space-y-3.5 group overflow-hidden"
        >
          <div className="absolute top-0 end-5 z-10">
            <div className="bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-b-xl shadow-xs flex items-center gap-1 cursor-pointer hover:bg-primary/90 transition-transform active:scale-95">
              <Edit3 className="size-3 text-white" />
              <span>{bi('تعديل', 'Edit', 'دەستکاری')}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <User className="size-4" />
            </div>
            <h3 className="text-sm font-bold text-foreground">
              {bi('المعلومات الشخصية', 'Personal Information', 'زانیاری کەسی')}
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs pt-1">
            <div className="space-y-1">
              <span className="text-muted-foreground-1 flex items-center gap-1 font-medium">
                <User className="size-3 text-muted-foreground-1" />
                {bi('الاسم الكامل', 'Full Name', 'ناوی تەواو')}
              </span>
              <span className="font-bold text-foreground block truncate">
                {getPatientDisplayName(patient.data, language)}
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-muted-foreground-1 flex items-center gap-1 font-medium">
                <Phone className="size-3 text-muted-foreground-1" />
                {bi('رقم الهاتف', 'Phone', 'ژمارەی تەلەفۆن')}
              </span>
              <span className="font-bold text-foreground block dir-ltr text-right truncate">
                {patient.data.phone ? formatIraqiPhoneDisplay(patient.data.phone) : '—'}
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-muted-foreground-1 flex items-center gap-1 font-medium">
                <Calendar className="size-3 text-muted-foreground-1" />
                {bi('تاريخ الميلاد', 'Date of Birth', 'بەرواری لەدایکبوون')}
              </span>
              <span className="font-bold text-foreground block">
                {patient.data.dateOfBirth ? formatClinicalDate(patient.data.dateOfBirth) : '—'}
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-muted-foreground-1 flex items-center gap-1 font-medium">
                <MapPin className="size-3 text-muted-foreground-1" />
                {bi('العنوان والمدينة', 'Address', 'ناونیشان')}
              </span>
              <span className="font-bold text-foreground block truncate">
                {patient.data.address || bi('بغداد، العراق', 'Baghdad, Iraq', 'بەغدا، عێراق')}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Clinical Summary */}
        <div
          onClick={onOpenEditClinicalSummary}
          className="relative p-4 sm:p-5 pt-6 rounded-2xl bg-card border border-card-line shadow-2xs hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer space-y-3.5 group overflow-hidden"
        >
          <div className="absolute top-0 end-5 z-10">
            <div className="bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-b-xl shadow-xs flex items-center gap-1 cursor-pointer hover:bg-primary/90 transition-transform active:scale-95">
              <Edit3 className="size-3 text-white" />
              <span>{bi('عرض وتعديل', 'View & Edit', 'بینین و دەستکاری')}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center">
              <Stethoscope className="size-4" />
            </div>
            <h3 className="text-sm font-bold text-foreground">
              {bi('ملخص الحالة السريرية', 'Clinical Summary', 'پوختەی کلینیکی')}
            </h3>
          </div>

          <div className="flex items-start gap-3.5 pt-1">
            <div className="size-14 rounded-2xl bg-gradient-to-br from-primary/15 to-sky-500/20 border border-primary/20 flex items-center justify-center shrink-0 text-primary">
              <Activity className="size-7" />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div>
                <h4 className="text-sm font-bold text-foreground truncate">
                  {activeEpisode?.data.title ||
                    activeEpisode?.data.medicalDiagnosis ||
                    episodeStore.chiefComplaint ||
                    bi('علاج تأهيلي', 'Physical Rehabilitation', 'چارەسەری سروشتی')}
                </h4>
                <p className="text-xs text-muted-foreground-1 truncate">
                  {episodeStore.clinicalImpression ||
                    activeEpisode?.data.medicalDiagnosis ||
                    bi('تشخيص سريري معتمد', 'Clinical Impression', 'دەستنیشانکردنی کلینیکی')}
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-foreground/90 font-medium">
                <Target className="size-3.5 text-primary shrink-0" />
                <span className="truncate">
                  {episodeStore.patientPersonalGoals ||
                    bi('تقليل الألم واستعادة المدى الحركي', 'Reduce pain and improve ROM', 'کەمکردنەوەی ئازار و باشترکردنی جووڵە')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: MMT (Muscle Strength) */}
        <div
          onClick={onOpenMmtModal}
          className="relative p-4 sm:p-5 pt-6 rounded-2xl bg-card border border-card-line shadow-2xs hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer space-y-3 group overflow-hidden"
        >
          <div className="absolute top-0 end-5 z-10">
            <div className="bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-b-xl shadow-xs flex items-center gap-1 cursor-pointer hover:bg-primary/90 transition-transform active:scale-95">
              <Edit3 className="size-3 text-white" />
              <span>{bi('عرض وتعديل', 'View & Edit', 'بینین و دەستکاری')}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Dumbbell className="size-4" />
            </div>
            <h3 className="text-sm font-bold text-foreground">
              {bi('القوة العضلية (MMT)', 'Muscle Testing (MMT)', 'هێزی ماسولکەکان')}
            </h3>
          </div>

          <div className="pt-1">
            {episodeStore.objective?.mmtBattery?.entries &&
            episodeStore.objective.mmtBattery.entries.length > 0 ? (
              <div className="space-y-1.5">
                <div className="pr-hscroll overflow-x-auto flex items-center gap-2 whitespace-nowrap pb-1.5 pt-0.5 px-0.5">
                  {episodeStore.objective.mmtBattery.entries.slice(0, 3).map((entry: any, idx: number) => {
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
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-surface border border-line-2 text-xs font-semibold flex items-center gap-1.5"
                      >
                        <span className="text-foreground">
                          {muscleLabel} {side}:
                        </span>
                        <strong className="text-primary font-bold tabular-nums">{grade}/5</strong>
                      </span>
                    );
                  })}
                  {episodeStore.objective.mmtBattery.entries.length > 3 && (
                    <span className="px-2 py-1 text-xs text-muted-foreground-1 font-medium">
                      +{episodeStore.objective.mmtBattery.entries.length - 3}{' '}
                      {bi('عضلات أخرى', 'more', 'زیاتر')}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs text-muted-foreground-1 py-1">
                <span>{bi('لم يتم تسجيل قياسات قوة عضلية بعد', 'No MMT recorded yet', 'هێشتا تۆمار نەکراوە')}</span>
                <span className="text-primary font-bold">+ {bi('إضافة فحص', 'Add Test', 'زیادکردن')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Card 4: ROM (Range of Motion) */}
        <div
          onClick={onOpenRomModal}
          className="relative p-4 sm:p-5 pt-6 rounded-2xl bg-card border border-card-line shadow-2xs hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer space-y-3 group overflow-hidden"
        >
          <div className="absolute top-0 end-5 z-10">
            <div className="bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-b-xl shadow-xs flex items-center gap-1 cursor-pointer hover:bg-primary/90 transition-transform active:scale-95">
              <Edit3 className="size-3 text-white" />
              <span>{bi('عرض وتعديل', 'View & Edit', 'بینین و دەستکاری')}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-cyan-500/10 text-cyan-600 flex items-center justify-center">
              <Gauge className="size-4" />
            </div>
            <h3 className="text-sm font-bold text-foreground">
              {bi('المدى الحركي للمفاصل (ROM)', 'Range of Motion (ROM)', 'مەودای جووڵە')}
            </h3>
          </div>

          <div className="pt-1">
            {episodeStore.objective?.romBattery?.entries &&
            episodeStore.objective.romBattery.entries.length > 0 ? (
              <div className="space-y-1.5">
                <div className="pr-hscroll overflow-x-auto flex items-center gap-2 whitespace-nowrap pb-1.5 pt-0.5 px-0.5">
                  {episodeStore.objective.romBattery.entries.slice(0, 3).map((entry: any, idx: number) => {
                    const jointLabel = bi(
                      `${entry.jointNameAr || ''} ${entry.movementNameAr ? `(${entry.movementNameAr})` : ''}`.trim() ||
                        entry.label ||
                        'مفصل',
                      `${entry.jointNameEn || ''} ${entry.movementNameEn ? `(${entry.movementNameEn})` : ''}`.trim() ||
                        entry.label ||
                        'Joint'
                    );
                    const side =
                      entry.laterality === 'right'
                        ? bi('يمين', 'R')
                        : entry.laterality === 'left'
                        ? bi('يسار', 'L')
                        : '';
                    const angle = entry.measuredAngleDegrees ?? entry.activeDegrees ?? entry.passiveDegrees;
                    return (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-surface border border-line-2 text-xs font-semibold flex items-center gap-1.5"
                      >
                        <span className="text-foreground">
                          {jointLabel} {side ? `(${side})` : ''}:
                        </span>
                        <strong className="text-primary font-bold tabular-nums">
                          {angle !== undefined && angle !== null ? `${angle}°` : '—'}
                        </strong>
                      </span>
                    );
                  })}
                  {episodeStore.objective.romBattery.entries.length > 3 && (
                    <span className="px-2 py-1 text-xs text-muted-foreground-1 font-medium">
                      +{episodeStore.objective.romBattery.entries.length - 3}{' '}
                      {bi('حركات أخرى', 'more', 'زیاتر')}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs text-muted-foreground-1 py-1">
                <span>{bi('لم يتم توثيق مدى حركي للمفاصل بعد', 'No ROM recorded yet', 'هێشتا تۆمار نەکراوە')}</span>
                <span className="text-primary font-bold">+ {bi('إضافة قياس', 'Add Joint', 'زیادکردن')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Card 5: Neuro Screening */}
        <div
          onClick={onOpenNeuroModal}
          className="relative p-4 sm:p-5 pt-6 rounded-2xl bg-card border border-card-line shadow-2xs hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer space-y-3 group overflow-hidden"
        >
          <div className="absolute top-0 end-5 z-10">
            <div className="bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-b-xl shadow-xs flex items-center gap-1 cursor-pointer hover:bg-primary/90 transition-transform active:scale-95">
              <Edit3 className="size-3 text-white" />
              <span>{bi('عرض وتعديل', 'View & Edit', 'بینین و دەستکاری')}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center">
              <Zap className="size-4" />
            </div>
            <h3 className="text-sm font-bold text-foreground">
              {bi('الفحص العصبي (Neuro)', 'Neurological Screening', 'پشکنینی دەماری')}
            </h3>
          </div>

          <div className="pt-1">
            {episodeStore.objective?.neuroScreening?.dermatomes ||
            episodeStore.objective?.neuroScreening?.reflexes ? (
              <div className="text-xs text-foreground flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-surface border border-line-2 font-semibold">
                  {bi('إحساس الجلد (Dermatomes)', 'Dermatomes', 'دەمارە هەستەوەرەکان')}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-surface border border-line-2 font-semibold">
                  {bi('المنعكسات (Reflexes)', 'Reflexes', 'ڕەفڵەکس')}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs text-muted-foreground-1 py-1">
                <span>{bi('لم يتم توثيق الفحص العصبي بعد', 'No Neuro screening yet', 'هێشتا تۆمار نەکراوە')}</span>
                <span className="text-primary font-bold">+ {bi('فحص عصبي', 'Screen', 'پشکنین')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Card 6: Special Tests & Scales */}
        <div
          onClick={onOpenSpecialTestsModal}
          className="relative p-4 sm:p-5 pt-6 rounded-2xl bg-card border border-card-line shadow-2xs hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer space-y-3 group overflow-hidden"
        >
          <div className="absolute top-0 end-5 z-10">
            <div className="bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-b-xl shadow-xs flex items-center gap-1 cursor-pointer hover:bg-primary/90 transition-transform active:scale-95">
              <Edit3 className="size-3 text-white" />
              <span>{bi('عرض وتعديل', 'View & Edit', 'بینین و دەستکاری')}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center">
              <Award className="size-4" />
            </div>
            <h3 className="text-sm font-bold text-foreground">
              {bi('الفحوصات الخاصة والمقاييس', 'Special Tests & Scales', 'پشکنینە تایبەتەکان و پێوەرەکان')}
            </h3>
          </div>

          <div className="pt-1">
            {episodeStore.specialTests && episodeStore.specialTests.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 text-xs">
                {episodeStore.specialTests.slice(0, 3).map((test, idx) => (
                  <span
                    key={idx}
                    className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${
                      test.outcome === 'positive'
                        ? 'bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-400'
                        : 'bg-surface border-line-2 text-foreground'
                    }`}
                  >
                    {bi(test.nameAr, test.nameEn)}:{' '}
                    {test.outcome === 'positive'
                      ? bi('إيجابي (+)', 'Positive (+)', 'پۆزەتیڤ')
                      : bi('سلبي (-)', 'Negative (-)', 'نێگەتیڤ')}
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs text-muted-foreground-1 py-1">
                <span>{bi('لا توجد فحوصات خاصة موثقة', 'No special tests recorded', 'هیچ پشکنینێک تۆمار نەکراوە')}</span>
                <span className="text-primary font-bold">+ {bi('إضافة فحص', 'Add Test', 'زیادکردن')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Card 7: Recent Sessions */}
        <div className="p-4 sm:p-5 rounded-2xl bg-card border border-card-line shadow-2xs space-y-3 md:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <CalendarCheck2 className="size-4" />
              </div>
              <h3 className="text-sm font-bold text-foreground">
                {bi('الجلسات الأخيرة', 'Recent Sessions', 'دانیشتنە نوێیەکان')}
              </h3>
            </div>
            <button
              type="button"
              onClick={onViewAllSessions}
              className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              <span>{bi('عرض الكل', 'View All', 'هەموو')}</span>
              <ChevronLeft className="size-3.5 rtl:rotate-0 ltr:rotate-180" />
            </button>
          </div>

          <div className="pt-1">
            {episodeSessions.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {episodeSessions
                  .slice(-2)
                  .reverse()
                  .map((sess) => {
                    const isCompleted = sess.data.status === 'finalized';
                    return (
                      <div
                        key={sess.id}
                        onClick={() => onOpenSession(sess.id)}
                        className="p-3 rounded-xl bg-surface/70 border border-card-line hover:border-primary/30 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${
                              isCompleted ? 'bg-emerald-500/15 text-emerald-600' : 'bg-primary/10 text-primary'
                            }`}
                          >
                            <CheckCircle2 className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-foreground truncate">
                              {bi('جلسة', 'Session', 'دانیشتن')} #{sess.data.sessionNumber || 1}
                            </div>
                            <div className="text-[11px] text-muted-foreground-1 flex items-center gap-1.5 tabular-nums">
                              <span>{formatClinicalDate(sess.data.sessionDate)}</span>
                              <span>•</span>
                              <span>
                                {sess.data.sessionDurationMinutes || 45} {bi('دقيقة', 'min', 'خولەک')}
                              </span>
                            </div>
                          </div>
                        </div>

                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            isCompleted
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                              : 'bg-primary/15 text-primary border border-primary/30'
                          }`}
                        >
                          {isCompleted
                            ? bi('مكتملة', 'Completed', 'تەواوکراو')
                            : bi('مسودة', 'Draft', 'ڕەشنووس')}
                        </span>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="text-center py-4 text-xs text-muted-foreground-1">
                <p>
                  {bi(
                    'لا توجد جلسات مسجلة لهذه الحلقة بعد',
                    'No sessions recorded yet for this episode',
                    'هیچ دانیشتنێک تۆمار نەکراوە'
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
