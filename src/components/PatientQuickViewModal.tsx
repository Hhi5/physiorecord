// =======================================================================
// PhysioRecord — Read-Only Patient Clinical Quick-View Popup
// Opens on patient click in PatientDirectory to preview the patient's
// complete structured text report without accidental chart edits, with
// one-click Copy Text, Print Dossier, and "Open Patient Chart" action.
// =======================================================================

import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  Copy,
  FileText,
  FolderOpen,
  Layers,
  Paperclip,
  Phone,
  Printer,
  ShieldAlert,
  Stethoscope,
  Wallet,
} from 'lucide-react';
import type {
  EpisodeRecord,
  PatientRecord,
  SessionRecord,
  SoapNoteRecord,
} from '../types/clinical';
import type { EpisodeScopedClinicalStore } from '../types/clinicManagement';
import { useLanguage } from '../context/LanguageContext';
import { useVault } from '../context/VaultContext';
import { usePatients } from '../context/PatientContext';
import { useCurrency } from '../context/CurrencyContext';
import { EpisodeService } from '../services/episodeService';
import { SessionService } from '../services/sessionService';
import { SoapService } from '../services/soapService';
import {
  ClinicOperationsService,
  ROLE_PERMISSIONS,
} from '../services/clinicOperationsService';
import {
  buildPatientQuickSummary,
  renderPatientSummaryText,
} from '../utils/patientSummary';
import { ModalDialog } from './ui/Dialog';

const PrintDocumentModal = lazy(() =>
  import('./print/PrintDocumentModal').then((m) => ({ default: m.PrintDocumentModal }))
);

interface PatientQuickViewModalProps {
  patient: PatientRecord | null;
  patientIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  onOpenFullChart: (patient: PatientRecord) => void;
}

interface LoadedPatientReportData {
  episodes: EpisodeRecord[];
  episodeStores: Record<string, EpisodeScopedClinicalStore>;
  sessionsByEpisode: Record<string, SessionRecord[]>;
  latestSoapByEpisode: Record<string, SoapNoteRecord | null>;
  allSessions: SessionRecord[];
  allSoaps: SoapNoteRecord[];
  nprsSeriesByEpisode: Record<string, Array<{ sessionNumber: number; date: string; pain: number }>>;
}

const EMPTY_LOADED_DATA: LoadedPatientReportData = {
  episodes: [],
  episodeStores: {},
  sessionsByEpisode: {},
  latestSoapByEpisode: {},
  allSessions: [],
  allSoaps: [],
  nprsSeriesByEpisode: {},
};

const FRACTION_SPLIT_RE = /(\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?)/g;
const FRACTION_EXACT_RE = /^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/;

const BidiClinicalText: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(FRACTION_SPLIT_RE);
  if (parts.length <= 1) {
    return <>{text}</>;
  }
  return (
    <>
      {parts.map((part, idx) =>
        FRACTION_EXACT_RE.test(part) ? (
          <bdi key={idx} dir="ltr" className="tabular-nums font-semibold">
            {part.replace(/\s+/g, '')}
          </bdi>
        ) : (
          <React.Fragment key={idx}>{part}</React.Fragment>
        )
      )}
    </>
  );
};

