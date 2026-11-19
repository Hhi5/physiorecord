// =======================================================================
// PhysioRecord — One-Flow Session Finish Sequence (Phase 2.4)
// Step 1: Confirm Sign & Lock (immutable per R1)
// Step 2: Collect Payment (package/user services or blank custom amount; zero preset fees per R2)
// Step 3: Book Next Visit (suggests same weekday/time + smart memory duration/room)
// Post-finish triggers 8-second Undo on Billing + Booking while preserving finalized SOAP seal.
// =======================================================================

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { usePatients } from '../../context/PatientContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { ModalDialog } from '../ui/Dialog';
import { Money, MoneyInput, DatePickerInput, TimePickerInput, Fraction, TimeDisplay } from '../ui/Primitives';
import { CLINIC_ROOMS } from '../clinic/AppointmentScheduleView';
import type { SessionRecord } from '../../types/clinical';
import type {
  FinishUndoSnapshot,
  IraqiPaymentMethod,
} from '../../types/clinicManagement';
import {
  localDate,
  addDaysToDateStr,
  WEEKDAYS_IRAQI_ORDER,
  getWeekdayFromDateStr,
} from '../../utils/date';
import { getPatientDisplayName } from '../../utils/mrn';
import type { NoteCompletenessReport } from '../../utils/reEvalNudge';
import {
  Lock,
  Banknote,
  CalendarPlus,
  CheckCircle2,
  Package,
  ShieldAlert,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
} from 'lucide-react';

interface FinishSessionFlowModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  session: SessionRecord;
  episodeTitle?: string;
  completenessReport?: NoteCompletenessReport | null;
  advisoryWarnings?: string[];
  finalizeError?: string | null;
  onFinalizeStep: () => Promise<boolean>;
  onFinishCompleted: (undoSnapshot: FinishUndoSnapshot, summaryLabelAr: string, summaryLabelEn: string) => void;
}

