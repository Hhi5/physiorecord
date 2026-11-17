// =======================================================================
// PhysioRecord — Rapid ROM & MMT Clinical Assessment Panel
// Interactive Clinical Workflows, Rapid Steppers, Bilateral Symmetry & MRC Standards
// =======================================================================

import React, { useState, useMemo } from 'react';
import {
  Compass,
  Dumbbell,
  Plus,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Info,
  Scale,
  Minus,
  Sparkles,
} from 'lucide-react';
import type {
  RomMeasurementEntry,
  RomAssessmentBatteryData,
  MmtMeasurementEntry,
  MmtAssessmentBatteryData,
  RomMovementType,
  BodyLaterality,
  RomEndFeel,
  ClinicalNonTestableReason,
  MmtGradeValue,
  MmtGravityCondition,
} from '../../types/clinical';
import {
  ROM_JOINTS_CATALOG,
  MMT_MUSCLE_GROUPS_CATALOG,
  MRC_GRADES_CATALOG,
  CLINICAL_NON_TESTABLE_REASONS,
  ROM_END_FEELS,
  ROM_MOVEMENT_TYPES,
  BODY_LATERALITIES,
  calculateBilateralSymmetry,
} from '../../data/clinicalToolkit/romMmtCatalog';
import { useLanguage } from '../../context/LanguageContext';

const ROM_MOVEMENT_TYPE_CKB: Record<RomMovementType, string> = {
  AROM: 'مەودای جووڵەی چالاک (Active ROM)',
  PROM: 'مەودای جووڵەی ناچالاک (Passive ROM)',
  AAROM: 'مەودای جووڵەی چالاک بە یارمەتی (Active-Assisted ROM)',
};

const BODY_LATERALITY_CKB: Record<BodyLaterality, string> = {
  right: 'لای ڕاست',
  left: 'لای چەپ',
  bilateral: 'هەردوو لا',
  midline: 'تەوەری / هێڵی ناوەڕاست',
};

const ROM_END_FEEL_CKB: Record<RomEndFeel, string> = {
  normal_capsular_firm: 'کۆتایی توندی کەپسولیی ئاسایی (Firm / Capsular)',
  normal_bone_to_bone: 'بەرکەوتنی ئێسکی ڕەقی ئاسایی (Hard / Bone-to-Bone)',
  normal_soft_tissue_approximation: 'بەرکەوتنی شانەی نەرمی ئاسایی (Soft Tissue Approximation)',
  abnormal_empty_pain: 'کۆتایی بەتاڵ بەهۆی ئازاری توندەوە (Abnormal Empty)',
  abnormal_muscle_spasm: 'گرژبوونی خۆنەویستی توندی ماسوولکە (Muscle Spasm / Guarding)',
  abnormal_springy_block: 'گەڕانەوەی سپرینگئاسا بەهۆی ڕێگریی میکانیکی (Springy Block)',
  abnormal_capsular_early: 'ڕەقبوونی پێشوەختەی کەپسولی (Early Capsular / Adhesive)',
};

const NON_TESTABLE_REASON_CKB: Record<ClinicalNonTestableReason, string> = {
  severe_acute_pain: 'ئازاری توندی کتوپڕ ڕێگرە لە پشکنینی سەلامەت',
  surgical_or_post_op_precaution: 'ئاگاداریی نەشتەرگەری یان پرۆتۆکۆلی دوای نەشتەرگەری',
  fracture_or_joint_instability: 'شکانی نوێ یان ناجێگیری توندی جومگە',
  cast_or_splint_immobilized: 'چەسپاندن بە گەچ یان قاڵب (Cast/Splint)',
  severe_spasticity: 'گرژبوونی دەماریی توند ڕێگرە لە جووڵەی ستاندارد',
  patient_refused_or_fatigued: 'شەکەتبوونی توند یان نەتوانینی هاوکاریکردنی نەخۆش',
};

export interface RomMmtAssessmentPanelProps {
  romBattery?: RomAssessmentBatteryData;
  mmtBattery?: MmtAssessmentBatteryData;
  onChangeRom?: (battery: RomAssessmentBatteryData) => void;
  onChangeMmt?: (battery: MmtAssessmentBatteryData) => void;
  readOnly?: boolean;
  compactPreview?: boolean;
  activeWorkflow?: 'rom' | 'mmt';
  hideWorkflowTabs?: boolean;
}

