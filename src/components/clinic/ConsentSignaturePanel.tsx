// =======================================================================
// PhysioRecord — Bilingual Informed Consent & Signature Pad Module (4.8)
// Encrypted in Dexie v8 `consents`, off by default in Settings > Modules (R6).
// =======================================================================

import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import {
  FileSignature,
  CheckCircle2,
  Printer,
  RotateCcw,
  ShieldCheck,
  AlertCircle,
  Ban,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { CONSENT_TEMPLATES } from '../../data/consentTemplates';
import { formatDateDDMMYYYY, computePatientAge } from '../../utils/date';
import { isValidEncryptedImageDataUrl } from '../../utils/imageUtils';
const PrintDocumentModal = lazy(() =>
  import('../print/PrintDocumentModal').then((m) => ({ default: m.PrintDocumentModal }))
);
import type { EpisodeRecord, PatientRecord } from '../../types/clinical';
import type { ConsentTemplateId, PatientConsentRecord } from '../../types/clinicManagement';

interface ConsentSignaturePanelProps {
  patient: PatientRecord;
  episode?: EpisodeRecord | null;
}

const CONSENT_TEMPLATE_CKB: Record<
  string,
  { titleCkb: string; summaryCkb: string; bodyCkb: string }
> = {
  treatment: {
    titleCkb: 'بەڵێننامەی ڕەزامەندیی ئاگادارانە بۆ هەڵسەنگاندن و چارەسەری سروشتی',
    summaryCkb: 'پشکنینی جەستەیی، چارەسەری دەستی، ڕاهێنانی چارەسەری، و ئامێرە فیزیاییەکان دەگرێتەوە.',
    bodyCkb:
      'دڵنیای دەکەمەوە کە شێوازی پشکنینی کلینیکی و پلانی چارەسەری سروشتیی پێشنیارکراو — لەوانەش ڕاهێنانی چارەسەری، چارەسەری دەستی، یان ئامێرە کارەبایی و گەرمییەکان لە کاتی پێویستدا — بە ڕوونی بۆم ڕوون کراونەتەوە. تێدەگەم کە لەوانەیە گرژبوون یان ئازارێکی کاتی ماسولکە دوای دانیشتنەکە ڕووبدات، و بەڵێن دەدەم دەستبەجێ چارەسەرکارەکەم ئاگادار بکەمەوە لە هەر نیشانەیەکی نائاسایی یان ڕێگرییەکی پزیشکی (وەک ئامێری ڕێکخستنی لێدانی دڵ، دووگیانی، یان شکانە نوێیەکان). مافی تەواوم هەیە پرسیار بکەم یان لە هەر کاتێکدا هەر ڕێکارێکی چارەسەری ڕەت بکەمەوە یان ڕایبگرم.',
  },
  data_storage: {
    titleCkb: 'ڕەزامەندی بۆ هەڵگرتنی تۆمارە کلینیکییە نهێنیکراوەکان بە شێوەی ناوخۆیی',
    summaryCkb: 'هەڵگرتنی داتا کلینیکییەکان بە نهێنیکراوی تەنها لەسەر ئامێری کلینیکەکە بەبێ سێرڤەری دەرەکی ڕوون دەکاتەوە.',
    bodyCkb:
      'ڕەزامەندم بە تۆمارکردن و هەڵگرتنی تۆماری کلینیکی، دارایی، و دانیشتنەکانی بەدواداچوونم لە ناو سیستەمی ناوخۆیی نهێنیکراوی کلینیکدا (PhysioRecord) تەنها لەسەر ئەم ئامێرە بە مەبەستی بەردەوامیی چاودێری تەندروستی و بەدواداچوونی پزیشکی. تێدەگەم کە داتاکانم بە شێوەی ناوخۆیی نهێنی دەکرێن و بۆ هیچ سێرڤەرێکی هەوری یان لایەنی سێیەم نانێردرێن بەبێ داواکاری یان ڕەزامەندیی نووسراوی ڕاشکاوم، و مافی ئەوەم هەیە لە هەر کاتێکدا داوای کۆپیی چاپکراوی ڕاپۆرت یان پوختە پزیشکییەکانم بکەم.',
  },
  photography: {
    titleCkb: 'ڕەزامەندیی ئارەزوومەندانە بۆ تۆمارکردنی وێنەیی بۆ بەدواداچوونی شێوەی وەستان و جووڵە',
    summaryCkb: 'ئارەزوومەندانەیە بۆ هەڵسەنگاندنی هاوسەنگیی شێوەی وەستان یان مەودای جووڵەی جومگە لە کاتی پشکنیندا.',
    bodyCkb:
      'بە ئارەزوومەندانە و بە خواستی خۆم ڕەزامەندی دەدەم بە گرتنی وێنەی کلینیکیی دیاریکراو یان گرتە بۆ بەدواداچوونی پێشکەوتنی شێوەی وەستان، مەودای جووڵەی جومگە، یان چاکبوونەوەی شانەکان تەنها بە مەبەستی تۆماری پزیشکی و بەدواداچوونی باشتربوون. بڵاوکردنەوە یان هاوبەشکردنی ئەم وێنانە لە ئینتەرنێت یان هەر ڕێگەیەکی نا-کلینیکی بە تەواوی قەدەغەیە، لەگەڵ پابەندبوون بە شاردنەوەی ناسنامە و شێوەی دەموچاو مەگەر بە ڕاشکاوی داوا بکرێت، و دەتوانم لە هەر کاتێکدا ئەم ڕەزامەندییە بکێشمەوە.',
  },
};

export const ConsentSignaturePanel: React.FC<ConsentSignaturePanelProps> = ({
  patient,
  episode,
}) => {
  const { isRtl, bi } = useLanguage();

  const [isEnabled, setIsEnabled] = useState<boolean>(() =>
    ClinicOperationsService.isConsentModuleEnabled()
  );
  const [pediatricSafeguardsEnabled, setPediatricSafeguardsEnabled] = useState<boolean>(() =>
    ClinicOperationsService.isPediatricSafeguardsEnabled()
  );
  const patientAge = computePatientAge(patient.data.dateOfBirth, patient.data.age);
  const isPediatricMinor =
    pediatricSafeguardsEnabled && patientAge !== undefined && patientAge < 18;

  const [consents, setConsents] = useState<PatientConsentRecord[]>(() =>
    ClinicOperationsService.getConsentsForPatient(patient.id)
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<ConsentTemplateId>('treatment');
  const [signerName, setSignerName] = useState<string>(
    isPediatricMinor
      ? patient.data.guardianName || ''
      : patient.data.fullNameAr || patient.data.fullName || ''
  );
  const [signerRelation, setSignerRelation] =
    useState<PatientConsentRecord['signerRelation']>(isPediatricMinor ? 'guardian' : 'patient');
  const [consentChecked, setConsentChecked] = useState(false);
  const [hasDrawnStroke, setHasDrawnStroke] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [printConsent, setPrintConsent] = useState<PatientConsentRecord | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    void ClinicOperationsService.ensurePatientColdStoresLoadedAsync(
      patient.id,
      episode?.id ? [episode.id] : []
    );
    setSignerName(
      isPediatricMinor
        ? patient.data.guardianName || ''
        : patient.data.fullNameAr || patient.data.fullName || ''
    );
    if (isPediatricMinor) {
      setSignerRelation((prev) => (prev === 'patient' ? 'guardian' : prev));
    }
    const refresh = () => {
      setIsEnabled(ClinicOperationsService.isConsentModuleEnabled());
      setPediatricSafeguardsEnabled(ClinicOperationsService.isPediatricSafeguardsEnabled());
      setConsents(ClinicOperationsService.getConsentsForPatient(patient.id));
    };
    refresh();
    return ClinicOperationsService.subscribe(refresh);
  }, [
    patient.id,
    patient.data.fullNameAr,
    patient.data.fullName,
    patient.data.guardianName,
    isPediatricMinor,
    episode?.id,
  ]);

  const activeTemplate =
    CONSENT_TEMPLATES.find((t) => t.id === selectedTemplateId) || CONSENT_TEMPLATES[0];

  const initCanvasBackground = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  useEffect(() => {
    if (isEnabled) {
      initCanvasBackground();
    }
  }, [isEnabled]);

  const getPointerCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getPointerCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    isDrawingRef.current = true;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPointerCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasDrawnStroke) {
      setHasDrawnStroke(true);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture already released
    }
  };

  const handleClearCanvas = () => {
    initCanvasBackground();
    setHasDrawnStroke(false);
  };

  const handleSaveConsent = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (isPediatricMinor && signerRelation === 'patient') {
      setErrorMsg(
        bi(
          'حماية القُصّر: المريض دون 18 عاماً يتطلب توقيع ولي الأمر أو المرافق القانوني.',
          'Pediatric safeguard: Patients under 18 require guardian or legal representative consent.',
          'پاراستنی منداڵان و مێردمنداڵان: نەخۆشی ژێر ١٨ ساڵ پێویستی بە واژۆی سەرپەرشتیار یان نوێنەری یاسایی هەیە.'
        )
      );
      return;
    }
    if (!signerName.trim()) {
      setErrorMsg(bi('يرجى إدخال اسم الموقّع.', 'Signer name is required.', 'تکایە ناوی واژۆکەر بنووسە.'));
      return;
    }
    if (!consentChecked) {
      setErrorMsg(
        bi(
          'يرجى تأكيد موافقة المريض قبل حفظ التوقيع.',
          'Please check the consent acknowledgment box.',
          'تکایە پێش پاشەکەوتکردنی واژۆ خانەی ڕەزامەندیی نەخۆش دیاری بکە.'
        )
      );
      return;
    }
    if (!hasDrawnStroke || !canvasRef.current) {
      setErrorMsg(
        bi(
          'يرجى رسم التوقيع داخل مربع التوقيع.',
          'Please capture a signature on the pad.',
          'تکایە واژۆ لە ناو چوارگۆشەی واژۆدا بکێشە.'
        )
      );
      return;
    }

    const signatureDataUrl = canvasRef.current.toDataURL('image/png');
    setIsSaving(true);
    try {
      await ClinicOperationsService.savePatientConsentAsync({
        patientId: patient.id,
        episodeId: episode?.id,
        templateId: activeTemplate.id,
        templateVersion: activeTemplate.version,
        titleAr: activeTemplate.titleAr,
        titleEn: activeTemplate.titleEn,
        bodySnapshotAr: activeTemplate.bodyAr,
        bodySnapshotEn: activeTemplate.bodyEn,
        signerName: signerName.trim(),
        signerRelation,
        signatureDataUrl,
        consentGranted: consentChecked,
      });
      handleClearCanvas();
      setConsentChecked(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmRevoke = async (consentId: string) => {
    if (!revokeReason.trim()) return;
    try {
      await ClinicOperationsService.revokePatientConsentAsync(
        patient.id,
        consentId,
        revokeReason.trim()
      );
      setRevokingId(null);
      setRevokeReason('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  if (!isEnabled) {
    return (
      <div
        className="bg-card p-5 rounded-2xl border border-card-line shadow-2xs flex flex-wrap items-center justify-between gap-4"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <div className="flex items-start gap-3">
          <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <FileSignature className="size-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {bi(
                'نماذج الموافقة المستنيرة والتوقيع الرقمي (اختياري)',
                'Informed Consent & Digital Signature Module (Optional)',
                'فۆڕمەکانی ڕەزامەندیی ئاگادارانە و واژۆی دیجیتاڵی (ئارەزوومەندانە)'
              )}
            </h3>
            <p className="text-xs text-muted-foreground-1 mt-0.5 max-w-xl">
              {bi(
                'هذه الوحدة معطلة افتراضياً للحفاظ على بساطة الواجهة. يمكنك تفعيلها الآن أو من الإعدادات > الوحدات لجمع وتخزين تواقيع المرضى مشفرة محلياً.',
                'Disabled by default in Settings > Modules to keep charting minimal. Enable anytime to capture encrypted bilingual treatment, privacy, and media consents.',
                'ئەم بەشە بە شێوەی بنەڕەت ناچالاکە بۆ سادەهێشتنەوەی ڕووکار. دەتوانیت ئێستا یان لە ڕێکخستنەکان > بەشەکان چالاکی بکەیت بۆ کۆکردنەوە و هەڵگرتنی واژۆی نەخۆشان بە نهێنیکراوی ناوخۆیی.'
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => ClinicOperationsService.setConsentModuleEnabled(true)}
          className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <ShieldCheck className="size-4" />
          <span>{bi('تفعيل وحدة الموافقات', 'Enable Consent Module', 'چالاککردنی بەشی ڕەزامەندییەکان')}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="bg-card p-5 sm:p-6 rounded-2xl border border-card-line shadow-2xs space-y-5"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-divider pb-3">
        <div className="flex items-center gap-2.5">
          <span className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <FileSignature className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {bi(
                'نماذج الموافقة المستنيرة والتوقيع المحلي المشفر',
                'Informed Consents & Encrypted On-Device Signature',
                'فۆڕمەکانی ڕەزامەندیی ئاگادارانە و واژۆی نهێنیکراوی ناوخۆیی'
              )}
            </h3>
            <p className="text-xs text-muted-foreground-1">
              {bi(
                'تُحفظ الموافقات والتواقيع مشفرة بالكامل على الجهاز وقابلة للطباعة أو السحب الموثق.',
                'Stored encrypted inside IndexedDB on this device; printable or revocable with audit trail.',
                'ڕەزامەندی و واژۆکان بە تەواوی نهێنیکراو لەسەر ئامێرەکە پاشەکەوت دەکرێن و دەکرێت چاپ بکرێن یان بە بەڵگەوە هەڵبوەشێنرێنەوە.'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Template Tabs */}
      <div className="flex flex-wrap gap-2">
        {CONSENT_TEMPLATES.map((tpl) => {
          const active = tpl.id === selectedTemplateId;
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setSelectedTemplateId(tpl.id)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                active
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                  : 'bg-layer border-layer-line text-foreground hover:bg-layer-hover'
              }`}
            >
              {bi(tpl.titleAr, tpl.titleEn, CONSENT_TEMPLATE_CKB[tpl.id]?.titleCkb)}
            </button>
          );
        })}
      </div>

      {/* Template Body Preview */}
      <div className="p-4 rounded-2xl bg-surface border border-card-line space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-foreground">
          <span>
            {bi(
              activeTemplate.titleAr,
              activeTemplate.titleEn,
              CONSENT_TEMPLATE_CKB[activeTemplate.id]?.titleCkb
            )}
          </span>
          <span className="font-mono text-muted-foreground-1">v{activeTemplate.version}</span>
        </div>
        <p className="text-xs text-muted-foreground-1">
          {bi(
            activeTemplate.summaryAr,
            activeTemplate.summaryEn,
            CONSENT_TEMPLATE_CKB[activeTemplate.id]?.summaryCkb
          )}
        </p>
        <div className="p-3 rounded-xl bg-card border border-line-2 text-xs text-foreground leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
          {bi(
            activeTemplate.bodyAr,
            activeTemplate.bodyEn,
            CONSENT_TEMPLATE_CKB[activeTemplate.id]?.bodyCkb
          )}
        </div>
      </div>

      {/* Capture Form */}
      <form onSubmit={handleSaveConsent} className="space-y-4">
        {isPediatricMinor && (
          <div
            data-testid="consent-pediatric-guardian-alert"
            className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 space-y-1"
          >
            <p className="font-bold">
              {bi(
                `تنبيه حماية القُصّر (العمر ${patientAge} سنة < 18): يلزم توقيع ولي الأمر أو الممثل القانوني.`,
                `Pediatric Safeguard (Age ${patientAge} < 18): Guardian or legal representative signature is required.`,
                `ئاگادارکردنەوەی پاراستنی مێردمنداڵان (تەمەن ${patientAge} ساڵ < ١٨): واژۆی سەرپەرشتیار یان نوێنەری یاسایی پێویستە.`
              )}
            </p>
            {patient.data.guardianName && (
              <p>
                {bi('ولي الأمر المسجّل: ', 'Registered Guardian: ', 'سەرپەرشتیاری تۆمارکراو: ')}
                <span className="font-bold">{patient.data.guardianName}</span>
                {patient.data.guardianPhone ? (
                  <>
                    {' · '}
                    <bdi dir="ltr">{patient.data.guardianPhone}</bdi>
                  </>
                ) : null}
              </p>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              {bi('اسم الموقّع الكامل *', 'Signer Full Name *', 'ناوی تەواوی واژۆکەر *')}
            </label>
            <input
              type="text"
              required
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              {bi('صفة الموقّع', 'Signer Relationship', 'پەیوەندیی واژۆکەر')}
            </label>
            <select
              value={signerRelation}
              onChange={(e) =>
                setSignerRelation(e.target.value as PatientConsentRecord['signerRelation'])
              }
              className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
            >
              <option value="patient" disabled={isPediatricMinor}>
                {isPediatricMinor
                  ? bi(
                      'المريض نفسه (غير متاح للقُصّر < 18)',
                      'Patient (disabled for age < 18)',
                      'خودی نەخۆش (بۆ ژێر ١٨ ساڵ بەردەست نییە)'
                    )
                  : bi('المريض نفسه', 'Patient', 'خودی نەخۆش')}
              </option>
              <option value="guardian">
                {bi('ولي الأمر / المرافق القانوني', 'Guardian / Parent', 'سەرپەرشتیار / دایک و باوک')}
              </option>
              <option value="representative">
                {bi('ممثل مفوّض', 'Authorized Representative', 'نوێنەری ڕێپێدراو')}
              </option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground">
              {bi(
                'مربع التوقيع اليدوي (أو باللمس / القلم):',
                'Signature Pad (Touch / Stylus / Mouse):',
                'چوارگۆشەی واژۆی دەستی (بە دەست / قەڵەم / ماوس):'
              )}
            </label>
            <button
              type="button"
              onClick={handleClearCanvas}
              className="text-xs text-muted-foreground-1 hover:text-foreground inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="size-3.5" />
              <span>{bi('مسح التوقيع', 'Clear Pad', 'سڕینەوەی واژۆ')}</span>
            </button>
          </div>
          <canvas
            ref={canvasRef}
            width={560}
            height={150}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="w-full h-36 rounded-xl border-2 border-dashed border-layer-line bg-white touch-none cursor-crosshair"
          />
        </div>

        <label className="flex items-start gap-2.5 text-xs text-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={consentChecked}
            onChange={(e) => setConsentChecked(e.target.checked)}
            className="mt-0.5 size-4 rounded border-layer-line accent-primary"
          />
          <span>
            {bi(
              'أؤكد أن المريض أو من يمثله قد قرأ وفهم نموذج الموافقة وأعطى موافقته الطوعية، وتم شرح البدائل وحق سحب الموافقة في أي وقت.',
              'I confirm the patient/representative read and understood this consent form and provided voluntary informed agreement.',
              'دڵنیایی دەدەم کە نەخۆش یان نوێنەرەکەی ئەم فۆڕمەی ڕەزامەندییەی خوێندووەتەوە و لێی تێگەیشتووە و بە خواستی خۆی ڕەزامەندی داوە.'
            )}
          </span>
        </label>

        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 shadow-xs disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed cursor-pointer"
          >
            <CheckCircle2 className="size-4" />
            <span>
              {isSaving
                ? bi('جاري الحفظ المشفر...', 'Encrypting...', 'پاشەکەوتکردنی نهێنیکراو لە جێبەجێکردندایە...')
                : bi('اعتماد وحفظ الموافقة الموقعة', 'Save Signed Consent', 'پەسەندکردن و پاشەکەوتکردنی ڕەزامەندیی واژۆکراو')}
            </span>
          </button>
        </div>
      </form>

      {/* Signed Consents History */}
      {consents.length > 0 && (
        <div className="pt-4 border-t border-card-divider space-y-2.5">
          <h4 className="text-xs font-bold text-foreground">
            {bi(
              `سجل الموافقات الموقعة (${consents.length})`,
              `Signed Consents History (${consents.length})`,
              `مێژووی ڕەزامەندییە واژۆکراوەکان (${consents.length})`
            )}
          </h4>
          <div className="space-y-2">
            {consents.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl border border-card-line bg-surface flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  {isValidEncryptedImageDataUrl(item.signatureDataUrl) && (
                    <img
                      src={item.signatureDataUrl}
                      alt="Signature thumbnail"
                      className="h-10 w-20 object-contain rounded border border-line-2 bg-white shrink-0"
                    />
                  )}
                  <div className="space-y-0.5 text-xs">
                    <div className="font-bold text-foreground flex items-center gap-2">
                      <span>
                        {bi(
                          item.titleAr,
                          item.titleEn,
                          CONSENT_TEMPLATE_CKB[item.templateId]?.titleCkb
                        )}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          item.revokedAt
                            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {item.revokedAt
                          ? bi('مسحوبة', 'Revoked', 'کێشراوەتەوە')
                          : bi('سارية', 'Active', 'کارایە')}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground-1">
                      {bi('الموقّع: ', 'By: ', 'واژۆکەر: ')}
                      {item.signerName} ·{' '}
                      <bdi dir="ltr">{formatDateDDMMYYYY(item.signedAt.slice(0, 10))}</bdi>
                    </div>
                    {item.revokedAt && item.revokeReason && (
                      <div className="text-xs text-rose-600 dark:text-rose-400">
                        {bi('سبب السحب: ', 'Revoke reason: ', 'هۆکاری کێشانەوە: ')}
                        {item.revokeReason}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPrintConsent(item)}
                    className="px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Printer className="size-3.5" />
                    <span>{bi('طباعة', 'Print', 'چاپکردن')}</span>
                  </button>

                  {!item.revokedAt && revokingId !== item.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setRevokingId(item.id);
                        setRevokeReason('');
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Ban className="size-3.5" />
                      <span>{bi('سحب الموافقة', 'Revoke', 'کێشانەوەی ڕەزامەندی')}</span>
                    </button>
                  )}
                </div>

                {revokingId === item.id && (
                  <div className="w-full pt-2 border-t border-line-2 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={revokeReason}
                      onChange={(e) => setRevokeReason(e.target.value)}
                      placeholder={bi(
                        'اكتب سبب سحب الموافقة (إلزامي)...',
                        'Mandatory revocation reason...',
                        'هۆکاری کێشانەوەی ڕەزامەندی بنووسە (ناچاری)...'
                      )}
                      className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-layer-line bg-layer text-xs text-foreground"
                    />
                    <button
                      type="button"
                      disabled={!revokeReason.trim()}
                      onClick={() => handleConfirmRevoke(item.id)}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {bi('تأكيد السحب', 'Confirm Revoke', 'دڵنیاکردنەوەی کێشانەوە')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRevokingId(null)}
                      className="px-2.5 py-1.5 rounded-lg border border-layer-line text-xs text-muted-foreground-1 cursor-pointer"
                    >
                      {bi('إلغاء', 'Cancel', 'پاشگەزبوونەوە')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {Boolean(printConsent) && (
        <Suspense fallback={null}>
          <PrintDocumentModal
            isOpen={Boolean(printConsent)}
            onClose={() => setPrintConsent(null)}
            documentType="consent"
            patient={patient}
            episode={episode}
            consent={printConsent}
          />
        </Suspense>
      )}
    </div>
  );
};
