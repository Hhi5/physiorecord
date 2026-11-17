// =======================================================================
// PhysioRecord — Deep Tendon Reflexes (DTR) Reference Tab Component
// Interactive Reference for Tendon Reflexes, NINDS 0–4+ Grading, and Jendrassik
// =======================================================================

import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import {
  DTR_DEFINITIONS,
  NINDS_REFLEX_GRADES,
  DTR_ASYMMETRY_RULE_AR,
  DTR_ASYMMETRY_RULE_EN,
  JENDRASSIK_MANEUVER_NOTE_AR,
  JENDRASSIK_MANEUVER_NOTE_EN,
  getDtrById
} from '../../data/clinicalToolkit/dtrData';
import type { DtrReflexId, DtrGrade } from '../../types/clinicalToolkit';
import { Activity, ShieldAlert, CheckCircle2, Stethoscope, Sparkles } from 'lucide-react';

export const DtrReferenceTab: React.FC = () => {
  const { bi } = useLanguage();

  const [selectedReflexId, setSelectedReflexId] = useState<DtrReflexId>('patellar');
  const [selectedSimulatedGrade, setSelectedSimulatedGrade] = useState<DtrGrade>('2+');

  const selectedReflex = getDtrById(selectedReflexId) || DTR_DEFINITIONS[3]; // Default to Patellar
  const activeGradeObj = NINDS_REFLEX_GRADES.find(g => g.grade === selectedSimulatedGrade) || NINDS_REFLEX_GRADES[2];

  return (
    <div className="space-y-6">
      
      {/* 1. Clinical Pearls: Asymmetry and Jendrassik Notices */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Asymmetry Rule Notice */}
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3 text-amber-950 dark:text-amber-200 text-sm">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-900 dark:text-amber-100 flex items-center gap-1.5">
              <span>
                {bi(
                  'قاعدة عدم التناظر بين الجانبين (Asymmetry Rule)',
                  'Bilateral Asymmetry Clinical Rule',
                  'ڕێسای نایەکسانیی نێوان هەردوو لا (Asymmetry Rule)'
                )}
              </span>
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              {bi(DTR_ASYMMETRY_RULE_AR, DTR_ASYMMETRY_RULE_EN)}
            </p>
          </div>
        </div>

        {/* Jendrassik Maneuver Notice */}
        <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-xl p-4 flex items-start gap-3 text-sky-950 dark:text-sky-200 text-sm">
          <Sparkles className="w-5 h-5 flex-shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-sky-900 dark:text-sky-100 flex items-center gap-1.5">
              <span>
                {bi(
                  'مناورة جيندراسيك للتعزيز (Jendrassik Maneuver)',
                  'Jendrassik Reinforcement Maneuver',
                  'جوڵەی بەهێزکەری جیندراسیک (Jendrassik Maneuver)'
                )}
              </span>
            </p>
            <p className="text-xs text-sky-800 dark:text-sky-300 leading-relaxed">
              {bi(JENDRASSIK_MANEUVER_NOTE_AR, JENDRASSIK_MANEUVER_NOTE_EN)}
            </p>
          </div>
        </div>

      </div>

      {/* 2. Interactive Five Core Reflex Cards Selector */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center justify-between">
          <span>
            {bi(
              'اختر المنعكس الوتري العميق للفحص:',
              'Select Deep Tendon Reflex (DTR):',
              'کاردانەوەی ژێیە قووڵەکە هەڵبژێرە بۆ پشکنین:'
            )}
          </span>
          <span className="text-xs font-normal text-slate-400">
            {bi('5 منعكسات أساسية', '5 Essential Reflexes', '٥ کاردانەوەی سەرەکی')}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {DTR_DEFINITIONS.map(dtr => {
            const isSelected = selectedReflexId === dtr.reflexId;
            return (
              <button
                key={dtr.reflexId}
                onClick={() => setSelectedReflexId(dtr.reflexId)}
                className={`p-3.5 rounded-xl border text-start transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-primary-600 text-white border-primary-600 shadow-md shadow-primary-600/20 ring-2 ring-primary-500 ring-offset-1 dark:ring-offset-slate-900'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-black px-2 py-0.5 rounded ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800'
                    }`}>
                      {dtr.primaryRoot}
                    </span>
                    <span className={`text-xs font-mono ${isSelected ? 'text-primary-100' : 'text-slate-400'}`}>
                      {dtr.contributingRoots.join(', ')}
                    </span>
                  </div>
                  <div className="font-bold text-xs sm:text-sm leading-tight mt-1">
                    {bi(dtr.nameAr, dtr.nameEn)}
                  </div>
                </div>
                <div className={`text-xs mt-2 pt-1 border-t truncate ${
                  isSelected ? 'border-primary-500/50 text-primary-100' : 'border-slate-100 dark:border-slate-700 text-slate-400'
                }`}>
                  {bi(dtr.peripheralNerveAr, dtr.peripheralNerveEn)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Detailed Selected Reflex View */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm space-y-5">
        
        {/* Title & Root Badges */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-primary-100 dark:bg-primary-950 text-primary-800 dark:text-primary-200">
                {bi('الجذر الأساسي: ', 'Primary Root: ', 'ڕەگی سەرەکی: ')}{selectedReflex.primaryRoot}
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                {bi('الجذور المساعدة: ', 'Contributing: ', 'ڕەگە یاریدەدەرەکان: ')}{selectedReflex.contributingRoots.join(', ')}
              </span>
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">
              {bi(selectedReflex.nameAr, selectedReflex.nameEn)}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {bi(selectedReflex.nameEn, selectedReflex.nameAr, selectedReflex.nameEn)}
            </p>
          </div>

          <div className="text-end">
            <span className="inline-block px-3 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
              {bi(selectedReflex.peripheralNerveAr, selectedReflex.peripheralNerveEn)}
            </span>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {bi(selectedReflex.peripheralNerveEn, selectedReflex.peripheralNerveAr, selectedReflex.peripheralNerveEn)}
            </p>
          </div>
        </div>

        {/* Anatomical Testing Parameters Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Tapping Site Box */}
          <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Stethoscope className="w-3.5 h-3.5 text-primary-600" />
              <span>
                {bi(
                  'موضع القرع والشاكوش (Tapping Site):',
                  'Tapping Site & Technique:',
                  'شوێنی لێدانی چەکوش (Tapping Site):'
                )}
              </span>
            </div>
            <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
              {bi(selectedReflex.tappingSiteAr, selectedReflex.tappingSiteEn)}
            </p>
          </div>

          {/* Normal Response Box */}
          <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                {bi(
                  'الاستجابة الطبيعية السوية (Normal Response):',
                  'Normal Physiological Response:',
                  'وەڵامدانەوەی ئاسایی (Normal Response):'
                )}
              </span>
            </div>
            <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
              {bi(selectedReflex.normalResponseAr, selectedReflex.normalResponseEn)}
            </p>
          </div>

          {/* Reinforcement Technique Box */}
          <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-600" />
              <span>
                {bi(
                  'تقنية التعزيز المعتمدة (Reinforcement):',
                  'Reinforcement Technique:',
                  'تەکنیکی بەهێزکردنی پەسەندکراو (Reinforcement):'
                )}
              </span>
            </div>
            <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
              {bi(selectedReflex.reinforcementTechniqueAr, selectedReflex.reinforcementTechniqueEn)}
            </p>
          </div>

        </div>

        {/* Clinical Significance Box */}
        <div className="bg-card shadow-2xs rounded-xl p-4 space-y-1">
          <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>
              {bi(
                'الأهمية السريرية والتفسير التشخيصي:',
                'Clinical Diagnostic Significance:',
                'گرنگی کلینیکی و لێکدانەوەی دەستنیشانکردن:'
              )}
            </span>
          </div>
          <p className="text-xs text-foreground leading-relaxed">
            {selectedReflex.clinicalSignificanceAr}
          </p>
        </div>

      </div>

      {/* 4. Interactive NINDS 0 to 4+ Reflex Grade Simulator */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary-600" />
              <span>
                {bi(
                  'مقياس NINDS المعياري لدرجات المنعكسات الوترية (0 إلى 4+)',
                  'NINDS Standard Reflex Grading Scale (0 to 4+)',
                  'پێوەری ستانداردی NINDS بۆ پلەکانی کاردانەوەی ژێیەکان (0 بۆ +4)'
                )}
              </span>
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {bi(
                'انقر فوق الدرجة لاستعراض الدلالة السريرية والمعيار الفسيولوجي المعتمد',
                'Click a grade to view its clinical interpretation and pathology criteria',
                'کرتە لەسەر پلەیەک بکە بۆ بینینی واتای کلینیکی و پێوەری فیسیۆلۆژیی پەسەندکراو'
              )}
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            NINDS / Bates' Guide Standard
          </span>
        </div>

        {/* Grade Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {NINDS_REFLEX_GRADES.map(g => {
            const isSelected = selectedSimulatedGrade === g.grade;
            return (
              <button
                key={g.grade}
                onClick={() => setSelectedSimulatedGrade(g.grade)}
                className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                  isSelected
                    ? g.grade === '0'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/20'
                      : g.grade === '4+'
                      ? 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-600/20'
                      : 'bg-primary-600 text-white border-primary-600 shadow-md shadow-primary-600/20'
                    : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <span className="text-lg font-black font-mono">{g.grade}</span>
                <span className="text-xs font-medium truncate w-full text-center">
                  {g.grade === '0' ? bi('غائب', 'Absent', 'نەبوو') :
                   g.grade === '1+' ? bi('كليل / خامل', 'Hypoactive', 'کەم / خاو') :
                   g.grade === '2+' ? bi('طبيعي معتاد', 'Normal', 'ئاسایی') :
                   g.grade === '3+' ? bi('نشط بزيادة', 'Brisk', 'چالاک / خێرا') :
                   bi('مفرط + رمع', 'Clonus', 'زیادەڕۆ + لەرزین')}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active Grade Detailed Interpretation Box */}
        <div className={`p-4 rounded-xl border transition-all ${
          activeGradeObj.grade === '0'
            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-950 dark:text-rose-100'
            : activeGradeObj.grade === '4+'
            ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800 text-purple-950 dark:text-purple-100'
            : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'
        }`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="font-bold text-sm">
              {bi(activeGradeObj.labelAr, activeGradeObj.labelEn)}
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              activeGradeObj.isPhysiological
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
            }`}>
              {activeGradeObj.isPhysiological
                ? bi('فسيولوجي / محتمل طبيعياً', 'Physiological / May be Normal', 'فیسیۆلۆژی / لەوانەیە ئاسایی بێت')
                : bi('مرضي يستلزم التقصي', 'Pathological Finding', 'نەخۆشییە و پێویستی بە بەدواداچوونە')}
            </span>
          </div>
          <p className="text-xs leading-relaxed font-medium">
            {bi(activeGradeObj.clinicalInterpretationAr, activeGradeObj.clinicalInterpretationEn)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">
            {bi(activeGradeObj.clinicalInterpretationEn, activeGradeObj.clinicalInterpretationAr, activeGradeObj.clinicalInterpretationEn)}
          </p>
        </div>

      </div>

    </div>
  );
};