export const FinishSessionFlowModal: React.FC<FinishSessionFlowModalProps> = ({
  isOpen,
  onOpenChange,
  session,
  episodeTitle,
  completenessReport,
  advisoryWarnings = [],
  finalizeError = null,
  onFinalizeStep,
  onFinishCompleted,
}) => {
  const { language, bi, isRtl } = useLanguage();
  const { patients } = usePatients();
  const { currency } = useCurrency();
  const currencyCode = currency.code;

  const patient = patients.find((p) => p.id === session.patientId);
  const patientName = patient
    ? getPatientDisplayName(patient.data, language)
    : session.patientId;
  const patientPhone = patient?.data.phoneNumber || patient?.data.phone;

  const smartMemory = ClinicOperationsService.getSmartMemory();
  const clinicProfile = ClinicOperationsService.getClinicProfile();
  const services = useMemo(
    () => ClinicOperationsService.getClinicServices().filter((s) => s.isActive),
    [isOpen]
  );

  // Locate patient's active packages / open balance invoices & today's appointment
  const patientInvoices = useMemo(
    () =>
      ClinicOperationsService.getInvoicesIQD().filter(
        (inv) => inv.patientId === session.patientId && inv.status !== 'void'
      ),
    [session.patientId, isOpen]
  );
  const activePackage = useMemo(
    () =>
      patientInvoices.find(
        (inv) =>
          inv.invoiceType === 'rehab_package' &&
          (inv.packageUsedSessions || 0) < (inv.packageTotalSessions || 0)
      ) || null,
    [patientInvoices]
  );
  const unpaidInvoice = useMemo(
    () => patientInvoices.find((inv) => inv.balanceDueIQD > 0) || null,
    [patientInvoices]
  );
  const todaysAppt = useMemo(() => {
    const today = localDate();
    return ClinicOperationsService.getAppointments().find(
      (a) =>
        a.patientId === session.patientId &&
        a.date === today &&
        a.status !== 'cancelled' &&
        a.status !== 'completed'
    );
  }, [session.patientId, isOpen]);

  // Recurring weekday suggestion for next visit
  const patientRecurring = useMemo(
    () =>
      ClinicOperationsService.getRecurringSchedules().find(
        (r) => r.patientId === session.patientId && r.isActive
      ) || null,
    [session.patientId, isOpen]
  );

  const suggestedNextVisit = useMemo(() => {
    const baseDate = session.sessionDate || localDate();
    const baseTime =
      todaysAppt?.startTime ||
      patientRecurring?.startTime ||
      session.data.sessionTime ||
      '10:00';
    const baseDuration =
      smartMemory.lastDurationMinutes ||
      todaysAppt?.durationMinutes ||
      patientRecurring?.durationMinutes ||
      session.data.sessionDurationMinutes ||
      clinicProfile.defaultSessionDurationMinutes ||
      45;

    if (patientRecurring && patientRecurring.weekdays.length > 0) {
      for (let d = 1; d <= 14; d++) {
        const candidateDate = addDaysToDateStr(baseDate, d);
        const wd = getWeekdayFromDateStr(candidateDate);
        if (wd !== null && patientRecurring.weekdays.includes(wd)) {
          return {
            date: candidateDate,
            time: patientRecurring.startTime || baseTime,
            duration: patientRecurring.durationMinutes || baseDuration,
            room: patientRecurring.roomOrBed || smartMemory.lastRoom || CLINIC_ROOMS[1].ar,
          };
        }
      }
    }

    return {
      date: addDaysToDateStr(baseDate, 7),
      time: baseTime,
      duration: baseDuration,
      room: todaysAppt?.roomOrBed || smartMemory.lastRoom || CLINIC_ROOMS[1].ar,
    };
  }, [session, todaysAppt, patientRecurring, smartMemory]);

  // Wizard Steps: 1 Confirm Finalize -> 2 Payment -> 3 Next Visit
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<FinishUndoSnapshot>({});

  // Step 2 billing state (NO hard-coded price defaults per R2!)
  const [billingMode, setBillingMode] = useState<'none' | 'package_deduct' | 'existing_invoice' | 'new_charge'>('none');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [invoiceType, setInvoiceType] = useState<'single_session' | 'rehab_package' | 'evaluation'>('single_session');
  const [chargeTotal, setChargeTotal] = useState<number>(0);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<IraqiPaymentMethod>(
    smartMemory.lastPaymentMethod || 'cash'
  );
  const [otherMethodDetail, setOtherMethodDetail] = useState('');

  // Step 3 next appointment state
  const [bookNextVisit, setBookNextVisit] = useState(true);
  const [nextDate, setNextDate] = useState(suggestedNextVisit.date);
  const [nextTime, setNextTime] = useState(suggestedNextVisit.time);
  const [nextDuration, setNextDuration] = useState<number>(suggestedNextVisit.duration);
  const [nextRoom, setNextRoom] = useState(suggestedNextVisit.room);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    setStepError(null);
    setUndoSnapshot({});
    setStep(session.status === 'finalized' ? 2 : 1);
    if (activePackage) {
      setBillingMode(activePackage.balanceDueIQD > 0 ? 'existing_invoice' : 'package_deduct');
      setPaymentAmount(activePackage.balanceDueIQD > 0 ? activePackage.balanceDueIQD : 0);
    } else if (unpaidInvoice) {
      setBillingMode('existing_invoice');
      setPaymentAmount(unpaidInvoice.balanceDueIQD);
    } else {
      setBillingMode('new_charge');
      setChargeTotal(0);
      setPaymentAmount(0);
    }
    setSelectedServiceId('');
    setPaymentMethod(smartMemory.lastPaymentMethod || 'cash');
    setNextDate(suggestedNextVisit.date);
    setNextTime(suggestedNextVisit.time);
    setNextDuration(suggestedNextVisit.duration);
    setNextRoom(suggestedNextVisit.room);
  }, [isOpen, session.status, activePackage, unpaidInvoice, smartMemory.lastPaymentMethod, suggestedNextVisit]);

  const handleConfirmStep1Finalize = async () => {
    setStepError(null);
    setIsFinalizing(true);
    const preFinalizePackage = activePackage
      ? { ...activePackage, payments: [...activePackage.payments] }
      : undefined;
    try {
      const ok = await onFinalizeStep();
      if (!ok) {
        setStepError(
          finalizeError ||
            bi(
              'تعذر اعتماد الجلسة حالياً — يرجى التحقق من التنبيه أعلاه أو المحاولة مجدداً.',
              'Could not finalize session right now — please check any warning above or retry.',
              'ناتوانرێت دانیشتن پەسەند بکرێت لە ئێستادا — تکایە دووبارە هەوڵبدەرەوە.'
            )
        );
        return;
      }

      const nextUndo: FinishUndoSnapshot = {};
      if (preFinalizePackage) {
        const refreshedPkg = ClinicOperationsService.getInvoicesIQD().find(
          (i) => i.id === preFinalizePackage.id
        );
        if (
          refreshedPkg &&
          (refreshedPkg.packageUsedSessions || 0) !== (preFinalizePackage.packageUsedSessions || 0)
        ) {
          nextUndo.previousInvoiceState = preFinalizePackage;
        }
      }

      // Ensure today's linked appointment is marked completed (if not already completed by SessionFinalized)
      if (todaysAppt) {
        nextUndo.previousAppointmentId = todaysAppt.id;
        nextUndo.previousAppointmentStatus = todaysAppt.status;
        const currentAppt = ClinicOperationsService.getAppointments().find(
          (a) => a.id === todaysAppt.id
        );
        if (currentAppt && currentAppt.status !== 'completed') {
          ClinicOperationsService.updateAppointmentStatus(todaysAppt.id, 'completed');
        }
      }

      if (Object.keys(nextUndo).length > 0) {
        setUndoSnapshot((prev) => ({ ...prev, ...nextUndo }));
      }
      setStep(2);
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleSelectUserService = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) {
      setChargeTotal(0);
      setPaymentAmount(0);
      return;
    }
    setInvoiceType(svc.invoiceType);
    setChargeTotal(svc.priceIQD);
    setPaymentAmount(svc.priceIQD);
  };

  const handleStep2Next = () => {
    setStepError(null);
    let nextUndo = { ...undoSnapshot };
    const activeStaff = ClinicOperationsService.getActiveStaff();

    if (billingMode === 'package_deduct' && activePackage) {
      nextUndo = {
        ...nextUndo,
        previousInvoiceState:
          nextUndo.previousInvoiceState || {
            ...activePackage,
            payments: [...activePackage.payments],
          },
      };
      ClinicOperationsService.incrementPackageSessionUsed(activePackage.id, session.id);
    } else if (billingMode === 'existing_invoice' && (unpaidInvoice || activePackage)) {
      const targetInv = activePackage && activePackage.balanceDueIQD > 0 ? activePackage : unpaidInvoice;
      if (targetInv) {
        nextUndo = {
          ...nextUndo,
          previousInvoiceState:
            nextUndo.previousInvoiceState || {
              ...targetInv,
              payments: [...targetInv.payments],
            },
        };
        if (paymentAmount > 0) {
          ClinicOperationsService.recordPaymentOnInvoiceIQD(
            targetInv.id,
            paymentAmount,
            paymentMethod,
            paymentMethod === 'other' && otherMethodDetail.trim()
              ? otherMethodDetail.trim()
              : undefined,
            { primaryCurrencyCode: currencyCode }
          );
          const refreshed = ClinicOperationsService.getInvoicesIQD().find((i) => i.id === targetInv.id);
          const createdPay = refreshed?.payments[refreshed.payments.length - 1];
          if (createdPay) nextUndo.createdPaymentId = createdPay.id;
        }
        if (targetInv.invoiceType === 'rehab_package') {
          ClinicOperationsService.incrementPackageSessionUsed(targetInv.id, session.id);
        }
      }
    } else if (billingMode === 'new_charge' && (chargeTotal > 0 || paymentAmount > 0)) {
      const selectedSvc = services.find((s) => s.id === selectedServiceId);
      const totalVal = Math.max(chargeTotal, paymentAmount);
      const createdInv = ClinicOperationsService.createInvoiceIQD({
        patientId: session.patientId,
        patientName,
        episodeId: session.episodeId,
        episodeTitle,
        invoiceType,
        titleAr:
          selectedSvc?.nameAr ||
          (invoiceType === 'rehab_package'
            ? 'كورس علاجي'
            : invoiceType === 'evaluation'
            ? 'فحص وتقييم'
            : 'جلسة علاج طبيعي'),
        titleEn:
          selectedSvc?.nameEn ||
          (invoiceType === 'rehab_package'
            ? 'Rehab Course Package'
            : invoiceType === 'evaluation'
            ? 'Clinical Evaluation'
            : 'Single PT Session'),
        totalAmountIQD: totalVal,
        discountIQD: 0,
        initialPaidIQD: Math.min(paymentAmount, totalVal),
        paymentMethod,
        currencyCode,
        packageTotalSessions: selectedSvc?.packageSessions,
        notes:
          paymentMethod === 'other' && otherMethodDetail.trim()
            ? otherMethodDetail.trim()
            : bi(
                `بواسطة ${activeStaff.nameAr}`,
                `By ${activeStaff.nameEn}`,
                `لەلایەن ${activeStaff.nameAr}`
              ),
      });
      if (createdInv.invoiceType === 'rehab_package') {
        ClinicOperationsService.incrementPackageSessionUsed(createdInv.id, session.id);
      }
      nextUndo.createdInvoiceId = createdInv.id;
    }

    if (paymentAmount > 0) {
      void ClinicOperationsService.updateSmartMemoryAsync({
        lastPaymentMethod: paymentMethod,
      }).catch(() => undefined);
    }

    setUndoSnapshot(nextUndo);
    setStep(3);
  };

  const handleCompleteFlow = () => {
    let finalUndo = { ...undoSnapshot };
    const activeStaff = ClinicOperationsService.getActiveStaff();

    if (bookNextVisit && nextDate) {
      const booked = ClinicOperationsService.saveAppointment({
        patientId: session.patientId,
        patientName,
        patientPhone,
        episodeId: session.episodeId,
        date: nextDate,
        startTime: nextTime,
        durationMinutes: Math.max(5, Math.min(240, nextDuration || 45)),
        visitType: 'follow_up',
        therapistName: language === 'en' ? activeStaff.nameEn : activeStaff.nameAr,
        roomOrBed: nextRoom,
        status: 'scheduled',
        recurringScheduleId: patientRecurring?.id,
      });
      finalUndo.createdAppointmentId = booked.id;

      void ClinicOperationsService.updateSmartMemoryAsync({
        lastDurationMinutes: Math.max(5, Math.min(240, nextDuration || 45)),
        lastRoom: nextRoom,
      }).catch(() => undefined);
    }

    onOpenChange(false);
    onFinishCompleted(
      finalUndo,
      bi(
        `تم اعتماد الجلسة وإنهاء المتابعة لـ ${patientName}`,
        `Session sealed & follow-up completed for ${patientName}`,
        `دانیشتنەکە پەسەند کرا و بەدواداچوون تەواو بوو بۆ ${patientName}`
      ),
      `Session sealed & follow-up completed for ${patientName}`
    );
  };

  const suggestedWd = getWeekdayFromDateStr(nextDate);
  const suggestedWdEntry =
    suggestedWd !== null
      ? WEEKDAYS_IRAQI_ORDER.find((w) => w.index === suggestedWd)
      : undefined;
  const suggestedWdLabel = suggestedWdEntry ? bi(suggestedWdEntry.ar, suggestedWdEntry.en) : '';

  const NextArrow = isRtl ? ChevronLeft : ChevronRight;

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
      size="md"
      title={bi(
        'إنهاء الجلسة والمتابعة في خطوة متصلة',
        'Finish Session, Collect & Rebook',
        'تەواوکردنی دانیشتن، پارەوەرگرتن و حیجزکردنی داهاتوو'
      )}
      subtitle={patientName}
    >
      <div className="space-y-4 text-xs">
        {/* Stepper Indicator */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { num: 1 as const, ar: '1. اعتماد الملاحظة', en: '1. Sign Note', ckb: '١. پەسەندکردنی تۆمار', icon: Lock },
            { num: 2 as const, ar: '2. التحصيل المالي', en: '2. Payment', ckb: '٢. پارەوەرگرتن', icon: Banknote },
            { num: 3 as const, ar: '3. الموعد القادم', en: '3. Next Visit', ckb: '٣. وادەی داهاتوو', icon: CalendarPlus },
          ].map((item) => {
            const Icon = item.icon;
            const active = step === item.num;
            const done = step > item.num;
            return (
              <div
                key={item.num}
                className={`px-3 py-2 rounded-xl flex items-center gap-2 font-bold ${
                  active
                    ? 'bg-primary/10 text-primary'
                    : done
                    ? 'bg-surface text-emerald-700 dark:text-emerald-400'
                    : 'bg-surface text-muted-foreground-1'
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{bi(item.ar, item.en, item.ckb)}</span>
              </div>
            );
          })}
        </div>

        {/* STEP 1: Confirm Finalize */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-surface/85 flex items-start gap-3">
              <ShieldAlert className="size-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-extrabold text-amber-800 dark:text-amber-300">
                  {bi(
                    'تأكيد الاعتماد النهائي (ختم تكامل دائم SHA-256)',
                    'Confirm Permanent Sign & Lock (SHA-256 Integrity Seal)',
                    'پشتڕاستکردنەوەی پەسەندکردنی کۆتایی (مۆری هەمیشەیی SHA-256)'
                  )}
                </p>
                <p className="text-muted-foreground-1 leading-relaxed">
                  {bi(
                    'سيتم قفل الملاحظة السريرية بشكل دائم وفق السجلات غير القابلة للتعديل (يمكن إضافة ملاحق Addenda لاحقاً)، ثم الانتقال لتحصيل الدفعة وحجز الزيارة القادمة.',
                    'This permanently seals the clinical note as immutable (append-only addenda remain available), then proceeds to payment collection & next visit booking.',
                    'ئەم تۆمارە کلینیکییە بە هەمیشەیی قفڵ دەکرێت و ناگۆڕێت (دەکرێت پاشکۆی Addenda دواتر زیاد بکرێت)، پاشان دەچێتە پارەوەرگرتن و حیجزکردنی وادەی داهاتوو.'
                  )}
                </p>
              </div>
            </div>

            {advisoryWarnings.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-surface/75 space-y-1.5">
                <div className="flex items-center gap-2 font-extrabold text-amber-700 dark:text-amber-300 text-xs">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>
                    {bi(
                      'تنبيه إرشادي (غير مانع للاعتماد) — يفضّل إكمال الحقول التالية:',
                      'Advisory Notice (Non-Blocking) — optional recommended fields:',
                      'ئاگاداری ڕێنمایی (ڕێگر نییە) — پێشنیار دەکرێت ئەم خانانە پڕبکرێنەوە:'
                    )}
                  </span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-xs text-muted-foreground-1 font-medium">
                  {advisoryWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {completenessReport && (
              <div
                data-testid="note-completeness-checklist"
                className="p-3.5 rounded-2xl bg-surface/75 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-foreground">
                    {bi(
                      'فحص اكتمال الملاحظة (تنبيه فقط — غير مانع):',
                      'Note Completeness Check (Advisory Only):',
                      'پشکنینی تەواوبوونی تۆمار (تەنها ئاگاداری):'
                    )}
                  </span>
                  <span
                    className={`font-extrabold ${
                      completenessReport.allComplete
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {completenessReport.allComplete
                      ? bi('مكتملة', 'Complete', 'تەواوە')
                      : bi(
                          `${completenessReport.missingCount} عناصر ناقصة`,
                          `${completenessReport.missingCount} incomplete`,
                          `${completenessReport.missingCount} خاڵی ناتەواو`
                        )}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {completenessReport.items.map((item) => (
                    <div
                      key={item.id}
                      data-testid={`completeness-item-${item.id}`}
                      data-completed={String(item.completed)}
                      className={`px-2.5 py-1.5 rounded-xl bg-card/80 flex items-center gap-2 ${
                        item.completed
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {item.completed ? (
                        <CheckCircle2 className="size-3.5 shrink-0" />
                      ) : (
                        <AlertCircle className="size-3.5 shrink-0" />
                      )}
                      <span className="font-semibold">
                        {bi(item.labelAr, item.labelEn, item.labelCkb)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(stepError || finalizeError) && (
              <p className="px-1 text-xs text-rose-700 dark:text-rose-300 font-bold">
                {finalizeError || stepError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-layer border border-layer-line font-bold text-foreground cursor-pointer"
              >
                {bi('مراجعة الملاحظة', 'Review Note', 'پێداچوونەوەی تۆمار')}
              </button>
              <button
                type="button"
                disabled={isFinalizing}
                data-testid="finish-step1-finalize-btn"
                onClick={() => void handleConfirmStep1Finalize()}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-extrabold inline-flex items-center gap-2 cursor-pointer disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed"
              >
                <Lock className="size-4" />
                <span>
                  {isFinalizing
                    ? bi('جاري الختم...', 'Sealing...', 'مۆرکردن...')
                    : (completenessReport && !completenessReport.allComplete) || advisoryWarnings.length > 0
                    ? bi('اعتماد على أي حال (Finalize anyway)', 'Finalize anyway', 'بە هەر حاڵ پەسەندی بکە')
                    : bi('تأكيد الاعتماد والمتابعة', 'Confirm Seal & Continue', 'پشتڕاستکردنەوە و بەردەوامبوون')}
                </span>
                <NextArrow className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Collect Payment (Blank by default or from user's package/service list) */}
        {step === 2 && (
          <div className="space-y-3.5">
            {activePackage && (
              <div className="p-3 rounded-xl bg-surface/75 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Package className="size-4 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <p className="font-bold text-foreground">
                      {activePackage.titleAr || activePackage.titleEn}
                    </p>
                    <p className="text-xs text-muted-foreground-1">
                      {bi('الجلسات المستخدمة:', 'Sessions used:', 'دانیشتنە بەکارهێنراوەکان:')}{' '}
                      <Fraction value={activePackage.packageUsedSessions || 0} total={activePackage.packageTotalSessions ?? 0} className="font-bold" />
                    </p>
                  </div>
                </div>
                {activePackage.balanceDueIQD > 0 && (
                  <div className="text-end">
                    <span className="text-xs text-muted-foreground-1 block">
                      {bi('المتبقي:', 'Balance:', 'ماوە:')}
                    </span>
                    <Money amount={activePackage.balanceDueIQD} className="font-extrabold text-amber-700 dark:text-amber-400" />
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {activePackage && (
                <button
                  type="button"
                  onClick={() => {
                    setBillingMode('package_deduct');
                    setPaymentAmount(0);
                  }}
                  className={`py-2 px-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                    billingMode === 'package_deduct'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-layer text-foreground hover:bg-layer-hover'
                  }`}
                >
                  {bi('خصم من الباقة', 'Use Package', 'لە کۆرس داببڕە')}
                </button>
              )}
              {(unpaidInvoice || (activePackage && activePackage.balanceDueIQD > 0)) && (
                <button
                  type="button"
                  onClick={() => {
                    const inv = activePackage && activePackage.balanceDueIQD > 0 ? activePackage : unpaidInvoice;
                    setBillingMode('existing_invoice');
                    setPaymentAmount(inv ? inv.balanceDueIQD : 0);
                  }}
                  className={`py-2 px-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                    billingMode === 'existing_invoice'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-layer text-foreground hover:bg-layer-hover'
                  }`}
                >
                  {bi('تسديد متبقي', 'Pay Balance', 'دانی پارەی ماوە')}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setBillingMode('new_charge');
                }}
                className={`py-2 px-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                  billingMode === 'new_charge'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-layer text-foreground hover:bg-layer-hover'
                }`}
              >
                {bi('فاتورة / قبض جديد', 'New Charge', 'پسوولە / وەرگرتنی نوێ')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setBillingMode('none');
                  setPaymentAmount(0);
                  setChargeTotal(0);
                }}
                className={`py-2 px-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                  billingMode === 'none'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-layer text-foreground hover:bg-layer-hover'
                }`}
              >
                {bi('تخطي الدفع الآن', 'Skip Payment', 'تێپەڕاندنی پارەدان ئێستا')}
              </button>
            </div>

            {billingMode === 'new_charge' && (
              <div className="space-y-3 p-3.5 rounded-xl bg-surface/75">
                {services.length > 0 && (
                  <div>
                    <label className="text-xs font-bold text-foreground block mb-1">
                      {bi(
                        'اختر من خدماتك المحفوظة (اختياري):',
                        'Select from Your Saved Services (Optional):',
                        'لە خزمەتگوزارییە پاشەکەوتکراوەکانت هەڵبژێرە (دڵخوازانە):'
                      )}
                    </label>
                    <select
                      value={selectedServiceId}
                      onChange={(e) => handleSelectUserService(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground font-semibold"
                    >
                      <option value="">
                        {bi('— إدخال يدوي فارغ —', '— Manual Blank Entry —', '— تۆمارکردنی دەستیی بەتاڵ —')}
                      </option>
                      {services.map((svc) => (
                        <option key={svc.id} value={svc.id}>
                          {bi(svc.nameAr, svc.nameEn)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'single_session', ar: 'جلسة مفردة', en: 'Single Session', ckb: 'دانیشتنی تاک' },
                      { id: 'rehab_package', ar: 'كورس', en: 'Course', ckb: 'کۆرس' },
                      { id: 'evaluation', ar: 'فحص', en: 'Evaluation', ckb: 'پشکنین' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setInvoiceType(t.id)}
                      className={`py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        invoiceType === t.id
                          ? 'bg-primary/15 text-primary'
                          : 'bg-layer text-muted-foreground-1 hover:bg-layer-hover'
                      }`}
                    >
                      {bi(t.ar, t.en, t.ckb)}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-foreground block mb-1">
                      {bi('إجمالي المبلغ:', 'Total Amount:', 'کۆی گشتیی بڕی پارە:')}
                    </label>
                    <MoneyInput
                      value={chargeTotal}
                      onChange={(amt) => {
                        setChargeTotal(amt);
                        setPaymentAmount(amt);
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-foreground block mb-1">
                      {bi('المبلغ المستلم الآن:', 'Collected Now:', 'بڕی وەرگیراو ئێستا:')}
                    </label>
                    <MoneyInput value={paymentAmount} onChange={setPaymentAmount} />
                  </div>
                </div>
              </div>
            )}

            {billingMode === 'existing_invoice' && (
              <div className="p-3.5 rounded-xl bg-surface/75">
                <label className="text-xs font-bold text-foreground block mb-1">
                  {bi('المبلغ المحصّل على المتبقي:', 'Payment Collected:', 'بڕی پارەی وەرگیراو لەسەر ماوە:')}
                </label>
                <MoneyInput value={paymentAmount} onChange={setPaymentAmount} />
              </div>
            )}

            {(billingMode === 'new_charge' || billingMode === 'existing_invoice') && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground block">
                  {bi('طريقة الدفع:', 'Payment Method:', 'شێوازی پارەدان:')}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {(
                    [
                      { id: 'cash', ar: 'نقداً', en: 'Cash', ckb: 'نەقد' },
                      { id: 'zain_cash', ar: 'ZainCash', en: 'ZainCash', ckb: 'ZainCash' },
                      { id: 'qi_card', ar: 'QiCard', en: 'QiCard', ckb: 'QiCard' },
                      { id: 'other', ar: 'أخرى', en: 'Other', ckb: 'هیتر' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                        paymentMethod === m.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-layer text-foreground hover:bg-layer-hover'
                      }`}
                    >
                      {bi(m.ar, m.en, m.ckb)}
                    </button>
                  ))}
                </div>
                {paymentMethod === 'other' && (
                  <input
                    type="text"
                    value={otherMethodDetail}
                    onChange={(e) => setOtherMethodDetail(e.target.value)}
                    placeholder={bi(
                      'اكتب تفاصيل وسيلة الدفع...',
                      'Enter payment method details...',
                      'وردەکاریی شێوازی پارەدان بنووسە...'
                    )}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground"
                  />
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-card-divider">
              <button
                type="button"
                data-testid="finish-step2-next-btn"
                onClick={handleStep2Next}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-extrabold inline-flex items-center gap-2 cursor-pointer"
              >
                <span>{bi('التالي: الموعد القادم', 'Next: Book Next Visit', 'دواتر: وادەی داهاتوو')}</span>
                <NextArrow className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Book Next Visit */}
        {step === 3 && (
          <div className="space-y-3.5">
            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-surface/75 cursor-pointer">
              <input
                type="checkbox"
                checked={bookNextVisit}
                onChange={(e) => setBookNextVisit(e.target.checked)}
                className="size-4 accent-primary rounded cursor-pointer"
              />
              <div>
                <span className="font-bold text-foreground block">
                  {bi('حجز الموعد القادم تلقائياً', 'Schedule next visit', 'حیجزکردنی وادەی داهاتوو بە شێوەی خۆکار')}
                </span>
                <span className="text-xs text-muted-foreground-1">
                  {language === 'ckb' ? (
                    <>پێشنیاز: ڕۆژی {suggestedWdLabel} کاتژمێر <TimeDisplay time={nextTime} /></>
                  ) : language !== 'en' ? (
                    <>الاقتراح: يوم {suggestedWdLabel} الساعة <TimeDisplay time={nextTime} /></>
                  ) : (
                    <>Suggested: {suggestedWdLabel} at <TimeDisplay time={nextTime} /></>
                  )}
                </span>
              </div>
            </label>

            {bookNextVisit && (
              <div className="p-3.5 rounded-xl bg-surface/75 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">
                    {bi('تاريخ الموعد القادم:', 'Next Visit Date:', 'ڕێکەوتی وادەی داهاتوو:')}
                  </label>
                  <DatePickerInput value={nextDate} onChange={setNextDate} />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">
                    {bi('وقت البدء:', 'Start Time:', 'کاتی دەستپێکردن:')}
                  </label>
                  <TimePickerInput value={nextTime} onChange={setNextTime} />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">
                    {bi('المدة (دقيقة):', 'Duration (min):', 'ماوە (خولەک):')}
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={240}
                    value={nextDuration}
                    onChange={(e) => setNextDuration(Math.max(5, Math.min(240, Number(e.target.value) || 45)))}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">
                    {bi('الغرفة العلاجية:', 'Room / Bay:', 'ژووری چارەسەر:')}
                  </label>
                  <select
                    value={nextRoom}
                    onChange={(e) => setNextRoom(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground font-semibold"
                  >
                    {CLINIC_ROOMS.map((r) => (
                      <option key={r.ar} value={r.ar}>
                        {bi(r.ar, r.en)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-card-divider">
              <button
                type="button"
                data-testid="finish-step3-complete-btn"
                onClick={handleCompleteFlow}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold inline-flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <CheckCircle2 className="size-4" />
                <span>{bi('إنهاء وإغلاق المتابعة', 'Complete Finish Flow', 'تەواوکردن و داخستنی بەدواداچوون')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalDialog>
  );
};