export const RomMmtAssessmentPanel: React.FC<RomMmtAssessmentPanelProps> = ({
  romBattery,
  mmtBattery,
  onChangeRom,
  onChangeMmt,
  readOnly = false,
  compactPreview = false,
  activeWorkflow: controlledWorkflow,
  hideWorkflowTabs = false,
}) => {
  const { bi } = useLanguage();

  const labelLaterality = (lat: BodyLaterality): string => {
    const def = BODY_LATERALITIES[lat];
    return def ? bi(def.ar, def.en, BODY_LATERALITY_CKB[lat] || def.ar) : lat;
  };

  const labelNonTestableReason = (reason?: ClinicalNonTestableReason): string => {
    if (!reason) return bi('معذّر', 'Not tested', 'پشکنین نەکراوە');
    const def = CLINICAL_NON_TESTABLE_REASONS[reason];
    return def ? bi(def.ar, def.en, NON_TESTABLE_REASON_CKB[reason] || def.ar) : reason;
  };

  const labelEndFeel = (ef: RomEndFeel): string => {
    const def = ROM_END_FEELS[ef];
    return def ? bi(def.ar, def.en, ROM_END_FEEL_CKB[ef] || def.ar) : ef;
  };
  // Primary sub-tab: 'rom' | 'mmt'
  const [internalWorkflow, setInternalWorkflow] = useState<'rom' | 'mmt'>('rom');
  const activeWorkflow = controlledWorkflow || internalWorkflow;
  const setActiveWorkflow = setInternalWorkflow;

  // -------------------------------------------------------------------------
  // ROM Entry Draft State
  // -------------------------------------------------------------------------
  const [selectedJointId, setSelectedJointId] = useState<string>(ROM_JOINTS_CATALOG[0].jointId);
  const currentJoint = useMemo(
    () => ROM_JOINTS_CATALOG.find((j) => j.jointId === selectedJointId) || ROM_JOINTS_CATALOG[0],
    [selectedJointId]
  );

  const [selectedMovementId, setSelectedMovementId] = useState<string>(
    currentJoint.movements[0]?.movementId || ''
  );
  const currentMovement = useMemo(
    () => currentJoint.movements.find((m) => m.movementId === selectedMovementId) || currentJoint.movements[0],
    [currentJoint, selectedMovementId]
  );

  const [movementType, setMovementType] = useState<RomMovementType>('AROM');
  const [romLaterality, setRomLaterality] = useState<BodyLaterality>(
    currentJoint.applicableLateralities[0] || 'right'
  );
  const [romIsTested, setRomIsTested] = useState<boolean>(true);
  const [measuredAngle, setMeasuredAngle] = useState<number | string>(90);
  const [referenceAngle, setReferenceAngle] = useState<number | string>('');
  const [endFeel, setEndFeel] = useState<RomEndFeel>('normal_capsular_firm');
  const [romPainNrs, setRomPainNrs] = useState<number>(0);
  const [romReasonNotTested, setRomReasonNotTested] = useState<ClinicalNonTestableReason>('severe_acute_pain');
  const [romNotes, setRomNotes] = useState<string>('');
  const [romError, setRomError] = useState<string | null>(null);
  const [confirmRemoveRomId, setConfirmRemoveRomId] = useState<string | null>(null);
  const [confirmRemoveMmtId, setConfirmRemoveMmtId] = useState<string | null>(null);

  // When joint changes, sync movement and applicable laterality
  const handleJointChange = (newJointId: string) => {
    setSelectedJointId(newJointId);
    const j = ROM_JOINTS_CATALOG.find((joint) => joint.jointId === newJointId);
    if (j && j.movements.length > 0) {
      setSelectedMovementId(j.movements[0].movementId);
      if (!j.applicableLateralities.includes(romLaterality)) {
        setRomLaterality(j.applicableLateralities[0]);
      }
    }
  };

  // Live symmetry computation for ROM
  const currentSymmetry = useMemo(() => {
    if (!romIsTested || typeof measuredAngle !== 'number') return null;
    const ref = typeof referenceAngle === 'number' ? referenceAngle : parseFloat(String(referenceAngle));
    if (isNaN(ref) || ref <= 0) return null;
    return calculateBilateralSymmetry(measuredAngle, ref);
  }, [romIsTested, measuredAngle, referenceAngle]);

  // Stepper helper for measured angle
  const adjustMeasuredAngle = (step: number) => {
    if (readOnly || !romIsTested) return;
    const currentVal = typeof measuredAngle === 'number' ? measuredAngle : parseFloat(String(measuredAngle)) || 0;
    const nextVal = Math.min(360, Math.max(-45, currentVal + step));
    setMeasuredAngle(nextVal);
  };

  // Add ROM Entry
  const handleAddRomEntry = () => {
    if (readOnly || !onChangeRom) return;
    setRomError(null);

    let angleDegrees: number | null = null;
    if (romIsTested) {
      const parsed = typeof measuredAngle === 'number' ? measuredAngle : parseFloat(String(measuredAngle));
      if (isNaN(parsed) || parsed < -45 || parsed > 360) {
        setRomError(
          bi(
            'يرجى إدخال زاوية قياس صحيحة بين -45° و 360°',
            'Please enter a valid measured angle between -45° and 360°',
            'تکایە گۆشەیەکی پێوانەیی دروست بنووسە لە نێوان -45° و 360°',
          ),
        );
        return;
      }
      angleDegrees = parsed;
    }

    let refAngleDegrees: number | null = null;
    if (referenceAngle !== '') {
      const parsedRef = typeof referenceAngle === 'number' ? referenceAngle : parseFloat(String(referenceAngle));
      if (!isNaN(parsedRef)) {
        refAngleDegrees = parsedRef;
      }
    }

    const newEntry: RomMeasurementEntry = {
      entryId: crypto.randomUUID(),
      jointId: currentJoint.jointId,
      jointNameAr: currentJoint.nameAr,
      jointNameEn: currentJoint.nameEn,
      movementId: currentMovement.movementId,
      movementNameAr: currentMovement.nameAr,
      movementNameEn: currentMovement.nameEn,
      movementType,
      laterality: romLaterality,
      isTested: romIsTested,
      measuredAngleDegrees: romIsTested ? angleDegrees : null,
      referenceUninvolvedAngleDegrees: refAngleDegrees,
      endFeel: romIsTested ? endFeel : undefined,
      painNrsScore: romPainNrs,
      reasonNotTested: !romIsTested ? romReasonNotTested : undefined,
      clinicalNotes: romNotes.trim() ? romNotes.trim() : undefined,
    };

    const updatedEntries = [...(romBattery?.entries || []), newEntry];
    onChangeRom({
      batteryVersion: '1.0.0',
      entries: updatedEntries,
      updatedAt: new Date().toISOString(),
    });

    // Reset notes
    setRomNotes('');
  };

  // Remove ROM Entry
  const handleRemoveRomEntry = (entryId: string) => {
    if (readOnly || !onChangeRom || !romBattery) return;
    const updated = romBattery.entries.filter((e) => e.entryId !== entryId);
    onChangeRom({
      ...romBattery,
      entries: updated,
      updatedAt: new Date().toISOString(),
    });
  };

  // -------------------------------------------------------------------------
  // MMT Entry Draft State
  // -------------------------------------------------------------------------
  const [selectedMuscleGroupId, setSelectedMuscleGroupId] = useState<string>(
    MMT_MUSCLE_GROUPS_CATALOG[0].muscleGroupId
  );
  const currentMuscleGroup = useMemo(
    () =>
      MMT_MUSCLE_GROUPS_CATALOG.find((m) => m.muscleGroupId === selectedMuscleGroupId) ||
      MMT_MUSCLE_GROUPS_CATALOG[0],
    [selectedMuscleGroupId]
  );

  const [mmtLaterality, setMmtLaterality] = useState<BodyLaterality>('right');
  const [gravityCondition, setGravityCondition] = useState<MmtGravityCondition>('against_gravity');
  const [mmtIsTested, setMmtIsTested] = useState<boolean>(true);
  const [selectedGrade, setSelectedGrade] = useState<MmtGradeValue>('5');
  const [substitutionObserved, setSubstitutionObserved] = useState<boolean>(false);
  const [mmtPainNrs, setMmtPainNrs] = useState<number>(0);
  const [mmtReasonNotTested, setMmtReasonNotTested] = useState<ClinicalNonTestableReason>('severe_acute_pain');
  const [mmtNotes, setMmtNotes] = useState<string>('');
  const [mmtError, setMmtError] = useState<string | null>(null);

  // Add MMT Entry
  const handleAddMmtEntry = () => {
    if (readOnly || !onChangeMmt) return;
    setMmtError(null);

    const newEntry: MmtMeasurementEntry = {
      entryId: crypto.randomUUID(),
      muscleGroupId: currentMuscleGroup.muscleGroupId,
      muscleNameAr: currentMuscleGroup.nameAr,
      muscleNameEn: currentMuscleGroup.nameEn,
      actionNameAr: currentMuscleGroup.actionNameAr,
      actionNameEn: currentMuscleGroup.actionNameEn,
      laterality: mmtLaterality,
      gravityCondition,
      isTested: mmtIsTested,
      gradeValue: mmtIsTested ? selectedGrade : null,
      painNrsScore: mmtPainNrs,
      substitutionObserved: mmtIsTested ? substitutionObserved : false,
      reasonNotTested: !mmtIsTested ? mmtReasonNotTested : undefined,
      clinicalNotes: mmtNotes.trim() ? mmtNotes.trim() : undefined,
    };

    const updatedEntries = [...(mmtBattery?.entries || []), newEntry];
    onChangeMmt({
      batteryVersion: '1.0.0',
      entries: updatedEntries,
      updatedAt: new Date().toISOString(),
    });

    // Reset notes
    setMmtNotes('');
  };

  // Remove MMT Entry
  const handleRemoveMmtEntry = (entryId: string) => {
    if (readOnly || !onChangeMmt || !mmtBattery) return;
    const updated = mmtBattery.entries.filter((e) => e.entryId !== entryId);
    onChangeMmt({
      ...mmtBattery,
      entries: updated,
      updatedAt: new Date().toISOString(),
    });
  };

  // Grade color badges helper
  const getGradeBadgeClass = (grade: MmtGradeValue) => {
    switch (grade) {
      case '0':
        return 'text-rose-700 dark:text-rose-400 font-bold';
      case '1':
      case '2-':
      case '2':
        return 'text-amber-700 dark:text-amber-400 font-bold';
      case '2+':
      case '3-':
      case '3':
        return 'text-yellow-700 dark:text-yellow-400 font-bold';
      case '3+':
      case '4-':
      case '4':
      case '4+':
        return 'text-sky-700 dark:text-sky-400 font-bold';
      case '5':
        return 'text-emerald-700 dark:text-emerald-400 font-bold';
      default:
        return 'text-foreground font-bold';
    }
  };

  // -------------------------------------------------------------------------
  // COMPACT PREVIEW MODE (for SOAP preview and session summaries)
  // -------------------------------------------------------------------------
  if (compactPreview) {
    const romEntries = romBattery?.entries || [];
    const mmtEntries = mmtBattery?.entries || [];

    if (romEntries.length === 0 && mmtEntries.length === 0) {
      return (
        <div className="py-2 text-xs text-slate-400 text-center italic">
          {bi(
            'لم يتم توثيق قياسات ROM أو فحص عضلات MMT لهذه الجلسة.',
            'No ROM measurements or MMT muscle tests documented for this session.',
            'هیچ پێوانەیەکی مەودای جووڵە (ROM) یان پشکنینی ماسوولکە (MMT) بۆ ئەم دانیشتنە تۆمار نەکراوە.',
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3 text-xs">
        {/* ROM Summary */}
        {romEntries.length > 0 && (
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
            <div className="flex items-center gap-1.5 font-bold text-foreground mb-2 border-b border-primary/20 pb-1">
              <Compass className="w-3.5 h-3.5 text-primary" />
              <span>
                {bi(
                  `قياسات المدى الحركي (ROM) — ${romEntries.length} قياسات`,
                  `Range of Motion (ROM) — ${romEntries.length} entries`,
                  `پێوانەکانی مەودای جووڵە (ROM) — ${romEntries.length} پێوانە`,
                )}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {romEntries.map((e) => (
                <div
                  key={e.entryId}
                  className="bg-white/90 p-2 rounded-lg border border-primary/15 text-xs space-y-1 shadow-2xs"
                >
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span>
                      {bi(e.jointNameAr, e.jointNameEn)} — {bi(e.movementNameAr, e.movementNameEn)}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary font-mono">
                      {e.movementType}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>
                      {bi('الجهة:', 'Side:', 'لا:')} {labelLaterality(e.laterality)}
                    </span>
                    {e.isTested ? (
                      <span className="font-bold text-primary text-xs font-mono">
                        {e.measuredAngleDegrees}°
                        {e.referenceUninvolvedAngleDegrees != null && (
                          <span className="text-xs text-slate-400 mr-1">
                            {bi(
                              `(المرجع: ${e.referenceUninvolvedAngleDegrees}°)`,
                              `(Ref: ${e.referenceUninvolvedAngleDegrees}°)`,
                              `(سەرچاوە: ${e.referenceUninvolvedAngleDegrees}°)`,
                            )}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                        {bi('غير مفحوص', 'Not Tested', 'پشکنین نەکراو')} ({labelNonTestableReason(e.reasonNotTested)})
                      </span>
                    )}
                  </div>
                  {e.isTested && e.endFeel && (
                    <div className="text-xs text-slate-500">
                      {bi('النهاية:', 'End-feel:', 'کۆتایی جووڵە:')} {labelEndFeel(e.endFeel)}
                    </div>
                  )}
                  {e.painNrsScore !== undefined && e.painNrsScore > 0 && (
                    <div className="text-xs text-rose-600 font-medium">
                      {bi('درجة الألم:', 'Pain:', 'پلەی ئازار:')} <bdi dir="ltr">{e.painNrsScore}/10</bdi> (NRS)
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MMT Summary */}
        {mmtEntries.length > 0 && (
          <div className="rounded-xl bg-card shadow-2xs p-3">
            <div className="flex items-center gap-1.5 font-bold text-foreground mb-2 border-b border-card-line pb-1">
              <Dumbbell className="w-3.5 h-3.5 text-primary" />
              <span>
                {bi(
                  `فحوصات القوة العضلية (MMT) — ${mmtEntries.length} فحوصات`,
                  `Muscle Strength (MMT) — ${mmtEntries.length} tests`,
                  `پشکنینەکانی هێزی ماسوولکە (MMT) — ${mmtEntries.length} پشکنین`,
                )}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {mmtEntries.map((e) => (
                <div
                  key={e.entryId}
                  className="bg-layer p-2 rounded-lg border border-layer-line text-xs space-y-1 shadow-2xs"
                >
                  <div className="flex items-center justify-between font-bold text-foreground">
                    <span>{bi(e.muscleNameAr, e.muscleNameEn)}</span>
                    {e.isTested && e.gradeValue ? (
                      <span
                        className={`text-xs font-bold font-mono ${getGradeBadgeClass(
                          e.gradeValue
                        )}`}
                      >
                        {bi(`درجة ${e.gradeValue}`, `Grade ${e.gradeValue}`, `پلەی ${e.gradeValue}`)}
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                        {bi('غير مفحوص', 'Not Tested', 'پشکنین نەکراو')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>
                      {bi(e.actionNameAr, e.actionNameEn)} ({labelLaterality(e.laterality)})
                    </span>
                    <span className="text-xs text-slate-400">
                      {e.gravityCondition === 'against_gravity'
                        ? bi('ضد الجاذبية', 'Against Gravity', 'دژی هێزی کێشکردن')
                        : bi('إلغاء الجاذبية', 'Gravity Eliminated', 'لابردنی هێزی کێشکردن')}
                    </span>
                  </div>
                  {!e.isTested && e.reasonNotTested && (
                    <div className="text-xs text-amber-800">
                      {bi('السبب:', 'Reason:', 'هۆکار:')} {labelNonTestableReason(e.reasonNotTested)}
                    </div>
                  )}
                  {e.substitutionObserved && (
                    <div className="text-xs text-amber-700 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                      <span>
                        {bi(
                          'لوحظت حركة تعويضية غير طبيعية (Trick Movement)',
                          'Abnormal compensatory movement observed (Trick Movement)',
                          'جووڵەی جێگرەوەی نائاسایی تێبینی کرا (Trick Movement)',
                        )}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // INTERACTIVE WORKFLOW MODE
  // -------------------------------------------------------------------------
  const romEntries = romBattery?.entries || [];
  const mmtEntries = mmtBattery?.entries || [];

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      {/* Workflow Tabs Header */}
      {!hideWorkflowTabs && (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveWorkflow('rom')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeWorkflow === 'rom'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>{bi('المدى الحركي (ROM)', 'Range of Motion (ROM)', 'مەودای جووڵە (ROM)')}</span>
            {romEntries.length > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-xs font-mono ${
                  activeWorkflow === 'rom' ? 'bg-black/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {romEntries.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveWorkflow('mmt')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeWorkflow === 'mmt'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Dumbbell className="w-3.5 h-3.5" />
            <span>{bi('الفحص العضلي (MMT)', 'Manual Muscle Testing (MMT)', 'پشکنینی هێزی ماسوولکە (MMT)')}</span>
            {mmtEntries.length > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-xs font-mono ${
                  activeWorkflow === 'mmt' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {mmtEntries.length}
              </span>
            )}
          </button>
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>
            {bi(
              'قياس وتوثيق سريري معياري (WHO & MRC Standard)',
              'Standardized Clinical Measurement & Documentation (WHO & MRC)',
              'پێوانە و تۆمارکردنی پزیشکیی ستاندارد (WHO & MRC)',
            )}
          </span>
        </div>
      </div>
      )}

      {/* ===================================================================== */}
      {/* WORKFLOW 1: RANGE OF MOTION (ROM)                                    */}
      {/* ===================================================================== */}
      {activeWorkflow === 'rom' && (
        <div className="space-y-4">
          {!readOnly && (
            <div className="bg-primary/5 p-3.5 rounded-2xl border border-primary/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-primary" />
                  <span>
                    {bi(
                      'تسجيل قياس جديد للمدى الحركي (New ROM Entry)',
                      'New Range of Motion (ROM) Entry',
                      'تۆمارکردنی پێوانەی نوێی مەودای جووڵە (ROM)',
                    )}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setRomIsTested(!romIsTested)}
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all ${
                    !romIsTested
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {!romIsTested
                    ? bi(
                        '✓ محدد كـ غير قابل للفحص السريري',
                        '✓ Marked as Not Clinically Testable',
                        '✓ دیاریکراوە وەک نەگونجاو بۆ پشکنین',
                      )
                    : bi(
                        'تعذر الفحص السريري (Not Tested)',
                        'Mark Not Tested',
                        'پشکنین ئەنجام نەدرا (Not Tested)',
                      )}
                </button>
              </div>

              {romError && (
                <div className="p-2 rounded-lg bg-surface/75 text-rose-700 dark:text-rose-400 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{romError}</span>
                </div>
              )}

              {/* Joint & Movement Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {bi('المفصل المستهدف:', 'Target Joint:', 'جومگەی مەبەست:')}
                  </label>
                  <select
                    value={selectedJointId}
                    onChange={(e) => handleJointChange(e.target.value)}
                    className="w-full text-xs py-1.5 px-2.5 rounded-xl border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-primary"
                  >
                    {ROM_JOINTS_CATALOG.map((j) => (
                      <option key={j.jointId} value={j.jointId}>
                        {bi(j.nameAr, j.nameEn)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {bi('الحركة المفصلية:', 'Joint Movement:', 'جووڵەی جومگە:')}
                  </label>
                  <select
                    value={selectedMovementId}
                    onChange={(e) => setSelectedMovementId(e.target.value)}
                    className="w-full text-xs py-1.5 px-2.5 rounded-xl border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-primary"
                  >
                    {currentJoint.movements.map((m) => (
                      <option key={m.movementId} value={m.movementId}>
                        {bi(m.nameAr, m.nameEn)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {bi('نوع المدى الحركي:', 'Movement Type:', 'جۆری مەودای جووڵە:')}
                  </label>
                  <select
                    value={movementType}
                    onChange={(e) => setMovementType(e.target.value as RomMovementType)}
                    className="w-full text-xs py-1.5 px-2.5 rounded-xl border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-primary"
                  >
                    {(Object.keys(ROM_MOVEMENT_TYPES) as RomMovementType[]).map((t) => (
                      <option key={t} value={t}>
                        {bi(
                          ROM_MOVEMENT_TYPES[t].ar,
                          ROM_MOVEMENT_TYPES[t].en,
                          ROM_MOVEMENT_TYPE_CKB[t],
                        )}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {bi('الجهة / الطرف المفحوص:', 'Side / Laterality:', 'لا / پەلی پشکنراو:')}
                  </label>
                  <select
                    value={romLaterality}
                    onChange={(e) => setRomLaterality(e.target.value as BodyLaterality)}
                    className="w-full text-xs py-1.5 px-2.5 rounded-xl border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-primary"
                  >
                    {currentJoint.applicableLateralities.map((lat) => (
                      <option key={lat} value={lat}>
                        {labelLaterality(lat)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Angle Inputs OR Non-Testable Reason */}
              {romIsTested ? (
                <div className="space-y-3 pt-1 border-t border-primary/20">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
                    {/* Primary Angle Input with Stepper */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-slate-700">
                          {bi('الزاوية المقاسة (بالدرجات °):', 'Measured Angle (degrees °):', 'گۆشەی پێوراو (بە پلە °):')}
                        </label>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => adjustMeasuredAngle(-5)}
                          className="px-2 py-1 text-xs font-mono font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700"
                          title="-5°"
                        >
                          -5°
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustMeasuredAngle(-1)}
                          className="px-2 py-1 text-xs font-mono font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700"
                          title="-1°"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          value={measuredAngle}
                          onChange={(e) => setMeasuredAngle(e.target.value === '' ? '' : Number(e.target.value))}
                          step="1"
                          min="-45"
                          max="360"
                          className="w-full text-center text-sm font-bold font-mono py-1 rounded-xl border border-primary/40 bg-white focus:ring-2 focus:ring-primary"
                        />
                        <button
                          type="button"
                          onClick={() => adjustMeasuredAngle(1)}
                          className="px-2 py-1 text-xs font-mono font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700"
                          title="+1°"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustMeasuredAngle(5)}
                          className="px-2 py-1 text-xs font-mono font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700"
                          title="+5°"
                        >
                          +5°
                        </button>
                      </div>
                    </div>

                    {/* Contralateral Reference Angle & BSI */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {bi(
                          'زاوية الطرف السليم المقابل (اختياري):',
                          'Contralateral Reference Angle (optional):',
                          'گۆشەی لای ساغی بەرامبەر (ئیختیاری):',
                        )}
                      </label>
                      <input
                        type="number"
                        placeholder={bi('درجة الطرف المرجعي...', 'Reference side degrees...', 'پلەی لای سەرچاوە...')}
                        value={referenceAngle}
                        onChange={(e) => setReferenceAngle(e.target.value === '' ? '' : Number(e.target.value))}
                        step="1"
                        min="0"
                        max="360"
                        className="w-full text-xs py-1.5 px-3 rounded-xl border border-slate-300 bg-white font-mono focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    {/* End-Feel Picker */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {bi('نهاية المدى الحركي (End-Feel):', 'Joint End-Feel:', 'هەستی کۆتایی جووڵە (End-Feel):')}
                      </label>
                      <select
                        value={endFeel}
                        onChange={(e) => setEndFeel(e.target.value as RomEndFeel)}
                        className="w-full text-xs py-1.5 px-2.5 rounded-xl border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-primary"
                      >
                        {(Object.keys(ROM_END_FEELS) as RomEndFeel[]).map((key) => (
                          <option key={key} value={key}>
                            {labelEndFeel(key)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Symmetry Calculation Feedback */}
                  {currentSymmetry && currentSymmetry.symmetryIndexPercent !== null && (
                    <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/25 text-xs text-foreground flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Scale className="w-4 h-4 text-primary" />
                        <span>
                          <strong>
                            {bi('مؤشر التناظر (BSI):', 'Bilateral Symmetry Index (BSI):', 'پێنوێنی هاوسەنگیی هەردوو لا (BSI):')}
                          </strong>{' '}
                          {bi(
                            `${currentSymmetry.symmetryIndexPercent}% مقارنة بالطرف المرجعي`,
                            `${currentSymmetry.symmetryIndexPercent}% vs. reference side`,
                            `${currentSymmetry.symmetryIndexPercent}% بەراورد بە لای سەرچاوە`,
                          )}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-primary">
                        {bi(
                          `عجز المدى: -${currentSymmetry.deficitDegrees}°`,
                          `Deficit: -${currentSymmetry.deficitDegrees}°`,
                          `کەمیی مەودا: -${currentSymmetry.deficitDegrees}°`,
                        )}
                      </span>
                    </div>
                  )}

                  {/* End-feel clinical description */}
                  <div className="text-xs text-slate-500 bg-white/70 p-2 rounded-lg border border-slate-200 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <span>
                      {ROM_END_FEELS[endFeel]
                        ? bi(
                            ROM_END_FEELS[endFeel].clinicalDescriptionAr,
                            ROM_END_FEELS[endFeel].en,
                            ROM_END_FEEL_CKB[endFeel],
                          )
                        : null}
                    </span>
                  </div>

                  {/* Pain NRS Pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-700">
                      {bi(
                        'شدة الألم مع الحركة (NRS 0-10):',
                        'Pain with Movement (NRS 0-10):',
                        'توندیی ئازار لە کاتی جووڵەدا (NRS 0-10):',
                      )}
                    </span>
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setRomPainNrs(num)}
                        className={`w-6 h-6 rounded-lg text-xs font-mono font-bold border transition-all ${
                          romPainNrs === num
                            ? num > 6
                              ? 'bg-rose-600 text-white border-rose-600'
                              : num > 3
                              ? 'bg-amber-700 text-white border-amber-700'
                              : 'bg-primary text-primary-foreground border-primary'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Non-Testable Reason Selection */
                <div className="p-3 bg-card shadow-2xs rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>
                      {bi(
                        'سبب تعذر فحص المدى الحركي سريرياً (Mandatory Non-Testable Justification):',
                        'Justification for Non-Testable ROM:',
                        'هۆکاری نەگونجاویی پشکنینی مەودای جووڵە:',
                      )}
                    </span>
                  </div>
                  <select
                    value={romReasonNotTested}
                    onChange={(e) => setRomReasonNotTested(e.target.value as ClinicalNonTestableReason)}
                    className="w-full text-xs py-2 px-3 rounded-xl border border-amber-300 bg-white font-medium focus:ring-2 focus:ring-amber-500"
                  >
                    {(Object.keys(CLINICAL_NON_TESTABLE_REASONS) as ClinicalNonTestableReason[]).map((r) => (
                      <option key={r} value={r}>
                        {labelNonTestableReason(r)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Notes & Add Button */}
              <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-primary/20">
                <input
                  type="text"
                  placeholder={bi(
                    'ملاحظات سريرية اختيارية (مثال: شعور بشد في نهاية الحركة، قصر نسبي في العضلات)...',
                    'Optional clinical notes (e.g., tightness at end range, relative muscle shortening)...',
                    'تێبینییە پزیشکییە ئیختیارییەکان (بۆ نموونە: هەستکردن بە کشان لە کۆتایی جووڵەدا)...',
                  )}
                  value={romNotes}
                  onChange={(e) => setRomNotes(e.target.value)}
                  className="w-full text-xs py-1.5 px-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={handleAddRomEntry}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-primary-foreground bg-primary hover:bg-primary-hover shadow-xs whitespace-nowrap transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>{bi('إضافة القياس إلى الجلسة', 'Add Measurement to Session', 'زیادکردنی پێوانە بۆ دانیشتن')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Recorded ROM Entries Table / Cards */}
          <div className="space-y-2">
            <h5 className="text-xs font-bold text-slate-800 flex items-center justify-between">
              <span>
                {bi(
                  `القياسات المسجلة في هذه الجلسة (${romEntries.length}):`,
                  `Recorded Measurements in This Session (${romEntries.length}):`,
                  `پێوانە تۆمارکراوەکان لەم دانیشتنەدا (${romEntries.length}):`,
                )}
              </span>
              {romEntries.length === 0 && (
                <span className="text-xs text-slate-400 font-normal">
                  {bi('لم تُضف أي قياسات بعد', 'No measurements added yet', 'هێشتا هیچ پێوانەیەک زیاد نەکراوە')}
                </span>
              )}
            </h5>

            {romEntries.length > 0 && (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden bg-slate-50/50">
                {romEntries.map((entry) => {
                  const bsi =
                    entry.isTested && entry.measuredAngleDegrees !== null && entry.referenceUninvolvedAngleDegrees
                      ? calculateBilateralSymmetry(entry.measuredAngleDegrees, entry.referenceUninvolvedAngleDegrees)
                      : null;

                  return (
                    <div
                      key={entry.entryId}
                      className="p-3 bg-white hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 font-bold text-slate-900">
                          <span>
                            {bi(entry.jointNameAr, entry.jointNameEn)} — {bi(entry.movementNameAr, entry.movementNameEn)}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-xs font-mono bg-primary/10 text-primary">
                            {entry.movementType}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-xs bg-slate-100 text-slate-700">
                            {labelLaterality(entry.laterality)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-slate-600 text-xs">
                          {entry.isTested ? (
                            <>
                              <span className="font-bold text-primary text-xs font-mono">
                                {entry.measuredAngleDegrees}°
                              </span>
                              {entry.referenceUninvolvedAngleDegrees != null && (
                                <span className="text-slate-400 font-mono">
                                  {bi(
                                    `(المرجع: ${entry.referenceUninvolvedAngleDegrees}°)`,
                                    `(Ref: ${entry.referenceUninvolvedAngleDegrees}°)`,
                                    `(سەرچاوە: ${entry.referenceUninvolvedAngleDegrees}°)`,
                                  )}
                                </span>
                              )}
                              {bsi && bsi.symmetryIndexPercent !== null && (
                                <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/25 font-mono font-bold">
                                  BSI: {bsi.symmetryIndexPercent}%
                                </span>
                              )}
                              {entry.endFeel && (
                                <span className="text-slate-500">
                                  {bi('النهاية:', 'End-feel:', 'کۆتایی:')} {labelEndFeel(entry.endFeel)}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                              {bi('غير مفحوص:', 'Not Tested:', 'پشکنین نەکراو:')} {labelNonTestableReason(entry.reasonNotTested)}
                            </span>
                          )}

                          {entry.painNrsScore !== undefined && entry.painNrsScore > 0 && (
                            <span className="text-rose-700 dark:text-rose-400 font-mono font-medium text-xs">
                              {bi('الألم:', 'Pain:', 'ئازار:')} <bdi dir="ltr">{entry.painNrsScore}/10</bdi>
                            </span>
                          )}
                        </div>

                        {entry.clinicalNotes && (
                          <div className="text-xs text-slate-500 italic">
                            {bi('ملاحظات:', 'Notes:', 'تێبینییەکان:')} {entry.clinicalNotes}
                          </div>
                        )}
                      </div>

                      {!readOnly && onChangeRom && (
                        confirmRemoveRomId === entry.entryId ? (
                          <div className="inline-flex items-center gap-1 self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={() => {
                                handleRemoveRomEntry(entry.entryId);
                                setConfirmRemoveRomId(null);
                              }}
                              className="px-2 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                            >
                              {bi('تأكيد', 'Confirm', 'دڵنیاکردنەوە')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveRomId(null)}
                              className="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 text-xs cursor-pointer"
                            >
                              {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveRomId(entry.entryId)}
                            className="self-end sm:self-auto p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                            aria-label={bi('حذف القياس', 'Delete measurement', 'سڕینەوەی پێوانە')}
                            title={bi('حذف القياس', 'Delete measurement', 'سڕینەوەی پێوانە')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* WORKFLOW 2: MANUAL MUSCLE TESTING (MMT)                              */}
      {/* ===================================================================== */}
      {activeWorkflow === 'mmt' && (
        <div className="space-y-4">
          {!readOnly && (
            <div className="bg-card shadow-2xs p-3.5 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Dumbbell className="w-4 h-4 text-primary" />
                  <span>
                    {bi(
                      'فحص عضلي يدوي جديد (New MMT Assessment)',
                      'New Manual Muscle Test (MMT)',
                      'پشکنینی نوێی هێزی ماسوولکە بە دەست (MMT)',
                    )}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setMmtIsTested(!mmtIsTested)}
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all ${
                    !mmtIsTested
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {!mmtIsTested
                    ? bi(
                        '✓ محدد كـ غير قابل للفحص السريري',
                        '✓ Marked as Not Clinically Testable',
                        '✓ دیاریکراوە وەک نەگونجاو بۆ پشکنین',
                      )
                    : bi(
                        'تعذر الفحص السريري (Not Tested)',
                        'Mark Not Tested',
                        'پشکنین ئەنجام نەدرا (Not Tested)',
                      )}
                </button>
              </div>

              {mmtError && (
                <div className="p-2 rounded-lg bg-surface/75 text-rose-700 dark:text-rose-400 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{mmtError}</span>
                </div>
              )}

              {/* Muscle Group & Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {bi('المجموعة العضلية المفحوصة:', 'Target Muscle Group:', 'کۆمەڵە ماسوولکەی پشکنراو:')}
                  </label>
                  <select
                    value={selectedMuscleGroupId}
                    onChange={(e) => setSelectedMuscleGroupId(e.target.value)}
                    className="w-full text-xs py-1.5 px-2.5 rounded-xl border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-indigo-500"
                  >
                    {MMT_MUSCLE_GROUPS_CATALOG.map((m) => (
                      <option key={m.muscleGroupId} value={m.muscleGroupId}>
                        {bi(m.nameAr, m.nameEn)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {bi('الطرف المفحوص:', 'Tested Side:', 'لای پشکنراو:')}
                  </label>
                  <select
                    value={mmtLaterality}
                    onChange={(e) => setMmtLaterality(e.target.value as BodyLaterality)}
                    className="w-full text-xs py-1.5 px-2.5 rounded-xl border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-indigo-500"
                  >
                    {currentMuscleGroup.applicableLateralities.map((lat) => (
                      <option key={lat} value={lat}>
                        {labelLaterality(lat)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {bi('وضع الجاذبية (Condition):', 'Gravity Condition:', 'دۆخی هێزی کێشکردن:')}
                  </label>
                  <select
                    value={gravityCondition}
                    onChange={(e) => setGravityCondition(e.target.value as MmtGravityCondition)}
                    className="w-full text-xs py-1.5 px-2.5 rounded-xl border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="against_gravity">
                      {bi(
                        'ضد الجاذبية (Against Gravity — 3 to 5)',
                        'Against Gravity (Grades 3 to 5)',
                        'دژی هێزی کێشکردن (پلەی 3 تا 5)',
                      )}
                    </option>
                    <option value="gravity_eliminated">
                      {bi(
                        'وضع إلغاء الجاذبية (Gravity Eliminated — 0 to 2)',
                        'Gravity Eliminated (Grades 0 to 2)',
                        'دۆخی لابردنی هێزی کێشکردن (پلەی 0 تا 2)',
                      )}
                    </option>
                  </select>
                </div>
              </div>

              {/* Tested Grade Selector OR Non-Testable Reason */}
              {mmtIsTested ? (
                <div className="space-y-3 pt-1 border-t border-indigo-200/60">
                  {/* MRC Grade Buttons Grid */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      {bi(
                        'درجة القوة العضلية وفق مقياس مجلس البحوث الطبية (MRC Scale):',
                        'Muscle Strength Grade (MRC Scale):',
                        'پلەی هێزی ماسوولکە بەپێی پێوەری MRC:',
                      )}
                    </label>
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-1.5">
                      {(Object.keys(MRC_GRADES_CATALOG) as MmtGradeValue[]).map((grade) => (
                        <button
                          key={grade}
                          type="button"
                          onClick={() => setSelectedGrade(grade)}
                          className={`py-1.5 px-1 rounded-xl text-xs font-mono font-bold border transition-all text-center flex flex-col items-center justify-center ${
                            selectedGrade === grade
                              ? 'ring-2 ring-indigo-600 shadow-xs ' + getGradeBadgeClass(grade)
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          <span>{grade}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Selected Grade Clinical Description Card */}
                  {selectedGrade && MRC_GRADES_CATALOG[selectedGrade] && (
                    <div className="p-2.5 rounded-xl bg-white border border-indigo-200 text-xs space-y-1">
                      <div className="flex items-center justify-between font-bold text-indigo-950">
                        <span>
                          {bi(
                            MRC_GRADES_CATALOG[selectedGrade].labelAr,
                            MRC_GRADES_CATALOG[selectedGrade].labelEn,
                          )}
                        </span>
                        <span className="font-mono text-xs text-indigo-600">
                          {MRC_GRADES_CATALOG[selectedGrade].labelEn}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {bi(
                          MRC_GRADES_CATALOG[selectedGrade].descriptionAr,
                          MRC_GRADES_CATALOG[selectedGrade].descriptionEn,
                        )}
                      </p>
                    </div>
                  )}

                  {/* Substitution & Pain Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                      <input
                        type="checkbox"
                        checked={substitutionObserved}
                        onChange={(e) => setSubstitutionObserved(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                      />
                      <span className="text-xs">
                        {bi(
                          'ملاحظة حركة تعويضية غير طبيعية (Trick/Substitution Movement)',
                          'Abnormal compensatory / substitution movement observed (Trick Movement)',
                          'تێبینیکردنی جووڵەی جێگرەوەی نائاسایی (Trick/Substitution)',
                        )}
                      </span>
                    </label>

                    {/* Pain NRS */}
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-xs font-bold text-slate-700">
                        {bi('ألم الفحص:', 'Test Pain:', 'ئازاری پشکنین:')}
                      </span>
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setMmtPainNrs(num)}
                          className={`w-5 h-5 rounded text-xs font-mono font-bold border transition-all ${
                            mmtPainNrs === num
                              ? num > 5
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Non-Testable Reason Selection */
                <div className="p-3 bg-card shadow-2xs rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>
                      {bi(
                        'سبب تعذر فحص القوة العضلية سريرياً (Mandatory Non-Testable Justification):',
                        'Justification for Non-Testable MMT:',
                        'هۆکاری نەگونجاویی پشکنینی هێزی ماسوولکە:',
                      )}
                    </span>
                  </div>
                  <select
                    value={mmtReasonNotTested}
                    onChange={(e) => setMmtReasonNotTested(e.target.value as ClinicalNonTestableReason)}
                    className="w-full text-xs py-2 px-3 rounded-xl border border-amber-300 bg-white font-medium focus:ring-2 focus:ring-amber-500"
                  >
                    {(Object.keys(CLINICAL_NON_TESTABLE_REASONS) as ClinicalNonTestableReason[]).map((r) => (
                      <option key={r} value={r}>
                        {labelNonTestableReason(r)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Notes & Add Button */}
              <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-indigo-200/60">
                <input
                  type="text"
                  placeholder={bi(
                    'ملاحظات سريرية حول الفحص العضلي...',
                    'Clinical notes on muscle test...',
                    'تێبینییە پزیشکییەکان سەبارەت بە پشکنینی ماسوولکە...',
                  )}
                  value={mmtNotes}
                  onChange={(e) => setMmtNotes(e.target.value)}
                  className="w-full text-xs py-1.5 px-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddMmtEntry}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs whitespace-nowrap transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>{bi('إضافة الفحص إلى الجلسة', 'Add Test to Session', 'زیادکردنی پشکنین بۆ دانیشتن')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Recorded MMT Entries List */}
          <div className="space-y-2">
            <h5 className="text-xs font-bold text-slate-800 flex items-center justify-between">
              <span>
                {bi(
                  `الفحوصات العضلية المسجلة في هذه الجلسة (${mmtEntries.length}):`,
                  `Recorded MMT Tests in This Session (${mmtEntries.length}):`,
                  `پشکنینە تۆمارکراوەکانی هێزی ماسوولکە لەم دانیشتنەدا (${mmtEntries.length}):`,
                )}
              </span>
              {mmtEntries.length === 0 && (
                <span className="text-xs text-slate-400 font-normal">
                  {bi('لم يُضف أي فحص بعد', 'No tests added yet', 'هێشتا هیچ پشکنینێک زیاد نەکراوە')}
                </span>
              )}
            </h5>

            {mmtEntries.length > 0 && (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden bg-slate-50/50">
                {mmtEntries.map((entry) => (
                  <div
                    key={entry.entryId}
                    className="p-3 bg-white hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
                        <span>{bi(entry.muscleNameAr, entry.muscleNameEn)}</span>
                        <span className="text-slate-500 text-xs font-normal">
                          ({bi(entry.actionNameAr, entry.actionNameEn)})
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-xs bg-slate-100 text-slate-700">
                          {labelLaterality(entry.laterality)}
                        </span>
                        {entry.isTested && entry.gradeValue ? (
                          <span
                            className={`text-xs font-bold font-mono ${getGradeBadgeClass(
                              entry.gradeValue
                            )}`}
                          >
                            {bi(`درجة ${entry.gradeValue} (MRC)`, `Grade ${entry.gradeValue} (MRC)`, `پلەی ${entry.gradeValue} (MRC)`)}
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                            {bi('غير مفحوص:', 'Not Tested:', 'پشکنین نەکراو:')} {labelNonTestableReason(entry.reasonNotTested)}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span className="text-slate-400">
                          {entry.gravityCondition === 'against_gravity'
                            ? bi('ضد الجاذبية', 'Against Gravity', 'دژی هێزی کێشکردن')
                            : bi('وضع إلغاء الجاذبية', 'Gravity Eliminated', 'دۆخی لابردنی هێزی کێشکردن')}
                        </span>
                        {entry.substitutionObserved && (
                          <span className="text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-1 text-xs">
                            <AlertTriangle className="w-3 h-3 text-amber-500" />
                            <span>
                              {bi('حركة تعويضية (Trick)', 'Trick / Substitution Movement', 'جووڵەی جێگرەوە (Trick)')}
                            </span>
                          </span>
                        )}
                        {entry.painNrsScore !== undefined && entry.painNrsScore > 0 && (
                          <span className="text-rose-700 dark:text-rose-400 font-mono font-medium text-xs">
                            {bi('الألم:', 'Pain:', 'ئازار:')} <bdi dir="ltr">{entry.painNrsScore}/10</bdi>
                          </span>
                        )}
                      </div>

                      {entry.clinicalNotes && (
                        <div className="text-xs text-slate-500 italic">
                          {bi('ملاحظات:', 'Notes:', 'تێبینییەکان:')} {entry.clinicalNotes}
                        </div>
                      )}
                    </div>

                    {!readOnly && onChangeMmt && (
                      confirmRemoveMmtId === entry.entryId ? (
                        <div className="inline-flex items-center gap-1 self-end sm:self-auto">
                          <button
                            type="button"
                            onClick={() => {
                              handleRemoveMmtEntry(entry.entryId);
                              setConfirmRemoveMmtId(null);
                            }}
                            className="px-2 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                          >
                            {bi('تأكيد', 'Confirm', 'دڵنیاکردنەوە')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveMmtId(null)}
                            className="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 text-xs cursor-pointer"
                          >
                            {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveMmtId(entry.entryId)}
                          className="self-end sm:self-auto p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                          aria-label={bi('حذف الفحص', 'Delete test', 'سڕینەوەی پشکنین')}
                          title={bi('حذف الفحص', 'Delete test', 'سڕینەوەی پشکنین')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

