import React, { Suspense, lazy } from 'react';
import { Download, Printer, Wallet } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { useVault } from '../../../context/VaultContext';
import { ClinicOperationsService } from '../../../services/clinicOperationsService';
import { SoapService } from '../../../services/soapService';
import type {
  EpisodeRecord,
  PatientRecord,
  SessionRecord,
  SoapNoteRecord,
} from '../../../types/clinical';
import type { EpisodeScopedClinicalStore } from '../../../types/clinicManagement';
import { localDate as getTodayIso } from '../../../utils/date';
import { buildPatientFhirR4Bundle } from '../../../utils/fhirExport';
import type { PrintableDocumentType } from '../../print/PrintDocumentModal';
import { Money, Num } from '../../ui/Primitives';

const ConsentSignaturePanel = lazy(() =>
  import('../../clinic/ConsentSignaturePanel').then((m) => ({
    default: m.ConsentSignaturePanel,
  }))
);

export interface ChartProfileTabProps {
  patient: PatientRecord;
  episodes: EpisodeRecord[];
  activeEpisode: EpisodeRecord | null;
  sessions: SessionRecord[];
  episodeStore: EpisodeScopedClinicalStore;
  financialSummary: {
    invoices: unknown[];
    totalBilledIQD: number;
    totalPaidIQD: number;
    totalDebtIQD: number;
  };
  enableScheduleVisitCardPrint: boolean;
  onAllPatientSoapsLoaded: (soaps: SoapNoteRecord[]) => void;
  onOpenPrintDoc: (docType: PrintableDocumentType) => void;
}

