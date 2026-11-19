import React, { useState } from 'react';
import { AlertTriangle, FilePlus2, Plus } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { MAX_ADDENDUM_TEXT_LENGTH } from '../../../services/soapService';
import {
  ADDENDUM_REASONS,
  type AddendumReason,
  type ClinicalAddendumRecord,
  type SoapNoteRecord,
} from '../../../types/clinical';
import { formatClinicalDate } from '../../../utils/date';
import { AutoResizeTextarea, ClinicalAbbr, Fraction } from '../../ui/Primitives';
import type {
  CopiedSoapTextField,
  PatientToleranceOption,
  ProgressStatusOption,
  UntouchedDraftFormState,
} from './sessionSoapHelpers';

export interface SessionAddendaSectionProps {
  recordedByName: string;
  soapRecord: SoapNoteRecord | null;
  addenda: ClinicalAddendumRecord[];
  addendaFailedCount: number;
  addendumReason: AddendumReason;
  setAddendumReason: (reason: AddendumReason) => void;
  addendumText: string;
  setAddendumText: (text: string) => void;
  isSavingAddendum: boolean;
  addendumError: string | null;
  onAddAddendum: (e: React.FormEvent) => void;
}

export const SessionAddendaSection: React.FC<SessionAddendaSectionProps> = ({
  recordedByName,
  soapRecord,
  addenda,
  addendaFailedCount,
  addendumReason,
  setAddendumReason,
  addendumText,
  setAddendumText,
  isSavingAddendum,
  addendumError,
  onAddAddendum,
}) => {
  const { language, bi } = useLanguage();

  return (
    <div className="max-w-3xl mx-auto w-full p-4 sm:p-5 rounded-2xl pr-surface space-y-4">
      <div className="flex items-center justify-between border-b border-black/[0.045] dark:border-white/[0.06] pb-3">
        <div className="flex items-center gap-2">
          <FilePlus2 className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">
            {bi(
              'الملاحق والتصحيحات السريرية (Append-Only Clinical Addenda)',
              'Clinical Addenda (Append-Only Post-Finalization Amendments)',
              'پاشکۆ و ڕاستکردنەوە کلینیکییەکان (Append-Only Clinical Addenda)'
            )}
          </h2>
        </div>
        <span className="text-xs font-mono text-muted-foreground-1">
          {addenda.length} {bi('ملحق', 'addenda', 'پاشکۆ')}
        </span>
      </div>

      {addendaFailedCount > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {bi(
              `تنبيه: تعذر فك تشفير (${addendaFailedCount}) ملحق سريري مرتبط بهذه الجلسة.`,
              `Warning: (${addendaFailedCount}) clinical addendum record(s) failed decryption.`,
              `ئاگاداری: کردنەوەی کۆدی (${addendaFailedCount}) پاشکۆی کلینیکیی پەیوەست بەم دانیشتنە شکستی هێنا.`
            )}
          </span>
        </div>
      )}

      {addenda.length > 0 && (
        <div className="space-y-2.5">
          {addenda.map((item) => {
            const reasonInfo = ADDENDUM_REASONS[item.data.reasonForAmendment];
            return (
              <div
                key={item.id}
                className="p-3.5 rounded-xl bg-surface/65 space-y-1.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground-1">
                  <span className="font-bold text-primary">
                    {reasonInfo ? bi(reasonInfo.ar, reasonInfo.en) : ''}
                  </span>
                  <span className="font-mono">
                    {bi('مسجل بواسطة: ', 'Recorded by: ', 'تۆمارکراو لەلایەن: ')}
                    {item.data.signedByTherapistName} ·{' '}
                    {formatClinicalDate(item.createdAt, language, { includeTime: true })}
                  </span>
                </div>
                <p className="text-foreground whitespace-pre-wrap">{item.data.amendmentText}</p>
              </div>
            );
          })}
        </div>
      )}

      {soapRecord && (
        <form onSubmit={onAddAddendum} className="space-y-3 pt-2">
          {addendumError && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {addendumError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="soap-addendum-reason" className="text-xs font-bold text-foreground block mb-1">
                {bi('سبب الملحق السريري:', 'Reason for Addendum:', 'هۆکاری پاشکۆی کلینیکی:')}
              </label>
              <select
                id="soap-addendum-reason"
                value={addendumReason}
                onChange={(e) => setAddendumReason(e.target.value as AddendumReason)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground"
              >
                {(Object.keys(ADDENDUM_REASONS) as AddendumReason[]).map((key) => (
                  <option key={key} value={key}>
                    {bi(ADDENDUM_REASONS[key].ar, ADDENDUM_REASONS[key].en)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="soap-addendum-recorded-by" className="text-xs font-bold text-foreground block mb-1">
                {bi(
                  'مسجل بواسطة (Recorded by — قراءة فقط):',
                  'Recorded by (Read-Only Active Staff):',
                  'تۆمارکراو لەلایەن (تەنها خوێندنەوە):'
                )}
              </label>
              <input
                id="soap-addendum-recorded-by"
                type="text"
                value={recordedByName}
                readOnly
                className="w-full px-3 py-2 text-xs rounded-xl bg-muted text-muted-foreground-1 cursor-not-allowed"
              />
              <span className="text-xs text-muted-foreground-2 block mt-0.5">
                {bi(
                  'اسم مصرّح به ذاتياً من اختيار الكادر المحلي وليس هوية مصادقاً عليها رقمياً.',
                  'Self-declared name from active staff selection, not authenticated identity.',
                  'ناوی ڕاگەیەنراوی خۆیی لە هەڵبژاردنی ستافی ناوخۆیی، ناسنامەی باوەڕپێکراوی دیجیتاڵی نییە.'
                )}
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="soap-addendum-text" className="text-xs font-bold text-foreground">
                {bi(
                  'نص الإضافة أو التصحيح السريري (لا يعدل النص الأصلي بل يُلحق به):',
                  'Addendum Text (appended immutably):',
                  'دەقی زیادکردن یان ڕاستکردنەوەی کلینیکی (دەقی بنەڕەتی ناگۆڕێت بەڵکو پێوەی دەلکێنرێت):'
                )}
              </label>
              <span className="text-xs font-mono text-muted-foreground-2">
                <Fraction value={addendumText.length} total={MAX_ADDENDUM_TEXT_LENGTH} />
              </span>
            </div>
            <AutoResizeTextarea
              id="soap-addendum-text"
              minRows={2}
              maxLength={MAX_ADDENDUM_TEXT_LENGTH}
              value={addendumText}
              onChange={(e) => setAddendumText(e.target.value)}
              required
              placeholder={bi(
                'اكتب تفاصيل الإضافة أو التوضيح السريري هنا...',
                'Enter clinical addendum details...',
                'وردەکارییەکانی پاشکۆ یان ڕوونکردنەوەی کلینیکی لێرە بنووسە...'
              )}
              className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/25"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingAddendum || !addendumText.trim()}
              className="compact-btn h-9 px-4 rounded-xl bg-primary hover:bg-primary-hover disabled:bg-surface disabled:text-muted-foreground-2 disabled:cursor-not-allowed text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>
                {bi('إدراج الملحق السريري', 'Append Clinical Addendum', 'زیادکردنی پاشکۆی کلینیکی')}
              </span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export interface SessionAssessmentPlanAndAddendaProps {
  formState: UntouchedDraftFormState;
  isLocked: boolean;
  recordedByName: string;
  updateField: <K extends keyof UntouchedDraftFormState>(
    key: K,
    value: UntouchedDraftFormState[K]
  ) => void;
  getCopiedFieldStatus: (field: CopiedSoapTextField) => 'copied' | 'edited' | null;
  renderCopiedFieldBadge: (field: CopiedSoapTextField) => React.ReactNode;

  soapRecord: SoapNoteRecord | null;
  addenda: ClinicalAddendumRecord[];
  addendaFailedCount: number;
  addendumReason: AddendumReason;
  setAddendumReason: (reason: AddendumReason) => void;
  addendumText: string;
  setAddendumText: (text: string) => void;
  isSavingAddendum: boolean;
  addendumError: string | null;
  onAddAddendum: (e: React.FormEvent) => void;
}

export const SessionAssessmentPlanAndAddenda: React.FC<
  SessionAssessmentPlanAndAddendaProps
> = ({
  formState,
  isLocked,
  recordedByName,
  updateField,
  getCopiedFieldStatus,
  renderCopiedFieldBadge,
  soapRecord,
  addenda,
  addendaFailedCount,
  addendumReason,
  setAddendumReason,
  addendumText,
  setAddendumText,
  isSavingAddendum,
  addendumError,
  onAddAddendum,
}) => {
  const { language, bi } = useLanguage();
  const [showNextSessionPlan, setShowNextSessionPlan] = useState(false);
  const [showHomeInstructions, setShowHomeInstructions] = useState(false);

  const hasNextSessionPlan =
    showNextSessionPlan || formState.nextSessionPlan.trim().length > 0;
  const hasHomeInstructions =
    showHomeInstructions || formState.homeInstructions.trim().length > 0;

  return (
    <>
      {/* 3. ASSESSMENT & PLAN AXES */}
      <div className="p-4 sm:p-5 rounded-2xl pr-surface space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.045] dark:border-white/[0.06] pb-2.5">
          <div className="flex items-center gap-2">
            <span className="size-6 rounded-lg bg-primary/10 text-primary font-black text-xs flex items-center justify-center shrink-0">
              3
            </span>
            <h2 className="text-sm font-bold text-foreground">
              {bi(
                'التقييم السريري والخطة العلاجية القادمة',
                'Assessment (A) & Plan (P)',
                'هەڵسەنگاندنی کلینیکی و پلانی چارەسەری داهاتوو'
              )}
            </h2>
          </div>

          <span
            className="text-xs text-muted-foreground-1 font-medium"
            title={bi(
              'اسم مصرّح به ذاتياً من الكادر المحلي (ليس هوية مصادقاً عليها رقمياً)',
              'Self-declared staff label (not authenticated identity)',
              'ناوی ڕاگەیەنراوی خۆیی لە ستافی ناوخۆیی'
            )}
          >
            {bi('مسجل بواسطة:', 'Recorded by:', 'تۆمارکراو لەلایەن:')}{' '}
            <span className="font-semibold text-foreground">{recordedByName}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="soap-progress-status" className="text-xs font-bold text-foreground block mb-1">
              {bi('مسار تقدم الحالة *:', 'Progress Status *:', 'ڕەوتی پێشکەوتنی بارودۆخ *:')}
            </label>
            <select
              id="soap-progress-status"
              disabled={isLocked}
              value={formState.progressStatus}
              onChange={(e) =>
                updateField('progressStatus', e.target.value as ProgressStatusOption)
              }
              className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
            >
              <option value="">
                {bi('— اختر مسار تقدم الحالة —', '— Select progress status —', '— ڕەوتی پێشکەوتن هەڵبژێرە —')}
              </option>
              <option value="improved">{bi('تحسن ملحوظ', 'Improved', 'باشبوونی بەرچاو')}</option>
              <option value="unchanged">{bi('دون تغيير', 'Unchanged', 'بێ گۆڕان')}</option>
              <option value="plateau">
                {bi('استقرار / ثبات مرحلي', 'Plateau', 'جێگیربوون / وەستانی قۆناغی')}
              </option>
              <option value="regressed">
                {bi('تراجع في الأعراض', 'Regressed', 'خراپتربوونی نیشانەکان')}
              </option>
            </select>
          </div>

          <div>
            <label htmlFor="soap-patient-tolerance" className="text-xs font-bold text-foreground block mb-1">
              {bi('تحمّل المريض للجلسة:', 'Patient Tolerance:', 'بەرگەگرتنی نەخۆش بۆ دانیشتن:')}
            </label>
            <select
              id="soap-patient-tolerance"
              disabled={isLocked}
              value={formState.patientTolerance}
              onChange={(e) =>
                updateField('patientTolerance', e.target.value as PatientToleranceOption)
              }
              className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
            >
              <option value="">
                {bi('— اختر تحمّل المريض —', '— Select patient tolerance —', '— بەرگەگرتنی نەخۆش هەڵبژێرە —')}
              </option>
              <option value="well_tolerated">
                {bi('تحمّل ممتاز / جيد', 'Well tolerated', 'بەرگەگرتنی زۆر باش / باش')}
              </option>
              <option value="moderate_fatigue">
                {bi('إجهاد متوسط', 'Moderate fatigue', 'ماندوبوونی مامناوەند')}
              </option>
              <option value="poorly_tolerated">
                {bi('ضعف تحمّل / ألم', 'Poorly tolerated', 'بەرگەگرتنی لاواز / ئازار')}
              </option>
            </select>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <label htmlFor="soap-clinical-impression" className="text-xs font-bold text-foreground">
              {bi(
                'الانطباع والتفسير السريري للجلسة *:',
                'Clinical Impression (Assessment) *:',
                'تێڕوانین و لێکدانەوەی کلینیکیی دانیشتن *:'
              )}
            </label>
            {renderCopiedFieldBadge('clinicalImpression')}
          </div>
          <AutoResizeTextarea
            id="soap-clinical-impression"
            minRows={2}
            snippetCategory="assessment"
            disabled={isLocked}
            value={formState.clinicalImpression}
            onChange={(e) => updateField('clinicalImpression', e.target.value)}
            placeholder={bi(
              'اكتب التفسير السريري لاستجابة المريض في هذه الجلسة...',
              'Enter clinical reasoning and impression of patient response...',
              'لێکدانەوەی کلینیکی بۆ وەڵامدانەوەی نەخۆش لەم دانیشتنەدا بنووسە...'
            )}
            className={`w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 ${
              getCopiedFieldStatus('clinicalImpression') === 'copied'
                ? 'ring-1 ring-amber-500/40'
                : getCopiedFieldStatus('clinicalImpression') === 'edited'
                  ? 'ring-1 ring-emerald-500/40'
                  : ''
            }`}
          />
        </div>

        {(hasNextSessionPlan || hasHomeInstructions) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {hasNextSessionPlan && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label htmlFor="soap-next-session-plan" className="text-xs font-bold text-foreground">
                    {bi(
                      'خطة الجلسة القادمة والتعديلات المقترحة:',
                      'Next Session Plan:',
                      'پلانی دانیشتنی داهاتوو و گۆڕانکارییە پێشنیارکراوەکان:'
                    )}
                  </label>
                  {renderCopiedFieldBadge('nextSessionPlan')}
                </div>
                <AutoResizeTextarea
                  id="soap-next-session-plan"
                  minRows={2}
                  snippetCategory="plan"
                  disabled={isLocked}
                  value={formState.nextSessionPlan}
                  onChange={(e) => updateField('nextSessionPlan', e.target.value)}
                  placeholder={bi(
                    'خطة التدرج أو التعديل للجلسة القادمة...',
                    'Plan or progression for next session...',
                    'پلانی پێشکەوتن یان گۆڕانکاری بۆ دانیشتنی داهاتوو...'
                  )}
                  className={`w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 ${
                    getCopiedFieldStatus('nextSessionPlan') === 'copied'
                      ? 'ring-1 ring-amber-500/40'
                      : getCopiedFieldStatus('nextSessionPlan') === 'edited'
                        ? 'ring-1 ring-emerald-500/40'
                        : ''
                  }`}
                />
              </div>
            )}

            {hasHomeInstructions && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label htmlFor="soap-home-instructions" className="text-xs font-bold text-foreground">
                    {language === 'en' ? (
                      'Home Instructions (HEP):'
                    ) : (
                      <>
                        {bi(
                          'التعليمات والبرنامج المنزلي',
                          'Home Instructions (HEP):',
                          'ڕێنماییەکان و بەرنامەی ماڵەوە'
                        )}{' '}
                        <ClinicalAbbr code="HEP" className="text-xs text-muted-foreground-1 ms-1" />:
                      </>
                    )}
                  </label>
                  {renderCopiedFieldBadge('homeInstructions')}
                </div>
                <AutoResizeTextarea
                  id="soap-home-instructions"
                  minRows={2}
                  snippetCategory="plan"
                  disabled={isLocked}
                  value={formState.homeInstructions}
                  onChange={(e) => updateField('homeInstructions', e.target.value)}
                  placeholder={bi(
                    'تعليمات التمارين المنزلية أو الوقاية اليومية...',
                    'Home exercise instructions or daily precautions...',
                    'ڕێنمایی ڕاهێنانی ماڵەوە یان خۆپارێزی ڕۆژانە...'
                  )}
                  className={`w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 ${
                    getCopiedFieldStatus('homeInstructions') === 'copied'
                      ? 'ring-1 ring-amber-500/40'
                      : getCopiedFieldStatus('homeInstructions') === 'edited'
                        ? 'ring-1 ring-emerald-500/40'
                        : ''
                  }`}
                />
              </div>
            )}
          </div>
        )}

        {!isLocked && (!hasNextSessionPlan || !hasHomeInstructions) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {!hasNextSessionPlan && (
              <button
                type="button"
                onClick={() => setShowNextSessionPlan(true)}
                className="compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-surface text-xs font-semibold text-muted-foreground-1 hover:text-foreground inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="size-3.5 text-primary shrink-0" />
                <span>{bi('خطة الجلسة القادمة', 'Next session plan', 'پلانی دانیشتنی داهاتوو')}</span>
              </button>
            )}
            {!hasHomeInstructions && (
              <button
                type="button"
                onClick={() => setShowHomeInstructions(true)}
                className="compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-surface text-xs font-semibold text-muted-foreground-1 hover:text-foreground inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="size-3.5 text-primary shrink-0" />
                <span>{bi('تعليمات وبرنامج منزلي HEP', 'Home instructions (HEP)', 'ڕێنمایی ماڵەوە HEP')}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Append-Only Clinical Addenda Section (shown for finalized sessions) */}
      {isLocked && (
        <SessionAddendaSection
          recordedByName={recordedByName}
          soapRecord={soapRecord}
          addenda={addenda}
          addendaFailedCount={addendaFailedCount}
          addendumReason={addendumReason}
          setAddendumReason={setAddendumReason}
          addendumText={addendumText}
          setAddendumText={setAddendumText}
          isSavingAddendum={isSavingAddendum}
          addendumError={addendumError}
          onAddAddendum={onAddAddendum}
        />
      )}
    </>
  );
};
