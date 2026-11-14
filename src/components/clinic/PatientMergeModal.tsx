// =======================================================================
// PhysioRecord — Phase D1: Transactional Patient Merge Modal
// Lazy-loaded via React.lazy; merges duplicate encrypted patient records
// into a single surviving chart after saving an encrypted recovery snapshot.
// =======================================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  GitMerge,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  X,
  UserCheck,
  ArrowRightLeft,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { usePatients } from '../../context/PatientContext';
import {
  findAllDirectoryDuplicatePairs,
  mergePatientsTransactional,
  type DuplicatePatientPair,
  type PatientMergeSummary,
} from '../../utils/dataQualityPhaseD';
import { getPatientDisplayName, getPatientMrn } from '../../utils/mrn';
import { formatDateDDMMYYYY, formatIraqiPhoneDisplay } from '../../utils/date';
import { Num } from '../ui/Primitives';

export interface PatientMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSurvivingPatientId?: string;
  initialSourcePatientId?: string;
  onMerged?: (survivingPatientId: string) => void;
}

export const PatientMergeModal: React.FC<PatientMergeModalProps> = ({
  isOpen,
  onClose,
  initialSurvivingPatientId,
  initialSourcePatientId,
  onMerged,
}) => {
  const { language, bi, isRtl } = useLanguage();
  const { dek } = useVault();
  const { activePatients, patients, refreshPatients } = usePatients();

  const [survivingPatientId, setSurvivingPatientId] = useState<string>('');
  const [sourcePatientId, setSourcePatientId] = useState<string>('');
  const [confirmChecked, setConfirmChecked] = useState<boolean>(false);
  const [merging, setMerging] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mergeSummary, setMergeSummary] = useState<PatientMergeSummary | null>(null);

  const detectedPairs = useMemo<DuplicatePatientPair[]>(
    () => findAllDirectoryDuplicatePairs(patients),
    [patients]
  );

  const selectablePatients = useMemo(() => {
    const byId = new Map(activePatients.map((p) => [p.id, p]));
    if (initialSurvivingPatientId && !byId.has(initialSurvivingPatientId)) {
      const found = patients.find((p) => p.id === initialSurvivingPatientId);
      if (found) byId.set(found.id, found);
    }
    if (initialSourcePatientId && !byId.has(initialSourcePatientId)) {
      const found = patients.find((p) => p.id === initialSourcePatientId);
      if (found) byId.set(found.id, found);
    }
    return Array.from(byId.values()).sort((a, b) =>
      getPatientDisplayName(a.data, language).localeCompare(
        getPatientDisplayName(b.data, language),
        language === 'en' ? 'en' : 'ar'
      )
    );
  }, [activePatients, patients, initialSurvivingPatientId, initialSourcePatientId, language]);

  useEffect(() => {
    if (!isOpen) return;
    setConfirmChecked(false);
    setMerging(false);
    setErrorMsg(null);
    setMergeSummary(null);

    if (initialSurvivingPatientId || initialSourcePatientId) {
      setSurvivingPatientId(initialSurvivingPatientId || '');
      setSourcePatientId(initialSourcePatientId || '');
    } else if (detectedPairs.length > 0) {
      setSurvivingPatientId(detectedPairs[0].primary.id);
      setSourcePatientId(detectedPairs[0].duplicate.id);
    } else {
      setSurvivingPatientId('');
      setSourcePatientId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialSurvivingPatientId, initialSourcePatientId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !merging) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, merging, onClose]);

  if (!isOpen) return null;

  const survivingPatient =
    patients.find((p) => p.id === survivingPatientId) || null;
  const sourcePatient =
    patients.find((p) => p.id === sourcePatientId) || null;

  const isSamePatient =
    Boolean(survivingPatientId) &&
    Boolean(sourcePatientId) &&
    survivingPatientId === sourcePatientId;

  const canExecute =
    Boolean(dek) &&
    Boolean(survivingPatient) &&
    Boolean(sourcePatient) &&
    !isSamePatient &&
    confirmChecked &&
    !merging;

  const formatReasons = (reasons: DuplicatePatientPair['matchReasons']): string => {
    return reasons
      .map((r) =>
        r === 'name'
          ? bi('تشابه الاسم', 'Name Match')
          : bi('تطابق رقم الهاتف', 'Phone Match')
      )
      .join(' • ');
  };

  const handleSelectPair = (pair: DuplicatePatientPair) => {
    setSurvivingPatientId(pair.primary.id);
    setSourcePatientId(pair.duplicate.id);
    setConfirmChecked(false);
    setErrorMsg(null);
    setMergeSummary(null);
  };

  const handleSwapDirection = () => {
    const nextSurviving = sourcePatientId;
    const nextSource = survivingPatientId;
    setSurvivingPatientId(nextSurviving);
    setSourcePatientId(nextSource);
    setConfirmChecked(false);
    setErrorMsg(null);
  };

  const handleExecuteMerge = async () => {
    if (!dek || !survivingPatientId || !sourcePatientId || isSamePatient || !confirmChecked) {
      return;
    }

    setMerging(true);
    setErrorMsg(null);
    try {
      const summary = await mergePatientsTransactional({
        survivingPatientId,
        sourcePatientId,
        dek,
      });
      await refreshPatients();
      setMergeSummary(summary);
      setSourcePatientId('');
      setConfirmChecked(false);
      onMerged?.(summary.survivingPatientId);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : bi('فشلت عملية دمج السجلين. لم يتم تعديل البيانات.', 'Failed to merge patient records. No data was altered.')
      );
    } finally {
      setMerging(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      dir={isRtl ? 'rtl' : 'ltr'}
      onClick={() => {
        if (!merging) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-merge-modal-title"
        data-testid="patient-merge-modal"
        className="w-full max-w-3xl max-h-[92vh] bg-layer border border-layer-line text-foreground rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-card-divider bg-surface/60 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <span className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <GitMerge className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2
                id="patient-merge-modal-title"
                className="text-base sm:text-lg font-bold text-foreground leading-snug"
              >
                {bi('دمج سجلات المرضى المكررة', 'Merge Duplicate Patient Records')}
              </h2>
              <p className="text-xs text-muted-foreground-1 mt-0.5 leading-relaxed">
                {bi(
                  'نقل الحلقات والجلسات والملاحظات المعتمدة والفواتير إلى ملف موحد مع لقطة أمان مشفرة مسبقة.',
                  'Consolidate episodes, sessions, finalized SOAP notes, and invoices into one surviving chart with a pre-merge encrypted snapshot.'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={merging}
            onClick={onClose}
            aria-label={bi('إغلاق', 'Close')}
            className="p-2 rounded-xl text-muted-foreground-1 hover:text-foreground hover:bg-layer-hover disabled:opacity-50 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Success Feedback Banner */}
          {mergeSummary && (
            <div
              data-testid="merge-success-banner"
              role="status"
              className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/35 text-emerald-900 dark:text-emerald-200 space-y-2.5"
            >
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0">
                  <h3 className="text-xs sm:text-sm font-bold">
                    {bi(
                      'تم دمج السجلين بنجاح ونقل كافة البيانات التراكمية بأمان.',
                      'Patient records merged successfully and all linked data transferred atomically.'
                    )}
                  </h3>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300">
                    {bi('معرف لقطة الاسترداد المسبقة:', 'Pre-merge recovery snapshot ID:')}{' '}
                    <bdi dir="ltr" className="font-mono font-semibold">
                      {mergeSummary.snapshotId}
                    </bdi>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                <div className="px-2.5 py-1.5 rounded-lg bg-surface/80 border border-emerald-500/20 flex items-center justify-between">
                  <span>{bi('الحلقات', 'Episodes')}</span>
                  <Num value={mergeSummary.movedCounts.episodes} className="font-bold" />
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-surface/80 border border-emerald-500/20 flex items-center justify-between">
                  <span>{bi('الجلسات', 'Sessions')}</span>
                  <Num value={mergeSummary.movedCounts.sessions} className="font-bold" />
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-surface/80 border border-emerald-500/20 flex items-center justify-between">
                  <span>{bi('ملاحظات SOAP', 'SOAP Notes')}</span>
                  <Num value={mergeSummary.movedCounts.soapNotes} className="font-bold" />
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-surface/80 border border-emerald-500/20 flex items-center justify-between">
                  <span>{bi('الفواتير والدفعات', 'Invoices & Payments')}</span>
                  <Num
                    value={mergeSummary.movedCounts.invoices + mergeSummary.movedCounts.payments}
                    className="font-bold"
                  />
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-surface/80 border border-emerald-500/20 flex items-center justify-between">
                  <span>{bi('المواعيد والانتظار', 'Appts & Waitlist')}</span>
                  <Num
                    value={mergeSummary.movedCounts.appointments + mergeSummary.movedCounts.waitingList}
                    className="font-bold"
                  />
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-surface/80 border border-emerald-500/20 flex items-center justify-between">
                  <span>{bi('الملاحق التصحيحية', 'Addenda')}</span>
                  <Num value={mergeSummary.movedCounts.clinicalAddenda} className="font-bold" />
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-surface/80 border border-emerald-500/20 flex items-center justify-between">
                  <span>{bi('الأدوية والموافقات', 'Meds & Consents')}</span>
                  <Num
                    value={mergeSummary.movedCounts.patientMedications + mergeSummary.movedCounts.consents}
                    className="font-bold"
                  />
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-surface/80 border border-emerald-500/20 flex items-center justify-between">
                  <span>{bi('المرفقات والمسودات', 'Files & Drafts')}</span>
                  <Num
                    value={mergeSummary.movedCounts.attachments + mergeSummary.movedCounts.drafts}
                    className="font-bold"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Auto-detected Duplicate Pairs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-foreground">
                {bi('التكرارات المكتشفة تلقائياً في الدليل', 'Auto-Detected Duplicate Pairs')}
              </h3>
              <span className="text-xs font-semibold text-muted-foreground-1">
                <Num value={detectedPairs.length} /> {bi('تطابق', 'pair(s)')}
              </span>
            </div>

            <div
              data-testid="merge-detected-pairs-list"
              className="space-y-2"
            >
              {detectedPairs.length === 0 ? (
                <div className="px-3.5 py-2.5 rounded-xl bg-muted/40 border border-card-line text-xs text-muted-foreground-1 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    {bi(
                      'لم يتم اكتشاف تكرارات تلقائية بالاسم أو رقم الهاتف — يمكنك اختيار أي سجلين يدوياً أدناه.',
                      'No duplicate pairs auto-detected by name or phone — you can still manually choose any two active patients below.'
                    )}
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pe-0.5">
                  {detectedPairs.map((pair, idx) => {
                    const isSelected =
                      (survivingPatientId === pair.primary.id &&
                        sourcePatientId === pair.duplicate.id) ||
                      (survivingPatientId === pair.duplicate.id &&
                        sourcePatientId === pair.primary.id);
                    return (
                      <button
                        key={`${pair.primary.id}::${pair.duplicate.id}`}
                        type="button"
                        data-testid={`merge-detected-pair-btn-${idx}`}
                        onClick={() => handleSelectPair(pair)}
                        className={`w-full text-start p-3 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-primary/10 border-primary ring-1 ring-primary/30'
                            : 'bg-surface border-layer-line hover:bg-layer-hover'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-foreground">
                            <span>{getPatientDisplayName(pair.primary.data, language)}</span>
                            <bdi dir="ltr" className="font-mono text-xs text-primary">
                              ({getPatientMrn(pair.primary)})
                            </bdi>
                            <span className="text-muted-foreground-2">⇄</span>
                            <span>{getPatientDisplayName(pair.duplicate.data, language)}</span>
                            <bdi dir="ltr" className="font-mono text-xs text-amber-700 dark:text-amber-300">
                              ({getPatientMrn(pair.duplicate)})
                            </bdi>
                          </div>
                          <div className="text-xs text-muted-foreground-1 flex flex-wrap items-center gap-2">
                            <span>{formatReasons(pair.matchReasons)}</span>
                            <span>•</span>
                            <bdi dir="ltr" className="tabular-nums">
                              {formatIraqiPhoneDisplay(
                                pair.primary.data.phoneNumber || pair.primary.data.phone
                              )}
                            </bdi>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/30 text-xs font-semibold shrink-0 self-start sm:self-center">
                          {isSelected ? bi('محدد حالياً', 'Selected') : bi('اختيار للدمج', 'Select Pair')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Surviving vs Source Patient Selectors + Swap */}
          <div className="p-4 rounded-xl bg-surface/60 border border-card-line space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-end">
              <div>
                <label
                  htmlFor="merge-surviving-patient-select"
                  className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-1.5"
                >
                  <UserCheck className="w-4 h-4 shrink-0" />
                  <span>{bi('السجل الباقي (الأساسي)', 'Surviving Record (Keep)')}</span>
                </label>
                <select
                  id="merge-surviving-patient-select"
                  data-testid="merge-surviving-patient-select"
                  value={survivingPatientId}
                  disabled={merging}
                  onChange={(e) => {
                    setSurvivingPatientId(e.target.value);
                    setConfirmChecked(false);
                    setErrorMsg(null);
                    setMergeSummary(null);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="">
                    {bi('— اختر السجل الأساسي الباقي —', '— Select surviving patient —')}
                  </option>
                  {selectablePatients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {getPatientDisplayName(p.data, language)} • {getPatientMrn(p)} •{' '}
                      {formatIraqiPhoneDisplay(p.data.phoneNumber || p.data.phone)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-center">
                <button
                  type="button"
                  data-testid="merge-swap-direction-btn"
                  disabled={merging || (!survivingPatientId && !sourcePatientId)}
                  onClick={handleSwapDirection}
                  title={bi('عكس اتجاه الدمج', 'Swap surviving and source patients')}
                  className="px-3 py-2 rounded-xl bg-layer border border-layer-line hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <ArrowRightLeft className="w-4 h-4 text-primary" />
                  <span>{bi('عكس', 'Swap')}</span>
                </button>
              </div>

              <div>
                <label
                  htmlFor="merge-source-patient-select"
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 mb-1.5"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{bi('السجل المكرر (سيُدمج ويُزال)', 'Source Duplicate (Absorb & Archive)')}</span>
                </label>
                <select
                  id="merge-source-patient-select"
                  data-testid="merge-source-patient-select"
                  value={sourcePatientId}
                  disabled={merging}
                  onChange={(e) => {
                    setSourcePatientId(e.target.value);
                    setConfirmChecked(false);
                    setErrorMsg(null);
                    setMergeSummary(null);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="">
                    {bi('— اختر السجل المكرر للدمج —', '— Select source duplicate —')}
                  </option>
                  {selectablePatients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {getPatientDisplayName(p.data, language)} • {getPatientMrn(p)} •{' '}
                      {formatIraqiPhoneDisplay(p.data.phoneNumber || p.data.phone)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isSamePatient && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/35 text-xs font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  {bi(
                    'يرجى اختيار سجلين مختلفين؛ لا يمكن دمج ملف المريض مع نفسه.',
                    'Please select two distinct patient records; a record cannot be merged into itself.'
                  )}
                </span>
              </div>
            )}

            {/* Selected Records Side-by-Side Preview */}
            {survivingPatient && sourcePatient && !isSamePatient && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/25 space-y-1 text-xs">
                  <div className="font-bold text-emerald-800 dark:text-emerald-200">
                    {bi('يبقى نشطاً:', 'Retained Record:')} {getPatientDisplayName(survivingPatient.data, language)}
                  </div>
                  <div className="text-muted-foreground-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    <bdi dir="ltr" className="font-mono">{getPatientMrn(survivingPatient)}</bdi>
                    <bdi dir="ltr" className="tabular-nums">
                      {formatIraqiPhoneDisplay(
                        survivingPatient.data.phoneNumber || survivingPatient.data.phone
                      )}
                    </bdi>
                    <bdi dir="ltr" className="tabular-nums">
                      {formatDateDDMMYYYY(survivingPatient.createdAt?.slice(0, 10))}
                    </bdi>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/25 space-y-1 text-xs">
                  <div className="font-bold text-amber-800 dark:text-amber-200">
                    {bi('يُدمج فيه:', 'Absorbed Duplicate:')} {getPatientDisplayName(sourcePatient.data, language)}
                  </div>
                  <div className="text-muted-foreground-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    <bdi dir="ltr" className="font-mono">{getPatientMrn(sourcePatient)}</bdi>
                    <bdi dir="ltr" className="tabular-nums">
                      {formatIraqiPhoneDisplay(
                        sourcePatient.data.phoneNumber || sourcePatient.data.phone
                      )}
                    </bdi>
                    <bdi dir="ltr" className="tabular-nums">
                      {formatDateDDMMYYYY(sourcePatient.createdAt?.slice(0, 10))}
                    </bdi>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Safety Snapshot Notice */}
          <div
            data-testid="merge-safety-snapshot-notice"
            className="p-3.5 rounded-xl bg-primary/5 border border-primary/25 text-xs text-foreground space-y-1.5 leading-relaxed"
          >
            <div className="flex items-center gap-2 font-bold text-primary">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                {bi(
                  'حماية سريرية مشفرة قبل التنفيذ (Pre-Merge Recovery Snapshot)',
                  'Encrypted Pre-Merge Safety Snapshot & Transactional Integrity'
                )}
              </span>
            </div>
            <p className="text-muted-foreground-1">
              {bi(
                'قبل إجراء أي تعديل، يتم حفظ لقطة استرداد مشفرة بالكامل في recoveryDb.recoverySnapshots. يتم نقل جميع الحلقات العلاجية، الجلسات، ملاحظات SOAP المعتمدة (مع الحفاظ التام على أختام SHA-256 السريرية حرفياً دون المساس بها)، المواعيد، قائمة الانتظار، الفواتير، الدفعات، الأدوية، الموافقات، والمرفقات ضمن معاملة قاعدة بيانات واحدة موحدة.',
                'Before any mutation occurs, an encrypted recovery snapshot is saved to recoveryDb.recoverySnapshots. All episodes, sessions, finalized SOAP notes (preserving SHA-256 clinical seals verbatim), appointments, waiting list entries, invoices, payments, medications, consents, and attachments move transactionally into the surviving record.'
              )}
            </p>
          </div>

          {/* Explicit Confirmation Checkbox */}
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-surface border border-layer-line text-xs font-semibold text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              data-testid="merge-confirm-checkbox"
              checked={confirmChecked}
              disabled={merging}
              onChange={(e) => setConfirmChecked(e.target.checked)}
              className="mt-0.5 size-4 rounded border-layer-line accent-primary shrink-0"
            />
            <span>
              {bi(
                'أؤكد مراجعة السجل الباقي والسجل المكرر، وأوافق على تنفيذ الدمج المعاملاتي بعد حفظ لقطة الاسترداد المشفرة.',
                'I have verified the surviving and duplicate patient records and confirm executing this transactional merge with a pre-merge encrypted snapshot.'
              )}
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-card-divider bg-muted/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            disabled={merging}
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground-1 hover:text-foreground bg-layer border border-layer-line hover:bg-layer-hover disabled:opacity-50 transition-colors cursor-pointer"
          >
            {mergeSummary ? bi('إغلاق', 'Close') : bi('إلغاء', 'Cancel')}
          </button>

          <button
            type="button"
            data-testid="execute-patient-merge-btn"
            disabled={!canExecute}
            onClick={() => void handleExecuteMerge()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold transition-all shadow-2xs disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
          >
            <GitMerge className="w-4 h-4" />
            <span>
              {merging
                ? bi('جاري حفظ اللقطة ودمج السجلات...', 'Saving Snapshot & Merging...')
                : bi('تنفيذ دمج السجلين', 'Execute Merge')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PatientMergeModal;
