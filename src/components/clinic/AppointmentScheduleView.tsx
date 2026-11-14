// =======================================================================
// PhysioRecord — Appointment Schedule & Waiting List (Batch 3 Simplification)
// - Page header = title + max 2 actions (DatePicker + Book Appointment)
// - Right-side slide-over sheet for New Appointment
// - ONE patient combobox ("search or add new"), duration presets (30/45/60),
//   room as a select from clinic rooms, and same time format as the list (formatTimeIraq)
// - Appointment status = status chip with menu (not a <select>)
// =======================================================================

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { usePatients } from '../../context/PatientContext';
import { useVault } from '../../context/VaultContext';
import { DraftRecoveryService } from '../../services/draftRecoveryService';
import {
  ClinicOperationsService,
} from '../../services/clinicOperationsService';
import {
  localDate,
  formatDateDDMMYYYY,
  formatTimeIraq,
  formatIraqiPhoneDisplay,
  WEEKDAYS_IRAQI_ORDER,
  formatWeekdaysSummary,
  getWeekdayFromDateStr,
} from '../../utils/date';
import {
  buildAppointmentReminderText,
  buildUserInitiatedWhatsAppHref,
} from '../../utils/whatsappTemplates';
import { getPatientMrn, isDemoPatient, getPatientDisplayName } from '../../utils/mrn';
import { Num, DemoBadge, DatePickerInput, TimePickerInput, TimeDisplay } from '../ui/Primitives';
import { ModalDialog, DrawerDialog } from '../ui/Dialog';
import {
  IRAQ_GOVERNORATES,
  buildGoogleMapsSearchUrl,
  formatClosedDateRangeSummary,
  formatHijriDate,
  formatHomeVisitAddressDisplay,
  getPracticeLocationLabel,
  getWeeklyBreakConflictsForRecurring,
  getWeeklyBreaksForHour,
  hasHomeVisitAddress,
  resolveAppointmentLocationId,
  resolveDefaultLocationId,
  summarizeAppointmentsByLocation,
} from '../../utils/iraqScheduleLocationsC1C3';
import type { ClosedDaysBreaksModalTab } from './ClosedDaysBreaksModal';
import {
  computePatientVisitCardSummary,
  findNextUpcomingAppointment,
} from '../../utils/sharingInteropPhaseE';

const ClosedDaysBreaksModal = lazy(() => import('./ClosedDaysBreaksModal'));
const IcsExportModal = lazy(() => import('./IcsExportModal'));
const PrintDocumentModal = lazy(() =>
  import('../print/PrintDocumentModal').then((m) => ({ default: m.PrintDocumentModal }))
);

const localizePreferredDays = (rawDays: string | undefined, language: string): string => {
  if (!rawDays || language === 'ar') return rawDays || '';
  if (language === 'ckb') {
    const ckbMap: Array<[RegExp, string]> = [
      [/السبت/g, 'شەممە'],
      [/الأحد|الاحد/g, 'یەکشەممە'],
      [/الإثنين|الاثنين/g, 'دووشەممە'],
      [/الثلاثاء/g, 'سێشەممە'],
      [/الأربعاء|الاربعاء/g, 'چوارشەممە'],
      [/الخميس/g, 'پێنجشەممە'],
      [/الجمعة/g, 'هەینی'],
      [/صباحاً|صباحا/g, 'بەیانی'],
      [/مساءً|مساءا/g, 'ئێوارە'],
    ];
    return ckbMap.reduce((acc, [pattern, ckb]) => acc.replace(pattern, ckb), rawDays);
  }
  const map: Array<[RegExp, string]> = [
    [/السبت/g, 'Sat'],
    [/الأحد|الاحد/g, 'Sun'],
    [/الإثنين|الاثنين/g, 'Mon'],
    [/الثلاثاء/g, 'Tue'],
    [/الأربعاء|الاربعاء/g, 'Wed'],
    [/الخميس/g, 'Thu'],
    [/الجمعة/g, 'Fri'],
    [/صباحاً|صباحا/g, 'Morning'],
    [/مساءً|مساءا/g, 'Evening'],
    [/،/g, ','],
  ];
  return map.reduce((acc, [pattern, en]) => acc.replace(pattern, en), rawDays);
};
import type {
  AppointmentMode,
  AppointmentStatus,
  ClinicAppointment,
  HomeVisitAddress,
  PatientVisitCardSummary,
  RecurringPatientSchedule,
  WaitingListEntry,
  WaitlistMatchSuggestion,
  WeekdayIndex,
} from '../../types/clinicManagement';
import type { SessionType } from '../../types/clinical';
import {
  Plus,
  Phone,
  Stethoscope,
  Trash2,
  ClipboardList,
  CheckCircle2,
  Clock,
  MapPin,
  RotateCcw,
  X,
  Search,
  UserPlus,
  ChevronDown,
  Repeat,
  Pause,
  Play,
  AlertTriangle,
  LayoutList,
  CalendarClock,
  MessageCircle,
  Sparkles,
  Home,
  Building2,
  CalendarOff,
  ExternalLink,
  SlidersHorizontal,
  Calendar,
  Printer,
  Eye,
  EyeOff,
} from 'lucide-react';

export const CLINIC_ROOMS = [
  { ar: 'غرفة التقييم الأولي 1', en: 'Initial Evaluation Room 1', ckb: 'ژووری هەڵسەنگاندنی سەرەتایی 1' },
  { ar: 'وحدة العلاج الطبيعي 1', en: 'PT Treatment Room 1', ckb: 'ژووری چارەسەری سروشتی 1' },
  { ar: 'وحدة العلاج الطبيعي 2', en: 'PT Treatment Room 2', ckb: 'ژووری چارەسەری سروشتی 2' },
  { ar: 'وحدة العلاج الكهربائي واليدوي', en: 'Electro & Manual Therapy Bay', ckb: 'بەشی چارەسەری کارەبایی و دەستی' },
  { ar: 'قاعة التأهيل الحركي والرياضي', en: 'Active Rehab & Sports Gym', ckb: 'هۆڵی ڕاهێنانی جووڵەیی و وەرزشی' },
];

const STATUS_CKB: Record<AppointmentStatus, string> = {
  scheduled: 'خشتەکراو',
  arrived: 'گەیشتووەتە کلینیک',
  in_session: 'لە دانیشتندایە',
  completed: 'تەواوبوو',
  cancelled: 'هەڵوەشاوە',
  no_show: 'ئامادە نەبوو',
};

const WEEKDAY_CKB: Record<number, string> = {
  6: 'شەممە',
  0: 'یەکشەممە',
  1: 'دووشەممە',
  2: 'سێشەممە',
  3: 'چوارشەممە',
  4: 'پێنجشەممە',
  5: 'هەینی',
};

const GOVERNORATE_CKB: Record<string, string> = {
  Baghdad: 'بەغدا',
  Basra: 'بەسڕە',
  Nineveh: 'نەینەوا',
  Erbil: 'هەولێر',
  Najaf: 'نەجەف',
  Karbala: 'کەربەلا',
  Babil: 'بابل',
  Anbar: 'ئەنبار',
  Diyala: 'دیالە',
  Kirkuk: 'کەرکووک',
  Sulaymaniyah: 'سلێمانی',
  Duhok: 'دهۆک',
  Wasit: 'واست',
  Maysan: 'میسان',
  'Dhi Qar': 'زیقار',
  Muthanna: 'موسەنا',
  'Al-Qadisiyah': 'قادسیە',
  Saladin: 'سەلاحەدین',
};

interface AppointmentScheduleViewProps {
  onNewPatient?: () => void;
  privacyBlur?: boolean;
}

