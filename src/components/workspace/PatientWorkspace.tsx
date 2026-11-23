// =======================================================================
// PhysioRecord — Patient Workspace (Responsive Split-Pane)
// Desktop (xl+): Permanent Summary Sidebar + Main Chart
// Mobile & Tablet (< xl): Full-Width Main Chart + Slide-Over Episodes/Sessions Drawer
// =======================================================================

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useVault } from '../../context/VaultContext';
import { usePatients } from '../../context/PatientContext';
import { EpisodeService } from '../../services/episodeService';
import { SessionService } from '../../services/sessionService';
import type { PatientRecord, EpisodeRecord, SessionRecord } from '../../types/clinical';
import { PatientBanner } from './PatientBanner';
import { MasterPatientChart } from './MasterPatientChart';
import { EpisodeModal } from '../patients/EpisodeModal';
import { SessionModal } from '../patients/SessionModal';

const TreatmentSessionView = lazy(() =>
  import('./TreatmentSessionView').then((m) => ({ default: m.TreatmentSessionView }))
);
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import type { FinishUndoSnapshot } from '../../types/clinicManagement';

interface PatientWorkspaceProps {
  patient: PatientRecord;
  onBackToDirectory: () => void;
  initialSessionId?: string | null;
  initialAutoOpenFinish?: boolean;
  onFocusModeChange?: (active: boolean) => void;
  onActiveSessionChange?: (active: boolean) => void;
  onFinishCompleted?: (
    undoSnapshot: FinishUndoSnapshot,
    summaryAr: string,
    summaryEn: string
  ) => void;
  onStartChartTour?: () => void;
  onStartSessionTour?: () => void;
}

