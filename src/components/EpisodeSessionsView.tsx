// =======================================================================
// PhysioRecord — Episode Sessions & SOAP View Component (Phase 2B.2)
// Chronological Session Timeline, 1:1 SOAP Documentation & Addenda Management
// =======================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Plus, 
  Calendar, 
  Clock, 
  FileEdit, 
  Lock, 
  Edit3, 
  Trash2, 
  XCircle, 
  History, 
  FileText, 
  AlertCircle, 
  FolderOpen,
  Activity,
  Compass,
  Dumbbell,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Brain
} from 'lucide-react';
import { 
  SESSION_TYPES, 
  SESSION_STATUSES, 
  ATTENDANCE_STATUSES, 
  type EpisodeRecord, 
  type PatientRecord, 
  type SessionRecord, 
  type SoapNoteRecord, 
  type SoapNoteData, 
  type SessionClinicalData, 
  type AddendumReason, 
  type ClinicalAddendumRecord 
} from '../types/clinical';
import { useSessions } from '../context/SessionContext';
import { useLanguage } from '../context/LanguageContext';
import { useVirtualWindow } from '../hooks/useVirtualWindow';
import { SessionModal } from './SessionModal';
import { SoapModal } from './SoapModal';
import { AddendumModal } from './AddendumModal';
import { EpisodeDischargeModal } from './EpisodeDischargeModal';
import { useEpisodes } from '../context/EpisodeContext';
import { SessionService } from '../services/sessionService';
import {
  compareLongitudinalRomEntries,
  findMatchingBaselineRomEntry,
  findMatchingBaselineMmtEntry,
  BODY_LATERALITIES,
} from '../data/clinicalToolkit/romMmtCatalog';
import { formatDateDDMMYYYY } from '../utils/date';

interface EpisodeSessionsViewProps {
  episode: EpisodeRecord;
  patient: PatientRecord;
}

