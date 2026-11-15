// =======================================================================
// PhysioRecord — Patient Workspace (Responsive Split-Pane)
// Desktop (xl+): Permanent Summary Sidebar + Main Chart
// Mobile & Tablet (< xl): Full-Width Main Chart + Slide-Over Episodes/Sessions Drawer
// =======================================================================

import React, { useState, useEffect } from 'react';
import { useVault } from '../../context/VaultContext';
import { usePatients } from '../../context/PatientContext';
import { EpisodeService } from '../../services/episodeService';
import { SessionService } from '../../services/sessionService';
import type { PatientRecord, EpisodeRecord, SessionRecord } from '../../types/clinical';
import { PatientBanner } from './PatientBanner';
import { MasterPatientChart } from './MasterPatientChart';
import { TreatmentSessionView } from './TreatmentSessionView';
import { EpisodeModal } from '../EpisodeModal';
import { SessionModal } from '../SessionModal';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import type { FinishUndoSnapshot } from '../../types/clinicManagement';

interface PatientWorkspaceProps {
  patient: PatientRecord;
  onBackToDirectory: () => void;
  initialSessionId?: string | null;
  initialAutoOpenFinish?: boolean;
  onFinishCompleted?: (
    undoSnapshot: FinishUndoSnapshot,
    summaryAr: string,
    summaryEn: string
  ) => void;
}

export const PatientWorkspace: React.FC<PatientWorkspaceProps> = ({
  patient,
  onBackToDirectory,
  initialSessionId = null,
  initialAutoOpenFinish = false,
  onFinishCompleted,
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
    window.addEventListener('physiorecord-patient-back', handleHardwarePatientBack);
    return () => window.removeEventListener('physiorecord-patient-back', handleHardwarePatientBack);
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

  const episodeSessions = activeEpisode
    ? sessions.filter((s) => s.episodeId === activeEpisode.id)
    : sessions;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background transition-colors relative">
      {/* Persistent Sticky Patient Banner across Desktop & Mobile (Never hidden in a drawer) */}
      <PatientBanner patient={resolvedPatient} onBackToDirectory={onBackToDirectory} />

      {/* Single Patient Column Workspace */}
      <div className="flex-1 flex flex-col overflow-hidden relative bg-background">
        {activeSession ? (
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
          />
        ) : (
          <MasterPatientChart
            patient={resolvedPatient}
            episodes={episodes}
            sessions={sessions}
            selectedEpisodeId={selectedEpisodeId}
            onSelectEpisode={(epId) => setSelectedEpisodeId(epId)}
            onOpenSession={(sessId) => setSelectedSessionId(sessId)}
            onOpenNewSession={() => setIsSessionDrawerOpen(true)}
            onOpenNewEpisode={() => setIsEpisodeDrawerOpen(true)}
            onBackToDirectory={onBackToDirectory}
            onPatientUpdated={loadPatientClinicalData}
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
