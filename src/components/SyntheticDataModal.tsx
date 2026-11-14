// =======================================================================
// PhysioRecord — Synthetic Clinical Demonstration Data Modal
// Conforms to shadcn/ui visual standards & strict cryptographic invariants
// =======================================================================

import React, { useState } from 'react';
import { db } from '../db/db';
import { usePatients } from '../context/PatientContext';
import { useVault } from '../context/VaultContext';
import { useLanguage } from '../context/LanguageContext';
import {
  SYNTHETIC_PATIENTS,
  generateSyntheticIraqiPatients,
  SYNTHETIC_DATA_LICENSE,
} from '../data/syntheticPatients';
import { EpisodeService } from '../services/episodeService';
import { SessionService } from '../services/sessionService';
import { SoapService } from '../services/soapService';
import { ClinicOperationsService } from '../services/clinicOperationsService';
import { computePatientAge } from '../utils/date';
import { hasAnyDemoPatients } from '../utils/mrn';
import { DemoBadge } from './ui/Primitives';
import { X, Database, ShieldCheck, Sparkles, CheckCircle2, Trash2 } from 'lucide-react';
import type {
  EpisodeClinicalData,
  SessionClinicalData,
  SoapNoteData,
} from '../types/clinical';

interface SyntheticDataModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SyntheticDataModal: React.FC<SyntheticDataModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { patients, savePatient, deleteAllDemoPatients, refreshPatients } = usePatients();
  const { dek } = useVault();
  const { bi, isRtl } = useLanguage();
  const [seeding, setSeeding] = useState(false);
  const [deletingDemo, setDeletingDemo] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [deletedNotice, setDeletedNotice] = useState(false);
  const [confirmDeleteDemo, setConfirmDeleteDemo] = useState(false);
  const [seedCount, setSeedCount] = useState<5 | 10>(5);
  const [publicDemoEnabled, setPublicDemoEnabled] = useState<boolean>(() =>
    ClinicOperationsService.isPublicDemoModeEnabled()
  );

  React.useEffect(() => {
    const syncDemo = () => {
      setPublicDemoEnabled(ClinicOperationsService.isPublicDemoModeEnabled());
    };
    syncDemo();
    const unsub = ClinicOperationsService.subscribe(syncDemo);
    window.addEventListener('physiorecord-demo-data-changed', syncDemo);
    return () => {
      unsub();
      window.removeEventListener('physiorecord-demo-data-changed', syncDemo);
    };
  }, [isOpen]);

  const targetPatients = React.useMemo(
    () => generateSyntheticIraqiPatients({ count: seedCount }),
    [seedCount]
  );

  const hasDemoRecords =
    hasAnyDemoPatients(patients) || ClinicOperationsService.hasDemoOperationsData();

  const handleDeleteAllDemo = async () => {
    setDeletingDemo(true);
    setSuccessCount(null);
    setDeletedNotice(false);
    try {
      await deleteAllDemoPatients();
      ClinicOperationsService.deleteAllDemoOperationsData();
      await refreshPatients();
      setDeletedNotice(true);
      setConfirmDeleteDemo(false);
      window.dispatchEvent(new CustomEvent('physiorecord-demo-data-changed'));
    } catch (err) {
      console.error('Failed to delete demo data:', err);
    } finally {
      setDeletingDemo(false);
    }
  };

  const handleSeedAll = async () => {
    setSeeding(true);
    setSuccessCount(null);
    try {
      let count = 0;
      const casesToSeed = generateSyntheticIraqiPatients({ count: seedCount });
      for (let i = 0; i < casesToSeed.length; i++) {
        const { id: fixedId, ...patientData } = casesToSeed[i];
        if (!fixedId) {
          continue;
        }
        // Check both IndexedDB by fixed ID and in-memory decrypted patients by name
        const existingById = await db.patients.get(fixedId);
        const existingByName = patients.find(
          (p) =>
            p.id === fixedId ||
            p.data.fullNameAr === patientData.fullNameAr ||
            p.data.fullName === patientData.fullName
        );
        // Never overwrite an existing patient record
        if (existingById || existingByName) {
          continue;
        }
        const savedPatient = await savePatient(patientData, fixedId);
        count++;

        // For Patient 1 (Ahmed Al-Shammari - Knee ACL Rehab), seed Episode of Care + 2 Sessions + Full SOAP notes
        // Demonstrating Body Chart, ROM/MMT Batteries, and Longitudinal Progress Tracking
        if (i === 0 && dek) {
          try {
            const existingEpisodes = await EpisodeService.getEpisodesByPatient(savedPatient.id, dek);
            let episode = existingEpisodes.find((e) => e.status !== 'archived');

            if (!episode) {
              const episodeData: EpisodeClinicalData = {
                title: 'إعادة تأهيل الركبة اليمنى بعد ترميم الرباط الصليبي (Right ACL Rehab)',
                status: 'active',
                startDate: '2026-03-01',
                onsetDate: '2026-03-01',
                medicalDiagnosis: 'تمزق كامل بالرباط الصليبي الأمامي الأيمن بعد الجراحة التعويضية (ACL Reconstruction)',
                affectedBodyRegion: 'الركبة اليمنى',
                primarySpecialty: 'musculoskeletal',
                clinicalImpression: 'مرحلة التأهيل الحركي المبكر بعد الجراحة: عجز ثني وبسط وضعف رباعية الرؤوس',
                rehabilitationGoals: {
                  shortTerm: [
                    'استعادة عطف الركبة حتى 120 درجة',
                    'تحقيق الامتداد الكامل 0 درجة',
                    'تنشيط الرباعية دون عجز',
                  ],
                  longTerm: [
                    'العودة للمشي الطبيعي دون عرج',
                    'استعادة القوة العضلية والعودة للنشاط الرياضي',
                  ],
                },
              };

              episode = await EpisodeService.createEpisode(savedPatient.id, episodeData, dek);
            }

            const existingSessions = await SessionService.getSessionsByEpisode(episode.id, dek);
            if (existingSessions.length === 0) {
              // Session 1: Initial Evaluation
              const session1Data: Partial<SessionClinicalData> = {
                sessionDate: '2026-03-01',
                sessionTime: '09:00',
                sessionDurationMinutes: 60,
                therapistName: 'د. عبد الله الصالح',
                administrativeNotes: 'التقييم الأولي الشامل للركبة اليمنى، توثيق مخطط الجسم والشكاوى، وتسجيل قياسات ROM و MMT الأساسية.',
              };

              const session1 = await SessionService.createSession(
                savedPatient.id,
                episode.id,
                {
                  ...session1Data,
                  sessionType: 'initial_evaluation',
                  attendanceStatus: 'attended',
                },
                dek
              );

              const soap1Data: SoapNoteData = {
                subjective: {
                  chiefComplaint: 'ألم وتيبس وصعوبة ثني الركبة اليمنى بعد جراحة ترميم الرباط الصليبي.',
                  painNrsScore: 6,
                  postSessionPainNrs: 4,
                  bodyChart: {
                    chartVersion: '1.0.0',
                    markers: [
                      {
                        markerId: 'mk-knee-postop',
                        symptomType: 'pain_sharp',
                        view: 'anterior',
                        xPercent: 42.0,
                        yPercent: 72.0,
                        anatomicalRegionCode: 'knee_right',
                        anatomicalRegionLabelAr: 'الركبة اليمنى',
                        severityNrs: 6,
                        description: 'ألم حاد موضعي حول الشق الجراحي لمفصل الركبة',
                        createdAt: '2026-03-01T09:15:00.000Z',
                      },
                      {
                        markerId: 'mk-knee-stiff',
                        symptomType: 'stiffness',
                        view: 'posterior',
                        xPercent: 42.0,
                        yPercent: 72.0,
                        anatomicalRegionCode: 'knee_right',
                        anatomicalRegionLabelAr: 'الحفرة المأبضية خلف الركبة',
                        severityNrs: 7,
                        description: 'شعور بشد وتيبس ملحوظ خلف الركبة عند محاولة الثني',
                        createdAt: '2026-03-01T09:16:00.000Z',
                      },
                    ],
                    clinicianSummaryNotes: 'أعراض الألم والشد حول مفصل الركبة اليمنى مع تيبس خلفي ناجم عن أثر وثني أوتار الركبة.',
                    lastUpdatedAt: '2026-03-01T09:20:00.000Z',
                  },
                },
                objective: {
                  status: 'assessed',
                  clinicalObservations: 'مشية مع عرج خفيف واستخدام عكاز، انصباب خفيف حول الرضفة، التئام جيد للجرح.',
                  objectiveFindings: 'ألم بالجس حول خط المفصل الإنسي، نبض الشرايين الطرفية طبيعي.',
                  romBattery: {
                    batteryVersion: '1.0.0',
                    entries: [
                      {
                        entryId: 'rom-knee-flex-s1-arom',
                        jointId: 'knee',
                        jointNameAr: 'مفصل الركبة',
                        jointNameEn: 'Knee',
                        movementId: 'flexion',
                        movementNameAr: 'ثني الركبة',
                        movementNameEn: 'Flexion',
                        movementType: 'AROM',
                        laterality: 'right',
                        isTested: true,
                        measuredAngleDegrees: 90,
                        referenceUninvolvedAngleDegrees: 135,
                        endFeel: 'normal_soft_tissue_approximation',
                        painNrsScore: 5,
                        clinicalNotes: 'توقف الحركة بسبب شد وألم خلف الركبة',
                      },
                      {
                        entryId: 'rom-knee-flex-s1-prom',
                        jointId: 'knee',
                        jointNameAr: 'مفصل الركبة',
                        jointNameEn: 'Knee',
                        movementId: 'flexion',
                        movementNameAr: 'ثني الركبة',
                        movementNameEn: 'Flexion',
                        movementType: 'PROM',
                        laterality: 'right',
                        isTested: true,
                        measuredAngleDegrees: 100,
                        referenceUninvolvedAngleDegrees: 140,
                        endFeel: 'normal_capsular_firm',
                        painNrsScore: 6,
                      },
                      {
                        entryId: 'rom-knee-ext-s1-arom',
                        jointId: 'knee',
                        jointNameAr: 'مفصل الركبة',
                        jointNameEn: 'Knee',
                        movementId: 'extension',
                        movementNameAr: 'بسط الركبة',
                        movementNameEn: 'Extension',
                        movementType: 'AROM',
                        laterality: 'right',
                        isTested: true,
                        measuredAngleDegrees: 5,
                        referenceUninvolvedAngleDegrees: 0,
                        endFeel: 'normal_capsular_firm',
                        painNrsScore: 3,
                        clinicalNotes: 'عجز بسط بمقدار 5 درجات مقارنة بالطرف السليم.',
                      },
                    ],
                    updatedAt: '2026-03-01T09:40:00.000Z',
                  },
                  mmtBattery: {
                    batteryVersion: '1.0.0',
                    entries: [
                      {
                        entryId: 'mmt-knee-ext-s1',
                        muscleGroupId: 'knee_extensors',
                        muscleNameAr: 'باسطات الركبة (Quadriceps Femoris)',
                        muscleNameEn: 'Knee Extensors',
                        actionNameAr: 'بسط الركبة للأمام',
                        actionNameEn: 'Knee Extension',
                        laterality: 'right',
                        gravityCondition: 'against_gravity',
                        isTested: true,
                        gradeValue: '3+',
                        painNrsScore: 4,
                        substitutionObserved: false,
                        clinicalNotes: 'تثبيط انعكاسي طفيف في العضلة المتسعة الإنسية (VMO lag)',
                      },
                      {
                        entryId: 'mmt-knee-flex-s1',
                        muscleGroupId: 'knee_flexors',
                        muscleNameAr: 'عاطفات الركبة (Hamstrings)',
                        muscleNameEn: 'Knee Flexors',
                        actionNameAr: 'ثني مفصل الركبة',
                        actionNameEn: 'Knee Flexion',
                        laterality: 'right',
                        gravityCondition: 'against_gravity',
                        isTested: true,
                        gradeValue: '4-',
                        painNrsScore: 3,
                        substitutionObserved: false,
                      },
                    ],
                    updatedAt: '2026-03-01T09:45:00.000Z',
                  },
                  dailyInterventionsSummary: 'تحريك الرضفة، تمارين انقباض متساوي القياس، ثني منفعل، كمادات ثلجية لمدة 15 دقيقة.',
                },
                assessment: {
                  clinicalImpressionCurrent: 'عجز في مدى ثني وبسط الركبة اليمنى وضعف في العضلة الرباعية بعد جراحة ترميم الرباط الصليبي.',
                  progressStatus: 'improved',
                  patientTolerance: 'well_tolerated',
                },
                plan: {
                  nextSessionPlan: 'الاستمرار في برنامج زيادة المدى الحركي وتقوية العضلة الرباعية.',
                  homeInstructions: 'تمارين زحلق الكعب (Heel slides) والجليد 3 مرات يومياً.',
                },
              };

              await SoapService.createSoapNote(
                savedPatient.id,
                episode.id,
                session1.id,
                soap1Data,
                dek
              );

              // Finalize Session 1 to establish baseline evaluation
              await SessionService.finalizeSession(session1.id, 'د. عبد الله الصالح', dek);

              // Session 2: Follow-up Session (showing clear measurable longitudinal progress)
              const session2Data: Partial<SessionClinicalData> = {
                sessionDate: '2026-03-08',
                sessionTime: '10:00',
                sessionDurationMinutes: 45,
                therapistName: 'د. عبد الله الصالح',
                administrativeNotes: 'جلسة متابعة بعد أسبوع: تحسن ملحوظ في المدى الحركي وتراجع الألم واكتمال البسط.',
              };

              const session2 = await SessionService.createSession(
                savedPatient.id,
                episode.id,
                {
                  ...session2Data,
                  sessionType: 'follow_up',
                  attendanceStatus: 'attended',
                },
                dek
              );

              const soap2Data: SoapNoteData = {
                subjective: {
                  chiefComplaint: 'تحسن ملحوظ في ثني الركبة والمشي أصبح أكثر راحة وثباتاً.',
                  painNrsScore: 3,
                  postSessionPainNrs: 2,
                  symptomChangesSinceLastSession: 'انخفض الألم من 6/10 إلى 3/10، وتلاشى الشد الليلي.',
                },
                objective: {
                  status: 'assessed',
                  clinicalObservations: 'المشي دون عكازات مع نمط تناسقي أفضل وتلاشي العرج، انحسار التورم تماماً.',
                  romBattery: {
                    batteryVersion: '1.0.0',
                    entries: [
                      {
                        entryId: 'rom-knee-flex-s2-arom',
                        jointId: 'knee',
                        jointNameAr: 'مفصل الركبة',
                        jointNameEn: 'Knee',
                        movementId: 'flexion',
                        movementNameAr: 'ثني الركبة',
                        movementNameEn: 'Flexion',
                        movementType: 'AROM',
                        laterality: 'right',
                        isTested: true,
                        measuredAngleDegrees: 110, // Progress: +20°
                        referenceUninvolvedAngleDegrees: 135,
                        endFeel: 'normal_soft_tissue_approximation',
                        painNrsScore: 2,
                        clinicalNotes: 'تحسن كبير في المدى الفعال وسهولة الحركة',
                      },
                      {
                        entryId: 'rom-knee-flex-s2-prom',
                        jointId: 'knee',
                        jointNameAr: 'مفصل الركبة',
                        jointNameEn: 'Knee',
                        movementId: 'flexion',
                        movementNameAr: 'ثني الركبة',
                        movementNameEn: 'Flexion',
                        movementType: 'PROM',
                        laterality: 'right',
                        isTested: true,
                        measuredAngleDegrees: 118, // Progress: +18°
                        referenceUninvolvedAngleDegrees: 140,
                        endFeel: 'normal_soft_tissue_approximation',
                        painNrsScore: 3,
                      },
                      {
                        entryId: 'rom-knee-ext-s2-arom',
                        jointId: 'knee',
                        jointNameAr: 'مفصل الركبة',
                        jointNameEn: 'Knee',
                        movementId: 'extension',
                        movementNameAr: 'بسط الركبة',
                        movementNameEn: 'Extension',
                        movementType: 'AROM',
                        laterality: 'right',
                        isTested: true,
                        measuredAngleDegrees: 0, // Progress: +5° reaching full 0° extension!
                        referenceUninvolvedAngleDegrees: 0,
                        endFeel: 'normal_bone_to_bone',
                        painNrsScore: 1,
                        clinicalNotes: 'استعادة البسط الكامل 0 درجة بنجاح تام.',
                      },
                    ],
                    updatedAt: '2026-03-08T10:30:00.000Z',
                  },
                  mmtBattery: {
                    batteryVersion: '1.0.0',
                    entries: [
                      {
                        entryId: 'mmt-knee-ext-s2',
                        muscleGroupId: 'knee_extensors',
                        muscleNameAr: 'باسطات الركبة (Quadriceps Femoris)',
                        muscleNameEn: 'Knee Extensors',
                        actionNameAr: 'بسط الركبة للأمام',
                        actionNameEn: 'Knee Extension',
                        laterality: 'right',
                        gravityCondition: 'against_gravity',
                        isTested: true,
                        gradeValue: '4+', // Progress: improved from 3+ to 4+!
                        painNrsScore: 1,
                        substitutionObserved: false,
                        clinicalNotes: 'قوة ممتازة ضد مقاومة يدوية قوية دون أي تأخر في VMO',
                      },
                      {
                        entryId: 'mmt-knee-flex-s2',
                        muscleGroupId: 'knee_flexors',
                        muscleNameAr: 'عاطفات الركبة (Hamstrings)',
                        muscleNameEn: 'Knee Flexors',
                        actionNameAr: 'ثني مفصل الركبة',
                        actionNameEn: 'Knee Flexion',
                        laterality: 'right',
                        gravityCondition: 'against_gravity',
                        isTested: true,
                        gradeValue: '5', // Progress: improved from 4- to 5!
                        painNrsScore: 0,
                        substitutionObserved: false,
                      },
                    ],
                    updatedAt: '2026-03-08T10:35:00.000Z',
                  },
                  dailyInterventionsSummary: 'تمارين السلسلة المغلقة (Squats جزئي)، دراجة ثابتة بمقاومة خفيفة لمدة 10 دقائق، تقوية العضلة الرباعية.',
                },
                assessment: {
                  clinicalImpressionCurrent: 'تقدم سريري ممتاز في المدى الحركي والقوة العضلية مع اختفاء عجز البسط.',
                  progressStatus: 'improved',
                  patientTolerance: 'well_tolerated',
                },
                plan: {
                  nextSessionPlan: 'البدء في تمارين التوازن والمشي السريع والتوازن على لوحة التذبذب (Wobble board).',
                },
              };

              await SoapService.createSoapNote(
                savedPatient.id,
                episode.id,
                session2.id,
                soap2Data,
                dek
              );
            }
          } catch (clinicalSeedErr) {
            console.error('Failed to seed clinical episode/sessions for Ahmed Al-Shammari:', clinicalSeedErr);
          }
        }
      }
      ClinicOperationsService.seedDemoOperationsData();
      await refreshPatients();
      setSuccessCount(count);
      setDeletedNotice(false);
      window.dispatchEvent(new CustomEvent('physiorecord-demo-data-changed'));
    } catch (err) {
      console.error('Failed to seed synthetic records:', err);
    } finally {
      setSeeding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex justify-center items-center p-4"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-card-line flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-card-divider flex items-center justify-between bg-muted/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                {bi('إدراج بيانات سريرية تجريبية', 'Insert Synthetic Clinical Demonstration Data')}
              </h2>
              <p className="text-xs text-muted-foreground-1">
                {bi(
                  'بيانات وهمية سريرية لاختبار وتجربة كافة ميزات النظام والمخططات الحركية',
                  'Clinical mock cases to test and verify all system features and kinetic progress'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground-1 hover:text-foreground hover:bg-layer-hover transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl text-foreground text-xs flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div>
                <strong className="text-primary">{bi('ضمان الخصوصية السريرية:', 'Clinical Privacy Guarantee:')}</strong>{' '}
                {bi(
                  'هذه الحالات وهمية تماماً ومُصممة سريرياً لمحاكاة سيناريوهات التأهيل المختلفة (عظام، أعصاب، قلب، أطفال، إصابات رياضية) لغايات التدقيق والاختبار.',
                  'These cases are synthetic and clinically structured to simulate rehab pathways (orthopedics, neuro, cardiac, pediatrics, sports).'
                )}
              </div>
              <div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/15 text-primary font-bold text-xs">
                  {bi(
                    `${SYNTHETIC_DATA_LICENSE} · أسماء وهواتف (+964) ومدن عراقية وهمية أصلية`,
                    `${SYNTHETIC_DATA_LICENSE} · Original Fictional Iraqi Names, +964 Phones & Cities`
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Public Demo Mode Card */}
          <div
            data-testid="public-demo-mode-card"
            className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-3 text-xs"
          >
            <div className="space-y-0.5 min-w-0 flex-1">
              <div className="font-extrabold text-foreground flex items-center gap-1.5">
                <DemoBadge />
                <span>
                  {bi(
                    'وضع العرض التجريبي العام (Public Demo Mode)',
                    'Public Demo Mode'
                  )}
                </span>
              </div>
              <p className="text-muted-foreground-1">
                {bi(
                  'يعرض شريط تنبيه علوي بارز يوضح أن النسخة للعرض التجريبي فقط ببيانات عراقية افتراضية (CC0-1.0).',
                  'Displays a prominent top banner indicating a public demo build with CC0-1.0 synthetic Iraqi data only.'
                )}
              </p>
            </div>
            <button
              type="button"
              data-testid="toggle-public-demo-mode-btn"
              onClick={() => {
                const next = !ClinicOperationsService.isPublicDemoModeEnabled();
                ClinicOperationsService.setPublicDemoModeEnabled(next);
                setPublicDemoEnabled(next);
                window.dispatchEvent(new CustomEvent('physiorecord-demo-data-changed'));
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer shrink-0 ${
                publicDemoEnabled
                  ? 'bg-amber-700 hover:bg-amber-800 text-white'
                  : 'bg-layer hover:bg-layer-hover border border-layer-line text-foreground'
              }`}
            >
              {publicDemoEnabled
                ? bi('إيقاف وضع العرض العام', 'Disable Public Demo Mode')
                : bi('تفعيل وضع العرض العام', 'Enable Public Demo Mode')}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-foreground">
              {bi(
                `الحالات السريرية الجاهزة للإدراج (${targetPatients.length} حالات):`,
                `Clinical Cases Ready for Seeding (${targetPatients.length} cases):`
              )}
            </h3>
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                data-testid="synthetic-count-5-btn"
                onClick={() => setSeedCount(5)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                  seedCount === 5
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-layer text-foreground border-layer-line hover:bg-layer-hover'
                }`}
              >
                {bi('5 حالات أساسية', '5 Core Cases')}
              </button>
              <button
                type="button"
                data-testid="synthetic-count-10-btn"
                onClick={() => setSeedCount(10)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                  seedCount === 10
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-layer text-foreground border-layer-line hover:bg-layer-hover'
                }`}
              >
                {bi('10 حالات عراقية موسعة', '10 Extended Iraqi Cases')}
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {targetPatients.map((p, idx) => (
              <div key={p.id || idx} className="p-3 bg-muted/40 rounded-xl border border-card-line text-xs">
                <div className="flex items-center justify-between font-bold text-foreground mb-1">
                  <div className="flex items-center gap-2">
                    <span>{isRtl ? p.fullNameAr : p.fullName}</span>
                    <bdi dir="ltr" className="font-mono text-xs text-muted-foreground-1">
                      {p.mrn}
                    </bdi>
                    <DemoBadge />
                  </div>
                  <span className="text-primary font-normal">
                    {p.gender === 'male' ? bi('ذكر', 'Male') : bi('أنثى', 'Female')}، {computePatientAge(p.dateOfBirth, p.age)} {bi('سنة', 'yo')}
                  </span>
                </div>
                <p className="text-muted-foreground-1 line-clamp-1">{p.medicalHistory}</p>
              </div>
            ))}
          </div>

          {deletedNotice && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                {bi(
                  'تم حذف جميع البيانات التجريبية (المرضى، الجلسات، المواعيد، والفواتير) بنجاح.',
                  'All demo data (patients, sessions, appointments, and invoices) has been deleted.'
                )}
              </span>
            </div>
          )}

          {successCount !== null && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <span>
                {bi(
                  `تم إدراج ${successCount} مرضى بنجاح، وتجهيز جلسات تأهيل الرباط الصليبي وسجلات التقدم الحركي.`,
                  `Successfully seeded ${successCount} patients with ACL rehabilitation progress sessions.`
                )}
              </span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-muted/40 border-t border-card-divider flex flex-wrap items-center justify-between gap-3">
          <div>
            {hasDemoRecords && !confirmDeleteDemo && (
              <button
                type="button"
                disabled={deletingDemo || seeding}
                onClick={() => setConfirmDeleteDemo(true)}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-layer-line disabled:cursor-not-allowed cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{bi('حذف كافة البيانات التجريبية', 'Delete all demo data')}</span>
              </button>
            )}
            {hasDemoRecords && confirmDeleteDemo && (
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={deletingDemo || seeding}
                  onClick={handleDeleteAllDemo}
                  className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deletingDemo ? bi('جاري الحذف...', 'Deleting...') : bi('تأكيد الحذف النهائي', 'Confirm Delete')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteDemo(false)}
                  className="px-2.5 py-2 border border-layer-line bg-layer text-foreground rounded-lg text-xs font-semibold cursor-pointer"
                >
                  {bi('إلغاء', 'Cancel')}
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-layer-line bg-layer text-muted-foreground-1 hover:text-foreground rounded-lg text-xs font-bold hover:bg-layer-hover transition-colors cursor-pointer"
            >
              {bi('إغلاق', 'Close')}
            </button>
            <button
              type="button"
              data-testid="synthetic-seed-btn"
              disabled={seeding || deletingDemo}
              onClick={handleSeedAll}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center gap-2 shadow-2xs cursor-pointer"
            >
              {seeding ? (
                <span className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {bi('جارٍ التشفير والإدراج...', 'Encrypting & Seeding...')}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  {seedCount === 10
                    ? bi('إدراج كافة الحالات السريرية العشر (10)', 'Seed All 10 Clinical Cases')
                    : bi('إدراج كافة الحالات السريرية الخمس', 'Seed All 5 Clinical Cases')}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
