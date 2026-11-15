// =======================================================================
// PhysioRecord — Sticky Patient Clinical Safety Banner (Batch 1 P0)
// Persistent on ALL patient pages (Desktop 1440px + Mobile 390px, never hidden in a drawer):
// Displays Name, Age/Sex, Sequential MRN (PT-000123), Phone, DEMO badge,
// and an inline-expandable Red Flags / Contraindications chip (red ONLY when flagged).
// =======================================================================

import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { PatientRecord } from '../../types/clinical';
import { computePatientAge, formatIraqiPhoneDisplay } from '../../utils/date';
import {
  getPatientMrn,
  getPatientDisplayName,
  getPatientSecondaryName,
  isDemoPatient,
  hasPatientRedFlagsOrContraindications,
  isMeaningfulClinicalAlertText,
} from '../../utils/mrn';
import { DemoBadge, Num } from '../ui/Primitives';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import {
  ArrowLeft,
  ArrowRight,
  Phone,
  ShieldAlert,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Star,
} from 'lucide-react';

interface PatientBannerProps {
  patient: PatientRecord;
  onBackToDirectory: () => void;
}

export const PatientBanner: React.FC<PatientBannerProps> = ({
  patient,
  onBackToDirectory,
}) => {
  const { language, bi, isRtl } = useLanguage();
  const [isFlagsExpanded, setIsFlagsExpanded] = useState(false);
  const [isPinned, setIsPinned] = useState<boolean>(() =>
    ClinicOperationsService.isPatientPinned(patient.id)
  );

  const d = patient.data;
  const mrn = getPatientMrn(patient);
  const isDemo = isDemoPatient(patient);
  const age = computePatientAge(d.dateOfBirth, d.age);
  const phone = d.phone || d.phoneNumber || '';
  const hasAlerts = hasPatientRedFlagsOrContraindications(d);

  const hasRedFlagsText = isMeaningfulClinicalAlertText(d.redFlags);
  const hasContraText = isMeaningfulClinicalAlertText(d.contraindications);
  const hasPrecautionsText = isMeaningfulClinicalAlertText(d.precautions);
  const hasAllergiesText = isMeaningfulClinicalAlertText(d.allergies);

  return (
    <div
      className="sticky top-0 z-20 bg-card border-b border-card-line px-3 sm:px-5 py-1.5 shrink-0 shadow-2xs transition-colors"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
        {/* Left / Start: Back + Patient Identity + MRN + Age/Sex + Phone */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBackToDirectory}
            aria-label={bi('العودة لدليل المرضى', 'Back to patient directory', 'گەڕانەوە بۆ تۆماری نەخۆشەکان')}
            className="size-7 sm:size-8 rounded-lg bg-layer border border-layer-line text-muted-foreground-1 hover:text-foreground hover:bg-layer-hover flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title={bi('العودة لدليل المرضى', 'Back to directory', 'گەڕانەوە بۆ تۆمار')}
          >
            {isRtl ? <ArrowRight className="size-4" /> : <ArrowLeft className="size-4" />}
          </button>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-foreground truncate max-w-[180px] sm:max-w-none">
              {getPatientDisplayName(d, language)}
            </h2>
            {getPatientSecondaryName(d, language) && (
              <span className="hidden lg:inline text-xs text-muted-foreground-1 truncate max-w-[220px]">
                <bdi>{getPatientSecondaryName(d, language)}</bdi>
              </span>
            )}

            {isDemo && <DemoBadge />}

            <span className="py-0.5 px-1.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-bold shrink-0">
              <bdi dir="ltr">{mrn}</bdi>
            </span>

            <span className="text-xs text-muted-foreground-1 font-medium shrink-0">
              {d.gender === 'male'
                ? bi('ذكر', 'Male', 'نێر')
                : bi('أنثى', 'Female', 'مێ')}
              {age !== undefined && (
                <>
                  {' · '}
                  <Num value={age} /> {bi('سنة', 'yrs', 'ساڵ')}
                </>
              )}
              {d.dateOfBirth && (
                <span className="hidden xl:inline">
                  {' · '}
                  <bdi dir="ltr">{d.dateOfBirth}</bdi>
                </span>
              )}
            </span>

            {phone && (
              <span className="hidden md:inline-flex items-center gap-1 text-xs text-muted-foreground-1 tabular-nums bg-surface px-2 py-0.5 rounded-md border border-line-2 shrink-0">
                <Phone className="size-3 text-primary shrink-0" />
                <bdi dir="ltr">{formatIraqiPhoneDisplay(phone)}</bdi>
              </span>
            )}
          </div>
        </div>

        {/* Right / End: Pin Patient Star + Red Flags / Contraindications Chip */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsPinned(ClinicOperationsService.togglePinnedPatient(patient.id))}
            aria-pressed={isPinned}
            title={bi('تثبيت المريض في الوصول السريع', 'Pin patient for quick access', 'جێگیرکردنی نەخۆش بۆ دەستگەیشتنی خێرا')}
            className={`min-h-[30px] px-2 py-0.5 rounded-lg border text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer ${
              isPinned
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                : 'bg-surface border-line-2 text-muted-foreground-1 hover:text-foreground'
            }`}
          >
            <Star className={`size-3.5 ${isPinned ? 'fill-current' : ''}`} />
            <span className="hidden sm:inline">
              {isPinned ? bi('مثبّت', 'Pinned', 'جێگیرکراو') : bi('تثبيت', 'Pin', 'جێگیرکردن')}
            </span>
          </button>
          {hasAlerts ? (
            <button
              type="button"
              onClick={() => setIsFlagsExpanded((prev) => !prev)}
              aria-expanded={isFlagsExpanded}
              className="min-h-[30px] py-0.5 px-2.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ShieldAlert className="size-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>
                {bi('علامات حمراء ومحاذير', 'Red flags / Alerts', 'ئاڵا سوورەکان و ئاگادارییەکان')}
              </span>
              {isFlagsExpanded ? (
                <ChevronUp className="size-3.5 shrink-0" />
              ) : (
                <ChevronDown className="size-3.5 shrink-0" />
              )}
            </button>
          ) : (
            <span className="min-h-[30px] py-0.5 px-2.5 rounded-lg bg-surface text-muted-foreground-1 border border-line-2 text-xs font-medium inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-muted-foreground-1 shrink-0" />
              <span>{bi('لا توجد علامات حمراء', 'No red flags', 'هیچ ئاڵایەکی سوور نییە')}</span>
            </span>
          )}
        </div>
      </div>

      {/* Inline Expanded Red Flags / Contraindications Details */}
      {hasAlerts && isFlagsExpanded && (
        <div className="mt-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs space-y-1">
          {hasRedFlagsText && (
            <div className="flex flex-wrap gap-1.5">
              <span className="font-bold text-rose-700 dark:text-rose-300">
                {bi('علامات حمراء:', 'Red Flags:', 'ئاڵا سوورەکان:')}
              </span>
              <span className="text-foreground font-medium"><bdi dir="auto">{d.redFlags}</bdi></span>
            </div>
          )}
          {hasContraText && (
            <div className="flex flex-wrap gap-1.5">
              <span className="font-bold text-rose-700 dark:text-rose-300">
                {bi('موانع الاستعمال:', 'Contraindications:', 'قەدەغەکراوەکان:')}
              </span>
              <span className="text-foreground font-medium"><bdi dir="auto">{d.contraindications}</bdi></span>
            </div>
          )}
          {hasPrecautionsText && (
            <div className="flex flex-wrap gap-1.5">
              <span className="font-bold text-amber-700 dark:text-amber-300">
                {bi('محاذير واحتياطات:', 'Precautions:', 'وریابوون و ئاگادارییەکان:')}
              </span>
              <span className="text-foreground font-medium"><bdi dir="auto">{d.precautions}</bdi></span>
            </div>
          )}
          {hasAllergiesText && (
            <div className="flex flex-wrap gap-1.5">
              <span className="font-bold text-muted-foreground-1">
                {bi('الحساسية:', 'Allergies:', 'هەستیاری:')}
              </span>
              <span className="text-foreground">{d.allergies}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