export const ChartProfileTab: React.FC<ChartProfileTabProps> = ({
  patient,
  episodes,
  activeEpisode,
  sessions,
  episodeStore,
  financialSummary,
  enableScheduleVisitCardPrint,
  onAllPatientSoapsLoaded,
  onOpenPrintDoc,
}) => {
  const { bi } = useLanguage();
  const { dek } = useVault();

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Patient Iraqi Financial Summary Strip (IQD) */}
      <div className="p-5 sm:p-6 rounded-2xl bg-card border border-card-line shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Wallet className="size-4 text-primary" />
            <span>
              {bi(
                'الملخص المالي للمريض بالدينار العراقي',
                'Patient Financial Summary (IQD)',
                'پوختەی دارایی نەخۆش بە دیناری عێراقی'
              )}
            </span>
          </h2>
          <span className="text-xs text-muted-foreground-1 tabular-nums">
            <Num value={financialSummary.invoices.length} /> {bi('فواتير', 'invoices', 'پسوولە')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 tabular-nums">
          <div className="p-4 rounded-xl bg-surface border border-line-2">
            <span className="text-xs text-muted-foreground-1 block font-sans">
              {bi('إجمالي المبالغ المفوترة', 'Total Billed', 'کۆی گشتیی پسوولەکراو')}
            </span>
            <span className="text-base font-bold text-foreground mt-0.5 block">
              <Money amount={financialSummary.totalBilledIQD} />
            </span>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-line-2">
            <span className="text-xs text-muted-foreground-1 block font-sans">
              {bi('إجمالي المدفوع نقداً / إلكترونياً', 'Total Paid', 'کۆی پارەی دراو (نەقد / ئەلیکترۆنی)')}
            </span>
            <span className="text-base font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 block">
              <Money amount={financialSummary.totalPaidIQD} />
            </span>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-line-2">
            <span className="text-xs text-muted-foreground-1 block font-sans">
              {bi('الرصيد المتبقي بذمة المريض (دين)', 'Balance Due (Debt)', 'پارەی ماوە لەسەر نەخۆش (قەرز)')}
            </span>
            <span
              className={`text-base font-bold mt-0.5 block ${
                financialSummary.totalDebtIQD > 0
                  ? 'text-rose-700 dark:text-rose-400'
                  : 'text-muted-foreground-1'
              }`}
            >
              <Money amount={financialSummary.totalDebtIQD} />
            </span>
          </div>
        </div>
      </div>

      {/* 4.6 Printable Clinical Reports Portal */}
      <div className="bg-card p-5 sm:p-6 rounded-2xl border border-card-line shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-card-divider pb-3">
          <div className="flex items-center gap-2">
            <Printer className="size-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">
              {bi(
                'التقارير الطبية والطباعة الرسمية (PDF)',
                'Official Printable Clinical Reports (PDF)',
                'ڕاپۆرتە پزیشکییەکان و چاپکردنی فەرمی (PDF)'
              )}
            </h2>
          </div>
          <span className="text-xs text-muted-foreground-1">
            {bi(
              'بترويسة وشعار وختم العيادة المشفر محلياً',
              'With encrypted clinic letterhead, logo & stamp',
              'بە سەردێڕ و لۆگۆ و مۆری کلینیکی کۆدکراوی ناوخۆیی'
            )}
          </span>
        </div>

        <div className="pr-hscroll overflow-x-auto flex items-center gap-2 whitespace-nowrap pb-1.5 pt-0.5 px-0.5">
          {(
            [
              {
                type: 'progress_report',
                ar: 'تقرير متابعة التقدم',
                en: 'Progress Report',
                ckb: 'ڕاپۆرتی بەدواداچوونی پێشکەوتن',
              },
              {
                type: 'discharge_summary',
                ar: 'ملخص التخريج',
                en: 'Discharge Summary',
                ckb: 'پوختەی دەرچوون',
              },
              {
                type: 'referral_letter',
                ar: 'كتاب إحالة طبية',
                en: 'Referral Letter',
                ckb: 'نامەی ڕەوانەکردنی پزیشکی',
              },
              {
                type: 'medical_report',
                ar: 'تقرير علاج طبيعي',
                en: 'Medical Report',
                ckb: 'ڕاپۆرتی چارەسەری سروشتی',
              },
              {
                type: 'patient_dossier',
                ar: 'الملف السريري الكامل (PDF)',
                en: 'Full Patient Dossier (PDF)',
                ckb: 'دۆسیەی کلینیکیی تەواو (PDF)',
              },
              ...(episodeStore.hepProgram.length > 0
                ? [
                    {
                      type: 'hep_sheet' as PrintableDocumentType,
                      ar: 'ورقة التمارين المنزلية (HEP)',
                      en: 'HEP Exercise Sheet',
                      ckb: 'لاپەڕەی ڕاهێنانی ماڵەوە (HEP)',
                    },
                  ]
                : []),
              ...(enableScheduleVisitCardPrint
                ? [
                    {
                      type: 'patient_visit_card' as PrintableDocumentType,
                      ar: 'بطاقة مواعيد المريض ورصيد الجلسات',
                      en: 'Patient Visit Card',
                      ckb: 'کارتی وادەکانی نەخۆش و ژمارەی دانیشتنەکان',
                      testId: 'print-patient-visit-card-btn',
                    },
                  ]
                : []),
            ] satisfies Array<{
              type: PrintableDocumentType;
              ar: string;
              en: string;
              ckb: string;
              testId?: string;
            }>
          ).map((item) => (
            <button
              key={item.type}
              type="button"
              data-testid={item.testId}
              onClick={async () => {
                if (item.type === 'patient_dossier' && dek) {
                  const loaded: SoapNoteRecord[] = [];
                  for (const s of sessions) {
                    try {
                      const note = await SoapService.getSoapNoteBySession(s.id, dek);
                      if (note) loaded.push(note);
                    } catch {
                      // skip unreadable draft
                    }
                  }
                  onAllPatientSoapsLoaded(loaded);
                }
                onOpenPrintDoc(item.type);
              }}
              className="py-2 px-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-surface hover:bg-gray-50 dark:hover:bg-neutral-800 text-xs font-semibold text-foreground inline-flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
            >
              <Printer className="size-3.5 text-primary" />
              <span>{bi(item.ar, item.en, item.ckb)}</span>
            </button>
          ))}

          <button
            type="button"
            onClick={async () => {
              if (!dek) return;
              const allSoaps: SoapNoteRecord[] = [];
              for (const s of sessions) {
                const note = await SoapService.getSoapNoteBySession(s.id, dek);
                if (note) allSoaps.push(note);
              }
              const stores = episodes.map((ep) =>
                ClinicOperationsService.getEpisodeClinicalStore(ep.id, patient.id)
              );
              const profile = ClinicOperationsService.getClinicProfile();
              const bundle = buildPatientFhirR4Bundle({
                patient,
                episodes,
                sessions,
                soaps: allSoaps,
                episodeStores: stores,
                clinicName: bi(profile.clinicNameAr, profile.clinicNameEn),
              });
              const blob = new Blob([JSON.stringify(bundle, null, 2)], {
                type: 'application/fhir+json;charset=utf-8',
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `patient-${patient.data.mrn || patient.id}-fhir-r4-${getTodayIso()}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
            className="py-2 px-3.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-semibold text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
          >
            <Download className="size-3.5" />
            <span>{bi('تصدير HL7 FHIR R4 JSON', 'Export FHIR R4 JSON', 'هەناردەکردنی HL7 FHIR R4 JSON')}</span>
          </button>
        </div>
      </div>

      {/* 4.8 Informed Consent & Encrypted Signature Pad */}
      <Suspense fallback={null}>
        <ConsentSignaturePanel patient={patient} episode={activeEpisode} />
      </Suspense>
    </div>
  );
};
