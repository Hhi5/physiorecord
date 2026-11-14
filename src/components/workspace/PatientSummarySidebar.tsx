// =======================================================================
// PhysioRecord — Patient Summary & Clinical Trajectory Sidebar
// Responsive across Desktop Split-Pane and Mobile/Tablet Slide-Over Drawer
// =======================================================================

import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import {
  computePatientAge,
  formatDateDDMMYYYY,
  formatIraqiPhoneDisplay,
} from '../../utils/date';
import {
  getPatientMrn,
  getPatientDisplayName,
  getPatientSecondaryName,
  isDemoPatient,
  hasPatientRedFlagsOrContraindications,
} from '../../utils/mrn';
import { DemoBadge, Num } from '../ui/Primitives';
import type { PatientRecord, EpisodeRecord, SessionRecord } from '../../types/clinical';
import {
  Activity,
  Plus,
  FolderOpen,
  Phone,
  ShieldAlert,
  X,
} from 'lucide-react';

interface PatientSummarySidebarProps {
  patient: PatientRecord;
  episodes: EpisodeRecord[];
  sessions: SessionRecord[];
  selectedEpisodeId: string | null;
  onSelectEpisode: (episodeId: string) => void;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onOpenNewEpisode: () => void;
  onOpenNewSession: () => void;
  onCloseMobileDrawer?: () => void;
}

