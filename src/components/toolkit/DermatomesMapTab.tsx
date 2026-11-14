import React, { useState, useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import {
  ASIA_ISNCSCI_SENSORY_LEVELS,
  DERMATOME_DEFINITIONS,
  DERMATOMAL_OVERLAP_GENERAL_NOTE_AR,
  DERMATOMAL_OVERLAP_GENERAL_NOTE_EN,
  getDermatomeByRoot
} from '../../data/clinicalToolkit/dermatomesData';
import type { SpinalLevel, SpinalRegionGroup } from '../../types/clinicalToolkit';
import { BodyMapSlot } from '../ui/BodyMapSlot';
import { Search, Info, RotateCcw } from 'lucide-react';

export const DermatomesMapTab: React.FC = () => {
  const { bi } = useLanguage();

  const [activeRoot, setActiveRoot] = useState<SpinalLevel>('C6');
  const [activeView, setActiveView] = useState<'anterior' | 'posterior'>('anterior');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<SpinalRegionGroup | 'all'>('all');

  const selectedDermatome = useMemo(() => {
    return getDermatomeByRoot(activeRoot) || DERMATOME_DEFINITIONS[0];
  }, [activeRoot]);

  // Filtered roots based on search or group
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return DERMATOME_DEFINITIONS.filter(d => {
      const matchGroup = selectedGroupFilter === 'all' || d.regionGroup === selectedGroupFilter;
      if (!q) return matchGroup;

      const matchRoot = d.rootLevel.toLowerCase().includes(q);
      const matchEn = d.canonicalRegionEn.toLowerCase().includes(q) || d.keySensoryPointEn.toLowerCase().includes(q);
      const matchAr = d.canonicalRegionAr.includes(q) || d.keySensoryPointAr.includes(q);
      return matchGroup && (matchRoot || matchEn || matchAr);
    });
  }, [searchQuery, selectedGroupFilter]);

  const handleSelectRoot = (root: SpinalLevel) => {
    setActiveRoot(root);
  };

  return (
    <div className="space-y-6">
      {/* Overview & Clinical Notice */}
      <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-xl p-4 flex items-start gap-3 text-sky-900 dark:text-sky-200 text-sm">
        <Info className="w-5 h-5 flex-shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-sky-950 dark:text-sky-100">
            {bi(
              'قاعدة التداخل الحسي للقطاعات الجلدية (Dermatomal Overlap)',
              'Clinical Dermatomal Overlap Rule',
              'ڕێسای تێکەڵبوونی هەستیی دێرماتۆمەکان (Dermatomal Overlap)'
            )}
          </p>
          <p className="text-xs text-sky-800 dark:text-sky-300 leading-relaxed">
            {bi(DERMATOMAL_OVERLAP_GENERAL_NOTE_AR, DERMATOMAL_OVERLAP_GENERAL_NOTE_EN)}
          </p>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute top-3 start-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={bi(
              'ابحث بالجذر (C6, L4..) أو بالمنطقة (Thumb, Knee, إبهام القدم..)',
              'Search by root (C6, L4..) or region (Thumb, Knee..)',
              'گەڕان بەدوای ڕەگ (C6, L4..) یان ناوچە (Thumb, Knee..)'
            )}
            className="w-full ps-9 pe-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute top-2.5 end-2.5 text-xs text-slate-400 hover:text-slate-600 px-1"
            >
              ✕
            </button>
          )}
        </div>

        {/* Region Group Buttons */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-medium overflow-x-auto">
          {(['all', 'cervical', 'thoracic', 'lumbar', 'sacral'] as const).map(group => (
            <button
              key={group}
              onClick={() => setSelectedGroupFilter(group)}
              className={`px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                selectedGroupFilter === group
                  ? 'bg-white dark:bg-slate-700 text-sky-700 dark:text-sky-300 shadow-sm font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              {group === 'all' && bi('الكل', 'All', 'هەموو')}
              {group === 'cervical' && bi('رقبي (C)', 'Cervical', 'ملی (C)')}
              {group === 'thoracic' && bi('صدري (T)', 'Thoracic', 'سنگی (T)')}
              {group === 'lumbar' && bi('قطني (L)', 'Lumbar', 'کەمەری (L)')}
              {group === 'sacral' && bi('عجزي (S)', 'Sacral', 'کلێنجەیی (S)')}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Table-First ASIA Sensory Reference (No SVG) + Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left / Center: Table-First C2..S4-5 Key Sensory Table + Optional BodyMapSlot */}
        <div className="lg:col-span-6 space-y-3">
          <BodyMapSlot
            region="dermatomes"
            selectedRoot={activeRoot}
            legacyFallback={() => (
        <div className="lg:col-span-6 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col items-center relative">
          {/* View Toggle (Anterior / Posterior) */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm mb-4 self-center sm:self-start">
            <button
              onClick={() => setActiveView('anterior')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeView === 'anterior'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              {bi('المشهد الأمامي (Anterior)', 'Anterior View', 'دیمەنی پێشەوە (Anterior)')}
            </button>
            <button
              onClick={() => setActiveView('posterior')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeView === 'posterior'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              {bi('المشهد الخلفي (Posterior)', 'Posterior View', 'دیمەنی پشتەوە (Posterior)')}
            </button>
          </div>

          {/* SVG Canvas */}
          <div className="w-full max-w-[300px] sm:max-w-[320px] aspect-[200/420] relative select-none flex items-center justify-center">
            {activeView === 'anterior' ? (
              /* ANTERIOR VIEW SVG */
              <svg viewBox="0 0 200 420" className="w-full h-full drop-shadow-sm">
                {/* Head C2 */}
                <circle
                  cx="100" cy="35" r="22"
                  className={`cursor-pointer transition-all ${activeRoot === 'C2' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('C2')}
                />
                <text x="100" y="39" fontSize="12" textAnchor="middle" fill="#475569" className="font-bold pointer-events-none">C2</text>

                {/* Neck C3 */}
                <path
                  d="M 85 58 Q 100 64 115 58 L 125 75 Q 100 82 75 75 Z"
                  className={`cursor-pointer transition-all ${activeRoot === 'C3' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('C3')}
                />
                <text x="100" y="69" fontSize="12" textAnchor="middle" fill="#475569" className="font-semibold pointer-events-none">C3</text>

                {/* Shoulders C4 */}
                <path
                  d="M 75 75 L 50 85 L 58 100 L 78 90 Z"
                  className={`cursor-pointer transition-all ${activeRoot === 'C4' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('C4')}
                />
                <path
                  d="M 125 75 L 150 85 L 142 100 L 122 90 Z"
                  className={`cursor-pointer transition-all ${activeRoot === 'C4' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('C4')}
                />
                <text x="100" y="88" fontSize="12" textAnchor="middle" fill="#64748b" className="pointer-events-none">C4</text>

                {/* Upper Arms C5 */}
                <path
                  d="M 50 85 L 35 130 L 45 132 L 58 100 Z"
                  className={`cursor-pointer transition-all ${activeRoot === 'C5' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('C5')}
                />
                <path
                  d="M 150 85 L 165 130 L 155 132 L 142 100 Z"
                  className={`cursor-pointer transition-all ${activeRoot === 'C5' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('C5')}
                />

                {/* Forearm & Thumb C6 */}
                <path
                  d="M 35 130 L 22 180 L 32 183 L 45 132 Z"
                  className={`cursor-pointer transition-all ${activeRoot === 'C6' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('C6')}
                />
                <path
                  d="M 165 130 L 178 180 L 168 183 L 155 132 Z"
                  className={`cursor-pointer transition-all ${activeRoot === 'C6' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('C6')}
                />

                {/* Middle Finger C7 */}
                <rect
                  x="23" y="183" width="8" height="20" rx="3"
                  className={`cursor-pointer transition-all ${activeRoot === 'C7' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('C7')}
                />
                <rect
                  x="169" y="183" width="8" height="20" rx="3"
                  className={`cursor-pointer transition-all ${activeRoot === 'C7' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('C7')}
                />

                {/* Little Finger C8 */}
                <rect
                  x="14" y="181" width="7" height="18" rx="3"
                  className={`cursor-pointer transition-all ${activeRoot === 'C8' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('C8')}
                />
                <rect
                  x="179" y="181" width="7" height="18" rx="3"
                  className={`cursor-pointer transition-all ${activeRoot === 'C8' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('C8')}
                />

                {/* Thoracic Bands */}
                <path
                  d="M 78 90 L 122 90 L 120 115 L 80 115 Z"
                  className={`cursor-pointer transition-all ${activeRoot === 'T2' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('T2')}
                />
                <text x="100" y="106" fontSize="12" textAnchor="middle" fill="#475569" className="font-semibold pointer-events-none">T2</text>

                <path
                  d="M 80 115 L 120 115 L 118 140 L 82 140 Z"
                  className={`cursor-pointer transition-all ${activeRoot === 'T4' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('T4')}
                />
                <text x="100" y="131" fontSize="12" textAnchor="middle" fill="#475569" className="font-semibold pointer-events-none">T4</text>

                <path
                  d="M 82 140 L 118 140 L 116 165 L 84 165 Z"
                  className={`cursor-pointer transition-all ${activeRoot === 'T10' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('T10')}
                />
                <text x="100" y="156" fontSize="12" textAnchor="middle" fill="#475569" className="font-semibold pointer-events-none">T10</text>

                <path
                  d="M 84 165 L 116 165 L 112 185 L 88 185 Z"
                  className={`cursor-pointer transition-all ${activeRoot === 'T12' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('T12')}
                />
                <text x="100" y="179" fontSize="12" textAnchor="middle" fill="#475569" className="pointer-events-none">T12 / L1</text>

                {/* Lumbar & Sacral Lower Extremity */}
                {/* L2 Anterior Thigh */}
                <path
                  d="M 88 185 L 100 190 L 100 230 L 80 230 L 84 185 Z"
                  className={`cursor-pointer transition-all ${activeRoot === 'L2' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('L2')}
                />
                <path
                  d="M 112 185 L 100 190 L 100 230 L 120 230 L 116 185 Z"
                  className={`cursor-pointer transition-all ${activeRoot === 'L2' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('L2')}
                />
                <text x="89" y="210" fontSize="12" textAnchor="middle" fill="#475569" className="pointer-events-none font-semibold">L2</text>
                <text x="111" y="210" fontSize="12" textAnchor="middle" fill="#475569" className="pointer-events-none font-semibold">L2</text>

                {/* L3 Knee & Medial Distal Thigh */}
                <rect
                  x="78" y="232" width="20" height="40" rx="4"
                  className={`cursor-pointer transition-all ${activeRoot === 'L3' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('L3')}
                />
                <rect
                  x="102" y="232" width="20" height="40" rx="4"
                  className={`cursor-pointer transition-all ${activeRoot === 'L3' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('L3')}
                />
                <text x="87" y="255" fontSize="12" textAnchor="middle" fill="#475569" className="pointer-events-none font-semibold">L3</text>
                <text x="113" y="255" fontSize="12" textAnchor="middle" fill="#475569" className="pointer-events-none font-semibold">L3</text>

                {/* L4 Medial Leg */}
                <path
                  d="M 78 274 L 88 274 L 86 340 L 76 340 Z"
                  className={`cursor-pointer transition-all ${activeRoot === 'L4' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('L4')}
                />
                <path
                  d="M 112 274 L 122 274 L 124 340 L 114 340 Z"
                  className={`cursor-pointer transition-all ${activeRoot === 'L4' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('L4')}
                />
                <text x="80" y="294" fontSize="12" textAnchor="middle" fill="#475569" className="pointer-events-none font-semibold">L4</text>
                <text x="120" y="294" fontSize="12" textAnchor="middle" fill="#475569" className="pointer-events-none font-semibold">L4</text>

                {/* L5 Anterolateral Leg & Dorsum Foot */}
                <path
                  d="M 88 274 L 98 274 L 96 340 L 86 340 Z"
                  className={`cursor-pointer transition-all ${activeRoot === 'L5' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('L5')}
                />
                <path
                  d="M 102 274 L 112 274 L 114 340 L 104 340 Z"
                  className={`cursor-pointer transition-all ${activeRoot === 'L5' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('L5')}
                />
                <text x="91" y="324" fontSize="12" textAnchor="middle" fill="#475569" className="pointer-events-none font-semibold">L5</text>
                <text x="109" y="324" fontSize="12" textAnchor="middle" fill="#475569" className="pointer-events-none font-semibold">L5</text>

                {/* S1 Lateral Foot */}
                <rect
                  x="74" y="342" width="22" height="15" rx="3"
                  className={`cursor-pointer transition-all ${activeRoot === 'S1' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('S1')}
                />
                <rect
                  x="104" y="342" width="22" height="15" rx="3"
                  className={`cursor-pointer transition-all ${activeRoot === 'S1' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('S1')}
                />
                <text x="84" y="354" fontSize="12" textAnchor="middle" fill="#475569" className="pointer-events-none font-semibold">S1</text>
                <text x="116" y="354" fontSize="12" textAnchor="middle" fill="#475569" className="pointer-events-none font-semibold">S1</text>
              </svg>
            ) : (
              /* POSTERIOR VIEW SVG */
              <svg viewBox="0 0 200 420" className="w-full h-full drop-shadow-sm">
                {/* Posterior Head C2 */}
                <circle
                  cx="100" cy="35" r="22"
                  className={`cursor-pointer transition-all ${activeRoot === 'C2' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('C2')}
                />
                <text x="100" y="39" fontSize="12" textAnchor="middle" fill="#475569" className="font-bold pointer-events-none">C2</text>

                {/* Upper Back Thoracic */}
                <path
                  d="M 75 75 L 125 75 L 120 185 L 80 185 Z"
                  className="fill-slate-200 dark:fill-slate-700 stroke-slate-400"
                />
                <text x="100" y="132" fontSize="12" textAnchor="middle" fill="#64748b">T1–T12</text>

                {/* Buttocks & Sacral S3 */}
                <circle
                  cx="85" cy="205" r="14"
                  className={`cursor-pointer transition-all ${activeRoot === 'S3' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('S3')}
                />
                <circle
                  cx="115" cy="205" r="14"
                  className={`cursor-pointer transition-all ${activeRoot === 'S3' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('S3')}
                />
                <text x="82" y="199" fontSize="12" textAnchor="middle" fill="#475569" className="font-semibold pointer-events-none">S3</text>
                <text x="118" y="199" fontSize="12" textAnchor="middle" fill="#475569" className="font-semibold pointer-events-none">S3</text>

                {/* Perianal S4-S5 */}
                <circle
                  cx="100" cy="216" r="6"
                  className={`cursor-pointer transition-all ${activeRoot === 'S4' || activeRoot === 'S5' ? 'fill-amber-400 stroke-amber-700 stroke-2' : 'fill-amber-100 stroke-amber-500 hover:fill-amber-200'}`}
                  onClick={() => handleSelectRoot('S4')}
                />
                <text x="100" y="222" fontSize="12" textAnchor="middle" fill="#92400e" className="font-bold pointer-events-none">S4-5</text>

                {/* Posterior Thigh S2 */}
                <rect
                  x="82" y="225" width="16" height="50" rx="3"
                  className={`cursor-pointer transition-all ${activeRoot === 'S2' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('S2')}
                />
                <rect
                  x="102" y="225" width="16" height="50" rx="3"
                  className={`cursor-pointer transition-all ${activeRoot === 'S2' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('S2')}
                />
                <text x="89" y="252" fontSize="12" textAnchor="middle" fill="#475569" className="font-semibold pointer-events-none">S2</text>
                <text x="111" y="252" fontSize="12" textAnchor="middle" fill="#475569" className="font-semibold pointer-events-none">S2</text>

                {/* Posterior Calf S1 */}
                <rect
                  x="78" y="280" width="18" height="60" rx="3"
                  className={`cursor-pointer transition-all ${activeRoot === 'S1' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('S1')}
                />
                <rect
                  x="104" y="280" width="18" height="60" rx="3"
                  className={`cursor-pointer transition-all ${activeRoot === 'S1' ? 'fill-sky-400 stroke-sky-700 stroke-2' : 'fill-slate-200 dark:fill-slate-700 stroke-slate-400 hover:fill-sky-200'}`}
                  onClick={() => handleSelectRoot('S1')}
                />
                <text x="87" y="316" fontSize="12" textAnchor="middle" fill="#475569" className="font-semibold pointer-events-none">S1</text>
                <text x="113" y="316" fontSize="12" textAnchor="middle" fill="#475569" className="font-semibold pointer-events-none">S1</text>
              </svg>
            )}
          </div>
        </div>
            )}
          />

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-200">
            {bi(
              'التسجيل يتبع فحص المعالج نفسه؛ هذا الجدول أداة توثيق مرجعية لمستويات ASIA الحسية (C2–S4-5).',
              "Scoring follows the clinician's own exam; this table is a recording aid for ASIA sensory key points (C2–S4-5).",
              'تۆمارکردن بەپێی پشکنینی خودی چارەسەرکار دەبێت؛ ئەم خشتەیە ئامرازێکی یارمەتیدەرە بۆ تۆمارکردنی ئاستە هەستییەکانی ASIA (C2–S4-5).'
            )}
          </div>

          <div className="overflow-x-auto max-h-[460px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-start font-bold">{bi('المستوى', 'Level', 'ئاست')}</th>
                  <th className="px-3 py-2 text-start font-bold">
                    {bi(
                      'المنطقة والنقطة الحسية (ASIA)',
                      'Anatomical Region & Key Sensory Point',
                      'ناوچەی توێکاری و خاڵی هەستیی سەرەکی (ASIA)'
                    )}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {ASIA_ISNCSCI_SENSORY_LEVELS.filter(
                  (row) => selectedGroupFilter === 'all' || row.regionGroup === selectedGroupFilter
                ).map((row) => {
                  const mappedRoot = (row.rootLevel === 'S4-5' ? 'S4' : row.rootLevel) as SpinalLevel;
                  const isActive =
                    activeRoot === mappedRoot ||
                    (row.rootLevel === 'S4-5' && (activeRoot === 'S4' || activeRoot === 'S5'));
                  return (
                    <tr
                      key={row.rootLevel}
                      onClick={() => handleSelectRoot(mappedRoot)}
                      className={`cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-sky-50 dark:bg-sky-950/40'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="px-3 py-2 font-mono font-bold text-sky-700 dark:text-sky-300 whitespace-nowrap">
                        {row.rootLevel}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {bi(row.regionAr, row.regionEn)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {bi(row.keyPointAr, row.keyPointEn)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Root Quick Selector & Detail Panel (lg:col-span-6) */}
        <div className="lg:col-span-6 space-y-4">
          {/* Quick Root Selector Pills */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {bi('المستويات الشوكية المتاحة:', 'Available Spinal Roots:', 'ڕەگە بڕبڕەییە بەردەستەکان:')}
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
              {searchResults.map(d => (
                <button
                  key={d.rootLevel}
                  onClick={() => handleSelectRoot(d.rootLevel)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                    activeRoot === d.rootLevel
                      ? 'bg-sky-600 text-white shadow-sm ring-2 ring-sky-300 dark:ring-sky-800'
                      : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:border-sky-400'
                  }`}
                >
                  {d.rootLevel}
                </button>
              ))}
            </div>
          </div>

          {/* Detailed Info Card */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <div>
                <span className="text-xs font-mono font-bold uppercase text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950 px-2 py-0.5 rounded">
                  {selectedDermatome.asiaCode || selectedDermatome.rootLevel}
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50 mt-1">
                  {bi(selectedDermatome.canonicalRegionAr, selectedDermatome.canonicalRegionEn)}
                </h3>
              </div>
              <button
                onClick={() => handleSelectRoot('C6')}
                title={bi('إعادة ضبط', 'Reset', 'ڕێکخستنەوە')}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Structured Table */}
            <div className="space-y-2.5 text-xs">
              <div className="flex items-start justify-between bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg">
                <span className="font-semibold text-slate-500">
                  {bi('نقطة الفحص المعيارية (ASIA Point):', 'Key Sensory Point:', 'خاڵی هەستیی سەرەکی (ASIA Point):')}
                </span>
                <span className="font-bold text-slate-800 dark:text-slate-200 text-end max-w-[65%]">
                  {bi(selectedDermatome.keySensoryPointAr, selectedDermatome.keySensoryPointEn)}
                </span>
              </div>

              <div className="flex items-start justify-between bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg">
                <span className="font-semibold text-slate-500">
                  {bi('المنطقة باللغة المقابلة:', 'Secondary Language:', 'ناوچە بە زمانی دووەم:')}
                </span>
                <span className="font-medium text-slate-600 dark:text-slate-300 text-end max-w-[65%]">
                  {bi(
                    selectedDermatome.canonicalRegionEn,
                    selectedDermatome.canonicalRegionAr,
                    selectedDermatome.canonicalRegionEn
                  )}
                </span>
              </div>

              <div className="flex items-start justify-between bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg">
                <span className="font-semibold text-slate-500">
                  {bi('المصدر العلمي:', 'Scientific Source:', 'سەرچاوەی زانستی:')}
                </span>
                <span className="font-mono text-slate-500 dark:text-slate-400 text-end text-xs">
                  {selectedDermatome.primarySourceCitation}
                </span>
              </div>
            </div>

            {/* Overlap & Clinical Pearl */}
            <div className="bg-amber-50 dark:bg-amber-950/40 border-s-4 border-amber-500 p-3 rounded-e-lg text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-bold flex items-center gap-1">
                <span>💡</span>
                <span>
                  {bi(
                    'ملاحظة التداخل والتباين السريري:',
                    'Clinical Overlap & Anatomical Variation:',
                    'تێبینی تێکەڵبوون و جیاوازیی کلینیکی:'
                  )}
                </span>
              </p>
              <p className="leading-relaxed">
                {bi(selectedDermatome.overlapClinicalNotesAr, selectedDermatome.overlapClinicalNotesEn)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
