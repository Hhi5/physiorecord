// =======================================================================
// PhysioRecord — Episode Creation & Editing Modal (Phase 2B.1)
// Bilingual Clinical Terminology, Pre-filling from Patient, and Review
// =======================================================================

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import type {
  PatientRecord,
  EpisodeRecord,
  EpisodeClinicalData,
  ClinicalSpecialty,
  OnsetMechanism,
  StructuredRehabGoal,
} from '../types/clinical';
import {
  CLINICAL_SPECIALTIES,
  ONSET_MECHANISMS,
  COMMON_BODY_REGIONS,
  searchBilingualGlossary,
  type BilingualGlossaryEntry,
} from '../data/terminology';
import { ClinicOperationsService } from '../services/clinicOperationsService';
import { localDate, computePatientAge } from '../utils/date';
import { getPatientDisplayName } from '../utils/mrn';
import { AutoResizeTextarea, DatePickerInput } from './ui/Primitives';
import { ModalDialog } from './ui/Dialog';

const SmartGoalsGasPanel = React.lazy(() =>
  import('./workspace/SmartGoalsGasPanel').then((m) => ({ default: m.SmartGoalsGasPanel }))
);
import {
  X,
  Layers,
  Save,
  CheckCircle2,
  Sparkles,
  Plus,
  Trash2,
  AlertCircle,
  BookOpen,
} from 'lucide-react';

interface EpisodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: PatientRecord;
  episodeToEdit?: EpisodeRecord | null;
  onSaved: (episode: EpisodeRecord) => void;
}