export const PatientQuickViewModal: React.FC<PatientQuickViewModalProps> = ({
  patient,
  patientIndex = 0,
  isOpen,
  onClose,
  onOpenFullChart,
}) => {
  const { language, bi } = useLanguage();
  const { dek } = useVault();
  const { loadFullPatientById } = usePatients();
  const { currency } = useCurrency();

  const [loading, setLoading] = useState(false);
  const [resolvedPatient, setResolvedPatient] = useState<PatientRecord | null>(patient);
  const [loadedData, setLoadedData] = useState<LoadedPatientReportData>(EMPTY_LOADED_DATA);
  const [showPlainText, setShowPlainText] = useState(false);
  const [copied, setCopied] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const activeStaff = ClinicOperationsService.getActiveStaff();
  const canViewFinance = ROLE_PERMISSIONS[activeStaff.role]?.canCollectPaymentsIQD ?? false;

  useEffect(() => {
    if (!isOpen || !patient || !dek) {
      setLoadedData(EMPTY_LOADED_DATA);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setResolvedPatient(patient);
    setLoading(true);
    setCopied(false);

    void (async () => {
      try {
        if (patient.isSummaryOnly) {
          const full = await loadFullPatientById(patient.id);
          if (!cancelled && full) {
            setResolvedPatient(full);
          }
        }
        const episodes = await EpisodeService.getEpisodesByPatient(patient.id, dek);
        await ClinicOperationsService.ensurePatientColdStoresLoadedAsync(
          patient.id,
          episodes.map((ep) => ep.id)
        );
        const episodeStores: Record<string, EpisodeScopedClinicalStore> = {};
        const sessionsByEpisode: Record<string, SessionRecord[]> = {};
        const latestSoapByEpisode: Record<string, SoapNoteRecord | null> = {};
        const nprsSeriesByEpisode: Record<
          string,
          Array<{ sessionNumber: number; date: string; pain: number }>
        > = {};
        const allSessions: SessionRecord[] = [];
        const allSoaps: SoapNoteRecord[] = [];

        for (const ep of episodes) {
          episodeStores[ep.id] = ClinicOperationsService.getEpisodeClinicalStore(
            ep.id,
            patient.id
          );

          const epSessions = await SessionService.getSessionsByEpisode(ep.id, dek);
          sessionsByEpisode[ep.id] = epSessions;
          allSessions.push(...epSessions);

          const latestResult = await SoapService.getLatestEpisodeSoapNote(
            ep.id,
            undefined,
            dek
          );
          latestSoapByEpisode[ep.id] = latestResult.soapNote;

          const points: Array<{ sessionNumber: number; date: string; pain: number }> = [];
          for (const sess of epSessions) {
            try {
              const soap = await SoapService.getSoapNoteBySession(sess.id, dek);
              if (soap) {
                allSoaps.push(soap);
                const pain = soap.data.subjective?.painNrsScore;
                if (typeof pain === 'number' && Number.isFinite(pain)) {
                  points.push({
                    sessionNumber: sess.sessionNumber,
                    date: sess.sessionDate,
                    pain,
                  });
                }
              }
            } catch {
              // Skip unreadable draft safely
            }
          }
          nprsSeriesByEpisode[ep.id] = points;
        }

        if (!cancelled) {
          setLoadedData({
            episodes,
            episodeStores,
            sessionsByEpisode,
            latestSoapByEpisode,
            allSessions,
            allSoaps,
            nprsSeriesByEpisode,
          });
        }
      } catch (err) {
        console.error('Failed to load quick patient report:', err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, patient, dek]);

  const effectivePatient = resolvedPatient && resolvedPatient.id === patient?.id ? resolvedPatient : patient;

  const summary = useMemo(() => {
    if (!effectivePatient) return null;
    const appointments = ClinicOperationsService.getAppointments().filter(
      (a) => a.patientId === effectivePatient.id
    );
    const invoices = canViewFinance
      ? ClinicOperationsService.getInvoicesIQD().filter((i) => i.patientId === effectivePatient.id)
      : [];

    return buildPatientQuickSummary({
      patient: effectivePatient,
      patientIndex,
      episodes: loadedData.episodes,
      episodeStores: loadedData.episodeStores,
      latestSoapByEpisode: loadedData.latestSoapByEpisode,
      sessionsByEpisode: loadedData.sessionsByEpisode,
      nprsSeriesByEpisode: loadedData.nprsSeriesByEpisode,
      appointments,
      invoices,
      canViewFinance,
      currencyCode: currency.code,
      language,
    });
  }, [patient, patientIndex, loadedData, canViewFinance, currency.code, language]);

  const plainTextReport = useMemo(() => {
    if (!summary) return '';
    return renderPatientSummaryText(summary, language);
  }, [summary, language]);

  const handleCopyReport = async () => {
    if (!plainTextReport) return;
    try {
      await navigator.clipboard.writeText(plainTextReport);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setShowPlainText(true);
    }
  };

  if (!patient || !summary) return null;

  const activeEp = loadedData.episodes.find((e) => e.status === 'active') || loadedData.episodes[0] || null;
  const activeStore = activeEp ? loadedData.episodeStores[activeEp.id] || null : null;

  return (
    <>
      <ModalDialog
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        size="xl"
        title={`${summary.header.primaryName}${summary.header.secondaryName ? ` (${summary.header.secondaryName})` : ''}`}
        subtitle={`${bi('التقرير السريري المختصر', 'Quick Read-Only Clinical Report')} · MRN: ${summary.header.mrn}`}
        closeLabel={bi('إغلاق', 'Close')}
        headerActions={
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowPlainText((v) => !v)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                showPlainText
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-surface border-line-2 text-foreground hover:border-primary/40'
              }`}
            >
              <FileText className="size-3.5" />
              <span>{bi('عرض النص المنسق للنسخ', 'Plain Text View')}</span>
            </button>
            <button
              type="button"
              onClick={handleCopyReport}
              className="px-2.5 py-1.5 rounded-xl bg-surface border border-line-2 hover:border-primary/40 text-xs font-semibold text-foreground inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="size-3.5 text-emerald-600" />
                  <span className="text-emerald-700 dark:text-emerald-300">
                    {bi('تم نسخ التقرير', 'Copied')}
                  </span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  <span>{bi('نسخ التقرير النصي', 'Copy Text')}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setPrintOpen(true)}
              className="px-2.5 py-1.5 rounded-xl bg-surface border border-line-2 hover:border-primary/40 text-xs font-semibold text-foreground inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="size-3.5" />
              <span>{bi('طباعة التقرير', 'Print')}</span>
            </button>
          </div>
        }
        footer={
          <div className="w-full flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-line-2 bg-surface hover:bg-muted text-foreground text-xs sm:text-sm font-semibold cursor-pointer"
            >
              {bi('إغلاق', 'Close')}
            </button>
            <button
              type="button"
              onClick={() => onOpenFullChart(patient)}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer shadow-2xs"
            >
              <FolderOpen className="size-4" />
              <span>{bi('فتح الملف السريري', 'Open Patient Chart')}</span>
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-xs sm:text-sm">
          {loading && (
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs text-primary font-semibold">
              {bi(
                'جاري تحميل وتفكيك التقرير المشفر...',
                'Decrypting encrypted patient chart summary...'
              )}
            </div>
          )}

          {showPlainText ? (
            <pre
              dir="auto"
              className="p-4 rounded-2xl bg-surface border border-line-2 text-xs leading-relaxed text-foreground whitespace-pre-wrap font-sans overflow-x-auto select-text"
            >
              <BidiClinicalText text={plainTextReport} />
            </pre>
          ) : (
            <>
              {/* Demographics & Referral Summary */}
              <section className="p-4 rounded-2xl bg-surface border border-line-2 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-primary">
                  <Stethoscope className="size-4" />
                  <span>{bi('البيانات الشخصية والتحويل', 'Demographics & Referral')}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <span className="text-muted-foreground-1">
                      {bi('الجنس / العمر:', 'Gender / Age:')}{' '}
                    </span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {summary.header.genderLabel}
                      {summary.header.age !== undefined ? ` · ${summary.header.age}` : ''}
                    </span>
                  </div>
                  {summary.header.phone && (
                    <div className="inline-flex items-center gap-1.5">
                      <Phone className="size-3.5 text-muted-foreground-1" />
                      <bdi dir="ltr" className="font-semibold text-foreground tabular-nums">
                        {summary.header.phone}
                      </bdi>
                    </div>
                  )}
                  {summary.header.occupation && (
                    <div>
                      <span className="text-muted-foreground-1">{bi('المهنة:', 'Occupation:')} </span>
                      <span className="font-semibold text-foreground">{summary.header.occupation}</span>
                    </div>
                  )}
                  {summary.header.address && (
                    <div>
                      <span className="text-muted-foreground-1">{bi('العنوان:', 'Address:')} </span>
                      <span className="font-semibold text-foreground">{summary.header.address}</span>
                    </div>
                  )}
                  {(summary.header.referringPhysician || summary.header.referringClinic) && (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground-1">
                        {bi('الطبيب المحيل:', 'Referring MD:')}{' '}
                      </span>
                      <span className="font-semibold text-foreground">
                        {[summary.header.referringPhysician, summary.header.referringClinic]
                          .filter(Boolean)
                          .join(' — ')}
                      </span>
                    </div>
                  )}
                  {summary.header.emergencyContact && (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground-1">
                        {bi('جهة الطوارئ:', 'Emergency Contact:')}{' '}
                      </span>
                      <span className="font-semibold text-foreground">
                        {summary.header.emergencyContact}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground-1">{bi('آخر تحديث:', 'Updated:')} </span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {summary.header.updatedAtLabel}
                    </span>
                  </div>
                </div>
              </section>

              {/* Safety Alerts & Red Flags */}
              {summary.alerts.hasAnyAlert && (
                <section className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-700 dark:text-rose-300">
                    <ShieldAlert className="size-4" />
                    <span>
                      {bi('التنبيهات والمحاذير السريرية', 'Clinical Alerts & Red Flags')}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-rose-800 dark:text-rose-200 leading-relaxed">
                    {summary.alerts.redFlags && (
                      <p>
                        <strong>{bi('علامات الخطر:', 'Red Flags:')}</strong>{' '}
                        <BidiClinicalText text={summary.alerts.redFlags} />
                      </p>
                    )}
                    {summary.alerts.checklistAlerts.map((item, idx) => (
                      <p key={idx} className="inline-flex items-center gap-1.5 me-3">
                        <AlertTriangle className="size-3.5 shrink-0" />
                        <span><BidiClinicalText text={item} /></span>
                      </p>
                    ))}
                    {summary.alerts.allergies && (
                      <p>
                        <strong>{bi('الحساسية:', 'Allergies:')}</strong>{' '}
                        <BidiClinicalText text={summary.alerts.allergies} />
                      </p>
                    )}
                    {summary.alerts.precautions && (
                      <p>
                        <strong>{bi('الاحتياطات:', 'Precautions:')}</strong>{' '}
                        <BidiClinicalText text={summary.alerts.precautions} />
                      </p>
                    )}
                    {summary.alerts.contraindications && (
                      <p>
                        <strong>{bi('الموانع:', 'Contraindications:')}</strong>{' '}
                        <BidiClinicalText text={summary.alerts.contraindications} />
                      </p>
                    )}
                  </div>
                </section>
              )}

              {/* Medical History & Medications */}
              {(summary.clinicalBackground.medicalHistory ||
                summary.clinicalBackground.previousSurgeries ||
                summary.clinicalBackground.currentMedications ||
                summary.clinicalBackground.generalNotes) && (
                <section className="p-4 rounded-2xl bg-card border border-card-line space-y-2">
                  <h4 className="text-xs font-bold text-foreground">
                    {bi('التاريخ الطبي والأدوية', 'Medical History & Medications')}
                  </h4>
                  <div className="space-y-1.5 text-xs text-muted-foreground-2 leading-relaxed">
                    {summary.clinicalBackground.medicalHistory && (
                      <p>
                        <strong className="text-foreground">
                          {bi('التاريخ المرضي:', 'History:')}{' '}
                        </strong>
                        <BidiClinicalText text={summary.clinicalBackground.medicalHistory} />
                      </p>
                    )}
                    {summary.clinicalBackground.previousSurgeries && (
                      <p>
                        <strong className="text-foreground">
                          {bi('العمليات السابقة:', 'Surgeries:')}{' '}
                        </strong>
                        <BidiClinicalText text={summary.clinicalBackground.previousSurgeries} />
                      </p>
                    )}
                    {summary.clinicalBackground.currentMedications && (
                      <p>
                        <strong className="text-foreground">
                          {bi('الأدوية الحالية:', 'Medications:')}{' '}
                        </strong>
                        <BidiClinicalText text={summary.clinicalBackground.currentMedications} />
                      </p>
                    )}
                    {summary.clinicalBackground.generalNotes && (
                      <p>
                        <strong className="text-foreground">
                          {bi('ملاحظات عامة:', 'General Notes:')}{' '}
                        </strong>
                        <BidiClinicalText text={summary.clinicalBackground.generalNotes} />
                      </p>
                    )}
                  </div>
                </section>
              )}

              {/* Episodes & Latest SOAP Summary */}
              <section className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <Layers className="size-4 text-primary" />
                  <span>
                    {bi('الحلقات العلاجية والتقييم', 'Care Episodes & Assessment')} (
                    {summary.episodes.length})
                  </span>
                </div>

                {summary.episodes.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-surface border border-line-2 text-xs text-muted-foreground-1">
                    {bi('لا توجد بيانات مسجلة', 'No care episodes documented yet.')}
                  </div>
                ) : (
                  summary.episodes.map((ep) => (
                    <div
                      key={ep.episodeId}
                      className="p-4 rounded-2xl bg-card border border-card-line space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h5 className="text-xs sm:text-sm font-bold text-foreground">
                            {ep.title}
                          </h5>
                          {ep.diagnosis && (
                            <p className="text-xs text-muted-foreground-1">{ep.diagnosis}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
                          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                            {ep.statusLabel}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-surface border border-line-2 text-muted-foreground-1">
                            {ep.specialtyLabel}
                          </span>
                          <span className="text-muted-foreground-1">
                            {ep.startDate}
                            {ep.endDate ? ` → ${ep.endDate}` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1 text-xs leading-relaxed text-muted-foreground-2">
                        {ep.chiefComplaint && (
                          <p>
                            <strong className="text-foreground">
                              {bi('الشكوى الرئيسية:', 'Chief Complaint:')}{' '}
                            </strong>
                            <BidiClinicalText text={ep.chiefComplaint} />
                          </p>
                        )}
                        {ep.clinicalImpression && (
                          <p>
                            <strong className="text-foreground">
                              {bi('التقييم السريري:', 'Impression:')}{' '}
                            </strong>
                            <BidiClinicalText text={ep.clinicalImpression} />
                          </p>
                        )}
                        {ep.painSnapshot && (
                          <p>
                            <strong className="text-foreground">
                              {bi('تقييم الألم:', 'Baseline Pain:')}{' '}
                            </strong>
                            <BidiClinicalText text={ep.painSnapshot} />
                          </p>
                        )}
                        {ep.nprsTrajectory.length > 0 && (
                          <p>
                            <strong className="text-foreground">
                              {bi('مسار الألم (NPRS):', 'NPRS Trajectory:')}{' '}
                            </strong>
                            <span className="font-semibold text-primary">
                              <BidiClinicalText text={ep.nprsTrajectory.join(' → ')} />
                            </span>
                          </p>
                        )}
                        {ep.specialTestsSummary.length > 0 && (
                          <p>
                            <strong className="text-foreground">
                              {bi('الفحوصات التخصصية:', 'Special Tests:')}{' '}
                            </strong>
                            <BidiClinicalText text={ep.specialTestsSummary.join(' · ')} />
                          </p>
                        )}
                        {ep.bodyMarkersSummary.length > 0 && (
                          <p>
                            <strong className="text-foreground">
                              {bi('مخطط الجسم:', 'Body Chart:')}{' '}
                            </strong>
                            <BidiClinicalText text={ep.bodyMarkersSummary.join(' · ')} />
                          </p>
                        )}
                      </div>

                      {ep.latestSoap && (
                        <div className="p-3 rounded-xl bg-surface border border-line-2 space-y-1 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-foreground">
                            <span>
                              {bi('آخر ملاحظة SOAP', 'Latest SOAP Note')}
                              {ep.latestSoap.sessionDate ? ` (${ep.latestSoap.sessionDate})` : ''}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs ${
                                ep.latestSoap.isFinalized
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              }`}
                            >
                              {ep.latestSoap.isFinalized
                                ? bi('مختوم نهائياً', 'Finalized')
                                : bi('مسودة', 'Draft')}
                            </span>
                          </div>
                          {ep.latestSoap.painPrePost && (
                            <p className="text-primary font-semibold">
                              <BidiClinicalText text={ep.latestSoap.painPrePost} />
                            </p>
                          )}
                          {ep.latestSoap.subjective && (
                            <p>
                              <strong>S:</strong>{' '}
                              <BidiClinicalText text={ep.latestSoap.subjective} />
                            </p>
                          )}
                          {ep.latestSoap.objective && (
                            <p>
                              <strong>O:</strong>{' '}
                              <BidiClinicalText text={ep.latestSoap.objective} />
                            </p>
                          )}
                          {ep.latestSoap.assessment && (
                            <p>
                              <strong>A:</strong>{' '}
                              <BidiClinicalText text={ep.latestSoap.assessment} />
                            </p>
                          )}
                          {ep.latestSoap.plan && (
                            <p>
                              <strong>P:</strong>{' '}
                              <BidiClinicalText text={ep.latestSoap.plan} />
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </section>

              {/* Imaging & Documents */}
              {summary.attachments.length > 0 && (
                <section className="p-4 rounded-2xl bg-card border border-card-line space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <Paperclip className="size-4 text-primary" />
                    <span>
                      {bi('المستندات والأشعة والرنين', 'Imaging & Clinical Documents')} (
                      {summary.attachments.length})
                    </span>
                  </div>
                  <div className="divide-y divide-card-divider">
                    {summary.attachments.map((att) => (
                      <div key={att.id} className="py-2 text-xs space-y-0.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-foreground">{att.title}</span>
                          <div className="flex items-center gap-2 text-muted-foreground-1">
                            <span className="px-2 py-0.5 rounded-full bg-surface border border-line-2">
                              {att.categoryLabel}
                            </span>
                            {att.studyDate && <span className="tabular-nums">{att.studyDate}</span>}
                          </div>
                        </div>
                        {att.summaryNotes && (
                          <p className="text-muted-foreground-2">
                            <BidiClinicalText text={att.summaryNotes} />
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Appointments */}
              {summary.appointments.length > 0 && (
                <section className="p-4 rounded-2xl bg-card border border-card-line space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <Calendar className="size-4 text-primary" />
                    <span>
                      {bi('المواعيد', 'Appointments')} ({summary.appointments.length})
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {summary.appointments.map((appt) => (
                      <div
                        key={appt.id}
                        className="p-2.5 rounded-xl bg-surface border border-line-2 flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-bold text-foreground tabular-nums">
                            {appt.date} · {appt.startTime}
                          </div>
                          <div className="text-muted-foreground-1">{appt.therapistName}</div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-card border border-card-line text-xs">
                          {appt.statusLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Financial Summary (Strictly RBAC gated) */}
              {summary.finance && (
                <section className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    <Wallet className="size-4" />
                    <span>{bi('الملخص المالي', 'Financial Summary')}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs tabular-nums">
                    <div>
                      <div className="text-muted-foreground-1">{bi('الفواتير', 'Invoices')}</div>
                      <div className="font-bold text-foreground">{summary.finance.invoiceCount}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground-1">{bi('الصافي', 'Net Total')}</div>
                      <div className="font-bold text-foreground">
                        {summary.finance.formattedTotalNet}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground-1">{bi('المدفوع', 'Paid')}</div>
                      <div className="font-bold text-emerald-700 dark:text-emerald-300">
                        {summary.finance.formattedTotalPaid}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground-1">{bi('المتبقي', 'Balance Due')}</div>
                      <div className="font-bold text-rose-700 dark:text-rose-300">
                        {summary.finance.formattedBalanceDue}
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </ModalDialog>

      {printOpen && (
        <Suspense fallback={null}>
          <PrintDocumentModal
            isOpen={printOpen}
            onClose={() => setPrintOpen(false)}
            documentType="patient_dossier"
            patient={patient}
            episode={activeEp}
            allEpisodes={loadedData.episodes}
            allPatientConsents={ClinicOperationsService.getConsentsForPatient(patient.id)}
            clinicalStore={activeStore}
            sessions={loadedData.allSessions}
            soaps={loadedData.allSoaps}
            hepProgram={activeStore?.hepProgram || []}
          />
        </Suspense>
      )}
    </>
  );
};