export const EpisodeSessionsView: React.FC<EpisodeSessionsViewProps> = ({
  episode,
  patient,
}) => {
  const { language, bi, isRtl } = useLanguage();
  const isEn = language === 'en';

  const {
    loadSessionsForEpisode,
    createSession,
    updateSession,
    cancelSession,
    finalizeSession,
    deleteSession,
    getSoapNote,
    saveSoapNote,
    getAddenda,
    addAddendum,
  } = useSessions();

  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SOAP notes cache mapped by sessionId
  const [soapCache, setSoapCache] = useState<Record<string, SoapNoteRecord | null>>({});
  // Addenda counts mapped by sessionId
  const [addendaCountCache, setAddendaCountCache] = useState<Record<string, number>>({});

  const sessionsVirtual = useVirtualWindow({
    totalCount: sessions.length,
    estimatedRowHeightPx: 112,
    columns: 1,
    overscanRows: 5,
  });
  const visibleSessions = useMemo(
    () => sessions.slice(sessionsVirtual.startIndex, sessionsVirtual.endIndex),
    [sessions, sessionsVirtual.startIndex, sessionsVirtual.endIndex]
  );

  const { closeEpisode } = useEpisodes();

  // Modals state
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [sessionToEdit, setSessionToEdit] = useState<SessionRecord | null>(null);

  const [activeSessionForSoap, setActiveSessionForSoap] = useState<SessionRecord | null>(null);
  const [isSoapModalOpen, setIsSoapModalOpen] = useState(false);

  const [activeSessionForAddendum, setActiveSessionForAddendum] = useState<SessionRecord | null>(null);
  const [addendaListForActiveSession, setAddendaListForActiveSession] = useState<ClinicalAddendumRecord[]>([]);
  const [isAddendumModalOpen, setIsAddendumModalOpen] = useState(false);
  const [isDischargeModalOpen, setIsDischargeModalOpen] = useState(false);

  // Cancellation & delete confirmation prompts
  const [sessionToCancel, setSessionToCancel] = useState<SessionRecord | null>(null);
  const [cancellationReasonInput, setCancellationReasonInput] = useState('');
  const [cancellationType, setCancellationType] = useState<'cancelled_patient' | 'cancelled_clinic' | 'no_show'>('cancelled_patient');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<SessionRecord | null>(null);

  // Longitudinal Tracking Accordion
  const [isLongitudinalOpen, setIsLongitudinalOpen] = useState(true);

  // Longitudinal ROM Progress Comparisons
  const longitudinalRomComparisons = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => a.sessionNumber - b.sessionNumber);
    const sessionsWithRom = sorted.filter(
      (s) =>
        soapCache[s.id]?.data?.objective?.romBattery?.entries &&
        soapCache[s.id]!.data.objective.romBattery!.entries.length > 0
    );

    if (sessionsWithRom.length < 2) return [];

    const baselineSession = sessionsWithRom[0];
    const latestSession = sessionsWithRom[sessionsWithRom.length - 1];

    const baselineEntries = soapCache[baselineSession.id]?.data?.objective?.romBattery?.entries || [];
    const latestEntries = soapCache[latestSession.id]?.data?.objective?.romBattery?.entries || [];

    const comparisons: Array<{
      jointNameAr: string;
      movementNameAr: string;
      movementType: string;
      laterality: string;
      baselineSessionNumber: number;
      baselineDate: string;
      baselineAngle: number | null;
      baselineIsTested: boolean;
      latestSessionNumber: number;
      latestDate: string;
      latestAngle: number | null;
      latestIsTested: boolean;
      comparison: ReturnType<typeof compareLongitudinalRomEntries>;
    }> = [];

    for (const latestEntry of latestEntries) {
      const baseMatch = findMatchingBaselineRomEntry(baselineEntries, latestEntry);

      if (baseMatch) {
        const comp = compareLongitudinalRomEntries(baseMatch, latestEntry);
        comparisons.push({
          jointNameAr: latestEntry.jointNameAr,
          movementNameAr: latestEntry.movementNameAr,
          movementType: latestEntry.movementType,
          laterality: BODY_LATERALITIES[latestEntry.laterality]?.ar || latestEntry.laterality,
          baselineSessionNumber: baselineSession.sessionNumber,
          baselineDate: baselineSession.sessionDate,
          baselineAngle: baseMatch.measuredAngleDegrees,
          baselineIsTested: baseMatch.isTested,
          latestSessionNumber: latestSession.sessionNumber,
          latestDate: latestSession.sessionDate,
          latestAngle: latestEntry.measuredAngleDegrees,
          latestIsTested: latestEntry.isTested,
          comparison: comp,
        });
      }
    }

    return comparisons;
  }, [sessions, soapCache]);

  // Longitudinal MMT Progress Comparisons
  const longitudinalMmtComparisons = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => a.sessionNumber - b.sessionNumber);
    const sessionsWithMmt = sorted.filter(
      (s) =>
        soapCache[s.id]?.data?.objective?.mmtBattery?.entries &&
        soapCache[s.id]!.data.objective.mmtBattery!.entries.length > 0
    );

    if (sessionsWithMmt.length < 2) return [];

    const baselineSession = sessionsWithMmt[0];
    const latestSession = sessionsWithMmt[sessionsWithMmt.length - 1];

    const baselineEntries = soapCache[baselineSession.id]?.data?.objective?.mmtBattery?.entries || [];
    const latestEntries = soapCache[latestSession.id]?.data?.objective?.mmtBattery?.entries || [];

    const comparisons: Array<{
      muscleNameAr: string;
      actionNameAr: string;
      laterality: string;
      baselineSessionNumber: number;
      baselineGrade: string | null;
      latestSessionNumber: number;
      latestGrade: string | null;
    }> = [];

    for (const latestEntry of latestEntries) {
      const baseMatch = findMatchingBaselineMmtEntry(baselineEntries, latestEntry);

      if (baseMatch && baseMatch.isTested && latestEntry.isTested) {
        comparisons.push({
          muscleNameAr: latestEntry.muscleNameAr,
          actionNameAr: latestEntry.actionNameAr,
          laterality: BODY_LATERALITIES[latestEntry.laterality]?.ar || latestEntry.laterality,
          baselineSessionNumber: baselineSession.sessionNumber,
          baselineGrade: baseMatch.gradeValue,
          latestSessionNumber: latestSession.sessionNumber,
          latestGrade: latestEntry.gradeValue,
        });
      }
    }

    return comparisons;
  }, [sessions, soapCache]);

  const fetchSessionsAndNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const records = await loadSessionsForEpisode(episode.id);
      setSessions(records);

      // Fetch SOAP notes and addenda counts in parallel
      const soaps: Record<string, SoapNoteRecord | null> = {};
      const addendaCounts: Record<string, number> = {};

      await Promise.all(
        records.map(async (sess) => {
          try {
            const s = await getSoapNote(sess.id);
            soaps[sess.id] = s;
            const a = await getAddenda(sess.id);
            addendaCounts[sess.id] = a.length;
          } catch (e) {
            console.warn(`Failed to prefetch SOAP or Addenda for session ${sess.id}:`, e);
          }
        })
      );

      setSoapCache(soaps);
      setAddendaCountCache(addendaCounts);
    } catch (err: unknown) {
      console.error('Failed to load sessions for episode:', err);
      setError(err instanceof Error ? err.message : 'فشل تحميل جلسات حلقة الرعاية.');
    } finally {
      setLoading(false);
    }
  }, [episode.id, loadSessionsForEpisode, getSoapNote, getAddenda]);

  useEffect(() => {
    fetchSessionsAndNotes();
  }, [fetchSessionsAndNotes]);

  // Handle Create / Edit Session
  const handleSaveSession = async (data: Partial<SessionClinicalData>) => {
    if (sessionToEdit) {
      await updateSession(sessionToEdit.id, data);
    } else {
      await createSession(patient.id, episode.id, data);
    }
    await fetchSessionsAndNotes();
  };

  // Handle Cancel Session
  const handleConfirmCancelSession = async () => {
    if (!sessionToCancel) return;
    if (!cancellationReasonInput.trim()) {
      setCancelError(bi('سبب الإلغاء إلزامي.', 'Cancellation reason is required.'));
      return;
    }

    setCancelError(null);
    try {
      await cancelSession(sessionToCancel.id, cancellationReasonInput.trim(), cancellationType);
      setSessionToCancel(null);
      setCancellationReasonInput('');
      await fetchSessionsAndNotes();
    } catch (err: unknown) {
      setCancelError(err instanceof Error ? err.message : bi('فشل إلغاء الجلسة.', 'Failed to cancel session.'));
    }
  };

  // Open SOAP Modal for a session
  const handleOpenSoap = (session: SessionRecord) => {
    setActiveSessionForSoap(session);
    setIsSoapModalOpen(true);
  };

  // Save SOAP Note
  const handleSaveSoap = async (data: SoapNoteData): Promise<SoapNoteRecord> => {
    if (!activeSessionForSoap) throw new Error('لا توجد جلسة نشطة.');
    const saved = await saveSoapNote(patient.id, episode.id, activeSessionForSoap.id, data);
    setSoapCache((prev) => ({ ...prev, [activeSessionForSoap.id]: saved }));
    await fetchSessionsAndNotes();
    return saved;
  };

  // Finalize Session
  const handleFinalizeSession = async (sessionId: string, therapistName: string) => {
    await finalizeSession(sessionId, therapistName);
    setIsSoapModalOpen(false);
    await fetchSessionsAndNotes();
  };

  // Open Addendum Modal
  const handleOpenAddendum = async (session: SessionRecord) => {
    setActiveSessionForAddendum(session);
    try {
      const list = await getAddenda(session.id);
      setAddendaListForActiveSession(list);
    } catch {
      setAddendaListForActiveSession([]);
    }
    setIsAddendumModalOpen(true);
  };

  // Save Addendum
  const handleSaveAddendum = async (
    targetTable: 'sessions' | 'soapNotes',
    targetId: string,
    data: {
      reasonForAmendment: AddendumReason;
      amendmentText: string;
      signedByTherapistName: string;
    }
  ) => {
    if (!activeSessionForAddendum) return;
    await addAddendum(activeSessionForAddendum.id, targetTable, targetId, data);
    await fetchSessionsAndNotes();
  };

  const isEpisodeClosed = episode.status === 'completed' || episode.status === 'archived';

  return (
    <div className="mt-4 pt-4 border-t border-slate-200" dir={isRtl ? 'rtl' : 'ltr'}>
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-primary-600" />
              <span>{bi('سجل الجلسات وتوثيق SOAP', 'Session Timeline & SOAP Notes')}</span>
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs tabular-nums bg-slate-100 text-slate-700 font-bold">
              {sessions.length} {bi('جلسات', 'Sessions')}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">
            {bi('توثيق الجلسات العلاجية وملاحظات SOAP اليومية التابعة لحلقة الرعاية هذه', 'Clinical treatment documentation and daily SOAP notes for this episode')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isEpisodeClosed && (
            <button
              type="button"
              onClick={() => setIsDischargeModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
            >
              <span>{bi('تخريج الحلقة', 'Discharge Episode')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setSessionToEdit(null);
              setIsSessionModalOpen(true);
            }}
            disabled={isEpisodeClosed}
            title={isEpisodeClosed ? bi('لا يمكن إضافة جلسات داخل حلقة مكتملة أو مؤرشفة', 'Cannot add sessions to a closed or archived episode') : bi('إضافة جلسة سريرية', 'Add clinical session')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 min-h-[36px] rounded-lg text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-40 shadow-2xs hover:shadow transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{bi('تسجيل جلسة سريرية جديدة', 'New Clinical Session')}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 mb-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Sessions Content */}
      {loading && sessions.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-xs">
          {bi('جاري فك تشفير وتحديث جلسات الحلقة السريرية...', 'Decrypting and loading clinical sessions...')}
        </div>
      ) : sessions.length === 0 ? (
        <div className="py-8 px-4 text-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50">
          <FolderOpen className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
          <p className="text-xs font-bold text-slate-700 mb-0.5">
            {bi('لا توجد جلسات مسجلة لهذه الحلقة بعد', 'No sessions recorded for this episode yet')}
          </p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-3">
            {bi('سجل الجلسة الأولى لتوثيق فحص المريض وملاحظات SOAP.', 'Record the first evaluation session to document clinical findings and SOAP notes.')}
          </p>
          {!isEpisodeClosed && (
            <button
              type="button"
              onClick={() => {
                setSessionToEdit(null);
                setIsSessionModalOpen(true);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{bi('إضافة الجلسة الأولى الآن', 'Add First Session Now')}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Longitudinal Clinical Progress Tracking */}
          {(longitudinalRomComparisons.length > 0 || longitudinalMmtComparisons.length > 0) && (
            <div className="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50/40 via-white to-indigo-50/20 p-4 shadow-2xs">
              <button
                type="button"
                onClick={() => setIsLongitudinalOpen(!isLongitudinalOpen)}
                className={`w-full flex items-center justify-between ${isRtl ? 'text-right' : 'text-left'}`}
              >
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-teal-600 text-white shadow-2xs">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <span>{bi('تتبع التقدم الحركي والعضلي عبر الجلسات', 'Longitudinal Motor & ROM Progress')}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs bg-teal-100 text-teal-800 font-mono font-bold">
                        {longitudinalRomComparisons.length + longitudinalMmtComparisons.length} {bi('مؤشرات', 'Metrics')}
                      </span>
                    </h4>
                    <p className="text-xs text-slate-600">
                      {bi('مقارنة تطور المدى الحركي والقوة العضلية بين الجلسة التقييمية الأولى والجلسة الأحدث', 'Comparing ROM and muscle strength progress between baseline and latest session')}
                    </p>
                  </div>
                </div>
                <div className="text-slate-400 p-1">
                  {isLongitudinalOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {isLongitudinalOpen && (
                <div className="mt-3 pt-3 border-t border-teal-100 space-y-3">
                  {/* ROM Comparisons */}
                  {longitudinalRomComparisons.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-teal-900 flex items-center gap-1">
                        <Compass className="w-3.5 h-3.5 text-teal-600" />
                        <span>{bi('تطور المدى الحركي:', 'Range of Motion (ROM) Progress:')}</span>
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {longitudinalRomComparisons.map((c, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg bg-white border border-teal-100 text-xs shadow-2xs space-y-1"
                          >
                            <div className="flex items-center justify-between font-bold text-slate-800">
                              <span>
                                {c.jointNameAr} — {c.movementNameAr}
                              </span>
                              <span className="text-xs text-slate-400 font-mono">
                                {c.movementType} ({c.laterality})
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-xs text-slate-600">
                              <span>
                                {bi(`الأساس (جلسة #${c.baselineSessionNumber}):`, `Baseline (S#${c.baselineSessionNumber}):`)}{' '}
                                <strong className="font-mono text-slate-800">
                                  {c.baselineIsTested ? `${c.baselineAngle}°` : bi('غير مفحوص', 'Not Tested')}
                                </strong>
                              </span>
                              <span>
                                {bi(`الأحدث (جلسة #${c.latestSessionNumber}):`, `Latest (S#${c.latestSessionNumber}):`)}{' '}
                                <strong className="font-mono text-slate-800">
                                  {c.latestIsTested ? `${c.latestAngle}°` : bi('غير مفحوص', 'Not Tested')}
                                </strong>
                              </span>
                            </div>

                            <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-xs">
                              {c.comparison.isComparable && c.comparison.deltaDegrees !== null ? (
                                <span
                                  className={`inline-flex items-center gap-1 font-bold font-mono px-2 py-0.5 rounded-full ${
                                    c.comparison.deltaDegrees > 0
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                      : c.comparison.deltaDegrees < 0
                                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                      : 'bg-slate-100 text-slate-700 border border-slate-300'
                                  }`}
                                >
                                  {c.comparison.deltaDegrees > 0 && '+'}
                                  {c.comparison.deltaDegrees}°
                                  <span className="font-sans text-xs font-normal">
                                    {c.comparison.deltaDegrees > 0
                                      ? bi('(تحسن في المدى)', '(Improved)')
                                      : c.comparison.deltaDegrees < 0
                                      ? bi('(تراجع في المدى)', '(Decreased)')
                                      : bi('(استقرار)', '(Stable)')}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded text-xs border border-amber-200">
                                  {isEn ? (c.comparison.reasonEn || 'Not directly comparable') : (c.comparison.reasonAr || 'غير قابلة للمقارنة المباشرة')}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* MMT Comparisons */}
                  {longitudinalMmtComparisons.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-indigo-900 flex items-center gap-1">
                        <Dumbbell className="w-3.5 h-3.5 text-indigo-600" />
                        <span>{bi('تطور القوة العضلية:', 'Muscle Strength (MMT) Progress:')}</span>
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {longitudinalMmtComparisons.map((c, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg bg-white border border-indigo-100 text-xs shadow-2xs space-y-1"
                          >
                            <div className="flex items-center justify-between font-bold text-slate-800">
                              <span>{c.muscleNameAr}</span>
                              <span className="text-xs text-slate-400">
                                {c.actionNameAr} ({c.laterality})
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-xs text-slate-600">
                              <span>
                                {bi(`الأساس (جلسة #${c.baselineSessionNumber}):`, `Baseline (S#${c.baselineSessionNumber}):`)}{' '}
                                <strong className="font-mono text-slate-800">{bi('درجة', 'Grade')} {c.baselineGrade}</strong>
                              </span>
                              <span>
                                {bi(`الأحدث (جلسة #${c.latestSessionNumber}):`, `Latest (S#${c.latestSessionNumber}):`)}{' '}
                                <strong className="font-mono text-slate-800">{bi('درجة', 'Grade')} {c.latestGrade}</strong>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div
            ref={sessionsVirtual.containerRef}
            onScroll={sessionsVirtual.onScroll}
            data-testid="episode-sessions-list"
            tabIndex={sessionsVirtual.isVirtualized ? 0 : undefined}
            aria-label={sessionsVirtual.isVirtualized ? bi('قائمة الجلسات', 'Sessions list') : undefined}
            className={
              sessionsVirtual.isVirtualized
                ? 'space-y-3 max-h-[70vh] overflow-y-auto pe-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                : 'space-y-3'
            }
          >
            {sessionsVirtual.topSpacerPx > 0 && (
              <div style={{ height: sessionsVirtual.topSpacerPx }} aria-hidden="true" />
            )}
            {visibleSessions.map((sess) => {
            const soap = soapCache[sess.id];
            const addendaCount = addendaCountCache[sess.id] || 0;
            const typeInfo = SESSION_TYPES[sess.sessionType] || SESSION_TYPES.follow_up;
            const statusInfo = SESSION_STATUSES[sess.status] || SESSION_STATUSES.draft;
            const attendanceInfo = ATTENDANCE_STATUSES[sess.attendanceStatus] || ATTENDANCE_STATUSES.attended;

            const isFinalized = sess.status === 'finalized';
            const isCancelled = sess.status === 'cancelled';

            const hasNeuroScreening = Boolean(
              soap?.data?.objective?.neuroScreening && (
                (soap.data.objective.neuroScreening.dermatomes && soap.data.objective.neuroScreening.dermatomes.length > 0) ||
                (soap.data.objective.neuroScreening.myotomes && soap.data.objective.neuroScreening.myotomes.length > 0) ||
                (soap.data.objective.neuroScreening.reflexes && soap.data.objective.neuroScreening.reflexes.length > 0)
              )
            );

            return (
              <div
                key={sess.id}
                className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                {/* Left Column: Number, Type, Date & Badges */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg text-xs tabular-nums font-bold bg-slate-900 text-white">
                      جلسة #{sess.sessionNumber}
                    </span>

                    {/* Session Type Badge */}
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${typeInfo.badgeClass}`}>
                      {typeInfo.ar}
                    </span>

                    {/* Status Badge */}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${statusInfo.badgeClass}`}>
                      {statusInfo.ar}
                    </span>

                    {/* Attendance Badge if not attended */}
                    {sess.attendanceStatus !== 'attended' && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${attendanceInfo.badgeClass}`}>
                        {attendanceInfo.ar}
                      </span>
                    )}

                    {/* Addenda count badge */}
                    {addendaCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                        <History className="w-3 h-3 text-amber-700" />
                        <span>{addendaCount} ملاحق</span>
                      </span>
                    )}

                    {/* Body Chart Markers Badge */}
                    {soap?.data?.subjective?.bodyChart?.markers && soap.data.subjective.bodyChart.markers.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-sky-50 text-sky-800 border border-sky-200 flex items-center gap-1">
                        <Activity className="w-3 h-3 text-sky-600" />
                        <span>{bi('مخطط الجسم', 'Body Chart')}: {soap.data.subjective.bodyChart.markers.length}</span>
                      </span>
                    )}

                    {/* ROM Measurements Badge */}
                    {soap?.data?.objective?.romBattery?.entries && soap.data.objective.romBattery.entries.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1">
                        <Compass className="w-3 h-3 text-teal-600" />
                        <span>ROM: {soap.data.objective.romBattery.entries.length}</span>
                      </span>
                    )}

                    {/* MMT Tests Badge */}
                    {soap?.data?.objective?.mmtBattery?.entries && soap.data.objective.mmtBattery.entries.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 flex items-center gap-1">
                        <Dumbbell className="w-3 h-3 text-indigo-600" />
                        <span>MMT: {soap.data.objective.mmtBattery.entries.length}</span>
                      </span>
                    )}

                    {/* Neuro Screening Badge */}
                    {hasNeuroScreening && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-violet-50 text-violet-800 border border-violet-200 flex items-center gap-1">
                        <Brain className="w-3 h-3 text-violet-600" />
                        <span>{bi('الفحص العصبي', 'Neuro Screening')}</span>
                      </span>
                    )}
                  </div>

                  {/* Metadata line */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <bdi dir="ltr">{formatDateDDMMYYYY(sess.sessionDate)}</bdi>
                    </span>
                    {sess.data.sessionTime && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <bdi dir="ltr">{sess.data.sessionTime}</bdi>
                      </span>
                    )}
                    {sess.data.sessionDurationMinutes && (
                      <span>({sess.data.sessionDurationMinutes} دقيقة)</span>
                    )}
                    {sess.data.therapistName && (
                      <span>• المعالج: <strong className="text-slate-700">{sess.data.therapistName}</strong></span>
                    )}
                  </div>

                  {/* Cancellation Reason if cancelled */}
                  {isCancelled && sess.data.cancellationReason && (
                    <p className="text-xs text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-200">
                      <strong>سبب الإلغاء:</strong> {sess.data.cancellationReason}
                    </p>
                  )}
                </div>

                {/* Right Column: Actions */}
                <div className="flex flex-wrap items-center gap-1.5 self-start md:self-center">
                  
                  {/* SOAP Documentation Button */}
                  <button
                    type="button"
                    onClick={() => handleOpenSoap(sess)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                      isFinalized
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                        : soap
                        ? 'bg-primary-50 text-primary-800 border-primary-300 hover:bg-primary-100'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {isFinalized ? (
                      <>
                        <Lock className="w-3.5 h-3.5 text-emerald-700" />
                        <span>{bi('عرض SOAP المعتمدة', 'View Finalized SOAP')}</span>
                      </>
                    ) : soap ? (
                      <>
                        <FileEdit className="w-3.5 h-3.5 text-primary-700" />
                        <span>{bi('تحرير مسودة SOAP', 'Edit Draft SOAP')}</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-3.5 h-3.5 text-slate-600" />
                        <span>{bi('توثيق SOAP', 'Document SOAP')}</span>
                      </>
                    )}
                  </button>

                  {/* Addenda Button (if finalized) */}
                  {isFinalized && (
                    <button
                      type="button"
                      onClick={() => handleOpenAddendum(sess)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-xl text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 transition-colors cursor-pointer"
                      title={bi('إضافة ملحق سريري وتصحيح للسجل المعتمد', 'Add clinical addendum')}
                    >
                      <History className="w-3.5 h-3.5 text-amber-700" />
                      <span>{addendaCount > 0 ? `الملاحق (${addendaCount})` : 'إضافة ملحق'}</span>
                    </button>
                  )}

                  {/* Edit Draft Session */}
                  {!isFinalized && !isCancelled && (
                    <button
                      type="button"
                      onClick={() => {
                        setSessionToEdit(sess);
                        setIsSessionModalOpen(true);
                      }}
                      className="p-1.5 min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                      title={bi('تعديل بيانات الجلسة الإدارية', 'Edit session details')}
                      aria-label={bi(`تعديل بيانات الجلسة #${sess.sessionNumber}`, `Edit session #${sess.sessionNumber}`)}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}

                  {/* Cancel Draft Session */}
                  {!isFinalized && !isCancelled && (
                    <button
                      type="button"
                      onClick={() => {
                        setSessionToCancel(sess);
                        setCancellationReasonInput('');
                        setCancelError(null);
                      }}
                      className="p-1.5 min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-rose-700 hover:text-rose-800 hover:bg-rose-50 transition-colors cursor-pointer"
                      title={bi('إلغاء الجلسة', 'Cancel session')}
                      aria-label={bi(`إلغاء الجلسة #${sess.sessionNumber}`, `Cancel session #${sess.sessionNumber}`)}
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}

                  {/* Delete Draft Session */}
                  {!isFinalized && (
                    <button
                      type="button"
                      onClick={() => setSessionToDelete(sess)}
                      className="p-1.5 min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-600 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                      title={bi('حذف مسودة الجلسة غير المعتمدة', 'Delete draft session')}
                      aria-label={bi(`حذف مسودة الجلسة #${sess.sessionNumber}`, `Delete draft session #${sess.sessionNumber}`)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                </div>
              </div>
            );
          })}
            {sessionsVirtual.bottomSpacerPx > 0 && (
              <div style={{ height: sessionsVirtual.bottomSpacerPx }} aria-hidden="true" />
            )}
          </div>
        </div>
      )}

      {/* Session Modal (Create / Edit) */}
      {isSessionModalOpen && (
        <SessionModal
          isOpen={isSessionModalOpen}
          onClose={() => setIsSessionModalOpen(false)}
          onSave={handleSaveSession}
          episode={episode}
          sessionToEdit={sessionToEdit}
          existingSessionCount={sessions.length}
          nextSessionNumber={SessionService.computeNextSessionNumber(sessions)}
        />
      )}

      {/* SOAP Modal (Draft / View / Finalize) */}
      {isSoapModalOpen && activeSessionForSoap && (
        <SoapModal
          isOpen={isSoapModalOpen}
          onClose={() => {
            setIsSoapModalOpen(false);
            setActiveSessionForSoap(null);
          }}
          session={activeSessionForSoap}
          episode={episode}
          patient={patient}
          existingSoap={soapCache[activeSessionForSoap.id] || null}
          onSaveSoap={handleSaveSoap}
          onFinalizeSession={handleFinalizeSession}
          onOpenAddendumModal={() => {
            const s = activeSessionForSoap;
            setIsSoapModalOpen(false);
            if (s) handleOpenAddendum(s);
          }}
        />
      )}

      {/* Addendum Modal */}
      {isAddendumModalOpen && activeSessionForAddendum && (
        <AddendumModal
          isOpen={isAddendumModalOpen}
          onClose={() => {
            setIsAddendumModalOpen(false);
            setActiveSessionForAddendum(null);
          }}
          session={activeSessionForAddendum}
          existingAddenda={addendaListForActiveSession}
          onAddAddendum={handleSaveAddendum}
        />
      )}

      {/* Episode Discharge Modal */}
      {isDischargeModalOpen && (
        <EpisodeDischargeModal
          isOpen={isDischargeModalOpen}
          onClose={() => setIsDischargeModalOpen(false)}
          episode={episode}
          onConfirmDischarge={async (dischargeInfo) => {
            await closeEpisode(episode.id, dischargeInfo);
            setIsDischargeModalOpen(false);
          }}
        />
      )}

      {/* Cancellation Dialog Prompt */}
      {sessionToCancel && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="episode-cancel-modal-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setSessionToCancel(null);
            }
          }}
          className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-card border border-rose-500/30 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h2 id="episode-cancel-modal-title" className="text-base font-bold text-foreground">
              {bi(`إلغاء الجلسة #${sessionToCancel.sessionNumber}`, `Cancel Session #${sessionToCancel.sessionNumber}`)}
            </h2>

            <p className="text-xs text-muted-foreground-1 leading-relaxed">
              {bi(
                'يرجى تحديد سبب الإلغاء ونوع التخلف لحفظه في السجل السريري للمريض:',
                'Select cancellation category and reason to record in the patient chart:'
              )}
            </p>

            <div className="space-y-3">
              <div>
                <label htmlFor="episode-cancel-type" className="block text-xs font-bold text-foreground mb-1">
                  {bi('جهة الإلغاء:', 'Cancellation Type:')}
                </label>
                <select
                  id="episode-cancel-type"
                  value={cancellationType}
                  onChange={(e) =>
                    setCancellationType(
                      e.target.value as 'cancelled_patient' | 'cancelled_clinic' | 'no_show'
                    )
                  }
                  className="w-full px-3 py-2 text-xs bg-layer border border-layer-line text-foreground rounded-xl focus:outline-none focus:border-primary"
                >
                  <option value="cancelled_patient">{bi('ألغيت من قبل المريض', 'Cancelled by Patient')}</option>
                  <option value="cancelled_clinic">{bi('ألغيت من قبل العيادة', 'Cancelled by Clinic')}</option>
                  <option value="no_show">{bi('تخلف عن الحضور دون إشعار (No Show)', 'No Show')}</option>
                </select>
              </div>

              <div>
                <label htmlFor="episode-cancel-reason" className="block text-xs font-bold text-foreground mb-1">
                  {bi('سبب الإلغاء بالتفصيل', 'Detailed Reason')}{' '}
                  <span className="text-rose-700 dark:text-rose-400">*</span>:
                </label>
                <textarea
                  id="episode-cancel-reason"
                  value={cancellationReasonInput}
                  onChange={(e) => {
                    setCancellationReasonInput(e.target.value);
                    setCancelError(null);
                  }}
                  placeholder={bi('اكتب سبب الإلغاء هنا...', 'Enter reason...')}
                  rows={2}
                  className="w-full px-3 py-2 text-xs bg-layer border border-layer-line text-foreground rounded-xl focus:outline-none focus:border-primary"
                  required
                />
              </div>

              {cancelError && (
                <p role="alert" className="text-xs font-semibold text-rose-700 dark:text-rose-400">
                  {cancelError}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleConfirmCancelSession}
                disabled={!cancellationReasonInput.trim()}
                className="flex-1 py-2 min-h-[36px] bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                {bi('تأكيد إلغاء الجلسة', 'Confirm Cancellation')}
              </button>
              <button
                type="button"
                onClick={() => setSessionToCancel(null)}
                className="px-4 py-2 min-h-[36px] bg-layer border border-layer-line text-foreground rounded-xl text-xs font-semibold hover:bg-layer-hover cursor-pointer"
              >
                {bi('تراجع', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draft Delete Confirmation Dialog */}
      {sessionToDelete && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="episode-delete-modal-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setSessionToDelete(null);
            }
          }}
          className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-card border border-rose-500/30 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h2 id="episode-delete-modal-title" className="text-base font-bold text-foreground">
              {bi(`حذف مسودة الجلسة #${sessionToDelete.sessionNumber}`, `Delete Draft Session #${sessionToDelete.sessionNumber}`)}
            </h2>
            <p className="text-xs text-muted-foreground-1 leading-relaxed">
              {bi(
                'هل أنت متأكد من حذف مسودة الجلسة غير المعتمدة؟ لا يمكن التراجع عن هذا الإجراء.',
                'Are you sure you want to delete this draft session? This action cannot be undone.'
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  const targetId = sessionToDelete.id;
                  setSessionToDelete(null);
                  try {
                    await deleteSession(targetId);
                    await fetchSessionsAndNotes();
                  } catch (err: unknown) {
                    setError(err instanceof Error ? err.message : bi('فشل حذف المسودة.', 'Failed to delete draft session.'));
                  }
                }}
                className="flex-1 py-2 min-h-[36px] bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                {bi('تأكيد الحذف', 'Confirm Delete')}
              </button>
              <button
                type="button"
                onClick={() => setSessionToDelete(null)}
                className="px-4 py-2 min-h-[36px] bg-layer border border-layer-line text-foreground rounded-xl text-xs font-semibold hover:bg-layer-hover cursor-pointer"
              >
                {bi('تراجع', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
