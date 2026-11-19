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
      className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm border-b border-card-divider/60 ps-11 sm:ps-12 pe-3 sm:pe-5 py-1.5 shrink-0 transition-colors"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="flex items-center justify-between gap-2">
        {/* Start: Back + Compact Patient Identity */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={onBackToDirectory}
            aria-label={bi('العودة لدليل المرضى', 'Back to patient directory', 'گەڕانەوە بۆ تۆماری نەخۆشەکان')}
            className="size-8 rounded-lg hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title={bi('العودة لدليل المرضى', 'Back to directory', 'گەڕانەوە بۆ تۆمار')}
          >
            {isRtl ? <ArrowRight className="size-4" /> : <ArrowLeft className="size-4" />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-foreground truncate">
                {getPatientDisplayName(d, language)}
              </h1>
              {getPatientSecondaryName(d, language) && (
                <span className="hidden lg:inline text-xs text-muted-foreground-1 truncate max-w-[200px]">
                  <bdi>{getPatientSecondaryName(d, language)}</bdi>
                </span>
              )}
              {isDemo && <DemoBadge />}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground-1 truncate">
              <bdi dir="ltr" className="font-mono font-semibold text-primary">
                {mrn}
              </bdi>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">
                {d.gender === 'male' ? bi('ذكر', 'Male', 'نێر') : bi('أنثى', 'Female', 'مێ')}
                {age !== undefined && (
                  <>
                    {' · '}
                    <Num value={age} /> {bi('س', 'y', 'س')}
                  </>
                )}
              </span>
              {d.dateOfBirth && (
                <span className="hidden xl:inline font-mono">
                  · <bdi dir="ltr">{d.dateOfBirth}</bdi>
                </span>
              )}
              {phone && (
                <span className="hidden md:inline-flex items-center gap-1 tabular-nums">
                  <span>·</span>
                  <Phone className="size-3 text-primary shrink-0" />
                  <bdi dir="ltr">{formatIraqiPhoneDisplay(phone)}</bdi>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* End: Compact Pin Star + Red Flags / Safety Shield */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setIsPinned(ClinicOperationsService.togglePinnedPatient(patient.id))}
            aria-pressed={isPinned}
            aria-label={isPinned ? bi('إلغاء تثبيت المريض', 'Unpin patient') : bi('تثبيت المريض', 'Pin patient')}
            title={bi('تثبيت المريض في الوصول السريع', 'Pin patient for quick access', 'جێگیرکردنی نەخۆش بۆ دەستگەیشتنی خێرا')}
            className={`size-8 sm:w-auto sm:px-2.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer ${
              isPinned
                ? 'text-amber-700 dark:text-amber-300 hover:bg-surface/80'
                : 'text-muted-foreground-1 hover:text-foreground hover:bg-layer-hover'
            }`}
          >
            <Star className={`size-4 sm:size-3.5 shrink-0 ${isPinned ? 'fill-current' : ''}`} />
            <span className="hidden sm:inline">
              {isPinned ? bi('مثبّت', 'Pinned', 'جێگیرکراو') : bi('تثبيت', 'Pin', 'جێگیرکردن')}
            </span>
          </button>
          {hasAlerts ? (
            <button
              type="button"
              onClick={() => setIsFlagsExpanded((prev) => !prev)}
              aria-expanded={isFlagsExpanded}
              className="min-h-[32px] py-1 px-2 sm:px-2.5 rounded-lg hover:bg-surface/80 text-rose-700 dark:text-rose-400 text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <ShieldAlert className="size-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
              <span className="hidden sm:inline">
                {bi('علامات حمراء ومحاذير', 'Red flags / Alerts', 'ئاڵا سوورەکان و ئاگادارییەکان')}
              </span>
              <span className="sm:hidden">
                {bi('محاذير', 'Alerts', 'ئاگاداری')}
              </span>
              {isFlagsExpanded ? (
                <ChevronUp className="size-3.5 shrink-0" />
              ) : (
                <ChevronDown className="size-3.5 shrink-0" />
              )}
            </button>
          ) : (
            <span
              title={bi('لا توجد علامات حمراء', 'No red flags', 'هیچ ئاڵایەکی سوور نییە')}
              className="min-h-[32px] px-1.5 sm:px-2 rounded-lg text-xs font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1"
            >
              <ShieldCheck className="size-4 sm:size-3.5 shrink-0" />
              <span className="hidden md:inline text-muted-foreground-1">
                {bi('لا توجد علامات حمراء', 'No red flags', 'هیچ ئاڵایەکی سوور نییە')}
              </span>
              <span className="md:hidden sr-only">
                {bi('لا توجد علامات حمراء', 'No red flags', 'هیچ ئاڵایەکی سوور نییە')}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Inline Expanded Red Flags / Contraindications Details */}
      {hasAlerts && isFlagsExpanded && (
        <div className="mt-2 p-2.5 rounded-xl bg-surface/65 text-xs space-y-1">
          {hasRedFlagsText && (
            <div className="flex flex-wrap gap-1.5">
              <span className="font-bold text-rose-700 dark:text-rose-400">
                {bi('علامات حمراء:', 'Red Flags:', 'ئاڵا سوورەکان:')}
              </span>
              <span className="text-foreground font-medium"><bdi dir="auto">{d.redFlags}</bdi></span>
            </div>
          )}
          {hasContraText && (
            <div className="flex flex-wrap gap-1.5">
              <span className="font-bold text-rose-700 dark:text-rose-400">
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