export const AppointmentScheduleView: React.FC<AppointmentScheduleViewProps> = ({
  onNewPatient,
  privacyBlur: propPrivacyBlur,
}) => {
  const { language, isRtl, bi } = useLanguage();
  const [internalPrivacyBlur, setInternalPrivacyBlur] = useState<boolean>(() =>
    ClinicOperationsService.getReceptionPrivacyBlur()
  );
  const privacyBlur = propPrivacyBlur !== undefined ? propPrivacyBlur : internalPrivacyBlur;
  const setPrivacyBlur = (val: boolean) => {
    setInternalPrivacyBlur(val);
    ClinicOperationsService.setReceptionPrivacyBlur(val);
  };
  const { activePatients } = usePatients();
  const { dek, refreshRecoveredDrafts } = useVault();

  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [waitingList, setWaitingList] = useState<WaitingListEntry[]>([]);
  const [recurringSchedules, setRecurringSchedules] = useState<RecurringPatientSchedule[]>([]);
  const [opsVersion, setOpsVersion] = useState(0);
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [selectedTherapist, setSelectedTherapist] = useState<string>('all');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all');
  const [showNewApptSheet, setShowNewApptSheet] = useState(false);
  const [showNewWaitlistForm, setShowNewWaitlistForm] = useState(false);
  const [showClosedDaysBreaksModal, setShowClosedDaysBreaksModal] = useState(false);
  const [closedDaysModalTab, setClosedDaysModalTab] = useState<ClosedDaysBreaksModalTab>('breaks');
  const [mapsConfirmTarget, setMapsConfirmTarget] = useState<{
    patientName: string;
    address: HomeVisitAddress;
    formattedAddress: string;
    url: string;
  } | null>(null);
  const [openStatusMenuId, setOpenStatusMenuId] = useState<string | null>(null);

  // New Appointment / Weekly Schedule Form State
  const [scheduleMode, setScheduleMode] = useState<'single' | 'recurring'>('single');
  const [selectedWeekdays, setSelectedWeekdays] = useState<WeekdayIndex[]>([0, 2, 4]);
  const [recurringStartDate, setRecurringStartDate] = useState(localDate());
  const [recurringEndDate, setRecurringEndDate] = useState('');
  const [patientId, setPatientId] = useState('');
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [isComboboxOpen, setIsComboboxOpen] = useState(false);
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [therapistName, setTherapistName] = useState(
    () => ClinicOperationsService.getStaffRoster()[0]?.nameAr || ''
  );
  const [startTime, setStartTime] = useState('10:00');
  const initialSmartMem = ClinicOperationsService.getSmartMemory();
  const initialClinicProfile = ClinicOperationsService.getClinicProfile();
  const initialDefaultDuration =
    initialSmartMem.lastDurationMinutes ||
    initialClinicProfile.defaultSessionDurationMinutes ||
    45;
  const [durationMinutes, setDurationMinutes] = useState<number>(initialDefaultDuration);
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [customDurationDraft, setCustomDurationDraft] = useState(
    String(initialDefaultDuration)
  );
  const [visitType, setVisitType] = useState<SessionType>('follow_up');
  const [appointmentMode, setAppointmentMode] = useState<AppointmentMode>('clinic');
  const [locationId, setLocationId] = useState<string>(() =>
    resolveDefaultLocationId(ClinicOperationsService.getPracticeLocations(), 'clinic')
  );
  const [homeVisitGov, setHomeVisitGov] = useState('');
  const [homeVisitArea, setHomeVisitArea] = useState('');
  const [homeVisitLandmark, setHomeVisitLandmark] = useState('');
  const [homeVisitNotes, setHomeVisitNotes] = useState('');
  const [travelBufferBeforeStr, setTravelBufferBeforeStr] = useState('');
  const [travelBufferAfterStr, setTravelBufferAfterStr] = useState('');
  const [roomOrBed, setRoomOrBed] = useState(initialSmartMem.lastRoom || CLINIC_ROOMS[1].ar);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Phase 4.5: Timeline Toggle, Cancellation/No-Show Reason Modal & Waitlist Suggestion
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');
  const [reasonModalTarget, setReasonModalTarget] = useState<{
    appointment: ClinicAppointment;
    targetStatus: 'cancelled' | 'no_show';
  } | null>(null);
  const [statusReasonInput, setStatusReasonInput] = useState('');
  const [freedSlotBanner, setFreedSlotBanner] = useState<{
    freedAppt: ClinicAppointment;
    suggestions: WaitlistMatchSuggestion[];
  } | null>(null);

  // New Waitlist Form State
  const [waitPatientId, setWaitPatientId] = useState('');
  const [waitCondition, setWaitCondition] = useState('');
  const [waitDays] = useState('السبت، الإثنين، الأربعاء');
  const [waitPriority, setWaitPriority] = useState<'urgent' | 'high' | 'normal'>('normal');

  // Phase E2/E3: .ics Calendar Export & Schedule / Visit Card Printing
  const [icsExportEnabled, setIcsExportEnabled] = useState<boolean>(() =>
    ClinicOperationsService.isIcsCalendarExportEnabled()
  );
  const [schedulePrintEnabled, setSchedulePrintEnabled] = useState<boolean>(() =>
    ClinicOperationsService.isScheduleVisitCardPrintEnabled()
  );
  const [icsModalState, setIcsModalState] = useState<{
    isOpen: boolean;
    initialSingleAppointment: ClinicAppointment | null;
  }>({ isOpen: false, initialSingleAppointment: null });
  const [printModalState, setPrintModalState] = useState<{
    documentType: 'tomorrow_schedule' | 'patient_visit_card';
    scheduleDate?: string;
    scheduleAppointments?: ClinicAppointment[];
    visitCardSummary?: PatientVisitCardSummary | null;
    patient?: (typeof activePatients)[number] | null;
    patientName?: string;
    patientPhone?: string;
    patientMrn?: string;
  } | null>(null);

  // 8-second Undo Toast State
  const [undoItem, setUndoItem] = useState<
    | { type: 'appointment'; data: ClinicAppointment }
    | { type: 'waitlist'; data: WaitingListEntry }
    | { type: 'recurring'; data: RecurringPatientSchedule }
    | null
  >(null);

  const reloadSchedule = (targetDate = selectedDate) => {
    setAppointments(ClinicOperationsService.ensureRecurringAppointmentsForDate(targetDate));
    setWaitingList(ClinicOperationsService.getWaitingList());
    setRecurringSchedules(ClinicOperationsService.getRecurringSchedules());
    setIcsExportEnabled(ClinicOperationsService.isIcsCalendarExportEnabled());
    setSchedulePrintEnabled(ClinicOperationsService.isScheduleVisitCardPrintEnabled());
    setOpsVersion((v) => v + 1);
  };

  useEffect(() => {
    reloadSchedule(selectedDate);
    const onUpdate = () => reloadSchedule(selectedDate);
    const unsubscribe = ClinicOperationsService.subscribe(() => {
      setAppointments(ClinicOperationsService.getAppointments());
      setWaitingList(ClinicOperationsService.getWaitingList());
      setRecurringSchedules(ClinicOperationsService.getRecurringSchedules());
      setIcsExportEnabled(ClinicOperationsService.isIcsCalendarExportEnabled());
      setSchedulePrintEnabled(ClinicOperationsService.isScheduleVisitCardPrintEnabled());
      setPrivacyBlur(ClinicOperationsService.getReceptionPrivacyBlur());
      setOpsVersion((v) => v + 1);
    });
    window.addEventListener('physiorecord-demo-updated', onUpdate);
    window.addEventListener('physiorecord-schedule-updated', onUpdate);
    window.addEventListener('physiorecord-modules-updated', onUpdate);
    return () => {
      unsubscribe();
      window.removeEventListener('physiorecord-demo-updated', onUpdate);
      window.removeEventListener('physiorecord-schedule-updated', onUpdate);
      window.removeEventListener('physiorecord-modules-updated', onUpdate);
    };
  }, [selectedDate]);

  useEffect(() => {
    if (!dek) return;
    void DraftRecoveryService.getDraftAsync<Record<string, any>>(
      dek,
      'appointment',
      'new'
    ).then((recovered) => {
      if (!recovered) return;
      const p = recovered.payload;
      if (typeof p.patientId === 'string') setPatientId(p.patientId);
      if (p.scheduleMode === 'single' || p.scheduleMode === 'recurring') {
        setScheduleMode(p.scheduleMode);
      }
      if (Array.isArray(p.selectedWeekdays)) setSelectedWeekdays(p.selectedWeekdays);
      if (typeof p.selectedDate === 'string') setSelectedDate(p.selectedDate);
      if (typeof p.episodeTitle === 'string') setEpisodeTitle(p.episodeTitle);
      if (typeof p.therapistName === 'string') setTherapistName(p.therapistName);
      if (typeof p.startTime === 'string') setStartTime(p.startTime);
      if (typeof p.durationMinutes === 'number') setDurationMinutes(p.durationMinutes);
      if (typeof p.roomOrBed === 'string') setRoomOrBed(p.roomOrBed);
      if (typeof p.notes === 'string') setNotes(p.notes);
      if (p.appointmentMode === 'clinic' || p.appointmentMode === 'home_visit') {
        setAppointmentMode(p.appointmentMode);
      }
      if (typeof p.locationId === 'string') setLocationId(p.locationId);
      if (p.homeVisitAddress && typeof p.homeVisitAddress === 'object') {
        const addr = p.homeVisitAddress as Partial<HomeVisitAddress>;
        if (typeof addr.governorate === 'string') setHomeVisitGov(addr.governorate);
        if (typeof addr.area === 'string') setHomeVisitArea(addr.area);
        if (typeof addr.nearestLandmark === 'string') setHomeVisitLandmark(addr.nearestLandmark);
        if (typeof addr.notes === 'string') setHomeVisitNotes(addr.notes);
      }
      if (typeof p.travelBufferBeforeMin === 'number') {
        setTravelBufferBeforeStr(String(p.travelBufferBeforeMin));
      }
      if (typeof p.travelBufferAfterMin === 'number') {
        setTravelBufferAfterStr(String(p.travelBufferAfterMin));
      }
      setShowNewApptSheet(true);
    });
  }, [dek]);

  useEffect(() => {
    if (!dek || !showNewApptSheet) return;
    const hasContent = Boolean(
      patientId ||
        episodeTitle.trim() ||
        notes.trim() ||
        homeVisitGov.trim() ||
        homeVisitArea.trim() ||
        homeVisitLandmark.trim()
    );
    if (!hasContent) return;
    const matched = activePatients.find((p) => p.id === patientId);
    const parsedBeforeDraft =
      appointmentMode === 'home_visit' && travelBufferBeforeStr.trim() !== ''
        ? Math.max(0, Math.min(240, Math.round(Number(travelBufferBeforeStr) || 0)))
        : undefined;
    const parsedAfterDraft =
      appointmentMode === 'home_visit' && travelBufferAfterStr.trim() !== ''
        ? Math.max(0, Math.min(240, Math.round(Number(travelBufferAfterStr) || 0)))
        : undefined;
    const draftInput = {
      draftType: 'appointment' as const,
      entityId: 'new',
      patientId: patientId || undefined,
      patientName: matched ? matched.data.fullNameAr || matched.data.fullName : undefined,
      summaryLabel: episodeTitle.trim().slice(0, 60) || `${selectedDate} ${startTime}`,
      payload: {
        patientId,
        scheduleMode,
        selectedWeekdays,
        selectedDate,
        episodeTitle,
        therapistName,
        startTime,
        durationMinutes,
        roomOrBed,
        notes,
        appointmentMode,
        locationId,
        homeVisitAddress:
          appointmentMode === 'home_visit'
            ? {
                governorate: homeVisitGov,
                area: homeVisitArea,
                nearestLandmark: homeVisitLandmark,
                notes: homeVisitNotes,
              }
            : undefined,
        travelBufferBeforeMin: parsedBeforeDraft,
        travelBufferAfterMin: parsedAfterDraft,
      },
    };
    DraftRecoveryService.scheduleDebouncedDraftSave(dek, draftInput);
    return DraftRecoveryService.registerDraftFlushSource('appointment:new', () => draftInput);
  }, [
    dek,
    showNewApptSheet,
    activePatients,
    patientId,
    scheduleMode,
    selectedWeekdays,
    selectedDate,
    episodeTitle,
    therapistName,
    startTime,
    durationMinutes,
    roomOrBed,
    notes,
    appointmentMode,
    locationId,
    homeVisitGov,
    homeVisitArea,
    homeVisitLandmark,
    homeVisitNotes,
    travelBufferBeforeStr,
    travelBufferAfterStr,
  ]);

  useEffect(() => {
    if (!undoItem) return;
    const timer = setTimeout(() => setUndoItem(null), 8000);
    return () => clearTimeout(timer);
  }, [undoItem]);

  const handleUndoDelete = () => {
    if (!undoItem) return;
    if (undoItem.type === 'appointment') {
      setAppointments(ClinicOperationsService.restoreAppointment(undoItem.data));
    } else if (undoItem.type === 'recurring') {
      setRecurringSchedules(ClinicOperationsService.restoreRecurringSchedule(undoItem.data));
      reloadSchedule(selectedDate);
    } else {
      setWaitingList(ClinicOperationsService.restoreWaitingListEntry(undoItem.data));
    }
    setUndoItem(null);
  };

  const selectedPatientObj = activePatients.find((p) => p.id === patientId) || null;

  const comboboxFilteredPatients = activePatients.filter((p, idx) => {
    const q = patientSearchQuery.trim().toLowerCase();
    if (!q) return true;
    const mrn = getPatientMrn(p, idx).toLowerCase();
    return (
      p.data.fullName.toLowerCase().includes(q) ||
      (p.data.fullNameAr && p.data.fullNameAr.toLowerCase().includes(q)) ||
      (p.data.phone && p.data.phone.includes(q)) ||
      (p.data.phoneNumber && p.data.phoneNumber.includes(q)) ||
      mrn.includes(q)
    );
  });

  const toggleWeekdayChip = (day: WeekdayIndex) => {
    setSelectedWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  void opsVersion;
  const homeVisitsEnabled = ClinicOperationsService.isHomeVisitsEnabled();
  const practiceLocationsEnabled = ClinicOperationsService.isPracticeLocationsEnabled();
  const closedDaysBreaksEnabled = ClinicOperationsService.isClosedDaysBreaksEnabled();
  const hijriDateEnabled = ClinicOperationsService.isHijriDateDisplayEnabled();
  const practiceLocations = ClinicOperationsService.getPracticeLocations();
  const activePracticeLocations = practiceLocations.filter((l) => l.isActive !== false);
  const weeklyBreaks = ClinicOperationsService.getWeeklyBreaks();
  const selectedDateClosedMatches = ClinicOperationsService.getClosedDateMatchesForDate(selectedDate);
  const hijriDateLabel = hijriDateEnabled ? formatHijriDate(selectedDate, language) : '';

  const handleSelectAppointmentMode = (mode: AppointmentMode) => {
    setAppointmentMode(mode);
    if (mode === 'home_visit') {
      const homeLoc =
        activePracticeLocations.find((l) => l.id === 'loc_home_visits') ||
        activePracticeLocations.find((l) => l.type === 'home_visits');
      if (homeLoc) {
        setLocationId(homeLoc.id);
      }
    } else {
      const currentLoc = practiceLocations.find((l) => l.id === locationId);
      if (!currentLoc || currentLoc.type === 'home_visits') {
        setLocationId(resolveDefaultLocationId(practiceLocations, 'clinic'));
      }
    }
  };

  const openMapsConfirmation = (patientNameStr: string, addr?: HomeVisitAddress) => {
    if (!addr || !hasHomeVisitAddress(addr)) return;
    const url = buildGoogleMapsSearchUrl(addr);
    if (!url) return;
    setMapsConfirmTarget({
      patientName: patientNameStr,
      address: addr,
      formattedAddress: formatHomeVisitAddressDisplay(addr),
      url,
    });
  };

  const handleCreateAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const matchedPatient = activePatients.find((p) => p.id === patientId);
    if (!matchedPatient) {
      setFormError(
        bi(
          'يرجى اختيار مريض مسجل أو إضافة مريض جديد أولاً.',
          'Please select a patient or add a new patient first.',
          'تکایە سەرەتا نەخۆشێکی تۆمارکراو هەڵبژێرە یان نەخۆشێکی نوێ زیاد بکە.'
        )
      );
      return;
    }

    const resolvedDuration = Math.max(
      5,
      Math.min(480, Math.round(Number(durationMinutes) || 45))
    );

    const effectiveMode: AppointmentMode = homeVisitsEnabled ? appointmentMode : 'clinic';
    const resolvedLocId = practiceLocationsEnabled
      ? locationId || resolveDefaultLocationId(practiceLocations, effectiveMode)
      : undefined;

    const draftAddress: HomeVisitAddress | undefined =
      effectiveMode === 'home_visit'
        ? {
            governorate: homeVisitGov.trim(),
            area: homeVisitArea.trim(),
            nearestLandmark: homeVisitLandmark.trim(),
            ...(homeVisitNotes.trim() ? { notes: homeVisitNotes.trim() } : {}),
          }
        : undefined;
    const resolvedAddress =
      draftAddress && (hasHomeVisitAddress(draftAddress) || draftAddress.notes)
        ? draftAddress
        : undefined;

    const parsedBufferBefore =
      effectiveMode === 'home_visit' && travelBufferBeforeStr.trim() !== ''
        ? Math.max(0, Math.min(240, Math.round(Number(travelBufferBeforeStr) || 0)))
        : undefined;
    const parsedBufferAfter =
      effectiveMode === 'home_visit' && travelBufferAfterStr.trim() !== ''
        ? Math.max(0, Math.min(240, Math.round(Number(travelBufferAfterStr) || 0)))
        : undefined;

    const resolvedRoom = effectiveMode === 'home_visit' ? undefined : roomOrBed;

    if (scheduleMode === 'recurring') {
      if (selectedWeekdays.length === 0) {
        setFormError(
          bi(
            'يرجى تحديد يوم واحد على الأقل من أيام الأسبوع للتكرار.',
            'Please select at least one weekday for recurring sessions.',
            'تکایە لانیکەم یەک ڕۆژی هەفتە بۆ دووبارەبوونەوە دیاری بکە.'
          )
        );
        return;
      }

      ClinicOperationsService.saveRecurringSchedule({
        patientId: matchedPatient.id,
        patientName: matchedPatient.data.fullNameAr || matchedPatient.data.fullName,
        patientPhone: matchedPatient.data.phoneNumber || '',
        episodeTitle:
          episodeTitle ||
          bi('جلسة علاج طبيعي وتأهيل', 'PT Rehab Session', 'دانیشتنی چارەسەری سروشتی و ڕاهێنان'),
        therapistName,
        weekdays: selectedWeekdays,
        startTime,
        durationMinutes: resolvedDuration,
        visitType,
        appointmentMode: effectiveMode,
        ...(resolvedLocId ? { locationId: resolvedLocId } : {}),
        ...(resolvedAddress ? { homeVisitAddress: resolvedAddress } : {}),
        ...(parsedBufferBefore !== undefined
          ? { travelBufferBeforeMin: parsedBufferBefore }
          : {}),
        ...(parsedBufferAfter !== undefined
          ? { travelBufferAfterMin: parsedBufferAfter }
          : {}),
        ...(resolvedRoom ? { roomOrBed: resolvedRoom } : {}),
        notes,
        startDate: recurringStartDate || localDate(),
        endDate: recurringEndDate || undefined,
        isActive: true,
        isDemo: isDemoPatient(matchedPatient),
      });
    } else {
      ClinicOperationsService.saveAppointment({
        patientId: matchedPatient.id,
        patientName: matchedPatient.data.fullNameAr || matchedPatient.data.fullName,
        patientPhone: matchedPatient.data.phoneNumber || '',
        episodeTitle:
          episodeTitle ||
          bi('جلسة علاج طبيعي وتأهيل', 'PT Rehab Session', 'دانیشتنی چارەسەری سروشتی و ڕاهێنان'),
        therapistName,
        date: selectedDate,
        startTime,
        durationMinutes: resolvedDuration,
        visitType,
        appointmentMode: effectiveMode,
        ...(resolvedLocId ? { locationId: resolvedLocId } : {}),
        ...(resolvedAddress ? { homeVisitAddress: resolvedAddress } : {}),
        ...(parsedBufferBefore !== undefined
          ? { travelBufferBeforeMin: parsedBufferBefore }
          : {}),
        ...(parsedBufferAfter !== undefined
          ? { travelBufferAfterMin: parsedBufferAfter }
          : {}),
        status: 'scheduled',
        ...(resolvedRoom ? { roomOrBed: resolvedRoom } : {}),
        notes,
        isDemo: isDemoPatient(matchedPatient),
      });
    }

    void ClinicOperationsService.updateSmartMemoryAsync({
      lastDurationMinutes: resolvedDuration,
      ...(resolvedRoom ? { lastRoom: resolvedRoom } : {}),
    }).catch(() => undefined);

    reloadSchedule(selectedDate);
    setShowNewApptSheet(false);
    void DraftRecoveryService.deleteDraftAsync('appointment', 'new').then(() =>
      refreshRecoveredDrafts()
    );
    setScheduleMode('single');
    setAppointmentMode('clinic');
    setLocationId(resolveDefaultLocationId(practiceLocations, 'clinic'));
    setHomeVisitGov('');
    setHomeVisitArea('');
    setHomeVisitLandmark('');
    setHomeVisitNotes('');
    setTravelBufferBeforeStr('');
    setTravelBufferAfterStr('');
    setRecurringEndDate('');
    setIsCustomDuration(false);
    setDurationMinutes(resolvedDuration);
    setCustomDurationDraft(String(resolvedDuration));
    setPatientId('');
    setPatientSearchQuery('');
    setEpisodeTitle('');
    setNotes('');
  };

  const handleAddWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    const matchedPatient = activePatients.find((p) => p.id === waitPatientId);
    if (!matchedPatient) return;

    const updated = ClinicOperationsService.addWaitingListEntry({
      patientId: matchedPatient.id,
      patientName: matchedPatient.data.fullNameAr || matchedPatient.data.fullName,
      phone: matchedPatient.data.phoneNumber || '',
      conditionOrRegion:
        waitCondition.trim() ||
        bi('تأهيل عظام ومفاصل', 'Orthopedic Rehab', 'ڕاهێنانی ئێسک و جومگە'),
      preferredDays: waitDays,
      preferredTimeWindow: 'evening',
      priority: waitPriority,
      isDemo: isDemoPatient(matchedPatient),
    });
    setWaitingList(updated);
    setShowNewWaitlistForm(false);
    setWaitPatientId('');
    setWaitCondition('');
  };

  const handlePromoteWaitlistToAppointment = (entry: WaitingListEntry) => {
    if (!entry.patientId) return;
    ClinicOperationsService.saveAppointment({
      patientId: entry.patientId,
      patientName: entry.patientName,
      patientPhone: entry.phone,
      episodeTitle: entry.conditionOrRegion,
      therapistName: entry.preferredTherapist || ClinicOperationsService.getStaffRoster()[0]?.nameAr || '',
      date: selectedDate,
      startTime: '12:30',
      durationMinutes: 45,
      visitType: 'initial_evaluation',
      appointmentMode: 'clinic',
      ...(practiceLocationsEnabled
        ? { locationId: resolveDefaultLocationId(practiceLocations, 'clinic') }
        : {}),
      status: 'scheduled',
      roomOrBed: CLINIC_ROOMS[0].ar,
      notes: `تمت الجدولة من قائمة الانتظار (${entry.preferredDays})`,
      isDemo: entry.isDemo,
    });
    const remainingWaitlist = ClinicOperationsService.removeWaitingListEntry(entry.id);
    setWaitingList(remainingWaitlist);
    setAppointments(ClinicOperationsService.getAppointments());
  };

  const dateAndTherapistAppointments = appointments.filter((a) => {
    const matchDate = !selectedDate || a.date === selectedDate;
    const matchTherapist =
      selectedTherapist === 'all' || a.therapistName === selectedTherapist;
    return matchDate && matchTherapist;
  });

  const locationSummaryItems = practiceLocationsEnabled
    ? summarizeAppointmentsByLocation(dateAndTherapistAppointments, practiceLocations)
    : [];

  const filteredAppointments = dateAndTherapistAppointments.filter((a) => {
    if (!practiceLocationsEnabled || selectedLocationId === 'all') return true;
    return resolveAppointmentLocationId(a, practiceLocations) === selectedLocationId;
  });

  const therapists = ClinicOperationsService.getStaffRoster().filter((s) => s.role !== 'receptionist');
  const clinicProfile = ClinicOperationsService.getClinicProfile();
  const waTemplates = ClinicOperationsService.getWhatsAppTemplates();
  const attendanceStats = ClinicOperationsService.getCancellationAndNoShowStats();

  const effectiveSheetMode: AppointmentMode = homeVisitsEnabled ? appointmentMode : 'clinic';
  const parsedSheetBufferBefore =
    effectiveSheetMode === 'home_visit' && travelBufferBeforeStr.trim() !== ''
      ? Math.max(0, Math.min(240, Math.round(Number(travelBufferBeforeStr) || 0)))
      : 0;
  const parsedSheetBufferAfter =
    effectiveSheetMode === 'home_visit' && travelBufferAfterStr.trim() !== ''
      ? Math.max(0, Math.min(240, Math.round(Number(travelBufferAfterStr) || 0)))
      : 0;

  const sheetConflict =
    scheduleMode === 'single'
      ? ClinicOperationsService.detectAppointmentConflicts({
          date: selectedDate,
          startTime,
          durationMinutes,
          therapistName,
          roomOrBed: effectiveSheetMode === 'home_visit' ? undefined : roomOrBed,
          appointmentMode: effectiveSheetMode,
          travelBufferBeforeMin: parsedSheetBufferBefore,
          travelBufferAfterMin: parsedSheetBufferAfter,
        })
      : {
          hasConflict: false,
          allOverlaps: [],
          therapistConflicts: [],
          roomConflicts: [],
          travelBufferConflicts: [],
          breakConflicts: closedDaysBreaksEnabled
            ? getWeeklyBreakConflictsForRecurring(
                selectedWeekdays,
                startTime,
                durationMinutes,
                weeklyBreaks
              )
            : [],
          closedDayMatches: [],
          allowConcurrent: true,
        };

  const selectedDateWeekday = getWeekdayFromDateStr(selectedDate);
  const workingDays = clinicProfile.workingDays || [0, 1, 2, 3, 4];
  const isNonWorkingDay =
    selectedDateWeekday !== null && !workingDays.includes(selectedDateWeekday as WeekdayIndex);

  const timelineHours = (() => {
    const startH = Math.max(0, Math.min(22, parseInt((clinicProfile.workHoursStart || '09:00').split(':')[0], 10) || 9));
    const endH = Math.max(startH + 1, Math.min(23, parseInt((clinicProfile.workHoursEnd || '21:00').split(':')[0], 10) || 21));
    const hours: number[] = [];
    for (let h = startH; h <= endH; h += 1) {
      hours.push(h);
    }
    return hours;
  })();

  const handleBookWaitlistIntoFreedSlot = (entry: WaitingListEntry, freedAppt: ClinicAppointment) => {
    if (!entry.patientId) return;
    ClinicOperationsService.saveAppointment({
      patientId: entry.patientId,
      patientName: entry.patientName,
      patientPhone: entry.phone,
      episodeTitle: entry.conditionOrRegion,
      therapistName: freedAppt.therapistName || entry.preferredTherapist || therapists[0]?.nameAr || '',
      date: freedAppt.date,
      startTime: freedAppt.startTime,
      durationMinutes: freedAppt.durationMinutes || 45,
      visitType: 'follow_up',
      appointmentMode: freedAppt.appointmentMode || 'clinic',
      ...(freedAppt.locationId ? { locationId: freedAppt.locationId } : {}),
      status: 'scheduled',
      roomOrBed: freedAppt.roomOrBed || CLINIC_ROOMS[0].ar,
      notes: `ملء موعد شاغر من قائمة الانتظار (بدلاً عن ${freedAppt.patientName})`,
      isDemo: entry.isDemo,
    });
    const remainingWaitlist = ClinicOperationsService.removeWaitingListEntry(entry.id);
    setWaitingList(remainingWaitlist);
    setAppointments(ClinicOperationsService.getAppointments());
    setFreedSlotBanner(null);
  };

  const statusOptions: {
    id: AppointmentStatus;
    ar: string;
    en: string;
    cls: string;
  }[] = [
    {
      id: 'scheduled',
      ar: 'مجدول',
      en: 'Scheduled',
      cls: 'bg-surface text-muted-foreground-2 border-line-2',
    },
    {
      id: 'arrived',
      ar: 'وصل للعيادة',
      en: 'Arrived',
      cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
    },
    {
      id: 'in_session',
      ar: 'داخل الجلسة',
      en: 'In Session',
      cls: 'bg-primary/15 text-primary border-primary/30',
    },
    {
      id: 'completed',
      ar: 'مكتمل',
      en: 'Completed',
      cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    },
    {
      id: 'cancelled',
      ar: 'ملغى',
      en: 'Cancelled',
      cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
    },
    {
      id: 'no_show',
      ar: 'لم يحضر',
      en: 'No-Show',
      cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
    },
  ];

  return (
    <div
      className="max-w-[85rem] w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Page Header + Hijri Badge + Schedule/Locations Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-base sm:text-lg font-extrabold text-foreground">
            {bi(
              'جدول المواعيد وقائمة الانتظار',
              'Appointment Schedule & Waitlist',
              'خشتەی چاوپێکەوتنەکان و لیستی چاوەڕوانی'
            )}
          </h1>
          <span className="py-0.5 px-2.5 rounded-full text-xs font-mono font-bold bg-primary/10 text-primary tabular-nums">
            <Num value={filteredAppointments.length} />
          </span>
          {hijriDateEnabled && hijriDateLabel && (
            <span
              data-testid="hijri-date-badge"
              className="py-0.5 px-2.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/25 tabular-nums"
            >
              {hijriDateLabel}
            </span>
          )}
        </div>

        {/* Actions: DatePicker + Closed Days/Locations Modal + Book Appointment */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-40">
            <DatePickerInput value={selectedDate} onChange={setSelectedDate} />
          </div>

          <button
            type="button"
            data-testid="schedule-privacy-blur-toggle"
            onClick={() => {
              const next = !privacyBlur;
              setPrivacyBlur(next);
              ClinicOperationsService.setReceptionPrivacyBlur(next);
            }}
            title={
              privacyBlur
                ? bi('إظهار بيانات المرضى', 'Show Patient Names', 'پیشاندانی ناوی نەخۆشەکان')
                : bi(
                    'تمويه بيانات المرضى (خصوصية)',
                    'Blur Patient Info (Privacy)',
                    'لێڵکردنی زانیاری نەخۆش (نهێنی)'
                  )
            }
            aria-pressed={privacyBlur}
            className={`py-2 px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer whitespace-nowrap ${
              privacyBlur
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card hover:bg-layer-hover text-foreground border-card-line'
            }`}
          >
            {privacyBlur ? (
              <EyeOff className="size-3.5 shrink-0" />
            ) : (
              <Eye className="size-3.5 text-primary shrink-0" />
            )}
            <span>
              {privacyBlur
                ? bi('الخصوصية: مفعّلة', 'Privacy: On', 'نهێنی: چالاک')
                : bi('وضع الخصوصية', 'Privacy Blur', 'دۆخی نهێنی')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setClosedDaysModalTab('breaks');
              setShowClosedDaysBreaksModal(true);
            }}
            data-testid="open-closed-days-breaks-btn"
            title={bi(
              'إدارة أيام الإغلاق والاستراحات ومواقع العمل',
              'Manage Closed Days, Breaks & Locations',
              'بەڕێوەبردنی ڕۆژانی داخستن و پشووەکان و شوێنەکان'
            )}
            className="py-2 px-3 rounded-xl bg-card hover:bg-layer-hover text-foreground border border-card-line text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
          >
            <SlidersHorizontal className="size-3.5 text-primary shrink-0" />
            <span>
              {bi(
                'الإغلاق والاستراحات والمواقع',
                'Breaks & Locations',
                'داخستن و پشوو و شوێنەکان'
              )}
            </span>
          </button>

          {icsExportEnabled && (
            <button
              type="button"
              data-testid="schedule-export-ics-btn"
              onClick={() =>
                setIcsModalState({
                  isOpen: true,
                  initialSingleAppointment: null,
                })
              }
              title={bi('تصدير تقويم (.ics)', 'Export .ics', 'هەناردەکردنی ڕۆژژمێر (.ics)')}
              className="py-2 px-3 rounded-xl bg-card hover:bg-layer-hover text-foreground border border-card-line text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <Calendar className="size-3.5 text-primary shrink-0" />
              <span>{bi('تصدير تقويم (.ics)', 'Export .ics', 'هەناردەکردنی ڕۆژژمێر (.ics)')}</span>
            </button>
          )}

          {schedulePrintEnabled && (
            <button
              type="button"
              data-testid="schedule-print-day-btn"
              onClick={() =>
                setPrintModalState({
                  documentType: 'tomorrow_schedule',
                  scheduleDate: selectedDate,
                  scheduleAppointments: filteredAppointments,
                })
              }
              title={bi('طباعة الجدول', 'Print Schedule', 'چاپکردنی خشتە')}
              className="py-2 px-3 rounded-xl bg-card hover:bg-layer-hover text-foreground border border-card-line text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <Printer className="size-3.5 text-primary shrink-0" />
              <span>{bi('طباعة الجدول', 'Print Schedule', 'چاپکردنی خشتە')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setScheduleMode('single');
              setAppointmentMode('clinic');
              setLocationId(resolveDefaultLocationId(practiceLocations, 'clinic'));
              setShowNewApptSheet(true);
            }}
            className="py-2 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-all cursor-pointer whitespace-nowrap"
          >
            <Plus className="size-4" />
            <span>{bi('حجز موعد', 'Book Appointment', 'تۆمارکردنی چاوپێکەوتن')}</span>
          </button>
        </div>
      </div>

      {/* Therapist Filter Strip */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => setSelectedTherapist('all')}
          className={`py-1.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            selectedTherapist === 'all'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-card text-muted-foreground-1 hover:text-foreground border border-card-line'
          }`}
        >
          {bi('جميع المعالجين', 'All Therapists', 'هەموو چارەسەرکاران')}
        </button>
        {therapists.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSelectedTherapist(t.nameAr)}
            className={`py-1.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              selectedTherapist === t.nameAr
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-card text-muted-foreground-1 hover:text-foreground border border-card-line'
            }`}
          >
            {bi(t.nameAr, t.nameEn)}
          </button>
        ))}
      </div>

      {/* C2: Practice Location Filter Strip & Per-Location Summary Strip */}
      {practiceLocationsEnabled && locationSummaryItems.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedLocationId('all')}
              className={`py-1.5 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                selectedLocationId === 'all'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'bg-card text-muted-foreground-1 hover:text-foreground border border-card-line'
              }`}
            >
              <Building2 className="size-3.5 shrink-0" />
              <span>{bi('جميع المواقع', 'All Locations', 'هەموو شوێنەکان')}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-surface text-foreground tabular-nums">
                <Num value={dateAndTherapistAppointments.length} />
              </span>
            </button>
            {locationSummaryItems.map((locItem) => {
              const isSelected = selectedLocationId === locItem.locationId;
              return (
                <button
                  key={locItem.locationId}
                  type="button"
                  onClick={() => setSelectedLocationId(locItem.locationId)}
                  className={`py-1.5 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'bg-card text-muted-foreground-1 hover:text-foreground border border-card-line'
                  }`}
                >
                  {locItem.type === 'home_visits' ? (
                    <Home className="size-3.5 shrink-0" />
                  ) : (
                    <MapPin className="size-3.5 shrink-0" />
                  )}
                  <span>{bi(locItem.nameAr, locItem.nameEn)}</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-surface text-foreground tabular-nums">
                    <Num value={locItem.totalCount} />
                  </span>
                </button>
              );
            })}
          </div>

          <div
            data-testid="location-summary-strip"
            className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs"
          >
            {locationSummaryItems.map((locItem) => {
              const isSelected = selectedLocationId === locItem.locationId;
              return (
                <button
                  key={`summary_${locItem.locationId}`}
                  type="button"
                  onClick={() =>
                    setSelectedLocationId(isSelected ? 'all' : locItem.locationId)
                  }
                  className={`px-3.5 py-2 rounded-xl border flex items-center justify-between gap-2 text-start transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-primary/10 border-primary text-foreground'
                      : 'bg-card border-card-line hover:bg-layer-hover text-foreground'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 min-w-0 font-semibold text-muted-foreground-1 truncate">
                    {locItem.type === 'home_visits' ? (
                      <Home className="size-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                    ) : (
                      <Building2 className="size-3.5 text-primary shrink-0" />
                    )}
                    <span className="truncate">
                      {bi(locItem.nameAr, locItem.nameEn)}
                    </span>
                  </span>
                  <span className="font-bold text-foreground tabular-nums shrink-0">
                    <Num value={locItem.activeCount} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* C3: Closed Date Banner for Selected Date */}
      {closedDaysBreaksEnabled && selectedDateClosedMatches.length > 0 && (
        <div
          data-testid="closed-date-banner"
          className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex flex-wrap items-start justify-between gap-3"
        >
          <div className="space-y-1 min-w-0 flex-1">
            <div className="font-bold flex items-center gap-2">
              <CalendarOff className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                {bi(
                  'تنبيه: هذا التاريخ مسجّل كيوم إغلاق للعيادة',
                  'Notice: Selected date is marked as a Clinic Closed Date',
                  'ئاگاداری: ئەم بەروارە وەک ڕۆژی داخستنی کلینیک تۆمارکراوە'
                )}
              </span>
            </div>
            <div className="space-y-0.5">
              {selectedDateClosedMatches.map((entry) => (
                <div key={entry.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">
                    {bi(entry.labelAr || entry.labelEn, entry.labelEn || entry.labelAr)}
                  </span>
                  <bdi dir="ltr" className="text-muted-foreground-1 tabular-nums">
                    ({formatClosedDateRangeSummary(entry)})
                  </bdi>
                  {entry.notes && (
                    <span className="text-muted-foreground-1">— {entry.notes}</span>
                  )}
                </div>
              ))}
            </div>
            <p className="text-muted-foreground-1">
              {bi(
                'تم إيقاف إنشاء الجداول الأسبوعية التلقائية في هذا اليوم، مع بقاء الحجز اليدوي متاحاً عند الحاجة.',
                'Recurring auto-scheduling is paused for this closed date; manual appointments remain allowed if needed.',
                'دروستکردنی خۆکارانەی خشتەی هەفتانە لەم ڕۆژەدا ڕاگیراوە، بەڵام تۆمارکردنی دەستی لە کاتی پێویستدا بەردەستە.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setClosedDaysModalTab('closed');
              setShowClosedDaysBreaksModal(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-card border border-amber-500/40 text-foreground font-semibold hover:bg-layer-hover cursor-pointer shrink-0"
          >
            {bi('إدارة أيام الإغلاق', 'Manage Closed Days', 'بەڕێوەبردنی ڕۆژانی داخستن')}
          </button>
        </div>
      )}

      {/* 4.5 Attendance / Cancellation / No-Show Stats Strip */}
      {attendanceStats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="px-3.5 py-2.5 rounded-xl bg-card border border-card-line flex items-center justify-between">
            <span className="text-muted-foreground-1 font-semibold">
              {bi('معدل الالتزام', 'Attendance Rate', 'ڕێژەی پابەندبوون')}
            </span>
            <span
              className={`font-mono font-bold ${
                attendanceStats.attendanceRatePercent > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-foreground'
              }`}
            >
              <bdi dir="ltr">{attendanceStats.attendanceRatePercent}%</bdi>
            </span>
          </div>
          <div className="px-3.5 py-2.5 rounded-xl bg-card border border-card-line flex items-center justify-between">
            <span className="text-muted-foreground-1 font-semibold">
              {bi('المكتملة', 'Completed', 'تەواوبوو')}
            </span>
            <span className="font-mono font-bold text-foreground">
              <Num value={attendanceStats.completed} />
            </span>
          </div>
          <div className="px-3.5 py-2.5 rounded-xl bg-card border border-card-line flex items-center justify-between">
            <span className="text-muted-foreground-1 font-semibold">
              {bi('نسبة الإلغاء', 'Cancellations', 'ڕێژەی هەڵوەشاندنەوە')}
            </span>
            <span
              className={`font-mono font-bold ${
                attendanceStats.cancelled > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-foreground'
              }`}
            >
              <bdi dir="ltr">
                {attendanceStats.cancelled} ({attendanceStats.cancellationRatePercent}%)
              </bdi>
            </span>
          </div>
          <div className="px-3.5 py-2.5 rounded-xl bg-card border border-card-line flex items-center justify-between">
            <span className="text-muted-foreground-1 font-semibold">
              {bi('عدم الحضور (No-Show)', 'No-Show', 'ئامادە نەبوو (No-Show)')}
            </span>
            <span
              className={`font-mono font-bold ${
                attendanceStats.noShow > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-foreground'
              }`}
            >
              <bdi dir="ltr">
                {attendanceStats.noShow} ({attendanceStats.noShowRatePercent}%)
              </bdi>
            </span>
          </div>
        </div>
      )}

      {/* 4.5 Freed-Slot Waitlist Auto-Suggestion Banner */}
      {freedSlotBanner && freedSlotBanner.suggestions.length > 0 && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-300">
              <Sparkles className="size-4 shrink-0" />
              <span>
                {bi(
                  `تم تفريغ موعد الساعة ${formatTimeIraq(freedSlotBanner.freedAppt.startTime, language)} — مرضى مقترحون من قائمة الانتظار:`,
                  `Slot freed at ${formatTimeIraq(freedSlotBanner.freedAppt.startTime, language)} — Suggested Waitlist Matches:`,
                  `کاتژمێری ${formatTimeIraq(freedSlotBanner.freedAppt.startTime, language)} بەتاڵ بوو — نەخۆشە پێشنیارکراوەکانی لیستی چاوەڕوانی:`
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setFreedSlotBanner(null)}
              className="p-1 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 rounded-lg cursor-pointer"
              aria-label={bi('إغلاق الاقتراح', 'Dismiss', 'داخستنی پێشنیار')}
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {freedSlotBanner.suggestions.slice(0, 2).map((s) => (
              <div
                key={s.entry.id}
                className="p-2.5 rounded-xl bg-card border border-card-line flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div
                    className={`font-bold text-foreground truncate ${privacyBlur ? 'blur-sm select-none' : ''}`}
                    data-privacy-blurred={privacyBlur ? 'true' : undefined}
                  >
                    {s.entry.patientName}
                  </div>
                  <div className="text-muted-foreground-1 truncate">
                    {bi(s.matchReasonAr, s.matchReasonEn)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleBookWaitlistIntoFreedSlot(s.entry, freedSlotBanner.freedAppt)
                  }
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold shrink-0 cursor-pointer"
                >
                  {bi('تثبيت الموعد', 'Book Slot', 'جێگیرکردنی کات')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 8-Second Undo Toast */}
      {undoItem && (
        <div className="p-3.5 bg-slate-900 text-white rounded-xl flex items-center justify-between gap-3 text-xs shadow-lg">
          <span>
            {undoItem.type === 'appointment'
              ? bi(
                  `تم حذف موعد (${undoItem.data.patientName}).`,
                  `Deleted appointment for (${undoItem.data.patientName}).`,
                  `چاوپێکەوتنی (${undoItem.data.patientName}) سڕایەوە.`
                )
              : undoItem.type === 'recurring'
              ? bi(
                  `تم حذف الجدول الأسبوعي (${undoItem.data.patientName}).`,
                  `Deleted weekly schedule for (${undoItem.data.patientName}).`,
                  `خشتەی هەفتانەی (${undoItem.data.patientName}) سڕایەوە.`
                )
              : bi(
                  `تمت إزالة (${undoItem.data.patientName}) من قائمة الانتظار.`,
                  `Removed (${undoItem.data.patientName}) from waiting list.`,
                  `(${undoItem.data.patientName}) لە لیستی چاوەڕوانی سڕایەوە.`
                )}
          </span>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="size-3.5" />
            <span>{bi('تراجع (8 ثوانٍ)', 'Undo (8s)', 'گەڕاندنەوە (8 چرکە)')}</span>
          </button>
        </div>
      )}

      {/* Main Split: Schedule Table (2/3) + Waiting List Panel (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Appointments List / Timeline Card */}
        <div className="lg:col-span-2 bg-card rounded-2xl border border-card-line shadow-2xs overflow-visible">
          <div className="px-5 py-3.5 border-b border-card-divider flex flex-wrap items-center justify-between gap-2 bg-muted/30">
            <div className="flex flex-wrap items-center gap-2">
              <Clock className="size-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">
                {bi('مواعيد يوم ', 'Appointments for ', 'چاوپێکەوتنەکانی ڕۆژی ')}
                <bdi dir="ltr" className="text-primary">
                  {formatDateDDMMYYYY(selectedDate)}
                </bdi>
              </h2>
              {hijriDateEnabled && hijriDateLabel && (
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  · {hijriDateLabel}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-xl bg-surface border border-line-2 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1 cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-layer text-primary shadow-2xs border border-layer-line'
                      : 'text-muted-foreground-1 hover:text-foreground'
                  }`}
                >
                  <LayoutList className="size-3.5" />
                  <span>{bi('قائمة', 'List', 'لیست')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('timeline')}
                  className={`px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1 cursor-pointer ${
                    viewMode === 'timeline'
                      ? 'bg-layer text-primary shadow-2xs border border-layer-line'
                      : 'text-muted-foreground-1 hover:text-foreground'
                  }`}
                >
                  <CalendarClock className="size-3.5" />
                  <span>{bi('الجدول الزمني', 'Timeline', 'خشتەی کاتی')}</span>
                </button>
              </div>

              <span className="py-0.5 px-2.5 rounded-full text-xs font-semibold bg-surface border border-line-2 text-muted-foreground-1 tabular-nums">
                <Num value={filteredAppointments.length} /> {bi('موعد', 'slots', 'چاوپێکەوتن')}
              </span>
            </div>
          </div>

          {viewMode === 'timeline' ? (
            <div className="divide-y divide-card-divider">
              {timelineHours.map((hour) => {
                const hourPrefix = `${String(hour).padStart(2, '0')}:`;
                const slotAppts = filteredAppointments.filter((a) =>
                  a.startTime.startsWith(hourPrefix)
                );
                const hourBreaks = closedDaysBreaksEnabled
                  ? getWeeklyBreaksForHour(
                      selectedDateWeekday as WeekdayIndex | null,
                      hour,
                      weeklyBreaks
                    )
                  : [];
                return (
                  <div
                    key={hour}
                    className={`p-3 sm:px-5 flex flex-col sm:flex-row sm:items-start gap-2.5 sm:gap-3 transition-colors ${
                      hourBreaks.length > 0 ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-muted/20'
                    }`}
                  >
                    <div className="sm:w-24 shrink-0 pt-1 flex sm:block items-center justify-between text-xs font-bold text-primary tabular-nums">
                      <TimeDisplay time={`${hourPrefix}00`} />
                      {hourBreaks.length > 0 && (
                        <span className="sm:mt-1 inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                          {bi(
                            hourBreaks[0].labelAr || hourBreaks[0].labelEn,
                            hourBreaks[0].labelEn || hourBreaks[0].labelAr
                          )}
                        </span>
                      )}
                      {slotAppts.length > 1 && (
                        <span className="sm:mt-1 inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                          <Num value={slotAppts.length} /> {bi('متزامن', 'concurrent', 'هاوکات')}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      {slotAppts.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {slotAppts.map((appt) => {
                            const apptLocId = resolveAppointmentLocationId(appt, practiceLocations);
                            const apptLocLabel = getPracticeLocationLabel(
                              apptLocId,
                              practiceLocations,
                              language !== 'en'
                            );
                            const isHome =
                              homeVisitsEnabled && appt.appointmentMode === 'home_visit';
                            const addrDisplay = isHome
                              ? formatHomeVisitAddressDisplay(appt.homeVisitAddress)
                              : '';
                            return (
                              <div
                                key={appt.id}
                                className="p-2.5 rounded-xl bg-surface border border-card-line flex flex-col gap-1.5 text-xs"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                    <span
                                      className={`font-bold text-foreground truncate ${privacyBlur ? 'blur-sm select-none' : ''}`}
                                      data-privacy-blurred={privacyBlur ? 'true' : undefined}
                                    >
                                      {appt.patientName}
                                    </span>
                                    {isHome && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-teal-500/15 text-teal-700 dark:text-teal-300 font-bold">
                                        <Home className="size-3" />
                                        <span>{bi('منزلي', 'Home', 'ماڵەوە')}</span>
                                      </span>
                                    )}
                                  </div>
                                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-layer border border-line-2 shrink-0">
                                    {bi(
                                      statusOptions.find((s) => s.id === appt.status)?.ar || '',
                                      statusOptions.find((s) => s.id === appt.status)?.en || '',
                                      STATUS_CKB[appt.status]
                                    )}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground-1">
                                  <span className="inline-flex items-center gap-1 tabular-nums">
                                    <TimeDisplay time={appt.startTime} /> (
                                    <Num value={appt.durationMinutes} /> {bi('د', 'm', 'خ')})
                                  </span>
                                  {appt.therapistName && (
                                    <span className="inline-flex items-center gap-1 text-primary font-semibold">
                                      · {appt.therapistName}
                                    </span>
                                  )}
                                  {practiceLocationsEnabled && (
                                    <span className="text-foreground font-medium">
                                      · {apptLocLabel}
                                    </span>
                                  )}
                                  {appt.roomOrBed && (
                                    <span className="text-muted-foreground-2">· {appt.roomOrBed}</span>
                                  )}
                                </div>
                                {isHome && addrDisplay && (
                                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5 text-muted-foreground-1">
                                    <span
                                      className={`truncate ${privacyBlur ? 'blur-sm select-none' : ''}`}
                                      data-privacy-blurred={privacyBlur ? 'true' : undefined}
                                    >
                                      {addrDisplay}
                                    </span>
                                    {hasHomeVisitAddress(appt.homeVisitAddress) && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openMapsConfirmation(
                                            appt.patientName,
                                            appt.homeVisitAddress
                                          )
                                        }
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 font-semibold cursor-pointer shrink-0"
                                      >
                                        <ExternalLink className="size-3" />
                                        <span>{bi('فتح في الخرائط', 'Open in maps', 'کردنەوە لە نەخشە')}</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setScheduleMode('single');
                          setStartTime(`${hourPrefix}00`);
                          setShowNewApptSheet(true);
                        }}
                        className="w-full text-start px-3 py-1.5 rounded-xl border border-dashed border-line-2 text-xs text-muted-foreground-1 hover:border-primary/40 hover:text-primary transition-colors cursor-pointer"
                      >
                        {slotAppts.length === 0
                          ? bi('+ حجز في هذا الوقت', '+ Book at this hour', '+ تۆمارکردن لەم کاتەدا')
                          : bi(
                              '+ حجز مريض آخر في نفس الوقت',
                              '+ Book another patient at this time',
                              '+ تۆمارکردنی نەخۆشێکی تر لە هەمان کاتدا'
                            )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
          <div className="divide-y divide-card-divider">
            {filteredAppointments.length === 0 ? (
              <div
                data-testid="schedule-empty-state"
                className="p-8 text-center text-xs text-muted-foreground-1 space-y-3"
              >
                <p className="font-semibold text-foreground">
                  {bi(
                    'لا توجد مواعيد مجدولة في هذا اليوم — ابدأ بحجز موعد مفرد أو جدول أسبوعي متكرر للمريض.',
                    'No appointments scheduled for this date — book a single visit or recurring weekly series to populate the schedule.',
                    'هیچ چاوپێکەوتنێک بۆ ئەم ڕۆژە تۆمار نەکراوە — سەردانێکی تاک یان خشتەیەکی هەفتانەی دووبارەبووەوە تۆمار بکە.'
                  )}
                </p>
                <div>
                  <button
                    type="button"
                    data-testid="schedule-empty-primary-btn"
                    onClick={() => {
                      setScheduleMode('single');
                      setShowNewApptSheet(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>{bi('+ حجز موعد جديد', '+ Book Appointment', '+ تۆمارکردنی چاوپێکەوتن')}</span>
                  </button>
                </div>
              </div>
            ) : (
              filteredAppointments.map((appt) => {
                const currentStatusObj =
                  statusOptions.find((s) => s.id === appt.status) || statusOptions[0];
                const isMenuOpen = openStatusMenuId === appt.id;
                const apptConflicts =
                  appt.status !== 'cancelled' && appt.status !== 'no_show'
                    ? ClinicOperationsService.detectAppointmentConflicts({
                        id: appt.id,
                        date: appt.date,
                        startTime: appt.startTime,
                        durationMinutes: appt.durationMinutes,
                        therapistName: appt.therapistName,
                        roomOrBed: appt.roomOrBed,
                        appointmentMode: appt.appointmentMode,
                        travelBufferBeforeMin: appt.travelBufferBeforeMin,
                        travelBufferAfterMin: appt.travelBufferAfterMin,
                      })
                    : null;
                const concurrentCount = apptConflicts?.allOverlaps?.length || 0;
                const travelConflictsCount = apptConflicts?.travelBufferConflicts?.length || 0;
                const breakConflictsCount = apptConflicts?.breakConflicts?.length || 0;
                const isHomeVisit = homeVisitsEnabled && appt.appointmentMode === 'home_visit';
                const apptLocationLabel = practiceLocationsEnabled
                  ? getPracticeLocationLabel(
                      resolveAppointmentLocationId(appt, practiceLocations),
                      practiceLocations,
                      language !== 'en'
                    )
                  : '';
                const formattedHvAddress = isHomeVisit
                  ? formatHomeVisitAddressDisplay(appt.homeVisitAddress)
                  : '';
                const hasHvAddress = isHomeVisit && hasHomeVisitAddress(appt.homeVisitAddress);

                return (
                  <div
                    key={appt.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="py-2 px-3 rounded-xl bg-primary/10 border border-primary/20 text-primary text-center shrink-0 min-w-[76px]">
                        <div className="text-xs font-extrabold tabular-nums">
                          <TimeDisplay time={appt.startTime} className="justify-center" />
                        </div>
                        <div className="text-xs opacity-80 tabular-nums">
                          <Num value={appt.durationMinutes} /> {bi('دقيقة', 'm', 'خولەک')}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-sm font-bold text-foreground ${privacyBlur ? 'blur-sm select-none' : ''}`}
                            data-privacy-blurred={privacyBlur ? 'true' : undefined}
                          >
                            {appt.patientName}
                          </span>
                          {appt.isDemo && <DemoBadge />}
                          {isHomeVisit && (
                            <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-md text-xs font-bold bg-teal-500/15 border border-teal-500/30 text-teal-700 dark:text-teal-300">
                              <Home className="size-3" />
                              <span>{bi('زيارة منزلية', 'Home Visit', 'سەردانی ماڵەوە')}</span>
                            </span>
                          )}
                          {practiceLocationsEnabled && apptLocationLabel && (
                            <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-md text-xs font-semibold bg-surface border border-line-2 text-foreground">
                              <Building2 className="size-3 text-primary" />
                              <span>{apptLocationLabel}</span>
                            </span>
                          )}
                          {concurrentCount > 0 && (
                            <span className="py-0.5 px-2 rounded-md text-xs font-bold bg-sky-500/10 border border-sky-500/20 text-sky-700 dark:text-sky-300">
                              {bi(
                                `موعد متزامن (${concurrentCount + 1})`,
                                `Concurrent (${concurrentCount + 1})`,
                                `چاوپێکەوتنی هاوکات (${concurrentCount + 1})`
                              )}
                            </span>
                          )}
                          {travelConflictsCount > 0 && (
                            <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-md text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300">
                              <AlertTriangle className="size-3" />
                              <span>
                                {bi(
                                  'تداخل وقت تنقل',
                                  'Travel buffer overlap',
                                  'بەرکەوتنی کاتی هاتوچۆ'
                                )}
                              </span>
                            </span>
                          )}
                          {breakConflictsCount > 0 && (
                            <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-md text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300">
                              <Clock className="size-3" />
                              <span>
                                {bi(
                                  `يتداخل مع استراحة (${apptConflicts?.breakConflicts?.[0]?.labelAr || ''})`,
                                  `Break overlap (${apptConflicts?.breakConflicts?.[0]?.labelEn || ''})`,
                                  `بەرکەوتن لەگەڵ پشوو (${apptConflicts?.breakConflicts?.[0]?.labelAr || ''})`
                                )}
                              </span>
                            </span>
                          )}
                          <span className="py-0.5 px-2 rounded-md text-xs font-semibold bg-surface border border-line-2 text-muted-foreground-1">
                            {appt.visitType === 'initial_evaluation'
                              ? bi('تقييم أولي', 'Initial Eval', 'هەڵسەنگاندنی سەرەتایی')
                              : appt.visitType === 're_evaluation'
                              ? bi('إعادة تقييم', 'Re-eval', 'هەڵسەنگاندنەوە')
                              : bi('جلسة متابعة', 'Follow-up', 'دانیشتنی بەدواداچوون')}
                          </span>
                          {appt.recurringScheduleId && (
                            <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-md text-xs font-bold bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                              <Repeat className="size-3" />
                              <span>{bi('أسبوعي', 'Weekly', 'هەفتانە')}</span>
                            </span>
                          )}
                        </div>

                        {appt.episodeTitle && (
                          <p className="text-xs text-muted-foreground-2 font-medium">
                            <bdi dir="auto">{appt.episodeTitle}</bdi>
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground-1 pt-0.5">
                          <span className="inline-flex items-center gap-1">
                            <Stethoscope className="size-3 text-primary" />
                            {appt.therapistName}
                          </span>
                          {appt.roomOrBed && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3 text-muted-foreground-1" />
                              {appt.roomOrBed}
                            </span>
                          )}
                          {appt.patientPhone && (
                            <span
                              className={`inline-flex items-center gap-1 tabular-nums ${privacyBlur ? 'blur-sm select-none' : ''}`}
                              data-privacy-blurred={privacyBlur ? 'true' : undefined}
                              dir="ltr"
                            >
                              <Phone className="size-3 text-muted-foreground-1" />
                              {formatIraqiPhoneDisplay(appt.patientPhone)}
                            </span>
                          )}
                          {isHomeVisit &&
                            ((appt.travelBufferBeforeMin || 0) > 0 ||
                              (appt.travelBufferAfterMin || 0) > 0) && (
                              <span className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-300 font-semibold">
                                <Clock className="size-3" />
                                {bi('تنقل:', 'Travel:', 'هاتوچۆ:')}
                                {(appt.travelBufferBeforeMin || 0) > 0 && (
                                  <span>
                                    {bi('قبل ', 'before ', 'پێش ')}
                                    <Num value={appt.travelBufferBeforeMin} />
                                    {bi(' د', 'm', ' خ')}
                                  </span>
                                )}
                                {(appt.travelBufferAfterMin || 0) > 0 && (
                                  <span>
                                    {bi('بعد ', 'after ', 'دوای ')}
                                    <Num value={appt.travelBufferAfterMin} />
                                    {bi(' د', 'm', ' خ')}
                                  </span>
                                )}
                              </span>
                            )}
                        </div>

                        {isHomeVisit && (formattedHvAddress || appt.homeVisitAddress?.notes) && (
                          <div className="pt-1 flex flex-wrap items-center gap-2 text-xs text-foreground">
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground-1">
                              <MapPin className="size-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                              <span
                                className={privacyBlur ? 'blur-sm select-none' : undefined}
                                data-privacy-blurred={privacyBlur ? 'true' : undefined}
                              >
                                {formattedHvAddress || appt.homeVisitAddress?.notes}
                                {formattedHvAddress && appt.homeVisitAddress?.notes
                                  ? ` — ${appt.homeVisitAddress.notes}`
                                  : ''}
                              </span>
                            </span>
                            {hasHvAddress && (
                              <button
                                type="button"
                                onClick={() =>
                                  openMapsConfirmation(appt.patientName, appt.homeVisitAddress)
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 font-bold cursor-pointer"
                              >
                                <ExternalLink className="size-3" />
                                <span>{bi('فتح في الخرائط', 'Open in maps', 'کردنەوە لە نەخشە')}</span>
                              </button>
                            )}
                          </div>
                        )}

                        {(appt.cancellationReason || appt.noShowReason) && (
                          <div className="text-xs text-rose-600 dark:text-rose-400 pt-0.5">
                            {bi('السبب: ', 'Reason: ', 'هۆکار: ')}
                            {appt.cancellationReason || appt.noShowReason}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status Chip with Menu + WhatsApp Reminder + .ics + Visit Card + Delete */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {appt.patientPhone && (() => {
                        const langKey = language === 'en' ? 'en' : 'ar';
                        const msg = buildAppointmentReminderText({
                          template: waTemplates.appointmentReminder[langKey],
                          appointment: appt,
                          clinicProfile,
                          lang: langKey,
                        });
                        const waHref = buildUserInitiatedWhatsAppHref(appt.patientPhone, msg);
                        if (!waHref) return null;
                        return (
                          <a
                            href={waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 transition-colors"
                            title={bi('تذكير واتساب للموعد', 'Send WhatsApp Reminder', 'ناردنی بیرخەرەوەی واتساپ')}
                            aria-label={bi(
                              `إرسال تذكير واتساب إلى ${appt.patientName}`,
                              `Send WhatsApp reminder to ${appt.patientName}`,
                              `ناردنی بیرخەرەوەی واتساپ بۆ ${appt.patientName}`
                            )}
                          >
                            <MessageCircle className="size-4" />
                          </a>
                        );
                      })()}

                      {icsExportEnabled && (
                        <button
                          type="button"
                          data-testid={`appt-export-ics-btn-${appt.id}`}
                          onClick={() =>
                            setIcsModalState({
                              isOpen: true,
                              initialSingleAppointment: appt,
                            })
                          }
                          title={bi('تصدير الموعد (.ics)', 'Export .ics', 'هەناردەکردنی چاوپێکەوتن (.ics)')}
                          aria-label={bi(
                            `تصدير موعد ${appt.patientName} (.ics)`,
                            `Export .ics for ${appt.patientName}`,
                            `هەناردەکردنی چاوپێکەوتنی ${appt.patientName} (.ics)`
                          )}
                          className="px-2.5 py-2 rounded-xl border border-card-line bg-surface hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Calendar className="size-3.5 text-primary shrink-0" />
                          <span className="hidden xl:inline">.ics</span>
                        </button>
                      )}

                      {schedulePrintEnabled && (
                        <button
                          type="button"
                          data-testid={`appt-print-visit-card-btn-${appt.id}`}
                          onClick={() => {
                            const matchedIdx = activePatients.findIndex(
                              (p) => p.id === appt.patientId
                            );
                            const matchedPatient =
                              matchedIdx >= 0 ? activePatients[matchedIdx] : null;
                            const mrn = matchedPatient
                              ? getPatientMrn(matchedPatient, matchedIdx)
                              : undefined;
                            const summary = computePatientVisitCardSummary({
                              patientId: appt.patientId,
                              patientName: appt.patientName,
                              patientMrn: mrn,
                              patientPhone: appt.patientPhone,
                              appointments: ClinicOperationsService.getAppointments(),
                              invoices: ClinicOperationsService.getInvoicesIQD(),
                              referenceDateStr:
                                selectedDate && selectedDate < localDate()
                                  ? selectedDate
                                  : localDate(),
                            });
                            setPrintModalState({
                              documentType: 'patient_visit_card',
                              visitCardSummary: summary,
                              patient: matchedPatient,
                              patientName: appt.patientName,
                              patientPhone: appt.patientPhone,
                              patientMrn: mrn,
                            });
                          }}
                          title={bi('طباعة بطاقة مواعيد المريض', 'Print Patient Visit Card', 'چاپکردنی کارتی سەردانی نەخۆش')}
                          aria-label={bi(
                            `طباعة بطاقة مواعيد ${appt.patientName}`,
                            `Print visit card for ${appt.patientName}`,
                            `چاپکردنی کارتی سەردانی ${appt.patientName}`
                          )}
                          className="px-2.5 py-2 rounded-xl border border-card-line bg-surface hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Printer className="size-3.5 text-primary shrink-0" />
                          <span className="hidden xl:inline">
                            {bi('بطاقة', 'Card', 'کارت')}
                          </span>
                        </button>
                      )}

                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenStatusMenuId(isMenuOpen ? null : appt.id)
                          }
                          aria-expanded={isMenuOpen}
                          aria-label={bi('تغيير حالة الموعد', 'Change appointment status', 'گۆڕینی دۆخی چاوپێکەوتن')}
                          className={`py-1.5 px-3 rounded-xl text-xs font-bold border inline-flex items-center gap-1.5 cursor-pointer ${currentStatusObj.cls}`}
                        >
                          <span>
                            {bi(currentStatusObj.ar, currentStatusObj.en, STATUS_CKB[currentStatusObj.id])}
                          </span>
                          <ChevronDown className="size-3.5 opacity-75" />
                        </button>

                        {isMenuOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-20"
                              onClick={() => setOpenStatusMenuId(null)}
                            />
                            <div
                              dir={isRtl ? 'rtl' : 'ltr'}
                              className="absolute end-0 mt-1.5 w-44 rounded-xl bg-card border border-card-line shadow-xl py-1 z-30 text-xs"
                            >
                              {statusOptions.map((opt) => (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => {
                                    if (opt.id === 'cancelled' || opt.id === 'no_show') {
                                      setReasonModalTarget({
                                        appointment: appt,
                                        targetStatus: opt.id,
                                      });
                                      setStatusReasonInput('');
                                      setOpenStatusMenuId(null);
                                      return;
                                    }
                                    const updated =
                                      ClinicOperationsService.updateAppointmentStatus(
                                        appt.id,
                                        opt.id
                                      );
                                    setAppointments(updated);
                                    setOpenStatusMenuId(null);
                                  }}
                                  className={`w-full px-3 py-1.5 text-start flex items-center justify-between hover:bg-layer-hover cursor-pointer ${
                                    appt.status === opt.id
                                      ? 'font-bold text-primary bg-primary/5'
                                      : 'text-foreground'
                                  }`}
                                >
                                  <span>{bi(opt.ar, opt.en, STATUS_CKB[opt.id])}</span>
                                  {appt.status === opt.id && (
                                    <CheckCircle2 className="size-3.5 text-primary" />
                                  )}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setUndoItem({ type: 'appointment', data: appt });
                          setAppointments(
                            ClinicOperationsService.deleteAppointment(appt.id)
                          );
                        }}
                        className="p-2 rounded-xl text-muted-foreground-1 hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title={bi('حذف الموعد', 'Delete', 'سڕینەوە')}
                        aria-label={bi(
                          `حذف موعد ${appt.patientName}`,
                          `Delete appointment for ${appt.patientName}`,
                          `سڕینەوەی چاوپێکەوتنی ${appt.patientName}`
                        )}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          )}
        </div>

        {/* Right Column: Weekly Recurring Schedules + Waiting List */}
        <div className="space-y-6">
          {/* Weekly Recurring Schedules Card */}
          <div className="bg-card rounded-2xl border border-card-line shadow-2xs overflow-hidden h-fit">
            <div className="px-5 py-3.5 border-b border-card-divider flex items-center justify-between gap-2 bg-muted/30">
              <div className="flex items-center gap-2">
                <Repeat className="size-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  {bi(
                    'الجداول الأسبوعية الثابتة',
                    'Weekly Recurring Schedules',
                    'خشتە هەفتانە جێگیرەکان'
                  )}
                </h3>
                <span className="py-0.5 px-2 rounded-full text-xs font-mono font-bold bg-primary/10 text-primary tabular-nums">
                  <Num value={recurringSchedules.length} />
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setScheduleMode('recurring');
                  setAppointmentMode('clinic');
                  setLocationId(resolveDefaultLocationId(practiceLocations, 'clinic'));
                  setRecurringStartDate(selectedDate || localDate());
                  setShowNewApptSheet(true);
                }}
                className="py-1.5 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                {bi('+ جدول أسبوعي', '+ Weekly Rule', '+ خشتەی هەفتانە')}
              </button>
            </div>

            <div className="p-4 space-y-2.5 max-h-80 overflow-y-auto">
              {recurringSchedules.length === 0 ? (
                <p className="text-xs text-center text-muted-foreground-2 py-5">
                  {bi(
                    'لا توجد جداول أسبوعية ثابتة بعد. حدّد أيام الأسبوع للمريض ليُضاف تلقائياً في طابور اليوم.',
                    'No weekly recurring schedules yet. Assign patient weekdays to auto-queue them.',
                    'هێشتا هیچ خشتەیەکی هەفتانەی جێگیر نییە. ڕۆژەکانی هەفتە بۆ نەخۆش دیاری بکە بۆ ڕیزکردنی خۆکارانە.'
                  )}
                </p>
              ) : (
                recurringSchedules.map((rule) => {
                  const ruleIsHome =
                    homeVisitsEnabled && rule.appointmentMode === 'home_visit';
                  const ruleLocationLabel = practiceLocationsEnabled
                    ? getPracticeLocationLabel(
                        resolveAppointmentLocationId(rule, practiceLocations),
                        practiceLocations,
                        language !== 'en'
                      )
                    : '';
                  const ruleAddrDisplay = ruleIsHome
                    ? formatHomeVisitAddressDisplay(rule.homeVisitAddress)
                    : '';
                  return (
                  <div
                    key={rule.id}
                    className={`p-3 rounded-xl border transition-colors ${
                      rule.isActive
                        ? 'bg-layer border-layer-line'
                        : 'bg-muted/40 border-line-2 opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-bold text-foreground truncate">
                            {rule.patientName}
                          </span>
                          {rule.isDemo && <DemoBadge />}
                          {ruleIsHome && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-teal-500/15 text-teal-700 dark:text-teal-300">
                              <Home className="size-3" />
                              <span>{bi('زيارة منزلية', 'Home Visit', 'سەردانی ماڵەوە')}</span>
                            </span>
                          )}
                          {practiceLocationsEnabled && ruleLocationLabel && (
                            <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-surface border border-line-2 text-muted-foreground-1">
                              {ruleLocationLabel}
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                              rule.isActive
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {rule.isActive
                              ? bi('نشط', 'Active', 'چالاک')
                              : bi('متوقف', 'Paused', 'وەستاو')}
                          </span>
                        </div>

                        <div className="text-xs font-semibold text-primary">
                          {formatWeekdaysSummary(rule.weekdays, language)}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground-1">
                          <span className="inline-flex items-center gap-1 font-bold text-foreground">
                            <Clock className="size-3 text-primary" />
                            <TimeDisplay time={rule.startTime} />
                          </span>
                          <span>•</span>
                          <span className="tabular-nums">
                            <Num value={rule.durationMinutes} /> {bi('د', 'm', 'خ')}
                          </span>
                          {rule.therapistName && (
                            <>
                              <span>•</span>
                              <span className="truncate">{rule.therapistName}</span>
                            </>
                          )}
                        </div>

                        {ruleIsHome && (ruleAddrDisplay || rule.homeVisitAddress?.notes) && (
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground-1">
                            <span className="truncate">
                              {ruleAddrDisplay || rule.homeVisitAddress?.notes}
                            </span>
                            {hasHomeVisitAddress(rule.homeVisitAddress) && (
                              <button
                                type="button"
                                onClick={() =>
                                  openMapsConfirmation(rule.patientName, rule.homeVisitAddress)
                                }
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 font-semibold cursor-pointer"
                              >
                                <ExternalLink className="size-3" />
                                <span>{bi('فتح في الخرائط', 'Open in maps', 'کردنەوە لە نەخشە')}</span>
                              </button>
                            )}
                          </div>
                        )}

                        <div className="text-xs text-muted-foreground-2">
                          {bi('يبدأ من ', 'From ', 'لە ')}
                          <bdi dir="ltr">{formatDateDDMMYYYY(rule.startDate)}</bdi>
                          {rule.endDate && (
                            <>
                              {' — '}
                              {bi('حتى ', 'to ', 'تا ')}
                              <bdi dir="ltr">{formatDateDDMMYYYY(rule.endDate)}</bdi>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            ClinicOperationsService.toggleRecurringScheduleActive(rule.id);
                            reloadSchedule(selectedDate);
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground-1 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer compact-btn"
                          style={{ minHeight: 'unset' }}
                          title={
                            rule.isActive
                              ? bi('إيقاف مؤقت', 'Pause schedule', 'وەستاندنی کاتی')
                              : bi('تفعيل', 'Resume schedule', 'چالاککردنەوە')
                          }
                          aria-label={
                            rule.isActive
                              ? bi(
                                  `إيقاف جدول ${rule.patientName}`,
                                  `Pause schedule for ${rule.patientName}`,
                                  `وەستاندنی خشتەی ${rule.patientName}`
                                )
                              : bi(
                                  `تفعيل جدول ${rule.patientName}`,
                                  `Resume schedule for ${rule.patientName}`,
                                  `چالاککردنەوەی خشتەی ${rule.patientName}`
                                )
                          }
                        >
                          {rule.isActive ? (
                            <Pause className="size-3.5" />
                          ) : (
                            <Play className="size-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setUndoItem({ type: 'recurring', data: rule });
                            ClinicOperationsService.deleteRecurringSchedule(rule.id);
                            reloadSchedule(selectedDate);
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground-1 hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer compact-btn"
                          style={{ minHeight: 'unset' }}
                          title={bi('حذف الجدول الأسبوعي', 'Delete weekly schedule', 'سڕینەوەی خشتەی هەفتانە')}
                          aria-label={bi(
                            `حذف الجدول الأسبوعي للمريض ${rule.patientName}`,
                            `Delete weekly schedule for ${rule.patientName}`,
                            `سڕینەوەی خشتەی هەفتانەی ${rule.patientName}`
                          )}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Waiting List Management Card */}
          <div className="bg-card rounded-2xl border border-card-line shadow-2xs overflow-hidden h-fit">
          <div className="px-5 py-3.5 border-b border-card-divider flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-2">
              <ClipboardList className="size-4 text-amber-600 dark:text-amber-400" />
              <h3 className="text-sm font-bold text-foreground">
                {bi('قائمة الانتظار', 'Waiting List', 'لیستی چاوەڕوانی')}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowNewWaitlistForm(!showNewWaitlistForm)}
              className="py-1.5 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/20 text-xs font-semibold transition-colors cursor-pointer"
            >
              {bi('+ إضافة للانتظار', '+ Add Waitlist', '+ زیادکردن بۆ چاوەڕوانی')}
            </button>
          </div>

          {showNewWaitlistForm && (
            <form
              onSubmit={handleAddWaitlist}
              className="p-4 bg-amber-500/5 border-b border-card-divider space-y-2.5"
            >
              <select
                required
                value={waitPatientId}
                onChange={(e) => setWaitPatientId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
              >
                <option value="">
                  {bi(
                    '-- اختر مريضاً مسجلاً --',
                    '-- Select registered patient --',
                    '-- نەخۆشێکی تۆمارکراو هەڵبژێرە --'
                  )}
                </option>
                {activePatients.map((p, idx) => (
                  <option key={p.id} value={p.id}>
                    {p.data.fullNameAr || p.data.fullName} ({getPatientMrn(p, idx)})
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={waitCondition}
                onChange={(e) => setWaitCondition(e.target.value)}
                placeholder={bi('الحالة / الإصابة...', 'Condition...', 'دۆخ / پێکان...')}
                className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
              />
              <div className="flex items-center gap-2">
                <select
                  value={waitPriority}
                  onChange={(e) =>
                    setWaitPriority(e.target.value as 'urgent' | 'high' | 'normal')
                  }
                  className="flex-1 px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground"
                >
                  <option value="normal">
                    {bi('أولوية اعتيادية', 'Normal Priority', 'لەپێشینەی ئاسایی')}
                  </option>
                  <option value="urgent">
                    {bi(
                      'أولوية عاجلة (ما بعد جراحة)',
                      'Urgent Post-Op',
                      'لەپێشینەی بەپەلە (دوای نەشتەرگەری)'
                    )}
                  </option>
                </select>
                <button
                  type="submit"
                  className="py-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-semibold cursor-pointer"
                >
                  {bi('حفظ', 'Save', 'پاشەکەوتکردن')}
                </button>
              </div>
            </form>
          )}

          <div className="divide-y divide-card-divider">
            {waitingList.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground-1">
                {bi(
                  'قائمة الانتظار فارغة حالياً.',
                  'Waiting list is currently empty.',
                  'لیستی چاوەڕوانی لە ئێستادا بەتاڵە.'
                )}
              </div>
            ) : (
              waitingList.map((entry) => (
                <div
                  key={entry.id}
                  className="p-4 space-y-2.5 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs font-bold text-foreground ${privacyBlur ? 'blur-sm select-none' : ''}`}
                        data-privacy-blurred={privacyBlur ? 'true' : undefined}
                      >
                        {entry.patientName}
                      </span>
                      {entry.isDemo && <DemoBadge />}
                    </div>
                    <span
                      className={`py-0.5 px-2 rounded-full text-xs font-semibold border ${
                        entry.priority === 'urgent'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                          : 'bg-surface text-muted-foreground-1 border-line-2'
                      }`}
                    >
                      {entry.priority === 'urgent'
                        ? bi('عاجل', 'Urgent', 'بەپەلە')
                        : bi('اعتيادي', 'Normal', 'ئاسایی')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground-2">
                    <bdi dir="auto">{entry.conditionOrRegion}</bdi>
                  </p>
                  <div className="text-xs text-muted-foreground-1 flex items-center justify-between">
                    <span
                      className={`tabular-nums ${privacyBlur ? 'blur-sm select-none' : ''}`}
                      data-privacy-blurred={privacyBlur ? 'true' : undefined}
                      dir="ltr"
                    >
                      {formatIraqiPhoneDisplay(entry.phone)}
                    </span>
                    <span>{localizePreferredDays(entry.preferredDays, language)}</span>
                  </div>
                  <div className="pt-1 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handlePromoteWaitlistToAppointment(entry)}
                      className="flex-1 py-2 px-3 rounded-xl bg-primary/10 hover:bg-primary hover:text-primary-foreground text-primary border border-primary/20 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="size-3.5" />
                      <span>{bi('تحويل لموعد اليوم', 'Book Today', 'گۆڕین بۆ چاوپێکەوتنی ئەمڕۆ')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUndoItem({ type: 'waitlist', data: entry });
                        setWaitingList(
                          ClinicOperationsService.removeWaitingListEntry(entry.id)
                        );
                      }}
                      className="p-2 rounded-xl text-muted-foreground-1 hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title={bi('حذف من قائمة الانتظار', 'Remove from waiting list', 'سڕینەوە لە لیستی چاوەڕوانی')}
                      aria-label={bi(
                        `حذف ${entry.patientName} من قائمة الانتظار`,
                        `Remove ${entry.patientName} from waiting list`,
                        `سڕینەوەی ${entry.patientName} لە لیستی چاوەڕوانی`
                      )}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          </div>
        </div>
      </div>

      {/* Batch 3 Item 7 & 8: Right-Side Slide-Over Sheet for New Appointment */}
      <DrawerDialog
        isOpen={showNewApptSheet}
        onOpenChange={(open) => {
          if (!open) setShowNewApptSheet(false);
        }}
        side="end"
        dir={isRtl ? 'rtl' : 'ltr'}
        maxWidthClassName="max-w-md"
        className="bg-card border-card-line"
        ariaLabel={bi('حجز موعد جديد', 'Book Appointment', 'تۆمارکردنی چاوپێکەوتنی نوێ')}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        bodyClassName="flex-1 min-h-0 flex flex-col overflow-hidden"
      >
          <form
            onSubmit={handleCreateAppointment}
            className="flex-1 min-h-0 flex flex-col overflow-hidden"
          >
            {/* Sheet Header */}
            <div className="px-5 py-4 border-b border-card-divider flex items-center justify-between bg-muted/40 shrink-0">
              <h3 className="text-sm font-bold text-foreground">
                {bi('حجز موعد جديد', 'Book Appointment', 'تۆمارکردنی چاوپێکەوتنی نوێ')}
              </h3>
              <button
                type="button"
                onClick={() => setShowNewApptSheet(false)}
                aria-label={bi('إغلاق', 'Close', 'داخستن')}
                className="p-1.5 rounded-lg text-muted-foreground-1 hover:text-foreground hover:bg-surface cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Sheet Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold">
                  {formError}
                </div>
              )}

              {scheduleMode === 'single' && (sheetConflict.allOverlaps?.length || 0) > 0 && (
                <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-800 dark:text-sky-300 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <Clock className="size-4 shrink-0" />
                    <span>
                      {bi(
                        `ملاحظة جدول (${sheetConflict.allOverlaps?.length || 0} مريض محجوز في هذا التوقيت — الحجز المتزامن مسموح):`,
                        `Schedule Note (${sheetConflict.allOverlaps?.length || 0} patient(s) already booked — concurrent booking allowed):`,
                        `تێبینیی خشتە (${sheetConflict.allOverlaps?.length || 0} نەخۆش لەم کاتەدا تۆمارکراوە — تۆمارکردنی هاوکات ڕێگەپێدراوە):`
                      )}
                    </span>
                  </div>
                  {sheetConflict.therapistConflicts.length > 0 && (
                    <div>
                      {bi(
                        `يشمل ${sheetConflict.therapistConflicts.length} حجز لنفس المعالج (${sheetConflict.therapistConflicts[0].patientName} الساعة ${formatTimeIraq(sheetConflict.therapistConflicts[0].startTime, language)}). يمكنك إتمام الحجز بشكل طبيعي.`,
                        `Includes ${sheetConflict.therapistConflicts.length} booking with this therapist (${sheetConflict.therapistConflicts[0].patientName} at ${formatTimeIraq(sheetConflict.therapistConflicts[0].startTime, language)}). Save proceeds normally.`,
                        `${sheetConflict.therapistConflicts.length} تۆمارکردن لەخۆدەگرێت بۆ هەمان چارەسەرکار (${sheetConflict.therapistConflicts[0].patientName} کاتژمێر ${formatTimeIraq(sheetConflict.therapistConflicts[0].startTime, language)}). دەتوانیت تۆمارکردنەکە تەواو بکەیت.`
                      )}
                    </div>
                  )}
                  {sheetConflict.therapistConflicts.length === 0 && (sheetConflict.allOverlaps?.length || 0) > 0 && (
                    <div>
                      {bi(
                        `موعد متزامن مع معالج آخر (${sheetConflict.allOverlaps?.[0].patientName}). يمكنك المتابعة وحجز الموعد.`,
                        `Concurrent booking with another therapist (${sheetConflict.allOverlaps?.[0].patientName}). You can confirm normally.`,
                        `چاوپێکەوتنی هاوکات لەگەڵ چارەسەرکارێکی تر (${sheetConflict.allOverlaps?.[0].patientName}). دەتوانیت بەردەوام بیت.`
                      )}
                    </div>
                  )}
                  {sheetConflict.roomConflicts.length > 0 && (
                    <div className="text-muted-foreground-1">
                      {bi(
                        `ملاحظة الغرفة: ${sheetConflict.roomConflicts[0].roomOrBed || ''} مستخدمة لنفس الوقت (${sheetConflict.roomConflicts[0].patientName}).`,
                        `Room note: ${sheetConflict.roomConflicts[0].roomOrBed || ''} also in use at this time (${sheetConflict.roomConflicts[0].patientName}).`,
                        `تێبینیی ژوور: ${sheetConflict.roomConflicts[0].roomOrBed || ''} لە هەمان کاتدا بەکاردێت (${sheetConflict.roomConflicts[0].patientName}).`
                      )}
                    </div>
                  )}
                </div>
              )}

              {scheduleMode === 'single' && (sheetConflict.travelBufferConflicts?.length || 0) > 0 && (
                <div
                  data-testid="travel-buffer-conflict-banner"
                  className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-1"
                >
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>
                      {bi(
                        `تنبيه وقت التنقل (${sheetConflict.travelBufferConflicts?.length || 0} موعد يتداخل مع هامش التنقل — الحجز مسموح):`,
                        `Travel Buffer Notice (${sheetConflict.travelBufferConflicts?.length || 0} appointment(s) overlap travel buffer — booking allowed):`,
                        `ئاگاداریی کاتی هاتوچۆ (${sheetConflict.travelBufferConflicts?.length || 0} چاوپێکەوتن بەرکەوتنی لەگەڵ کاتی هاتوچۆ هەیە — تۆمارکردن ڕێگەپێدراوە):`
                      )}
                    </span>
                  </div>
                  <div>
                    {sheetConflict.travelBufferConflicts
                      ?.slice(0, 3)
                      .map((c) => `${c.patientName} (${formatTimeIraq(c.startTime, language)})`)
                      .join(' · ')}
                  </div>
                </div>
              )}

              {closedDaysBreaksEnabled && (sheetConflict.breakConflicts?.length || 0) > 0 && (
                <div
                  data-testid="break-conflict-banner"
                  className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-1"
                >
                  <div className="font-bold flex items-center gap-1.5">
                    <Clock className="size-4 shrink-0" />
                    <span>
                      {bi(
                        'ملاحظة: الوقت يتداخل مع فترة استراحة أسبوعية (الحجز مسموح):',
                        'Break Overlap Notice (manual booking allowed):',
                        'تێبینی: کاتەکە بەرکەوتنی لەگەڵ پشووی هەفتانەدا هەیە (تۆمارکردن ڕێگەپێدراوە):'
                      )}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {sheetConflict.breakConflicts?.map((brk) => (
                      <div key={brk.id} className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold">
                          {bi(brk.labelAr || brk.labelEn, brk.labelEn || brk.labelAr)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          (<TimeDisplay time={brk.startTime} /> — <TimeDisplay time={brk.endTime} />)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {scheduleMode === 'single' && (sheetConflict.closedDayMatches?.length || 0) > 0 && (
                <div
                  data-testid="sheet-closed-day-banner"
                  className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-800 dark:text-rose-200 text-xs space-y-1"
                >
                  <div className="font-bold flex items-center gap-1.5">
                    <CalendarOff className="size-4 shrink-0" />
                    <span>
                      {bi(
                        'تنبيه: التاريخ المختار مسجّل كيوم إغلاق (يمكنك الحجز يدوياً):',
                        'Closed Date Notice (manual override allowed):',
                        'ئاگاداری: بەروارە هەڵبژێردراوەکە وەک ڕۆژی داخستن تۆمارکراوە (دەتوانیت بە دەستی تۆماری بکەیت):'
                      )}
                    </span>
                  </div>
                  <div>
                    {sheetConflict.closedDayMatches
                      ?.map((m) =>
                        `${bi(m.labelAr || m.labelEn, m.labelEn || m.labelAr)} (${formatClosedDateRangeSummary(m)})`
                      )
                      .join(' · ')}
                  </div>
                </div>
              )}

              {scheduleMode === 'single' && isNonWorkingDay && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>
                      {bi(
                        'ملاحظة يوم خارج الدوام المعتمد:',
                        'Non-Working Day Notice:',
                        'تێبینی ڕۆژی دەرەوەی دەوامی فەرمی:'
                      )}
                    </span>
                  </div>
                  <div>
                    {bi(
                      'التاريخ المختار يقع خارج أيام عمل العيادة المحددة في الإعدادات (يمكنك الحجز اختيارياً).',
                      'Selected date is outside the clinic working days configured in Settings.',
                      'بەروارە هەڵبژێردراوەکە دەکەوێتە دەرەوەی ڕۆژانی کارکردنی کلینیک لە ڕێکخستنەکاندا.'
                    )}
                  </div>
                </div>
              )}

              {/* 1. ONE Patient Combobox ("search or add new") */}
              <div className="relative">
                <label className="text-xs font-semibold text-foreground block mb-1.5">
                  {bi(
                    'المريض (ابحث أو أضف جديداً):',
                    'Patient (Search or Add New):',
                    'نەخۆش (بگەڕێ یان نوێ زیاد بکە):'
                  )}
                </label>

                {selectedPatientObj ? (
                  <div className="px-3.5 py-2.5 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-bold text-foreground block">
                        {getPatientDisplayName(selectedPatientObj.data, language)}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground-1">
                        <bdi dir="ltr">{getPatientMrn(selectedPatientObj)}</bdi>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPatientId('');
                        setIsComboboxOpen(true);
                      }}
                      className="text-xs font-bold text-primary hover:underline cursor-pointer"
                    >
                      {bi('تغيير', 'Change', 'گۆڕین')}
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={patientSearchQuery}
                      onFocus={() => setIsComboboxOpen(true)}
                      onChange={(e) => {
                        setPatientSearchQuery(e.target.value);
                        setIsComboboxOpen(true);
                      }}
                      placeholder={bi(
                        'ابحث بالاسم، الرقم الطبي (MRN)، أو الهاتف...',
                        'Search by name, MRN, or phone...',
                        'گەڕان بە ناو، ژمارەی پزیشکی (MRN)، یان تەلەفۆن...'
                      )}
                      className="w-full ps-9 pe-3 py-2.5 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                    />
                    <Search className="size-4 text-muted-foreground-1 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                )}

                {isComboboxOpen && !selectedPatientObj && (
                  <div className="mt-1 rounded-xl bg-card border border-card-line shadow-lg max-h-48 overflow-y-auto divide-y divide-card-divider z-20">
                    {comboboxFilteredPatients.map((p, idx) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPatientId(p.id);
                          setIsComboboxOpen(false);
                          setFormError(null);
                        }}
                        className="w-full px-3.5 py-2 text-start hover:bg-layer-hover flex items-center justify-between text-xs cursor-pointer"
                      >
                        <span className="font-bold text-foreground truncate">
                          {getPatientDisplayName(p.data, language)}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground-1">
                          <bdi dir="ltr">{getPatientMrn(p, idx)}</bdi>
                        </span>
                      </button>
                    ))}
                    {onNewPatient && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsComboboxOpen(false);
                          setShowNewApptSheet(false);
                          onNewPatient();
                        }}
                        className="w-full px-3.5 py-2.5 text-start bg-primary/5 hover:bg-primary/10 text-primary font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <UserPlus className="size-3.5" />
                        <span>
                          {bi('+ تسجيل مريض جديد', '+ Add New Patient', '+ تۆمارکردنی نەخۆشی نوێ')}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Schedule Mode + Date / Weekdays & Modern Time Picker */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('نوع الجدولة:', 'Schedule Mode:', 'شێوازی خشتە:')}
                  </label>
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted/60 border border-line-2">
                    <button
                      type="button"
                      onClick={() => setScheduleMode('single')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer compact-btn ${
                        scheduleMode === 'single'
                          ? 'bg-card text-foreground shadow-2xs border border-card-line'
                          : 'text-muted-foreground-1 hover:text-foreground'
                      }`}
                      style={{ minHeight: 'unset' }}
                    >
                      {bi('موعد ليوم واحد', 'Single Day', 'چاوپێکەوتنی یەک ڕۆژە')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleMode('recurring')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer compact-btn ${
                        scheduleMode === 'recurring'
                          ? 'bg-primary text-primary-foreground shadow-2xs'
                          : 'text-muted-foreground-1 hover:text-foreground'
                      }`}
                      style={{ minHeight: 'unset' }}
                    >
                      <Repeat className="size-3.5" />
                      <span>
                        {bi(
                          'تكرار أسبوعي (أيام الأسبوع)',
                          'Weekly Recurring',
                          'دووبارەبوونەوەی هەفتانە'
                        )}
                      </span>
                    </button>
                  </div>
                </div>

                {scheduleMode === 'single' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1.5">
                        {bi('التاريخ:', 'Date:', 'بەروار:')}
                      </label>
                      <DatePickerInput value={selectedDate} onChange={setSelectedDate} />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1.5">
                        {bi('وقت البدء:', 'Start Time:', 'کاتی دەستپێکردن:')}
                      </label>
                      <TimePickerInput value={startTime} onChange={setStartTime} />
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <label className="text-xs font-bold text-foreground">
                          {bi(
                            'أيام الحضور الأسبوعية:',
                            'Weekly Session Days:',
                            'ڕۆژانی سەردانی هەفتانە:'
                          )}
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedWeekdays([0, 2, 4])}
                            className="px-2 py-0.5 rounded-md text-xs font-semibold bg-card border border-line-2 text-primary hover:bg-primary/10 cursor-pointer compact-btn"
                            style={{ minHeight: 'unset' }}
                          >
                            {bi(
                              'أحد · ثلاثاء · خميس',
                              'Sun·Tue·Thu',
                              'یەکشەممە · سێشەممە · پێنجشەممە'
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedWeekdays([6, 1, 3])}
                            className="px-2 py-0.5 rounded-md text-xs font-semibold bg-card border border-line-2 text-primary hover:bg-primary/10 cursor-pointer compact-btn"
                            style={{ minHeight: 'unset' }}
                          >
                            {bi(
                              'سبت · إثنين · أربعاء',
                              'Sat·Mon·Wed',
                              'شەممە · دووشەممە · چوارشەممە'
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                        {WEEKDAYS_IRAQI_ORDER.map((day) => {
                          const isSelected = selectedWeekdays.includes(day.index);
                          return (
                            <button
                              key={day.index}
                              type="button"
                              onClick={() => toggleWeekdayChip(day.index)}
                              className={`py-2 px-1 rounded-xl text-xs font-bold border transition-colors cursor-pointer compact-btn text-center ${
                                isSelected
                                  ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                                  : 'bg-card text-foreground border-layer-line hover:bg-layer-hover'
                              }`}
                              style={{ minHeight: 'unset' }}
                            >
                              {bi(day.ar, day.shortEn, WEEKDAY_CKB[day.index])}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-foreground block mb-1.5">
                          {bi('يبدأ من تاريخ:', 'Starts On:', 'لە بەرواری:')}
                        </label>
                        <DatePickerInput
                          value={recurringStartDate}
                          onChange={setRecurringStartDate}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-foreground block mb-1.5">
                          {bi('وقت الجلسة:', 'Session Time:', 'کاتی دانیشتن:')}
                        </label>
                        <TimePickerInput value={startTime} onChange={setStartTime} />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-foreground">
                          {bi(
                            'تاريخ الانتهاء (اختياري):',
                            'End Date (Optional):',
                            'بەرواری کۆتایی (ئارەزوومەندانە):'
                          )}
                        </label>
                        {recurringEndDate && (
                          <button
                            type="button"
                            onClick={() => setRecurringEndDate('')}
                            className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer compact-btn"
                            style={{ minHeight: 'unset' }}
                          >
                            {bi('مسح', 'Clear', 'سڕینەوە')}
                          </button>
                        )}
                      </div>
                      <DatePickerInput
                        value={recurringEndDate}
                        onChange={setRecurringEndDate}
                        placeholder={bi(
                          'مفتوح بدون تاريخ انتهاء',
                          'Ongoing (no end date)',
                          'کراوە بەبێ بەرواری کۆتایی'
                        )}
                      />
                    </div>

                    <p className="text-xs text-primary/90 font-medium leading-relaxed">
                      {bi(
                        'سيتم إضافة المريض تلقائياً إلى طابور الاستقبال اليومي وجدول المواعيد في كل تاريخ يوافق الأيام المحددة.',
                        'The patient will be automatically added to the Reception daily queue and schedule on every matching weekday.',
                        'نەخۆشەکە بە شێوەی خۆکار بۆ ڕیزی پێشوازی ڕۆژانە و خشتەی چاوپێکەوتنەکان لە هەر ڕۆژێکی گونجاودا زیاد دەکرێت.'
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* 3. Duration Presets (30 / 45 / 60) + Manual Custom Input */}
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1.5">
                  {bi(
                    'مدة الجلسة (بالدقائق):',
                    'Duration (Minutes):',
                    'ماوەی دانیشتن (بە خولەک):'
                  )}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" dir="ltr">
                  {([30, 45, 60] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setIsCustomDuration(false);
                        setDurationMinutes(preset);
                      }}
                      className={`py-2 rounded-xl text-xs font-mono font-bold border transition-colors cursor-pointer ${
                        !isCustomDuration && durationMinutes === preset
                          ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                          : 'bg-layer text-foreground border-layer-line hover:bg-layer-hover'
                      }`}
                    >
                      {preset} {bi('دقيقة', 'min', 'خولەک')}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomDuration(true);
                      setCustomDurationDraft(String(durationMinutes || 45));
                    }}
                    className={`py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                      isCustomDuration
                        ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                        : 'bg-layer text-foreground border-layer-line hover:bg-layer-hover'
                    }`}
                  >
                    {bi('تحديد يدوي', 'Custom', 'دیاریکردنی دەستی')}
                  </button>
                </div>

                {isCustomDuration && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min={5}
                      max={480}
                      step={1}
                      dir="ltr"
                      value={customDurationDraft}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setCustomDurationDraft(raw);
                        const parsed = parseInt(raw, 10);
                        if (!Number.isNaN(parsed) && parsed >= 5) {
                          setDurationMinutes(Math.min(480, parsed));
                        }
                      }}
                      placeholder="75"
                      className="w-28 px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground font-mono font-bold tabular-nums focus:outline-none focus:border-primary"
                    />
                    <span className="text-xs font-semibold text-muted-foreground-1">
                      {bi('دقيقة (5 – 480 دقيقة)', 'minutes (5 – 480 min)', 'خولەک (5 – 480 خولەک)')}
                    </span>
                  </div>
                )}
              </div>

              {/* 4. Appointment Mode (C1) + Practice Location (C2) + Room / Home Visit Address */}
              {homeVisitsEnabled && (
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('نمط الحضور:', 'Appointment Mode:', 'شێوازی ئامادەبوون:')}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted/60 border border-line-2">
                    <button
                      type="button"
                      data-testid="appt-mode-clinic"
                      onClick={() => handleSelectAppointmentMode('clinic')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer compact-btn ${
                        appointmentMode === 'clinic'
                          ? 'bg-card text-foreground shadow-2xs border border-card-line'
                          : 'text-muted-foreground-1 hover:text-foreground'
                      }`}
                      style={{ minHeight: 'unset' }}
                    >
                      <Building2 className="size-3.5" />
                      <span>{bi('في العيادة / المركز', 'Clinic Visit', 'لە کلینیک / سەنتەر')}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="appt-mode-home-visit"
                      onClick={() => handleSelectAppointmentMode('home_visit')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer compact-btn ${
                        appointmentMode === 'home_visit'
                          ? 'bg-teal-600 text-white shadow-2xs'
                          : 'text-muted-foreground-1 hover:text-foreground'
                      }`}
                      style={{ minHeight: 'unset' }}
                    >
                      <Home className="size-3.5" />
                      <span>{bi('زيارة منزلية', 'Home Visit', 'سەردانی ماڵەوە')}</span>
                    </button>
                  </div>
                </div>
              )}

              {practiceLocationsEnabled && (
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('موقع الخدمة / الفرع:', 'Practice Location:', 'شوێنی خزمەتگوزاری / لق:')}
                  </label>
                  <select
                    data-testid="sheet-practice-location-select"
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground font-semibold focus:outline-none focus:border-primary"
                  >
                    {activePracticeLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {bi(loc.nameAr || loc.nameEn, loc.nameEn || loc.nameAr)}
                      </option>
                    ))}
                    {locationId &&
                      !activePracticeLocations.some((l) => l.id === locationId) && (
                        <option value={locationId}>
                          {bi(
                            getPracticeLocationLabel(locationId, practiceLocations, true),
                            getPracticeLocationLabel(locationId, practiceLocations, false)
                          )}
                        </option>
                      )}
                  </select>
                </div>
              )}

              {homeVisitsEnabled && appointmentMode === 'home_visit' ? (
                <div className="p-3.5 rounded-xl bg-teal-500/5 border border-teal-500/25 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-teal-800 dark:text-teal-300">
                    <Home className="size-3.5 shrink-0" />
                    <span>
                      {bi(
                        'عنوان الزيارة المنزلية (بأسلوب النقطة الدالة العراقي) ووقت التنقل',
                        'Home Visit Landmark Address & Travel Buffers',
                        'ناونیشانی سەردانی ماڵەوە (نیشانەی دیار) و کاتی هاتوچۆ'
                      )}
                    </span>
                  </div>

                  <datalist id="iraq-governorates-sheet-list">
                    {IRAQ_GOVERNORATES.map((gov) => (
                      <option key={gov.en} value={bi(gov.ar, gov.en, GOVERNORATE_CKB[gov.en])} />
                    ))}
                  </datalist>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1">
                        {bi('المحافظة:', 'Governorate:', 'پارێزگا:')}
                      </label>
                      <input
                        type="text"
                        list="iraq-governorates-sheet-list"
                        value={homeVisitGov}
                        onChange={(e) => setHomeVisitGov(e.target.value)}
                        placeholder={bi('مثال: بغداد', 'e.g., Baghdad', 'نموونە: هەولێر')}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1">
                        {bi('المنطقة / الحي:', 'Area / District:', 'ناوچە / گەڕەک:')}
                      </label>
                      <input
                        type="text"
                        value={homeVisitArea}
                        onChange={(e) => setHomeVisitArea(e.target.value)}
                        placeholder={bi(
                          'مثال: الكرادة / المنصور',
                          'e.g., Karrada / Mansour',
                          'نموونە: عەنکاوە / ئیسکان'
                        )}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-1">
                      {bi('أقرب نقطة دالة:', 'Nearest Landmark:', 'نزیکترین نیشانەی دیار:')}
                    </label>
                    <input
                      type="text"
                      value={homeVisitLandmark}
                      onChange={(e) => setHomeVisitLandmark(e.target.value)}
                      placeholder={bi(
                        'مثال: قرب ساحة كهرمانة أو جامع...',
                        'e.g., Near Kahramana Square...',
                        'نموونە: نزیک پارک یان مزگەوت...'
                      )}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-1">
                      {bi(
                        'ملاحظات الوصول (اختياري):',
                        'Access Notes (Optional):',
                        'تێبینیی گەیشتن (ئارەزوومەندانە):'
                      )}
                    </label>
                    <input
                      type="text"
                      value={homeVisitNotes}
                      onChange={(e) => setHomeVisitNotes(e.target.value)}
                      placeholder={bi(
                        'مثال: الطابق الثاني، يوجد مصعد...',
                        'e.g., 2nd floor, elevator available...',
                        'نموونە: نهۆمی دووەم، بەرزکەرەوە هەیە...'
                      )}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1">
                        {bi(
                          'تنقل قبل الجلسة (دقيقة):',
                          'Travel Before (min):',
                          'هاتوچۆ پێش دانیشتن (خولەک):'
                        )}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={240}
                        step={5}
                        dir="ltr"
                        value={travelBufferBeforeStr}
                        onChange={(e) => setTravelBufferBeforeStr(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground font-mono font-bold tabular-nums focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1">
                        {bi(
                          'تنقل بعد الجلسة (دقيقة):',
                          'Travel After (min):',
                          'هاتوچۆ دوای دانیشتن (خولەک):'
                        )}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={240}
                        step={5}
                        dir="ltr"
                        value={travelBufferAfterStr}
                        onChange={(e) => setTravelBufferAfterStr(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground font-mono font-bold tabular-nums focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('الغرفة العلاجية:', 'Treatment Room:', 'ژووری چارەسەر:')}
                  </label>
                  <select
                    value={roomOrBed}
                    onChange={(e) => setRoomOrBed(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground font-semibold focus:outline-none focus:border-primary"
                  >
                    {CLINIC_ROOMS.map((room) => (
                      <option key={room.ar} value={room.ar}>
                        {bi(room.ar, room.en, room.ckb)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 5. Visit Type & Assigned Therapist */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('نوع الزيارة:', 'Visit Type:', 'جۆری سەردان:')}
                  </label>
                  <select
                    value={visitType}
                    onChange={(e) => setVisitType(e.target.value as SessionType)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="initial_evaluation">
                      {bi('تقييم أولي', 'Initial Evaluation', 'هەڵسەنگاندنی سەرەتایی')}
                    </option>
                    <option value="follow_up">
                      {bi('جلسة متابعة', 'Follow-up Session', 'دانیشتنی بەدواداچوون')}
                    </option>
                    <option value="re_evaluation">
                      {bi('إعادة تقييم', 'Re-evaluation', 'هەڵسەنگاندنەوە')}
                    </option>
                    <option value="discharge_summary">
                      {bi('تخريج', 'Discharge Session', 'دەرچوون / کۆتاییهێنان')}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('المعالج:', 'Therapist:', 'چارەسەرکار:')}
                  </label>
                  <select
                    value={therapistName}
                    onChange={(e) => setTherapistName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  >
                    {therapists.map((t) => (
                      <option key={t.id} value={t.nameAr}>
                        {bi(t.nameAr, t.nameEn)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 6. Condition / Episode Title */}
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1.5">
                  {bi(
                    'الحالة أو المنطقة العلاجية:',
                    'Condition / Episode:',
                    'دۆخ یان ناوچەی چارەسەر:'
                  )}
                </label>
                <input
                  type="text"
                  value={episodeTitle}
                  onChange={(e) => setEpisodeTitle(e.target.value)}
                  placeholder={bi(
                    'مثال: تأهيل الكتف الأيمن...',
                    'e.g., Right Shoulder Rehab...',
                    'نموونە: ڕاهێنانی شانی ڕاست...'
                  )}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Sheet Footer */}
            <div className="px-5 py-4 border-t border-card-divider bg-muted/40 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowNewApptSheet(false);
                  void DraftRecoveryService.deleteDraftAsync('appointment', 'new').then(() =>
                    refreshRecoveredDrafts()
                  );
                }}
                className="py-2 px-4 rounded-xl bg-layer border border-layer-line text-layer-foreground text-xs font-semibold cursor-pointer"
              >
                {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
              </button>
              <button
                type="submit"
                className="py-2 px-5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-xs cursor-pointer"
              >
                {scheduleMode === 'recurring'
                  ? bi('حفظ الجدول الأسبوعي', 'Save Weekly Schedule', 'پاشەکەوتکردنی خشتەی هەفتانە')
                  : bi('تأكيد الموعد', 'Confirm Appointment', 'دڵنیاکردنەوەی چاوپێکەوتن')}
              </button>
            </div>
          </form>
      </DrawerDialog>

      {/* 4.5 Mandatory Cancellation / No-Show Reason Modal + Waitlist Trigger */}
      <ModalDialog
        isOpen={Boolean(reasonModalTarget)}
        onOpenChange={(open) => {
          if (!open) setReasonModalTarget(null);
        }}
        role="alertdialog"
        size="sm"
        dir={isRtl ? 'rtl' : 'ltr'}
        hideCloseButton
        ariaLabel={
          reasonModalTarget?.targetStatus === 'cancelled'
            ? bi(
                'تسجيل سبب إلغاء الموعد',
                'Record Appointment Cancellation Reason',
                'تۆمارکردنی هۆکاری هەڵوەشاندنەوەی چاوپێکەوتن'
              )
            : bi(
                'تسجيل سبب عدم الحضور (No-Show)',
                'Record No-Show Reason',
                'تۆمارکردنی هۆکاری ئامادەنەبوون (No-Show)'
              )
        }
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        className="bg-card border-card-line"
        bodyClassName="p-5 space-y-4 text-xs overflow-y-auto"
      >
        {reasonModalTarget && (
          <>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-foreground">
                {reasonModalTarget.targetStatus === 'cancelled'
                  ? bi(
                      'تسجيل سبب إلغاء الموعد',
                      'Record Appointment Cancellation Reason',
                      'تۆمارکردنی هۆکاری هەڵوەشاندنەوەی چاوپێکەوتن'
                    )
                  : bi(
                      'تسجيل سبب عدم الحضور (No-Show)',
                      'Record No-Show Reason',
                      'تۆمارکردنی هۆکاری ئامادەنەبوون (No-Show)'
                    )}
              </h3>
              <button
                type="button"
                onClick={() => setReasonModalTarget(null)}
                aria-label={bi('إغلاق', 'Close', 'داخستن')}
                className="p-1 text-muted-foreground-1 hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="text-muted-foreground-1 flex flex-wrap items-center gap-1.5">
              <span>{reasonModalTarget.appointment.patientName}</span>
              <span>—</span>
              <TimeDisplay time={reasonModalTarget.appointment.startTime} />
            </p>

            <div className="flex flex-wrap gap-1.5">
              {[
                {
                  ar: 'اعتذر المريض لظرف طارئ',
                  en: 'Patient emergency',
                  ckb: 'نەخۆش بەهۆی بارودۆخی فریاکەوتنەوە داوای لێبوردنی کرد',
                },
                {
                  ar: 'طلب تأجيل لموعد آخر',
                  en: 'Requested reschedule',
                  ckb: 'داوای دواخستنی کرد بۆ کاتێکی تر',
                },
                {
                  ar: 'لم يحضر دون إشعار',
                  en: 'Did not attend without notice',
                  ckb: 'بەبێ ئاگادارکردنەوە ئامادە نەبوو',
                },
                {
                  ar: 'تحسن الحالة أو سفر',
                  en: 'Travelling / Improved',
                  ckb: 'باشبوونی دۆخ یان گەشتکردن',
                },
              ].map((preset) => {
                const label = bi(preset.ar, preset.en, preset.ckb);
                return (
                  <button
                    key={preset.en}
                    type="button"
                    onClick={() => setStatusReasonInput(label)}
                    className="px-2.5 py-1 rounded-lg border border-layer-line bg-surface hover:bg-layer-hover text-foreground font-semibold cursor-pointer"
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div>
              <label className="block font-bold text-foreground mb-1">
                {bi('السبب (مطلوب): *', 'Reason (Required): *', 'هۆکار (پێویستە): *')}
              </label>
              <input
                type="text"
                value={statusReasonInput}
                onChange={(e) => setStatusReasonInput(e.target.value)}
                placeholder={bi('اكتب السبب...', 'Enter reason...', 'هۆکارەکە بنووسە...')}
                className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReasonModalTarget(null)}
                className="px-3.5 py-2 rounded-xl bg-layer border border-layer-line text-foreground font-semibold cursor-pointer"
              >
                {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
              </button>
              <button
                type="button"
                disabled={!statusReasonInput.trim()}
                onClick={() => {
                  const target = reasonModalTarget;
                  const cleanReason = statusReasonInput.trim();
                  if (!cleanReason) return;
                  const updated = ClinicOperationsService.updateAppointmentStatus(
                    target.appointment.id,
                    target.targetStatus,
                    cleanReason
                  );
                  setAppointments(updated);
                  const suggestions = ClinicOperationsService.suggestWaitlistForFreedSlot(
                    target.appointment
                  );
                  if (suggestions.length > 0) {
                    setFreedSlotBanner({
                      freedAppt: target.appointment,
                      suggestions,
                    });
                  }
                  setReasonModalTarget(null);
                  setStatusReasonInput('');
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed"
              >
                {bi('تأكيد وتحديث الموعد', 'Confirm Status', 'دڵنیاکردنەوە و نوێکردنەوەی دۆخ')}
              </button>
            </div>
          </>
        )}
      </ModalDialog>

      {/* C1: Explicit In-App Google Maps Confirmation Modal (Zero Background Requests) */}
      {mapsConfirmTarget && (
        <ModalDialog
          isOpen={Boolean(mapsConfirmTarget)}
          onOpenChange={(open) => {
            if (!open) setMapsConfirmTarget(null);
          }}
          role="alertdialog"
          size="sm"
          title={bi(
            'تأكيد فتح الخريطة الخارجية',
            'Confirm Opening External Maps',
            'دڵنیاکردنەوەی کردنەوەی نەخشەی دەرەکی'
          )}
          closeLabel={bi('إغلاق', 'Close', 'داخستن')}
          footer={
            <div
              dir={isRtl ? 'rtl' : 'ltr'}
              className="w-full flex items-center justify-end gap-2"
            >
              <button
                type="button"
                onClick={() => setMapsConfirmTarget(null)}
                className="px-3.5 py-2 rounded-xl bg-layer border border-layer-line text-foreground text-xs font-semibold cursor-pointer"
              >
                {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetUrl = mapsConfirmTarget.url;
                  setMapsConfirmTarget(null);
                  window.open(targetUrl, '_blank', 'noopener,noreferrer');
                }}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="size-3.5" />
                <span>{bi('فتح في خرائط جوجل', 'Open in Google Maps', 'کردنەوە لە گووگڵ مەپس')}</span>
              </button>
            </div>
          }
        >
          <div dir={isRtl ? 'rtl' : 'ltr'} className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 leading-relaxed font-medium">
              {bi(
                'تنبيه الخصوصية: سيتم فتح رابط خارجي إلى خرائط جوجل (Google Maps) مبني فقط من عنوان الدلالة المُدخل (المحافظة، المنطقة، أقرب نقطة دالة). لا يتم إرسال اسم المريض أو رقم الهاتف أو أي بيانات سريرية.',
                'Privacy Notice: This opens an external Google Maps link constructed strictly from the typed landmark address (governorate, area, nearest landmark). No patient name, phone number, or clinical notes are included.',
                'ئاگاداریی نهێنی: بەستەرێکی دەرەکی بۆ گووگڵ مەپس دەکرێتەوە کە تەنها لە ناونیشانی تۆمارکراو (پارێزگا، ناوچە، نزیکترین نیشانە) پێکهاتووە. ناوی نەخۆش، ژمارەی تەلەفۆن یان هیچ زانیارییەکی کلینیکی نانێردرێت.'
              )}
            </div>

            <div className="p-3 rounded-xl bg-surface border border-line-2 space-y-1">
              <div className="font-bold text-foreground">
                {bi('العنوان المستخدم في البحث:', 'Address Query:', 'ناونیشانی بەکارهاتوو بۆ گەڕان:')}
              </div>
              <div className="text-foreground">{mapsConfirmTarget.formattedAddress}</div>
              <div className="pt-1 text-muted-foreground-1 break-all">
                <bdi dir="ltr">{mapsConfirmTarget.url}</bdi>
              </div>
            </div>
          </div>
        </ModalDialog>
      )}

      {/* C3: Lazy-Loaded Closed Days, Breaks, Locations & Hijri Settings Modal */}
      <Suspense fallback={null}>
        {showClosedDaysBreaksModal && (
          <ClosedDaysBreaksModal
            isOpen={showClosedDaysBreaksModal}
            onClose={() => setShowClosedDaysBreaksModal(false)}
            initialTab={closedDaysModalTab}
            onSaved={() => reloadSchedule(selectedDate)}
          />
        )}
      </Suspense>

      {/* Phase E2: Lazy-Loaded Offline .ics Calendar Export Modal */}
      {icsModalState.isOpen && (
        <Suspense fallback={null}>
          <IcsExportModal
            isOpen={icsModalState.isOpen}
            onClose={() =>
              setIcsModalState({ isOpen: false, initialSingleAppointment: null })
            }
            dayDate={selectedDate}
            dayAppointments={filteredAppointments}
            initialSingleAppointment={icsModalState.initialSingleAppointment}
            nextUpcomingAppointment={
              findNextUpcomingAppointment(
                filteredAppointments,
                selectedDate !== localDate() ? { fromDate: selectedDate } : undefined
              ) || findNextUpcomingAppointment(appointments)
            }
          />
        </Suspense>
      )}

      {/* Phase E3: Lazy-Loaded Tomorrow Schedule & Patient Visit Card Print Modal */}
      {printModalState && (
        <Suspense fallback={null}>
          <PrintDocumentModal
            isOpen={Boolean(printModalState)}
            onClose={() => setPrintModalState(null)}
            documentType={printModalState.documentType}
            patient={printModalState.patient ?? null}
            patientName={printModalState.patientName}
            patientPhone={printModalState.patientPhone}
            patientMrn={printModalState.patientMrn}
            scheduleDate={printModalState.scheduleDate}
            scheduleAppointments={printModalState.scheduleAppointments}
            visitCardSummary={printModalState.visitCardSummary}
          />
        </Suspense>
      )}
    </div>
  );
};