export const EpisodeModal: React.FC<EpisodeModalProps> = ({
  isOpen,
  onClose,
  patient,
  episodeToEdit,
  onSaved,
}) => {
  const p = patient.data;
  const isEditing = Boolean(episodeToEdit);
  const { language, bi, isRtl } = useLanguage();

  // Form State
  const [isOngoingLegacy, setIsOngoingLegacy] = useState(false);
  const [title, setTitle] = useState('');
  const [primarySpecialty, setPrimarySpecialty] = useState<ClinicalSpecialty>('musculoskeletal');
  const [affectedBodyRegion, setAffectedBodyRegion] = useState('');
  const [customBodyRegion, setCustomBodyRegion] = useState('');
  const [onsetDate, setOnsetDate] = useState(localDate());
  const [onsetMechanism, setOnsetMechanism] = useState<OnsetMechanism>('insidious');
  const [medicalDiagnosis, setMedicalDiagnosis] = useState('');
  const [clinicalImpression, setClinicalImpression] = useState('');
  const [referralSource, setReferralSource] = useState('');
  const [dischargeCriteria, setDischargeCriteria] = useState('');

  // Goals
  const [shortTermGoals, setShortTermGoals] = useState<string[]>([]);
  const [newShortGoal, setNewShortGoal] = useState('');
  const [longTermGoals, setLongTermGoals] = useState<string[]>([]);
  const [newLongGoal, setNewLongGoal] = useState('');
  const [structuredGoals, setStructuredGoals] = useState<StructuredRehabGoal[]>([]);

  // Legacy Flags
  const [isDiagnosisConfirmed, setIsDiagnosisConfirmed] = useState(true);
  const [isOnsetDateExact, setIsOnsetDateExact] = useState(true);
  const [areBaselineGoalsFormalized, setAreBaselineGoalsFormalized] = useState(true);

  // Status & Error
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [glossaryQuery, setGlossaryQuery] = useState('');
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const defaultAutoTitleRef = useRef<string>('');
  const lastGlossaryTitleRef = useRef<string | null>(null);

  const episodeToEditId = episodeToEdit?.id ?? null;
  const glossaryEnabled = ClinicOperationsService.isBilingualTerminologyGlossaryEnabled();

  const glossarySuggestions = useMemo<BilingualGlossaryEntry[]>(() => {
    if (!glossaryEnabled) return [];
    return searchBilingualGlossary(glossaryQuery, undefined, 8);
  }, [glossaryEnabled, glossaryQuery]);

  // Populate form on open
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setGlossaryQuery('');
    setGlossaryOpen(false);
    lastGlossaryTitleRef.current = null;

    if (episodeToEdit) {
      const ed = episodeToEdit.data;
      defaultAutoTitleRef.current = '';
      setTitle(ed.title);
      setPrimarySpecialty(episodeToEdit.primarySpecialty);
      setAffectedBodyRegion(ed.affectedBodyRegion);
      setOnsetDate(episodeToEdit.startDate || localDate());
      setOnsetMechanism(ed.onsetMechanism || 'insidious');
      setMedicalDiagnosis(ed.medicalDiagnosis);
      setClinicalImpression(ed.clinicalImpression);
      setReferralSource(ed.referralSource || '');
      setDischargeCriteria(ed.dischargeCriteriaSummary || '');
      setShortTermGoals(ed.rehabilitationGoals?.shortTerm || []);
      setLongTermGoals(ed.rehabilitationGoals?.longTerm || []);
      setStructuredGoals(ed.structuredGoals || []);
      setIsOngoingLegacy(Boolean(ed.isOngoingLegacyEpisode));
      setIsDiagnosisConfirmed(ed.knownVsUnknownHistoryFlags?.isDiagnosisConfirmed ?? true);
      setIsOnsetDateExact(ed.knownVsUnknownHistoryFlags?.isOnsetDateExact ?? true);
      setAreBaselineGoalsFormalized(ed.knownVsUnknownHistoryFlags?.areBaselineGoalsFormalized ?? true);
    } else {
      // No fabricated defaults for a new Episode: start with empty strings/arrays and use placeholders as visual guides
      const defaultTitle = `${bi('حلقة رعاية:', 'Episode of Care:')} ${p.fullNameAr || p.fullName}`;
      defaultAutoTitleRef.current = defaultTitle;
      setTitle(defaultTitle);
      setPrimarySpecialty('musculoskeletal');
      setAffectedBodyRegion(COMMON_BODY_REGIONS[0].en);
      setCustomBodyRegion('');
      setOnsetDate(localDate());
      setOnsetMechanism('insidious');
      setMedicalDiagnosis(p.medicalHistory || '');
      setClinicalImpression(p.generalNotes || '');
      setReferralSource('');
      setDischargeCriteria('');
      setShortTermGoals([]);
      setLongTermGoals([]);
      setStructuredGoals([]);
      setIsOngoingLegacy(false);
      setIsDiagnosisConfirmed(true);
      setIsOnsetDateExact(true);
      setAreBaselineGoalsFormalized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, episodeToEditId, patient.id]);

  if (!isOpen) return null;

  const handleSelectGlossaryEntry = (entry: BilingualGlossaryEntry) => {
    const nextBilingualTitle = `${entry.ar} — ${entry.en}`;
    const trimmedTitle = title.trim();
    if (
      !trimmedTitle ||
      trimmedTitle === defaultAutoTitleRef.current ||
      trimmedTitle === lastGlossaryTitleRef.current
    ) {
      setTitle(nextBilingualTitle);
      lastGlossaryTitleRef.current = nextBilingualTitle;
    }

    const formattedDiagnosis = `${entry.ar} (${entry.en})`;
    setMedicalDiagnosis((prev) => {
      const existing = prev.trim();
      if (!existing) return formattedDiagnosis;
      if (existing.includes(entry.ar) && existing.includes(entry.en)) return prev;
      return `${existing}\n${formattedDiagnosis}`;
    });

    setGlossaryQuery('');
    setGlossaryOpen(false);
  };

  const handleAddShortGoal = () => {
    if (newShortGoal.trim()) {
      setShortTermGoals([...shortTermGoals, newShortGoal.trim()]);
      setNewShortGoal('');
    }
  };

  const handleRemoveShortGoal = (index: number) => {
    setShortTermGoals(shortTermGoals.filter((_, i) => i !== index));
  };

  const handleAddLongGoal = () => {
    if (newLongGoal.trim()) {
      setLongTermGoals([...longTermGoals, newLongGoal.trim()]);
      setNewLongGoal('');
    }
  };

  const handleRemoveLongGoal = (index: number) => {
    setLongTermGoals(longTermGoals.filter((_, i) => i !== index));
  };

  const finalBodyRegion = affectedBodyRegion === 'custom' ? customBodyRegion : affectedBodyRegion;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError(bi('يرجى إدخال عنوان واضح لحلقة الرعاية.', 'Please enter a clear episode title.'));
      return;
    }
    if (!medicalDiagnosis.trim()) {
      setError(bi('يرجى كتابة التشخيص الطبي الأولي.', 'Please enter the initial medical diagnosis.'));
      return;
    }
    if (!clinicalImpression.trim()) {
      setError(bi('يرجى كتابة الانطباع السريري للعلاج الطبيعي.', 'Please enter the physical therapy clinical impression.'));
      return;
    }
    if (!finalBodyRegion.trim()) {
      setError(bi('يرجى تحديد المنطقة التشريحية المصابة.', 'Please specify the affected body region.'));
      return;
    }

    setSaving(true);
    try {
      const payload: EpisodeClinicalData = {
        title: title.trim(),
        status: episodeToEdit?.status || 'active',
        primarySpecialty,
        startDate: onsetDate,
        endDate: episodeToEdit?.endDate,
        referralSource: referralSource.trim() || undefined,
        medicalDiagnosis: medicalDiagnosis.trim(),
        clinicalImpression: clinicalImpression.trim(),
        affectedBodyRegion: finalBodyRegion.trim(),
        onsetMechanism,
        onsetDate,
        rehabilitationGoals: {
          shortTerm: shortTermGoals,
          longTerm: longTermGoals,
        },
        structuredGoals: structuredGoals.length > 0 ? structuredGoals : undefined,
        dischargeCriteriaSummary: dischargeCriteria.trim() || undefined,
        isOngoingLegacyEpisode: isOngoingLegacy,
        knownVsUnknownHistoryFlags: isOngoingLegacy
          ? {
              isDiagnosisConfirmed,
              isOnsetDateExact,
              areBaselineGoalsFormalized,
            }
          : undefined,
      };

      // Pass prepared payload to parent callback
      onSaved({
        id: episodeToEdit?.id || '',
        patientId: patient.id,
        status: episodeToEdit?.status || 'active',
        primarySpecialty,
        startDate: onsetDate,
        createdAt: episodeToEdit?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        data: payload,
      });

      onClose();
    } catch (err: unknown) {
      console.error('Failed to save episode:', err);
      setError(
        err instanceof Error
          ? err.message
          : bi('حدث خطأ أثناء حفظ حلقة الرعاية.', 'An error occurred while saving the episode of care.')
      );
    } finally {
      setSaving(false);
    }
  };

  const displayAge = computePatientAge(p.dateOfBirth, p.age);

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="lg"
      hideCloseButton
      ariaLabel={
        isEditing
          ? bi('تعديل حلقة الرعاية السريرية', 'Edit Episode of Care')
          : bi('بدء حلقة رعاية جديدة', 'Start New Episode of Care')
      }
      closeLabel={bi('إغلاق', 'Close')}
      dir={isRtl ? 'rtl' : 'ltr'}
      className="bg-card border-card-line"
      bodyClassName="flex-1 min-h-0 flex flex-col overflow-hidden"
    >
        {/* Header */}
        <div className="px-6 py-5 bg-primary text-primary-foreground flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {isEditing ? bi('تعديل حلقة الرعاية السريرية', 'Edit Episode of Care') : bi('بدء حلقة رعاية جديدة', 'Start New Episode of Care')}
              </h2>
              <p className="text-xs text-white/85 mt-0.5">
                {bi('المريض:', 'Patient:')} <span className="font-semibold">{getPatientDisplayName(p, language)}</span> ({p.gender === 'male' ? bi('ذكر', 'Male') : bi('أنثى', 'Female')}، <bdi dir="ltr">{displayAge ?? '—'}</bdi> {bi('سنة', 'yrs')})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={bi('إغلاق', 'Close')}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {error && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-3 text-rose-800 dark:text-rose-300 text-sm">
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* New vs Ongoing Legacy Selection (Only if not editing) */}
          {!isEditing && (
            <div className="p-4 bg-muted/40 rounded-xl border border-card-line">
              <span className="text-xs font-bold text-foreground block mb-2">
                {bi('نوع حلقة الرعاية:', 'Episode Type:')}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${!isOngoingLegacy ? 'bg-primary/10 border-primary/30 ring-2 ring-primary/20' : 'bg-surface border-layer-line hover:bg-layer-hover'}`}>
                  <input
                    type="radio"
                    name="episodeKind"
                    checked={!isOngoingLegacy}
                    onChange={() => setIsOngoingLegacy(false)}
                    className="mt-1 text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="text-xs font-bold text-foreground block">
                      {bi('حلقة علاجية جديدة', 'New Episode')}
                    </span>
                    <span className="text-xs text-muted-foreground-1 block mt-0.5">
                      {bi(
                        'تبدأ اليوم بخطة تقييم وأهداف جديدة بالكامل.',
                        'Starts today with a full baseline evaluation and new goals.'
                      )}
                    </span>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isOngoingLegacy ? 'bg-amber-500/10 border-amber-500/30 ring-2 ring-amber-500/20' : 'bg-surface border-layer-line hover:bg-layer-hover'}`}>
                  <input
                    type="radio"
                    name="episodeKind"
                    checked={isOngoingLegacy}
                    onChange={() => setIsOngoingLegacy(true)}
                    className="mt-1 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-foreground block">
                      {bi('توثيق حلقة قديمة مستمرة', 'Legacy Ongoing Episode')}
                    </span>
                    <span className="text-xs text-muted-foreground-1 block mt-0.5">
                      {bi(
                        'توثيق حالة علاجية كانت قد بدأت مسبقاً خارج السجل الحالي.',
                        'Document an ongoing clinical case started previously outside this record.'
                      )}
                    </span>
                  </div>
                </label>
              </div>

              {/* Legacy ongoing explicit flags */}
              {isOngoingLegacy && (
                <div className="mt-3 pt-3 border-t border-card-divider space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground-1 block">
                    {bi('تأصيل دقة البيانات التاريخية المعروفة:', 'Historical Data Certainty:')}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-foreground">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isDiagnosisConfirmed}
                        onChange={(e) => setIsDiagnosisConfirmed(e.target.checked)}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span>{bi('التشخيص مؤكد طبياً', 'Diagnosis medically confirmed')}</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isOnsetDateExact}
                        onChange={(e) => setIsOnsetDateExact(e.target.checked)}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span>{bi('تاريخ البدء دقيق', 'Onset date exact')}</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={areBaselineGoalsFormalized}
                        onChange={(e) => setAreBaselineGoalsFormalized(e.target.checked)}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span>{bi('الأهداف المبدئية موثقة', 'Baseline goals formalized')}</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* D5: Bilingual Clinical Terminology Glossary Autocomplete */}
          {glossaryEnabled && (
            <div className="p-3.5 rounded-xl bg-surface/60 border border-card-line space-y-2 relative">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="episode-glossary-autocomplete-input"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-foreground"
                >
                  <BookOpen className="w-4 h-4 text-primary shrink-0" />
                  <span>
                    {bi(
                      'القاموس السريري الثنائي (التشخيص والعنوان)',
                      'Bilingual Clinical Terminology Glossary'
                    )}
                  </span>
                </label>
                {glossaryOpen && (
                  <button
                    type="button"
                    onClick={() => setGlossaryOpen(false)}
                    className="text-xs font-semibold text-muted-foreground-1 hover:text-foreground cursor-pointer"
                  >
                    {bi('إغلاق القائمة', 'Close list')}
                  </button>
                )}
              </div>

              <input
                id="episode-glossary-autocomplete-input"
                type="text"
                data-testid="episode-glossary-autocomplete-input"
                value={glossaryQuery}
                onFocus={() => setGlossaryOpen(true)}
                onChange={(e) => {
                  setGlossaryQuery(e.target.value);
                  setGlossaryOpen(true);
                }}
                placeholder={bi(
                  'ابحث في المصطلحات السريرية (مثال: انزلاق، كتف، lumbar، acl)...',
                  'Search clinical glossary (e.g., lumbar, acl, rotator cuff)...'
                )}
                className="w-full px-3.5 py-2 rounded-lg bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />

              {(glossaryOpen || glossaryQuery.trim().length > 0) && glossarySuggestions.length > 0 && (
                <div className="max-h-52 overflow-y-auto rounded-xl border border-layer-line bg-layer divide-y divide-card-divider shadow-md">
                  {glossarySuggestions.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      data-testid={`episode-glossary-option-${entry.id}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectGlossaryEntry(entry)}
                      className="w-full text-start px-3 py-2 hover:bg-primary/10 transition-colors flex flex-wrap items-center justify-between gap-2 text-xs cursor-pointer"
                    >
                      <span className="font-semibold text-foreground">{entry.ar}</span>
                      <span className="text-muted-foreground-1" dir="ltr">
                        {entry.en}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Episode Title */}
          <div>
            <label className="block text-xs font-bold text-foreground mb-1">
              {bi('عنوان حلقة الرعاية', 'Episode Title')} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={bi(
                'مثال: تأهيل تمزق الرباط الصليبي الأمامي للركبة اليمنى',
                'e.g., Right Knee ACL Tear Rehabilitation'
              )}
              className="w-full px-3.5 py-2.5 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Specialty & Body Region */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Primary Specialty */}
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                {bi('التخصص السريري الرئيسي', 'Primary Clinical Specialty')} <span className="text-rose-500">*</span>
              </label>
              <select
                value={primarySpecialty}
                onChange={(e) => setPrimarySpecialty(e.target.value as ClinicalSpecialty)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-surface border border-layer-line text-foreground text-xs sm:text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                {Object.values(CLINICAL_SPECIALTIES).map((spec) => (
                  <option key={spec.code} value={spec.code}>
                    {bi(spec.ar, spec.en)}
                  </option>
                ))}
              </select>
              {CLINICAL_SPECIALTIES[primarySpecialty].descriptionAr && (
                <span className="text-xs text-muted-foreground-1 mt-1 block">
                  {bi(
                    CLINICAL_SPECIALTIES[primarySpecialty].descriptionAr,
                    CLINICAL_SPECIALTIES[primarySpecialty].en
                  )}
                </span>
              )}
            </div>

            {/* Affected Body Region */}
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                {bi('المنطقة التشريحية المصابة', 'Affected Body Region')} <span className="text-rose-500">*</span>
              </label>
              <select
                value={affectedBodyRegion}
                onChange={(e) => setAffectedBodyRegion(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-surface border border-layer-line text-foreground text-xs sm:text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                {COMMON_BODY_REGIONS.map((reg) => (
                  <option key={reg.en} value={reg.en}>
                    {bi(reg.ar, reg.en)}
                  </option>
                ))}
                <option value="custom">{bi('أخرى (كتابة يدوية)...', 'Other (Custom)...')}</option>
              </select>
              {affectedBodyRegion === 'custom' && (
                <input
                  type="text"
                  required
                  value={customBodyRegion}
                  onChange={(e) => setCustomBodyRegion(e.target.value)}
                  placeholder={bi('حدد المنطقة التشريحية...', 'Specify anatomical region...', 'ناوچەی ئەناتۆمی دیاری بکە...')}
                  className="mt-2 w-full px-3 py-1.5 rounded-lg bg-surface border border-layer-line text-foreground text-xs"
                />
              )}
            </div>

          </div>

          {/* Dates & Onset Mechanism */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                {bi('تاريخ بدء الحلقة / الإصابة', 'Episode Start / Onset Date')} <span className="text-rose-500">*</span>
              </label>
              <DatePickerInput
                required
                value={onsetDate}
                onChange={(val) => setOnsetDate(val)}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                {bi('آلية الإصابة / البداية', 'Onset Mechanism')}
              </label>
              <select
                value={onsetMechanism}
                onChange={(e) => setOnsetMechanism(e.target.value as OnsetMechanism)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-surface border border-layer-line text-foreground text-xs sm:text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                {Object.values(ONSET_MECHANISMS).map((m) => (
                  <option key={m.code} value={m.code}>
                    {bi(m.ar, m.en)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Medical Diagnosis & Clinical Impression */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-foreground">
                  {bi('التشخيص الطبي الأولي', 'Medical Diagnosis')} <span className="text-rose-500">*</span>
                </label>
                {!isEditing && p.medicalHistory && (
                  <span className="text-xs text-primary flex items-center gap-1 font-medium bg-primary/10 px-2 py-0.5 rounded-md">
                    <Sparkles className="w-3 h-3" /> {bi('مستقى من ملخص المريض', 'Derived from patient summary')}
                  </span>
                )}
              </div>
              <AutoResizeTextarea
                required
                minRows={2}
                value={medicalDiagnosis}
                onChange={(e) => setMedicalDiagnosis(e.target.value)}
                placeholder={bi(
                  'التشخيص الطبي الصادر من الطبيب المحول أو تقارير الأشعة والتحاليل...',
                  'Medical diagnosis from referring physician or imaging/lab reports...'
                )}
                className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                {bi('الانطباع والتقييم السريري للعلاج الطبيعي', 'PT Clinical Impression & Assessment')} <span className="text-rose-500">*</span>
              </label>
              <AutoResizeTextarea
                required
                minRows={2}
                value={clinicalImpression}
                onChange={(e) => setClinicalImpression(e.target.value)}
                placeholder={bi(
                  'الانطباع السريري للمعالج: القصور الوظيفي، العجز الحركي، استجابة الأنسجة، ونمط الألم...',
                  "Therapist's clinical impression: functional deficits, movement impairments, tissue reactivity, and pain pattern..."
                )}
                className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          {/* Rehabilitation Goals Section */}
          <div className="p-4 bg-muted/40 rounded-xl border border-card-line space-y-4">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span>{bi('الأهداف التأهيلية السريرية', 'Clinical Rehabilitation Goals')}</span>
            </h4>

            {/* Short-Term Goals */}
            <div>
              <span className="text-xs font-semibold text-foreground block mb-1">
                {bi(
                  'الأهداف قصيرة المدى (2 إلى 4 أسابيع):',
                  'Short-Term Goals (2 to 4 weeks):'
                )}
              </span>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newShortGoal}
                  onChange={(e) => setNewShortGoal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddShortGoal();
                    }
                  }}
                  placeholder={bi(
                    'أضف هدفاً قصير المدى ثم اضغط إضافة...',
                    'Add a short-term goal and press Add...'
                  )}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-layer-line text-foreground text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddShortGoal}
                  className="px-3 py-1.5 bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> {bi('إضافة', 'Add')}
                </button>
              </div>
              <div className="space-y-1.5">
                {shortTermGoals.map((g, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-1.5 bg-surface rounded-lg border border-layer-line text-xs text-foreground">
                    <span>{g}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveShortGoal(idx)}
                      aria-label={bi('حذف الهدف', 'Remove goal')}
                      className="text-muted-foreground-2 hover:text-rose-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Long-Term Goals */}
            <div>
              <span className="text-xs font-semibold text-foreground block mb-1">
                {bi(
                  'الأهداف طويلة المدى وتطلعات التخريج (6 إلى 12 أسبوعاً):',
                  'Long-Term & Discharge Goals (6 to 12 weeks):'
                )}
              </span>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newLongGoal}
                  onChange={(e) => setNewLongGoal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddLongGoal();
                    }
                  }}
                  placeholder={bi(
                    'أضف هدفاً طويل المدى ثم اضغط إضافة...',
                    'Add a long-term goal and press Add...'
                  )}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-layer-line text-foreground text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddLongGoal}
                  className="px-3 py-1.5 bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> {bi('إضافة', 'Add')}
                </button>
              </div>
              <div className="space-y-1.5">
                {longTermGoals.map((g, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-1.5 bg-surface rounded-lg border border-layer-line text-xs text-foreground">
                    <span>{g}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveLongGoal(idx)}
                      aria-label={bi('حذف الهدف', 'Remove goal')}
                      className="text-muted-foreground-2 hover:text-rose-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Optional SMART Goals + GAS (-2..+2) Module (3.3 / R6) */}
            <React.Suspense fallback={null}>
              <SmartGoalsGasPanel
                goals={structuredGoals}
                onChange={setStructuredGoals}
              />
            </React.Suspense>

          </div>

          {/* Referral & Discharge Criteria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                {bi('الجهة أو الطبيب المحيل', 'Referral Source')}
              </label>
              <input
                type="text"
                value={referralSource}
                onChange={(e) => setReferralSource(e.target.value)}
                placeholder={bi('مثال: د. حيدر العبيدي / مستشفى الكفيل التخصصي', 'e.g., Dr. Haider Al-Obaidi / Al-Kafeel Hospital')}
                className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-xs sm:text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                {bi('معايير التخريج المبدئية', 'Discharge Criteria')}
              </label>
              <input
                type="text"
                value={dischargeCriteria}
                onChange={(e) => setDischargeCriteria(e.target.value)}
                placeholder={bi('معايير إنهاء الرعاية وتحقيق التعافي...', 'Discharge criteria and recovery goals...')}
                className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-xs sm:text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          {/* Clinician Review & Confirmation Banner */}
          <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl text-xs text-foreground leading-relaxed">
            <span className="font-bold text-primary block mb-1">
              {bi('إقرار ومراجعة المعالج السريري:', 'Clinician Review & Confirmation:')}
            </span>
            {bi(
              'بالموافقة على الحفظ، أؤكد بصفتي المعالج المسؤول مراجعة صحة التشخيص الطبي والانطباع السريري وأهداف التأهيل، وسيتم تشفير هذه الحلقة محلياً بواسطة AES-256-GCM وربطها بهوية المريض دون إمكانية فك تشفيرها إلا بمفتاح الخزنة.',
              'By confirming save, I verify as the treating clinician the accuracy of the medical diagnosis, clinical impression, and rehabilitation goals. This episode will be encrypted locally with AES-256-GCM and bound to the patient vault key.'
            )}
          </div>

        </form>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-muted/40 border-t border-card-divider flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold text-muted-foreground-1 hover:text-foreground bg-layer border border-layer-line hover:bg-layer-hover transition-colors cursor-pointer"
          >
            {bi('إلغاء', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 rounded-lg text-xs sm:text-sm font-bold text-primary-foreground bg-primary hover:bg-primary-hover disabled:opacity-50 transition-colors flex items-center gap-2 shadow-2xs cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>
              {saving
                ? bi('جاري الحفظ والتشفير...', 'Encrypting & Saving...')
                : isEditing
                  ? bi('حفظ التعديلات', 'Save Changes')
                  : bi('اعتماد وبدء حلقة الرعاية', 'Confirm & Start Episode')}
            </span>
          </button>
        </div>

    </ModalDialog>
  );
};