export const PatientWorkspace: React.FC<PatientWorkspaceProps> = ({
  patient,
  onBackToDirectory,
  initialSessionId = null,
  initialAutoOpenFinish = false,
  onFocusModeChange,
  onActiveSessionChange,
  onFinishCompleted,
  onStartChartTour,
  onStartSessionTour,
}) => {
  const { dek } = useVault();
  const { loadFullPatientById } = usePatients();
  const [resolvedPatient, setResolvedPatient] = useState<PatientRecord>(patient);

  useEffect(() => {
    setResolvedPatient(patient);
    if (!patient.id || !dek) return;
    if (!patient.isSummaryOnly) return;
    let active = true;
    void loadFullPatientById(patient.id).then((full) => {
      if (active && full) {
        setResolvedPatient(full);
      }
    });
    return () => {
      active = false;
    };
  }, [patient, dek, loadFullPatientById]);

  const [episodes, setEpisodes] = useState<EpisodeRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(initialSessionId);
  const [autoOpenFinish, setAutoOpenFinish] = useState<boolean>(initialAutoOpenFinish);

  useEffect(() => {
    setSelectedSessionId(initialSessionId || null);
    setAutoOpenFinish(Boolean(initialAutoOpenFinish));
  }, [patient.id, initialSessionId, initialAutoOpenFinish]);

  useEffect(() => {
    ClinicOperationsService.recordPatientVisitMemory(patient.id);
  }, [patient.id]);

  useEffect(() => {
    const handleHardwarePatientBack = () => {
      if (selectedSessionId) {
        setAutoOpenFinish(false);
        setSelectedSessionId(null);
      } else {
        onBackToDirectory();
      }
    };
    const handleCloseSessionForChartTour = () => {
      setAutoOpenFinish(false);
      setSelectedSessionId(null);
    };
    window.addEventListener('physiorecord-patient-back', handleHardwarePatientBack);
    window.addEventListener('physiorecord-chart-close-session', handleCloseSessionForChartTour);
    return () => {
      window.removeEventListener('physiorecord-patient-back', handleHardwarePatientBack);
      window.removeEventListener('physiorecord-chart-close-session', handleCloseSessionForChartTour);
    };
  }, [selectedSessionId, onBackToDirectory]);

  // Drawers
  const [isEpisodeDrawerOpen, setIsEpisodeDrawerOpen] = useState(false);
  const [isSessionDrawerOpen, setIsSessionDrawerOpen] = useState(false);

  const loadPatientClinicalData = async () => {
    if (!dek || !patient.id) return;
    try {
      const epList = await EpisodeService.getEpisodesByPatient(patient.id, dek);
      setEpisodes(epList);

      let activeEpId = selectedEpisodeId;
      if (!activeEpId && epList.length > 0) {
        const firstActive = epList.find((e) => e.data.status === 'active') || epList[0];
        activeEpId = firstActive.id;
        setSelectedEpisodeId(activeEpId);
      }

      const allSessions: SessionRecord[] = [];
      for (const ep of epList) {
        const epSessions = await SessionService.getSessionsByEpisode(ep.id, dek);
        allSessions.push(...epSessions);
      }
      setSessions(allSessions);
    } catch (err) {
      console.error('Failed to load patient clinical data:', err);
    }
  };

  useEffect(() => {
    loadPatientClinicalData();
  }, [patient.id, dek]);

  const activeEpisode = episodes.find((e) => e.id === selectedEpisodeId) || episodes[0];
  const activeSession = sessions.find((s) => s.id === selectedSessionId);

  useEffect(() => {
    onActiveSessionChange?.(Boolean(activeSession));
    return () => {
      onActiveSessionChange?.(false);
    };
  }, [activeSession, onActiveSessionChange]);

  useEffect(() => {
    const inActiveTreatmentFocus = Boolean(
      activeSession && activeSession.data.status === 'draft'
    );
    onFocusModeChange?.(inActiveTreatmentFocus);
    return () => {
      onFocusModeChange?.(false);
    };
  }, [activeSession, onFocusModeChange]);

  const episodeSessions = activeEpisode
    ? sessions.filter((s) => s.episodeId === activeEpisode.id)
    : sessions;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background-1 transition-colors relative">
      {/* Sticky Patient Banner during active treatment session */}
      {Boolean(activeSession) && (
        <PatientBanner patient={resolvedPatient} onBackToDirectory={onBackToDirectory} />
      )}

      {/* Single Patient Column Workspace */}
      <div className="flex-1 flex flex-col overflow-hidden relative bg-transparent">
        {activeSession ? (
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center p-6 text-xs text-muted-foreground-1">
                ...
              </div>
            }
          >
            <TreatmentSessionView
              session={activeSession}
              patientId={resolvedPatient.id}
              patientName={resolvedPatient.data.fullName}
              episodeTitle={
                activeEpisode?.data.title || activeEpisode?.data.medicalDiagnosis || 'Episode'
              }
              initialAutoOpenFinish={autoOpenFinish}
              onFinishCompleted={(snap, msgAr, msgEn) => {
                setAutoOpenFinish(false);
                onFinishCompleted?.(snap, msgAr, msgEn);
              }}
              onBack={() => {
                setAutoOpenFinish(false);
                setSelectedSessionId(null);
              }}
              onOpenMasterChart={() => {
                setAutoOpenFinish(false);
                setSelectedSessionId(null);
              }}
              onSessionUpdated={loadPatientClinicalData}
              onSessionDeleted={() => {
                setAutoOpenFinish(false);
                setSelectedSessionId(null);
                void loadPatientClinicalData();
              }}
              onStartSessionTour={onStartSessionTour}
            />
          </Suspense>
        ) : (
          <MasterPatientChart
            patient={resolvedPatient}
            episodes={episodes}
            sessions={sessions}
            selectedEpisodeId={selectedEpisodeId}
            onSelectEpisode={(epId) => setSelectedEpisodeId(epId)}
            onOpenSession={(sessId) => setSelectedSessionId(sessId)}
            onOpenNewSession={() => {
              if (activeEpisode) {
                setIsSessionDrawerOpen(true);
              } else {
                setIsEpisodeDrawerOpen(true);
              }
            }}
            onOpenNewEpisode={() => setIsEpisodeDrawerOpen(true)}
            onBackToDirectory={onBackToDirectory}
            onPatientUpdated={loadPatientClinicalData}
            onStartChartTour={onStartChartTour}
          />
        )}
      </div>

      {/* Episode Creation Modal */}
      {isEpisodeDrawerOpen && (
        <EpisodeModal
          isOpen={isEpisodeDrawerOpen}
          onClose={() => setIsEpisodeDrawerOpen(false)}
          patient={resolvedPatient}
          onSaved={async (epData) => {
            if (!dek) return;
            try {
              const created = await EpisodeService.createEpisode(patient.id, epData.data, dek);
              setEpisodes((prev) => [created, ...prev]);
              setSelectedEpisodeId(created.id);
            } catch (err) {
              console.error('Failed to create episode from modal:', err);
            }
          }}
        />
      )}

      {/* Session Creation Modal */}
      {isSessionDrawerOpen && activeEpisode && (
        <SessionModal
          isOpen={isSessionDrawerOpen}
          onClose={() => setIsSessionDrawerOpen(false)}
          episode={activeEpisode}
          existingSessionCount={episodeSessions.length}
          nextSessionNumber={SessionService.computeNextSessionNumber(episodeSessions)}
          onSave={async (sessPayload) => {
            if (!dek) return;
            const created = await SessionService.createSession(
              patient.id,
              activeEpisode.id,
              sessPayload,
              dek
            );
            setSessions((prev) => [created, ...prev]);
            setSelectedSessionId(created.id);
          }}
        />
      )}
    </div>
  );
};
