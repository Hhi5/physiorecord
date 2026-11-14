// =======================================================================
// PhysioRecord — Locked Patient-Facing Tablet Kiosk Mode (5.10)
// Allows patient self-intake + NPRS + PSFS + informed consent on tablet with
// zero exposure of other clinic patients; exit requires Vault Password or Admin PIN.
// =======================================================================

import React, { useEffect, useRef, useState } from 'react';
import {
  TabletSmartphone,
  Lock,
  CheckCircle2,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import { useVault } from '../../context/VaultContext';
import { usePatients } from '../../context/PatientContext';
import { EpisodeService } from '../../services/episodeService';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { CONSENT_TEMPLATES } from '../../data/consentTemplates';
import { classifyOutcomeSeverity, computeScalePercentage } from '../../utils/outcomeMeasures';
import { localDate, normalizeIraqiPhoneStorage } from '../../utils/date';
import { ModalDialog } from '../ui/Dialog';
import { Num, PhoneInput } from '../ui/Primitives';

interface PatientKioskModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PatientKioskModal: React.FC<PatientKioskModalProps> = ({
  isOpen,
  onOpenChange,
}) => {
  const { language, t } = useLanguage();
  const isEn = language === 'en';
  const { dek, verifyVaultPassword } = useVault();
  const { savePatient } = usePatients();

  const activeStaff = ClinicOperationsService.getActiveStaff();
  const treatmentTemplate = CONSENT_TEMPLATES[0];

  // Patient intake state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [age, setAge] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [painNrs, setPainNrs] = useState(5);
  const [psfsItems, setPsfsItems] = useState<Array<{ activity: string; score: number }>>([
    { activity: '', score: 4 },
    { activity: '', score: 4 },
    { activity: '', score: 4 },
  ]);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [completedBanner, setCompletedBanner] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Clinician unlock dialog state inside kiosk
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);
  const [unlockSecret, setUnlockSecret] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [verifyingExit, setVerifyingExit] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setHasStroke(false);
  };

  useEffect(() => {
    if (isOpen && !completedBanner) {
      setTimeout(initCanvas, 50);
    }
  }, [isOpen, completedBanner]);

  const resetForm = () => {
    setFullName('');
    setPhone('');
    setGender('male');
    setAge('');
    setChiefComplaint('');
    setPainNrs(5);
    setPsfsItems([
      { activity: '', score: 4 },
      { activity: '', score: 4 },
      { activity: '', score: 4 },
    ]);
    setConsentAccepted(false);
    setErrorMsg(null);
    initCanvas();
  };

  const getPointerCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const handleSubmitIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!dek) {
      setErrorMsg(isEn ? 'Clinic vault is locked.' : 'الخزينة مقفلة.');
      return;
    }
    const cleanName = fullName.trim();
    if (!cleanName) {
      setErrorMsg(isEn ? 'Please enter your full name.' : 'يرجى كتابة الاسم الكامل.');
      return;
    }
    if (!consentAccepted || !hasStroke || !canvasRef.current) {
      setErrorMsg(
        isEn
          ? 'Please confirm consent and sign inside the signature box.'
          : 'يرجى تأكيد الموافقة والتوقيع داخل المربع المخصص.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const today = localDate();
      const nowTime = new Date().toTimeString().slice(0, 5);
      const normalizedPhone = normalizeIraqiPhoneStorage(phone) || phone.trim();
      const isArabic = /[\u0600-\u06FF]/.test(cleanName);
      const parsedAge = age ? Number(age) : undefined;

      const patient = await savePatient({
        fullName: cleanName,
        ...(isArabic ? { fullNameAr: cleanName } : {}),
        ...(normalizedPhone ? { phoneNumber: normalizedPhone, phone: normalizedPhone } : {}),
        gender,
        ...(parsedAge && Number.isFinite(parsedAge) && parsedAge > 0 ? { age: parsedAge } : {}),
      });

      const complaintText =
        chiefComplaint.trim() || (isEn ? 'Self Check-In Assessment' : 'تسجيل دخول ذاتي — تقييم علاج طبيعي');

      const episode = await EpisodeService.createEpisode(
        patient.id,
        {
          title: complaintText.slice(0, 80),
          medicalDiagnosis: complaintText,
          clinicalImpression: complaintText,
          primarySpecialty: 'general',
          affectedBodyRegion: complaintText,
          rehabilitationGoals: { shortTerm: [], longTerm: [] },
          startDate: today,
          status: 'active',
        },
        dek
      );

      // Save Patient-Submitted Chief Complaint, NPRS & PSFS inside encrypted clinical store
      const store = ClinicOperationsService.getEpisodeClinicalStore(episode.id, patient.id);
      const filledPsfs = psfsItems
        .map((it, idx) => ({
          id: `psfs_kiosk_${idx}`,
          activity: it.activity.trim(),
          score0to10: it.score,
        }))
        .filter((it) => it.activity.length > 0);

      let nextScales = store.functionalScales;
      if (filledPsfs.length > 0) {
        const meanPsfs = Number(
          (filledPsfs.reduce((sum, item) => sum + item.score0to10, 0) / filledPsfs.length).toFixed(1)
        );
        const pct = computeScalePercentage('psfs', meanPsfs);
        const sev = classifyOutcomeSeverity('psfs', meanPsfs, pct);
        nextScales = {
          scaleId: 'psfs',
          scaleNameAr: 'المقياس الوظيفي الخاص بالمريض (PSFS)',
          scaleNameEn: 'Patient-Specific Functional Scale (PSFS)',
          rawScore: meanPsfs,
          maxScore: 10,
          scorePercentage: pct,
          severityLabelAr: sev.ar,
          severityLabelEn: sev.en,
          entryMode: 'procedure',
          responses: {},
          psfsActivities: filledPsfs,
          history: [
            {
              id: `out_kiosk_${Date.now()}`,
              date: today,
              visitType: 'initial_evaluation',
              scaleId: 'psfs',
              scaleNameAr: 'PSFS (كشك المريض)',
              scaleNameEn: 'PSFS (Patient Kiosk)',
              rawScore: meanPsfs,
              scorePercentage: pct,
              severityLabelAr: sev.ar,
              severityLabelEn: sev.en,
            },
          ],
        };
      }

      ClinicOperationsService.saveEpisodeClinicalStore({
        ...store,
        chiefComplaint: complaintText,
        painAtRestNrs: painNrs,
        painWorst24hNrs: painNrs,
        functionalScales: nextScales,
      });

      ClinicOperationsService.saveAppointment({
        patientId: patient.id,
        patientName: cleanName,
        patientPhone: normalizedPhone || undefined,
        episodeId: episode.id,
        date: today,
        startTime: nowTime,
        durationMinutes: ClinicOperationsService.getSmartMemory().lastDurationMinutes || 45,
        visitType: 'initial_evaluation',
        therapistName: isEn ? activeStaff.nameEn : activeStaff.nameAr,
        status: 'arrived',
        notes: `${isEn ? 'Tablet Kiosk Check-In' : 'تسجيل ذاتي عبر الكشك'} (NPRS ${painNrs}/10)`,
      });

      const signatureDataUrl = canvasRef.current.toDataURL('image/png');
      await ClinicOperationsService.savePatientConsentAsync({
        patientId: patient.id,
        episodeId: episode.id,
        templateId: treatmentTemplate.id,
        templateVersion: treatmentTemplate.version,
        titleAr: treatmentTemplate.titleAr,
        titleEn: treatmentTemplate.titleEn,
        bodySnapshotAr: treatmentTemplate.bodyAr,
        bodySnapshotEn: treatmentTemplate.bodyEn,
        signerName: cleanName,
        signerRelation: 'patient',
        signatureDataUrl,
        consentGranted: true,
      });

      resetForm();
      setCompletedBanner(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleExitAttempt = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    if (!unlockSecret.trim()) {
      setUnlockError(
        isEn
          ? 'Enter Admin PIN or Master Vault Password to exit Kiosk Mode.'
          : 'أدخل رمز PIN أو كلمة مرور الخزينة للخروج من وضع الكشك.'
      );
      return;
    }

    setVerifyingExit(true);
    try {
      // 1. Check Admin PIN if configured (supports rate-limiting)
      if (ClinicOperationsService.isAdminPinConfigured()) {
        const pinCheck = await ClinicOperationsService.verifyAdminPinAsync(unlockSecret.trim());
        if (pinCheck.ok) {
          setUnlockSecret('');
          setShowUnlockPrompt(false);
          onOpenChange(false);
          return;
        }
        if (pinCheck.rateLimited) {
          setUnlockError(
            isEn
              ? `Too many attempts. Wait ${pinCheck.remainingSeconds}s or use Vault Password.`
              : `محاولات متعددة. انتظر ${pinCheck.remainingSeconds} ثانية أو استخدم كلمة مرور الخزينة.`
          );
          return;
        }
      }

      // 2. Fallback: verify Master Vault Password
      const pwOk = await verifyVaultPassword(unlockSecret);
      if (pwOk) {
        setUnlockSecret('');
        setShowUnlockPrompt(false);
        onOpenChange(false);
        return;
      }

      setUnlockError(isEn ? 'Invalid PIN or Vault Password.' : 'رمز PIN أو كلمة المرور غير صحيحة.');
    } finally {
      setVerifyingExit(false);
    }
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="xl"
      isDismissable={false}
      isKeyboardDismissDisabled={true}
      hideCloseButton={true}
      title={t('kiosk.title')}
      subtitle={
        isEn
          ? 'Patient-only intake & consent station — other records are hidden'
          : 'محطة التسجيل الذاتي للمريض — السجلات الأخرى مخفية ومحمية'
      }
      headerActions={
        <div className="flex items-center gap-2">
          <LanguageSwitcher compact />
          <button
            type="button"
            onClick={() => {
              setUnlockError(null);
              setShowUnlockPrompt((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold cursor-pointer"
          >
            <Lock className="w-4 h-4" />
            {t('kiosk.exit')}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {showUnlockPrompt && (
          <form
            onSubmit={handleExitAttempt}
            className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 space-y-3"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>
                {isEn
                  ? 'Clinician Verification Required to Exit Kiosk'
                  : 'تحقق المعالج للخروج من وضع الكشك'}
              </span>
            </div>
            {unlockError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                {unlockError}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                autoComplete="current-password"
                value={unlockSecret}
                onChange={(e) => setUnlockSecret(e.target.value)}
                placeholder={isEn ? 'Admin PIN or Vault Password' : 'رمز PIN أو كلمة مرور الخزينة'}
                className="flex-1 min-w-[220px] px-3 py-2.5 rounded-xl border border-card-stroke bg-layer text-sm text-foreground"
              />
              <button
                type="submit"
                disabled={verifyingExit}
                className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed cursor-pointer"
              >
                {verifyingExit ? (isEn ? 'Checking…' : 'جاري التحقق…') : isEn ? 'Unlock & Exit' : 'فتح والخروج'}
              </button>
              <button
                type="button"
                onClick={() => setShowUnlockPrompt(false)}
                className="px-3 py-2.5 rounded-xl border border-card-stroke text-xs font-semibold text-muted-foreground-1 cursor-pointer"
              >
                {isEn ? 'Cancel' : 'إلغاء'}
              </button>
            </div>
          </form>
        )}

        {completedBanner ? (
          <div className="p-8 text-center rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-4">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-xl font-bold text-foreground">
              {isEn ? 'Thank You — Check-In Saved & Encrypted' : 'شكراً لك — تم حفظ بياناتك وتشفيرها بنجاح'}
            </h3>
            <p className="text-sm text-muted-foreground-1">
              {isEn
                ? 'Please hand this tablet back to your physical therapist or reception.'
                : 'يرجى تسليم الجهاز اللوحي لأخصائي العلاج الطبيعي.'}
            </p>
            <button
              type="button"
              onClick={() => setCompletedBanner(false)}
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
            >
              {isEn ? 'Ready for Next Patient' : 'جاهز لمريض جديد'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmitIntake} className="space-y-5">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                {errorMsg}
              </div>
            )}

            {/* Demographics */}
            <div className="p-4 rounded-2xl bg-surface border border-card-divider space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <TabletSmartphone className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>{isEn ? '1. Basic Information' : '١. المعلومات الأساسية'}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    {isEn ? 'Full Name *' : 'الاسم الكامل *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={isEn ? 'Enter your full name' : 'اكتب الاسم الثلاثي'}
                    className="w-full px-3 py-2.5 rounded-xl border border-card-stroke bg-layer text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    {isEn ? 'Mobile Phone' : 'رقم الموبايل'}
                  </label>
                  <PhoneInput value={phone} onChange={setPhone} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      {isEn ? 'Gender' : 'الجنس'}
                    </label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                      className="w-full px-2.5 py-2.5 rounded-xl border border-card-stroke bg-layer text-xs text-foreground"
                    >
                      <option value="male">{isEn ? 'Male' : 'ذكر'}</option>
                      <option value="female">{isEn ? 'Female' : 'أنثى'}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      {isEn ? 'Age' : 'العمر'}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className="w-full px-2.5 py-2.5 rounded-xl border border-card-stroke bg-layer text-xs text-foreground"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {isEn ? 'Reason for Visit / Main Pain Area' : 'سبب الزيارة / موضع الألم الرئيسي'}
                </label>
                <input
                  type="text"
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  placeholder={isEn ? 'e.g. Right shoulder pain when lifting' : 'مثال: ألم في الكتف الأيمن أو أسفل الظهر'}
                  className="w-full px-3 py-2.5 rounded-xl border border-card-stroke bg-layer text-sm text-foreground"
                />
              </div>
            </div>

            {/* Pain NPRS + PSFS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-surface border border-card-divider space-y-3">
                <div className="flex items-center justify-between text-sm font-bold text-foreground">
                  <span>{isEn ? '2. Current Pain Intensity (0–10)' : '٢. شدة الألم الحالية (0–10)'}</span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-teal-500/15 text-teal-700 dark:text-teal-300 text-sm font-extrabold">
                    <Num value={painNrs} /> / 10
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={painNrs}
                  aria-label={isEn ? 'Pain intensity 0 to 10' : 'شدة الألم من 0 إلى 10'}
                  onChange={(e) => setPainNrs(Number(e.target.value))}
                  className="w-full accent-teal-600 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-muted-foreground-1">
                  <span>{isEn ? '0 = No pain' : '0 = لا يوجد ألم'}</span>
                  <span>{isEn ? '10 = Worst pain' : '10 = أشد ألم ممكن'}</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-surface border border-card-divider space-y-2.5">
                <div className="text-sm font-bold text-foreground">
                  {isEn
                    ? '3. Activities Affected Most (PSFS 0–10, optional)'
                    : '٣. أنشطة يومية تجد صعوبة فيها (اختياري، 0–10)'}
                </div>
                <div className="space-y-2">
                  {psfsItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={item.activity}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPsfsItems((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, activity: val } : row))
                          );
                        }}
                        placeholder={
                          isEn
                            ? `Activity ${idx + 1} (e.g. climbing stairs)`
                            : `النشاط ${idx + 1} (مثل: صعود الدرج أو الصلاة)`
                        }
                        className="flex-1 px-3 py-2 rounded-xl border border-card-stroke bg-layer text-xs text-foreground"
                      />
                      <select
                        aria-label={`${isEn ? 'Ability score for activity' : 'القدرة على النشاط'} ${idx + 1}`}
                        value={item.score}
                        onChange={(e) => {
                          const score = Number(e.target.value);
                          setPsfsItems((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, score } : row))
                          );
                        }}
                        className="w-24 px-2 py-2 rounded-xl border border-card-stroke bg-layer text-xs font-bold text-foreground"
                      >
                        {Array.from({ length: 11 }).map((_, scoreVal) => (
                          <option key={scoreVal} value={scoreVal}>
                            {'\u2066'}{scoreVal} / 10{'\u2069'}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Informed Consent + Canvas Signature */}
            <div className="p-4 rounded-2xl bg-surface border border-card-divider space-y-3">
              <div className="text-sm font-bold text-foreground">
                {isEn ? `4. ${treatmentTemplate.titleEn}` : `٤. ${treatmentTemplate.titleAr}`}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground-1 bg-layer p-3 rounded-xl border border-card-divider">
                {isEn ? treatmentTemplate.bodyEn : treatmentTemplate.bodyAr}
              </p>

              <label className="flex items-center gap-2.5 text-xs font-bold text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                  className="w-4 h-4 rounded accent-teal-600"
                />
                <span>
                  {isEn
                    ? 'I have read and agree to the assessment and physiotherapy consent terms.'
                    : 'قرأت نص الإقرار وأوافق على التقييم وخطة العلاج الطبيعي.'}
                </span>
              </label>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground-1">
                  <span>{isEn ? 'Sign inside the white pad:' : 'وقّع بإصبعك أو القلم داخل المربع الأبيض:'}</span>
                  <button
                    type="button"
                    onClick={initCanvas}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-card-stroke hover:bg-layer-hover text-xs font-semibold text-foreground cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {isEn ? 'Clear' : 'مسح التوقيع'}
                  </button>
                </div>
                <canvas
                  ref={canvasRef}
                  width={680}
                  height={160}
                  onPointerDown={(e) => {
                    const canvas = canvasRef.current;
                    const ctx = canvas?.getContext('2d');
                    if (!canvas || !ctx) return;
                    canvas.setPointerCapture(e.pointerId);
                    const { x, y } = getPointerCoords(e);
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    drawingRef.current = true;
                  }}
                  onPointerMove={(e) => {
                    if (!drawingRef.current) return;
                    const ctx = canvasRef.current?.getContext('2d');
                    if (!ctx) return;
                    const { x, y } = getPointerCoords(e);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                    if (!hasStroke) setHasStroke(true);
                  }}
                  onPointerUp={(e) => {
                    if (!drawingRef.current) return;
                    drawingRef.current = false;
                    try {
                      canvasRef.current?.releasePointerCapture(e.pointerId);
                    } catch {
                      // ignore
                    }
                  }}
                  className="w-full h-36 rounded-xl border-2 border-dashed border-card-stroke bg-white touch-none cursor-crosshair"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold shadow-sm disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting
                ? isEn
                  ? 'Saving Encrypted Check-In…'
                  : 'جاري الحفظ والتشفير…'
                : isEn
                  ? 'Submit Intake & Signature'
                  : 'اعتماد المعلومات والتوقيع'}
            </button>
          </form>
        )}
      </div>
    </ModalDialog>
  );
};