export const PatientSummarySidebar: React.FC<PatientSummarySidebarProps> = ({
  patient,
  episodes,
  sessions,
  selectedEpisodeId,
  onSelectEpisode,
  selectedSessionId,
  onSelectSession,
  onOpenNewEpisode,
  onOpenNewSession,
  onCloseMobileDrawer,
}) => {
  const { language, bi } = useLanguage();

  const d = patient.data;

  // Filter sessions for the selected episode
  const activeSessions = selectedEpisodeId
    ? sessions.filter((s) => s.episodeId === selectedEpisodeId)
    : sessions;

  return (
    <div className="w-80 sm:w-88 bg-card border-e border-card-line flex flex-col h-full shrink-0 overflow-hidden select-none transition-colors">
      {/* Patient Header Card */}
      <div className="p-4 border-b border-card-divider bg-muted/40 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-11 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-base shrink-0">
              {d.fullName ? d.fullName.charAt(0) : 'P'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-foreground truncate">
                  {getPatientDisplayName(d, language)}
                </h2>
                {isDemoPatient(patient) && <DemoBadge />}
              </div>
              {getPatientSecondaryName(d, language) && (
                <p className="text-xs text-muted-foreground-2 truncate">
                  <bdi>{getPatientSecondaryName(d, language)}</bdi>
                </p>
              )}
              <p className="text-xs text-muted-foreground-1 font-mono tabular-nums">
                <bdi dir="ltr">{getPatientMrn(patient)}</bdi>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="py-0.5 px-2 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              {patient.isArchived
                ? bi('مؤرشف', 'Archived', 'ئەرشیفکراو')
                : bi('نشط', 'Active', 'چالاک')}
            </span>
            {onCloseMobileDrawer && (
              <button
                type="button"
                onClick={onCloseMobileDrawer}
                className="xl:hidden min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl bg-layer border border-layer-line text-layer-foreground cursor-pointer"
                aria-label={bi('إغلاق القائمة', 'Close drawer', 'داخستنی لیست')}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Quick demographics row */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground-1 font-medium tabular-nums">
          {d.gender && (
            <span className="py-0.5 px-2 rounded-md bg-surface border border-line-2 text-foreground">
              {d.gender === 'male'
                ? bi('ذكر', 'Male', 'نێر')
                : bi('أنثى', 'Female', 'مێ')}
            </span>
          )}
          {computePatientAge(d.dateOfBirth, d.age) !== undefined && (
            <>
              <span>·</span>
              <span>
                <Num value={computePatientAge(d.dateOfBirth, d.age)} /> {bi('سنة', 'yrs', 'ساڵ')}
              </span>
            </>
          )}
          {d.dateOfBirth && (
            <>
              <span>·</span>
              <span>
                <bdi dir="ltr">{formatDateDDMMYYYY(d.dateOfBirth)}</bdi>
              </span>
            </>
          )}
          {(d.phone || d.phoneNumber) && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1 tabular-nums">
                <Phone className="size-3 text-muted-foreground-1" />
                <bdi dir="ltr">{formatIraqiPhoneDisplay(d.phone || d.phoneNumber)}</bdi>
              </span>
            </>
          )}
        </div>

        {/* Medical Alerts / Red Flags Banner (Only when truly flagged) */}
        {hasPatientRedFlagsOrContraindications(d) && (
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2 text-xs">
            <ShieldAlert className="size-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-900 dark:text-rose-200 leading-snug">
              <span className="font-bold">{bi('علامة حمراء / تنبيه: ', 'Red Flag: ', 'ئاڵای سوور / ئاگاداری: ')}</span>
              <span>{d.redFlags || d.contraindications || d.precautions}</span>
            </div>
          </div>
        )}
      </div>

      {/* Episodes of Care Section */}
      <div className="p-3.5 border-b border-card-divider space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground-1">
            <FolderOpen className="size-3.5 text-primary" />
            <span>{bi('الحالات العلاجية', 'Episodes of Care', 'قۆناغەکانی چاودێری')}</span>
          </div>

          <button
            type="button"
            onClick={onOpenNewEpisode}
            className="size-8 flex items-center justify-center rounded-lg text-primary hover:bg-primary/10 transition-colors cursor-pointer"
            title={bi('بدء حالة علاجية جديدة', 'New episode', 'دەستپێکردنی قۆناغێکی نوێ')}
          >
            <Plus className="size-4" />
          </button>
        </div>

        {/* Episodes List */}
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {episodes.map((ep) => {
            const isSelected = selectedEpisodeId === ep.id;
            return (
              <button
                key={ep.id}
                type="button"
                onClick={() => onSelectEpisode(ep.id)}
                className={`w-full min-h-[44px] text-start p-2.5 rounded-xl text-xs font-medium transition-all flex items-center justify-between gap-2 cursor-pointer border ${
                  isSelected
                    ? 'bg-primary/10 border-primary text-foreground shadow-2xs'
                    : 'bg-surface/60 border-line-2 text-muted-foreground-1 hover:bg-surface hover:text-foreground'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-bold truncate text-xs text-foreground">
                    {ep.data.title || ep.data.medicalDiagnosis}
                  </p>
                  <p className="text-xs text-muted-foreground-1 tabular-nums mt-0.5">
                    <bdi dir="ltr">{formatDateDDMMYYYY(ep.data.startDate || ep.startDate)}</bdi> · {ep.data.status || ep.status}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sessions Timeline List */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground-1">
            <Activity className="size-3.5 text-primary" />
            <span>{bi('سجل الجلسات العلاجية', 'Sessions Timeline', 'تۆماری دانیشتنەکان')}</span>
          </div>

          <button
            type="button"
            onClick={onOpenNewSession}
            disabled={!selectedEpisodeId}
            className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer ${
              selectedEpisodeId
                ? 'bg-primary hover:bg-primary-hover text-primary-foreground shadow-2xs'
                : 'cursor-not-allowed bg-surface text-muted-foreground-2 border border-line-2'
            }`}
          >
            <Plus className="size-3.5" />
            <span>{bi('جلسة جديدة', 'New', 'دانیشتنی نوێ')}</span>
          </button>
        </div>

        {activeSessions.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground-1 italic bg-surface/50 rounded-xl border border-dashed border-line-2">
            {bi(
              'لا توجد جلسات موثقة في هذه الحالة بعد. انقر على "+ جلسة جديدة".',
              'No sessions recorded yet. Click "+ New".',
              'هێشتا هیچ دانیشتنێک لەم قۆناغەدا تۆمار نەکراوە. کلیک لە "+ دانیشتنی نوێ" بکە.'
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {activeSessions.map((session) => {
              const isSelected = selectedSessionId === session.id;
              const sNumber = session.sessionNumber ?? session.data?.sessionNumber ?? 1;
              const sDate = session.sessionDate ?? session.data?.sessionDate ?? '';
              const sStatus = session.status ?? session.data?.status ?? 'draft';
              const sType = session.sessionType ?? session.data?.sessionType ?? 'follow_up';

              return (
                <div
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectSession(session.id);
                    }
                  }}
                  className={`p-3 rounded-xl border transition-all cursor-pointer space-y-1.5 focus:outline-none focus:ring-2 focus:ring-primary/25 ${
                    isSelected
                      ? 'bg-primary/10 border-primary ring-1 ring-primary/30 text-foreground'
                      : 'bg-surface/40 border-line-2 hover:bg-surface text-muted-foreground-2'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs tabular-nums">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      <span className="text-primary font-mono font-bold">
                        <bdi dir="ltr">#{sNumber}</bdi>
                      </span>
                      <bdi dir="ltr">{formatDateDDMMYYYY(sDate)}</bdi>
                    </span>

                    <span
                      className={`py-0.5 px-2 rounded-full text-xs font-semibold border ${
                        sStatus === 'finalized'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                          : 'bg-surface text-muted-foreground-1 border-line-2'
                      }`}
                    >
                      {sStatus === 'finalized'
                        ? bi('معتمدة', 'Finalized', 'پەسەندکراو')
                        : sStatus === 'cancelled'
                        ? bi('ملغاة', 'Cancelled', 'هەڵوەشێنراو')
                        : bi('مسودة', 'Draft', 'ڕەشنووس')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground-1 tabular-nums">
                    <span className="truncate max-w-[150px]">
                      {sType === 'initial_evaluation'
                        ? bi('تقييم أولي', 'Initial Eval', 'هەڵسەنگاندنی سەرەتایی')
                        : sType === 'follow_up'
                        ? bi('جلسة متابعة', 'Follow-up', 'دانیشتنی بەدواداچوون')
                        : sType === 're_evaluation'
                        ? bi('إعادة تقييم', 'Re-eval', 'دووبارە هەڵسەنگاندن')
                        : sType}
                    </span>
                    <span className="text-xs font-mono">
                      {session.data?.sessionDurationMinutes ? `${session.data.sessionDurationMinutes}m` : '45m'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
