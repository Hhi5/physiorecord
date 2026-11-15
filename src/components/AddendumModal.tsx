// =======================================================================
// PhysioRecord — Clinical Addendum Modal (Phase 2B.2)
// Append-only Amendment of Finalized Clinical Records
// =======================================================================

import React, { useState, useEffect } from 'react';
import { 
  X, 
  FileEdit, 
  Save, 
  AlertCircle, 
  History, 
  ShieldCheck, 
  UserCheck 
} from 'lucide-react';
import { 
  ADDENDUM_REASONS, 
  type AddendumReason, 
  type ClinicalAddendumRecord, 
  type SessionRecord 
} from '../types/clinical';
import { useLanguage } from '../context/LanguageContext';

interface AddendumModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: SessionRecord;
  existingAddenda: ClinicalAddendumRecord[];
  onAddAddendum: (
    targetTable: 'sessions' | 'soapNotes',
    targetId: string,
    data: {
      reasonForAmendment: AddendumReason;
      amendmentText: string;
      signedByTherapistName: string;
    }
  ) => Promise<void>;
}

export const AddendumModal: React.FC<AddendumModalProps> = ({
  isOpen,
  onClose,
  session,
  existingAddenda,
  onAddAddendum,
}) => {
  const { isRtl, bi } = useLanguage();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [targetTable, setTargetTable] = useState<'sessions' | 'soapNotes'>('soapNotes');
  const [reasonForAmendment, setReasonForAmendment] = useState<AddendumReason>('late_entry');
  const [amendmentText, setAmendmentText] = useState('');
  const [signedByTherapistName, setSignedByTherapistName] = useState('د. المعالج الطبيعي');

  useEffect(() => {
    if (!isOpen) return;
    setReasonForAmendment('late_entry');
    setAmendmentText('');
    setSignedByTherapistName('د. المعالج الطبيعي');
    setError(null);
  }, [isOpen, session.id]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!amendmentText.trim()) {
      setError(bi('نص الملحق أو التصحيح السريري إلزامي.', 'Clinical addendum text is required.'));
      return;
    }
    if (!signedByTherapistName.trim()) {
      setError(bi('اسم وتوقيع المعالج إلزامي لاعتماد الملحق.', 'Clinician name and signature are required.'));
      return;
    }

    setSubmitting(true);
    try {
      await onAddAddendum(targetTable, session.id, {
        reasonForAmendment,
        amendmentText: amendmentText.trim(),
        signedByTherapistName: signedByTherapistName.trim(),
      });
      onClose();
    } catch (err: unknown) {
      console.error('Failed to create addendum:', err);
      setError(err instanceof Error ? err.message : bi('فشل حفظ الملحق السريري.', 'Failed to save clinical addendum.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="addendum-modal-title"
      className="fixed inset-0 z-60 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      dir={isRtl ? 'rtl' : 'ltr'}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-card rounded-3xl max-w-2xl w-full shadow-2xl border border-card-line overflow-hidden my-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center">
              <FileEdit className="w-5 h-5" />
            </div>
            <div>
              <h3 id="addendum-modal-title" className="text-base sm:text-lg font-bold">
                {bi('إضافة ملحق وتصحيح سريري (Clinical Addendum)', 'Add Clinical Addendum')}
              </h3>
              <p className="text-xs text-amber-200/80">
                {bi(
                  `للجلسة المعتمدة #${session.sessionNumber} بتاريخ ${session.sessionDate}`,
                  `For finalized Session #${session.sessionNumber} (${session.sessionDate})`
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={bi('إغلاق الملحق', 'Close addendum modal')}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* Legal & Architectural Context Notice */}
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-foreground leading-relaxed flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong>{bi('مبدأ سلامة السجلات السريرية:', 'Clinical Record Immutability:')}</strong>{' '}
              {bi(
                'الملاحق السريرية ترتبط بالسجل المعتمد بشكل تتابعي آمن ومؤرخ دون استبدال أو مسح أي بيانات سابقة، لضمان الحفاظ على التسلسل الزمني والمسؤولية المهنية.',
                'Clinical addenda are cryptographically appended to the finalized record with an immutable timestamp without overwriting original clinical notes.'
              )}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Target Table Selector */}
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                {bi('السجل المستهدف بالإلحاق والتصحيح:', 'Target Record for Addendum:')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={targetTable === 'soapNotes'}
                  onClick={() => setTargetTable('soapNotes')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                    targetTable === 'soapNotes'
                      ? 'border-primary bg-primary/10 text-primary shadow-2xs'
                      : 'border-line-2 bg-layer text-foreground hover:bg-surface'
                  }`}
                >
                  {bi('توثيق SOAP السريري', 'Clinical SOAP Note')}
                </button>
                <button
                  type="button"
                  aria-pressed={targetTable === 'sessions'}
                  onClick={() => setTargetTable('sessions')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                    targetTable === 'sessions'
                      ? 'border-primary bg-primary/10 text-primary shadow-2xs'
                      : 'border-line-2 bg-layer text-foreground hover:bg-surface'
                  }`}
                >
                  {bi('بيانات الجلسة الإدارية', 'Administrative Session Data')}
                </button>
              </div>
            </div>

            {/* Reason for Amendment */}
            <div>
              <label htmlFor="addendum-reason-select" className="block text-xs font-bold text-foreground mb-1.5">
                {bi('سبب الإضافة أو التصحيح (Reason for Amendment)', 'Reason for Amendment')} <span className="text-rose-500">*</span>
              </label>
              <select
                id="addendum-reason-select"
                value={reasonForAmendment}
                onChange={(e) => setReasonForAmendment(e.target.value as AddendumReason)}
                className="w-full px-3 py-2 text-xs border border-line-2 rounded-xl focus:ring-2 focus:ring-primary bg-layer text-foreground"
              >
                {(Object.keys(ADDENDUM_REASONS) as AddendumReason[]).map((rKey) => (
                  <option key={rKey} value={rKey}>
                    {bi(`${ADDENDUM_REASONS[rKey].ar} (${ADDENDUM_REASONS[rKey].en})`, ADDENDUM_REASONS[rKey].en)}
                  </option>
                ))}
              </select>
            </div>

            {/* Amendment Text */}
            <div>
              <label htmlFor="addendum-text-textarea" className="block text-xs font-bold text-foreground mb-1.5">
                {bi('نص الإضافة أو التصحيح السريري (Amendment / Clarification Text)', 'Amendment / Clarification Text')} <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="addendum-text-textarea"
                value={amendmentText}
                onChange={(e) => setAmendmentText(e.target.value)}
                placeholder={bi(
                  'وضح ما الذي تم تصحيحه أو إضافته، وتفاصيل الملاحظة السريرية الملحقة...',
                  'Document the clinical clarification, late entry, or correction details...'
                )}
                rows={4}
                required
                className="w-full px-3.5 py-2.5 text-xs border border-line-2 bg-layer text-foreground placeholder:text-muted-foreground-1 rounded-xl focus:ring-2 focus:ring-primary focus:outline-hidden"
              />
            </div>

            {/* Therapist Name */}
            <div>
              <label htmlFor="addendum-therapist-input" className="block text-xs font-bold text-foreground mb-1.5">
                <span className="flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-muted-foreground-1" />
                  <span>{bi('اسم وتوقيع المعالج المعتمد للملحق', 'Attesting Clinician Name & Signature')}</span>
                </span>
              </label>
              <input
                id="addendum-therapist-input"
                type="text"
                value={signedByTherapistName}
                onChange={(e) => setSignedByTherapistName(e.target.value)}
                required
                placeholder={bi('اسم المعالج الموثق...', 'Attesting clinician name...')}
                className="w-full px-3 py-2 text-xs border border-line-2 bg-layer text-foreground placeholder:text-muted-foreground-1 rounded-xl focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-foreground bg-layer border border-line-2 hover:bg-layer-hover cursor-pointer"
              >
                {bi('إلغاء', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting || !amendmentText.trim()}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 shadow-sm disabled:opacity-50 transition-all cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{submitting ? bi('جاري الاعتماد المشفر...', 'Signing & encrypting...') : bi('اعتماد وحفظ الملحق السريري', 'Sign & Save Clinical Addendum')}</span>
              </button>
            </div>

          </form>

          {/* History of Previous Addenda for this session */}
          {existingAddenda.length > 0 && (
            <div className="pt-6 border-t border-card-divider">
              <div className="flex items-center gap-2 mb-3">
                <History className="w-4 h-4 text-muted-foreground-1" />
                <h4 className="text-xs font-bold text-foreground">
                  {bi(
                    `سجل الملاحق والتصحيحات السابقة لهذه الجلسة (${existingAddenda.length})`,
                    `Previous Addenda for This Session (${existingAddenda.length})`
                  )}
                </h4>
              </div>

              <div className="space-y-2.5">
                {existingAddenda.map((addendum) => {
                  const ad = addendum.data;
                  const reasonInfo = ADDENDUM_REASONS[ad.reasonForAmendment] || { ar: ad.reasonForAmendment, en: ad.reasonForAmendment };

                  return (
                    <div
                      key={addendum.id}
                      className="p-3.5 bg-surface rounded-xl border border-line-2 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs text-muted-foreground-1">
                        <span className="font-bold text-amber-800 dark:text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-md border border-amber-500/30">
                          {bi(reasonInfo.ar, reasonInfo.en)}
                        </span>
                        <span className="font-mono">{addendum.createdAt}</span>
                      </div>
                      <p className="text-foreground whitespace-pre-line leading-relaxed">
                        {ad.amendmentText}
                      </p>
                      <div className="text-xs text-muted-foreground-1 pt-1 border-t border-line-1 flex items-center justify-between">
                        <span>{bi('الموقع:', 'Signed by:')} <strong>{ad.signedByTherapistName}</strong></span>
                        <span className="font-mono text-muted-foreground-1">ID: {addendum.id.substring(0, 8)}...</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
