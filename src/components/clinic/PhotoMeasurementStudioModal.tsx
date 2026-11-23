// =======================================================================
// PhysioRecord — Phase E4 Photo Measurement Studio Modal (Konva.js MIT)
// Powered by Konva + react-konva for high-accuracy clinical posture,
// radiograph & wound/Scar measurements with zoom/pan, Undo/Redo, scale
// calibration, 3-point goniometry, 4-point Cobb angles, linear calipers,
// directional arrows & non-destructive encrypted Dexie v9 export.
// =======================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Crosshair,
  Eye,
  Grid3x3,
  Hand,
  LayoutGrid,
  Maximize2,
  MoveDiagonal,
  Plus,
  Redo2,
  RotateCcw,
  Ruler,
  Save,
  Scale,
  ShieldCheck,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { ModalDialog } from '../ui/Dialog';
import {
  computeFourPointCobbAngleDegrees,
  computePhotoCalibrationScale,
  computePhotoDistanceMetrics,
  computeThreePointAngleDegrees,
  createDefaultPhotoAngleMeasurement,
  createDefaultPhotoArrowAnnotation,
  createDefaultPhotoCobbMeasurement,
  createDefaultPhotoDistanceMeasurement,
  formatPhotoDistanceBadgeText,
} from '../../utils/sharingInteropPhaseE';
import KonvaMeasurementCanvas, {
  type KonvaMeasurementCanvasHandle,
  type MeasurementToolMode,
} from './KonvaMeasurementCanvas';
import type {
  EncryptedAttachmentRecord,
  PhotoAngleMeasurement,
  PhotoAnnotationState,
  PhotoArrowAnnotation,
  PhotoCalibrationScale,
  PhotoCobbAngleMeasurement,
  PhotoDistanceMeasurement,
  PhotoPoint2D,
} from '../../types/clinicManagement';

export interface PhotoMeasurementStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  attachment: EncryptedAttachmentRecord | null;
  onSavedCopy?: (newRecord: EncryptedAttachmentRecord) => void;
}

type AnglePointRole = 'A' | 'B' | 'C';
type CobbPointRole = 'L1A' | 'L1B' | 'L2A' | 'L2B';
type TwoPointRole = 'start' | 'end';

function nextAngleRole(curr: AnglePointRole): AnglePointRole {
  if (curr === 'A') return 'B';
  if (curr === 'B') return 'C';
  return 'A';
}

function nextCobbRole(curr: CobbPointRole): CobbPointRole {
  if (curr === 'L1A') return 'L1B';
  if (curr === 'L1B') return 'L2A';
  if (curr === 'L2A') return 'L2B';
  return 'L1A';
}

function toPercent(norm: number): number {
  return Math.round(Math.max(0, Math.min(1, norm)) * 1000) / 10;
}

function withRecomputedAngle(
  angle: PhotoAngleMeasurement,
  aspectWidth: number,
  aspectHeight: number
): PhotoAngleMeasurement {
  const computed = computeThreePointAngleDegrees(
    angle.pointA,
    angle.vertexB,
    angle.pointC,
    aspectWidth,
    aspectHeight
  );
  return {
    ...angle,
    angleDegrees: computed.angleDegrees,
    supplementaryDegrees: computed.supplementaryDegrees,
  };
}

function withRecomputedCobb(
  cobb: PhotoCobbAngleMeasurement,
  aspectWidth: number,
  aspectHeight: number
): PhotoCobbAngleMeasurement {
  const computed = computeFourPointCobbAngleDegrees(
    cobb.line1Start,
    cobb.line1End,
    cobb.line2Start,
    cobb.line2End,
    aspectWidth,
    aspectHeight
  );
  return {
    ...cobb,
    angleDegrees: computed.angleDegrees,
    obtuseDegrees: computed.obtuseDegrees,
  };
}

function withRecomputedDistance(
  dist: PhotoDistanceMeasurement,
  imgW: number,
  imgH: number,
  calibration: PhotoCalibrationScale | null
): PhotoDistanceMeasurement {
  const m = computePhotoDistanceMetrics(dist.start, dist.end, imgW, imgH, calibration);
  return {
    ...dist,
    pixelLength: m.pixelLength,
    lengthMm: m.lengthMm,
    deltaXMm: m.deltaXMm,
    deltaYMm: m.deltaYMm,
    tiltFromHorizontalDeg: m.tiltFromHorizontalDeg,
  };
}

function buildInitialAnnotationState(
  starterLang: 'ar' | 'en' | 'ckb',
  aspectW: number,
  aspectH: number
): PhotoAnnotationState {
  return {
    showPlumbLine: true,
    plumbLineXPercent: 50,
    showHorizontalLevel: false,
    horizontalLevelYPercent: 50,
    gridMode: '3x3',
    angles: [
      withRecomputedAngle(
        createDefaultPhotoAngleMeasurement(1, starterLang),
        aspectW,
        aspectH
      ),
    ],
    cobbAngles: [],
    distances: [],
    arrows: [],
    calibration: null,
  };
}

export const PhotoMeasurementStudioModal: React.FC<PhotoMeasurementStudioModalProps> = ({
  isOpen,
  onClose,
  attachment,
  onSavedCopy,
}) => {
  const { language, bi } = useLanguage();
  const starterLang: 'ar' | 'en' | 'ckb' =
    language === 'en' ? 'en' : language === 'ckb' ? 'ckb' : 'ar';

  const naturalWidth =
    attachment?.widthPx && attachment.widthPx > 16 ? attachment.widthPx : null;
  const naturalHeight =
    attachment?.heightPx && attachment.heightPx > 16 ? attachment.heightPx : null;
  const hasNaturalDims = naturalWidth !== null && naturalHeight !== null;
  const aspectWidth = hasNaturalDims ? naturalWidth : 800;
  const aspectHeight = hasNaturalDims ? naturalHeight : 600;

  const [currentAttachment, setCurrentAttachment] = useState<EncryptedAttachmentRecord | null>(attachment);
  const [savedAnnotations, setSavedAnnotations] = useState<PhotoAnnotationState | null>(
    attachment?.annotations || null
  );

  const [state, setState] = useState<PhotoAnnotationState>(() =>
    attachment?.annotations || buildInitialAnnotationState(starterLang, aspectWidth, aspectHeight)
  );
  const [undoStack, setUndoStack] = useState<PhotoAnnotationState[]>([]);
  const [redoStack, setRedoStack] = useState<PhotoAnnotationState[]>([]);

  const [activeTool, setActiveTool] = useState<MeasurementToolMode>('angle3');
  const [activeAngleIndex, setActiveAngleIndex] = useState(0);
  const [activeAngleRole, setActiveAngleRole] = useState<AnglePointRole>('A');
  const [activeCobbIndex, setActiveCobbIndex] = useState(0);
  const [activeCobbRole, setActiveCobbRole] = useState<CobbPointRole>('L1A');
  const [activeDistanceIndex, setActiveDistanceIndex] = useState(0);
  const [activeDistanceRole, setActiveDistanceRole] = useState<TwoPointRole>('start');
  const [activeArrowIndex, setActiveArrowIndex] = useState(0);
  const [activeArrowRole, setActiveArrowRole] = useState<TwoPointRole>('start');

  // Scale calibration UI state
  const [calibDraftA, setCalibDraftA] = useState<PhotoPoint2D>({ xNorm: 0.15, yNorm: 0.85 });
  const [calibDraftB, setCalibDraftB] = useState<PhotoPoint2D>({ xNorm: 0.35, yNorm: 0.85 });
  const [calibPointRole, setCalibPointRole] = useState<'A' | 'B'>('A');
  const [calibLengthInput, setCalibLengthInput] = useState('10');
  const [calibUnit, setCalibUnit] = useState<'cm' | 'mm'>('cm');

  const [zoomPercent, setZoomPercent] = useState(100);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const emptyAnnotationState = useMemo<PhotoAnnotationState>(
    () => ({
      showPlumbLine: false,
      plumbLineXPercent: 50,
      showHorizontalLevel: false,
      horizontalLevelYPercent: 50,
      gridMode: 'none',
      angles: [],
      cobbAngles: [],
      distances: [],
      arrows: [],
      calibration: null,
    }),
    []
  );

  const canvasRef = useRef<KonvaMeasurementCanvasHandle | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastCommittedRef = useRef<PhotoAnnotationState | null>(null);

  useEffect(() => {
    if (!isOpen || !attachment) return;
    setCurrentAttachment(attachment);
    const initWidth = attachment.widthPx && attachment.widthPx > 16 ? attachment.widthPx : 800;
    const initHeight = attachment.heightPx && attachment.heightPx > 16 ? attachment.heightPx : 600;

    if (attachment.annotations) {
      setState(attachment.annotations);
      setSavedAnnotations(attachment.annotations);
      lastCommittedRef.current = attachment.annotations;
    } else {
      const initial = buildInitialAnnotationState(starterLang, initWidth, initHeight);
      setState(initial);
      setSavedAnnotations(null);
      lastCommittedRef.current = initial;
    }

    setUndoStack([]);
    setRedoStack([]);
    setActiveTool('angle3');
    setActiveAngleIndex(0);
    setActiveAngleRole('A');
    setActiveCobbIndex(0);
    setActiveCobbRole('L1A');
    setActiveDistanceIndex(0);
    setActiveDistanceRole('start');
    setActiveArrowIndex(0);
    setActiveArrowRole('start');
    setCalibDraftA({ xNorm: 0.15, yNorm: 0.85 });
    setCalibDraftB({ xNorm: 0.35, yNorm: 0.85 });
    setCalibPointRole('A');
    setCalibLengthInput('10');
    setCalibUnit('cm');
    setZoomPercent(100);
    setSaving(false);
    setSaveSuccess(false);
    setSaveError(null);
  }, [isOpen, attachment?.id, starterLang]);

  const commitSnapshot = useCallback((prevState?: PhotoAnnotationState) => {
    const snap = prevState || lastCommittedRef.current || stateRef.current;
    setUndoStack((hist) => [...hist.slice(-29), snap]);
    setRedoStack([]);
    lastCommittedRef.current = stateRef.current;
  }, []);

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const previous = prev[prev.length - 1];
      setRedoStack((r) => [...r, stateRef.current]);
      setState(previous);
      lastCommittedRef.current = previous;
      return prev.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      setUndoStack((u) => [...u, stateRef.current]);
      setState(next);
      lastCommittedRef.current = next;
      return prev.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, handleRedo, handleUndo]);

  if (!attachment) {
    return null;
  }

  const angles = state.angles;
  const cobbAngles = state.cobbAngles || [];
  const distances = state.distances || [];
  const arrows = state.arrows || [];

  const savedAngles = savedAnnotations?.angles || [];
  const savedCobb = savedAnnotations?.cobbAngles || [];
  const savedDist = savedAnnotations?.distances || [];
  const savedArrows = (savedAnnotations?.arrows || []).filter((a) => a.label.trim());

  const safeAngleIdx = Math.max(0, Math.min(activeAngleIndex, Math.max(0, angles.length - 1)));
  const activeAngle = angles[safeAngleIdx] || angles[0];

  const safeCobbIdx = Math.max(0, Math.min(activeCobbIndex, Math.max(0, cobbAngles.length - 1)));
  const activeCobb = cobbAngles[safeCobbIdx];

  const safeDistIdx = Math.max(0, Math.min(activeDistanceIndex, Math.max(0, distances.length - 1)));
  const activeDistance = distances[safeDistIdx];

  const safeArrowIdx = Math.max(0, Math.min(activeArrowIndex, Math.max(0, arrows.length - 1)));
  const activeArrow = arrows[safeArrowIdx];

  // Mutation helpers
  const mutateAnglePoint = (angleIdx: number, role: AnglePointRole, nextPoint: PhotoPoint2D, pushUndo: boolean) => {
    if (pushUndo) commitSnapshot(stateRef.current);
    setState((prev) => ({
      ...prev,
      angles: prev.angles.map((ang, i) => {
        if (i !== angleIdx) return ang;
        return withRecomputedAngle(
          {
            ...ang,
            pointA: role === 'A' ? nextPoint : ang.pointA,
            vertexB: role === 'B' ? nextPoint : ang.vertexB,
            pointC: role === 'C' ? nextPoint : ang.pointC,
          },
          aspectWidth,
          aspectHeight
        );
      }),
    }));
  };

  const mutateCobbPoint = (cobbIdx: number, role: CobbPointRole, nextPoint: PhotoPoint2D, pushUndo: boolean) => {
    if (pushUndo) commitSnapshot(stateRef.current);
    setState((prev) => ({
      ...prev,
      cobbAngles: (prev.cobbAngles || []).map((c, i) => {
        if (i !== cobbIdx) return c;
        return withRecomputedCobb(
          {
            ...c,
            line1Start: role === 'L1A' ? nextPoint : c.line1Start,
            line1End: role === 'L1B' ? nextPoint : c.line1End,
            line2Start: role === 'L2A' ? nextPoint : c.line2Start,
            line2End: role === 'L2B' ? nextPoint : c.line2End,
          },
          aspectWidth,
          aspectHeight
        );
      }),
    }));
  };

  const mutateDistancePoint = (distIdx: number, role: TwoPointRole, nextPoint: PhotoPoint2D, pushUndo: boolean) => {
    if (pushUndo) commitSnapshot(stateRef.current);
    setState((prev) => ({
      ...prev,
      distances: (prev.distances || []).map((d, i) => {
        if (i !== distIdx) return d;
        return withRecomputedDistance(
          {
            ...d,
            start: role === 'start' ? nextPoint : d.start,
            end: role === 'end' ? nextPoint : d.end,
          },
          aspectWidth,
          aspectHeight,
          prev.calibration || null
        );
      }),
    }));
  };

  const mutateArrowPoint = (arrowIdx: number, role: TwoPointRole, nextPoint: PhotoPoint2D, pushUndo: boolean) => {
    if (pushUndo) commitSnapshot(stateRef.current);
    setState((prev) => ({
      ...prev,
      arrows: (prev.arrows || []).map((a, i) =>
        i === arrowIdx
          ? {
              ...a,
              start: role === 'start' ? nextPoint : a.start,
              end: role === 'end' ? nextPoint : a.end,
            }
          : a
      ),
    }));
  };

  const applyCalibrationWithPoints = (ptA: PhotoPoint2D, ptB: PhotoPoint2D, knownMm: number) => {
    const scale = computePhotoCalibrationScale(ptA, ptB, knownMm, aspectWidth, aspectHeight);
    if (!scale) return;
    commitSnapshot(stateRef.current);
    setState((prev) => ({
      ...prev,
      calibration: scale,
      distances: (prev.distances || []).map((d) =>
        withRecomputedDistance(d, aspectWidth, aspectHeight, scale)
      ),
    }));
  };

  const handleApplyCalibration = () => {
    const num = Number(calibLengthInput);
    if (!Number.isFinite(num) || num <= 0) return;
    const knownMm = calibUnit === 'cm' ? num * 10 : num;
    applyCalibrationWithPoints(calibDraftA, calibDraftB, knownMm);
  };

  const handleCanvasTap = (pt: PhotoPoint2D) => {
    if (activeTool === 'angle3' && angles.length > 0) {
      mutateAnglePoint(safeAngleIdx, activeAngleRole, pt, true);
      setActiveAngleRole((curr) => nextAngleRole(curr));
    } else if (activeTool === 'cobb4') {
      if (cobbAngles.length === 0) {
        const added = withRecomputedCobb(
          createDefaultPhotoCobbMeasurement(1, starterLang, aspectWidth, aspectHeight),
          aspectWidth,
          aspectHeight
        );
        commitSnapshot(stateRef.current);
        setState((prev) => ({ ...prev, cobbAngles: [added] }));
        setActiveCobbIndex(0);
        setActiveCobbRole('L1A');
      } else {
        mutateCobbPoint(safeCobbIdx, activeCobbRole, pt, true);
        setActiveCobbRole((curr) => nextCobbRole(curr));
      }
    } else if (activeTool === 'distance') {
      if (distances.length === 0) {
        const added = createDefaultPhotoDistanceMeasurement(
          1,
          starterLang,
          aspectWidth,
          aspectHeight,
          state.calibration || null
        );
        commitSnapshot(stateRef.current);
        setState((prev) => ({ ...prev, distances: [added] }));
        setActiveDistanceIndex(0);
        setActiveDistanceRole('start');
      } else {
        mutateDistancePoint(safeDistIdx, activeDistanceRole, pt, true);
        setActiveDistanceRole((curr) => (curr === 'start' ? 'end' : 'start'));
      }
    } else if (activeTool === 'arrow') {
      if (arrows.length === 0) {
        const added = createDefaultPhotoArrowAnnotation(1, starterLang);
        commitSnapshot(stateRef.current);
        setState((prev) => ({ ...prev, arrows: [added] }));
        setActiveArrowIndex(0);
        setActiveArrowRole('start');
      } else {
        mutateArrowPoint(safeArrowIdx, activeArrowRole, pt, true);
        setActiveArrowRole((curr) => (curr === 'start' ? 'end' : 'start'));
      }
    } else if (activeTool === 'calibrate') {
      const nextA = calibPointRole === 'A' ? pt : calibDraftA;
      const nextB = calibPointRole === 'B' ? pt : calibDraftB;
      setCalibDraftA(nextA);
      setCalibDraftB(nextB);
      setCalibPointRole((curr) => (curr === 'A' ? 'B' : 'A'));
      if (state.calibration) {
        const num = Number(calibLengthInput);
        if (Number.isFinite(num) && num > 0) {
          applyCalibrationWithPoints(nextA, nextB, calibUnit === 'cm' ? num * 10 : num);
        }
      }
    }
  };

  const handleSelectTool = (tool: MeasurementToolMode) => {
    setActiveTool(tool);
    if (tool === 'cobb4' && cobbAngles.length === 0) {
      const created = withRecomputedCobb(
        createDefaultPhotoCobbMeasurement(1, starterLang, aspectWidth, aspectHeight),
        aspectWidth,
        aspectHeight
      );
      commitSnapshot(stateRef.current);
      setState((prev) => ({ ...prev, cobbAngles: [created] }));
      setActiveCobbIndex(0);
      setActiveCobbRole('L1A');
    } else if (tool === 'distance' && distances.length === 0) {
      const created = createDefaultPhotoDistanceMeasurement(
        1,
        starterLang,
        aspectWidth,
        aspectHeight,
        state.calibration || null
      );
      commitSnapshot(stateRef.current);
      setState((prev) => ({ ...prev, distances: [created] }));
      setActiveDistanceIndex(0);
      setActiveDistanceRole('start');
    } else if (tool === 'arrow' && arrows.length === 0) {
      const created = createDefaultPhotoArrowAnnotation(1, starterLang);
      commitSnapshot(stateRef.current);
      setState((prev) => ({ ...prev, arrows: [created] }));
      setActiveArrowIndex(0);
      setActiveArrowRole('start');
    }
  };

  const updateAngleCoord = (role: AnglePointRole, axis: 'x' | 'y', raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || !activeAngle) return;
    const clampedNorm = Math.max(0, Math.min(100, parsed)) / 100;
    const existing =
      role === 'A'
        ? activeAngle.pointA
        : role === 'B'
          ? activeAngle.vertexB
          : activeAngle.pointC;
    mutateAnglePoint(
      safeAngleIdx,
      role,
      {
        xNorm: axis === 'x' ? clampedNorm : existing.xNorm,
        yNorm: axis === 'y' ? clampedNorm : existing.yNorm,
      },
      false
    );
  };

  const handleAddAngle = () => {
    commitSnapshot(stateRef.current);
    const nextAngle = withRecomputedAngle(
      createDefaultPhotoAngleMeasurement(angles.length + 1, starterLang),
      aspectWidth,
      aspectHeight
    );
    setState((prev) => ({ ...prev, angles: [...prev.angles, nextAngle] }));
    setActiveAngleIndex(angles.length);
    setActiveAngleRole('A');
  };

  const handleRemoveAngle = (idx: number) => {
    if (angles.length <= 1) return;
    commitSnapshot(stateRef.current);
    setState((prev) => ({ ...prev, angles: prev.angles.filter((_, i) => i !== idx) }));
    setActiveAngleIndex((curr) => Math.max(0, curr >= idx ? curr - 1 : curr));
  };

  const handleResetActiveAngle = () => {
    if (!activeAngle) return;
    commitSnapshot(stateRef.current);
    const resetBase = createDefaultPhotoAngleMeasurement(safeAngleIdx + 1, starterLang);
    setState((prev) => ({
      ...prev,
      angles: prev.angles.map((ang, i) =>
        i === safeAngleIdx
          ? withRecomputedAngle(
              {
                ...ang,
                pointA: resetBase.pointA,
                vertexB: resetBase.vertexB,
                pointC: resetBase.pointC,
              },
              aspectWidth,
              aspectHeight
            )
          : ang
      ),
    }));
    setActiveAngleRole('A');
  };

  const handleSaveOnly = async () => {
    if (saving || !currentAttachment) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const summaryParts: string[] = [
        ...state.angles.map((a) => `${a.label}: ${a.angleDegrees}°`),
        ...(state.cobbAngles || []).map((c) => `${c.label}: ${c.angleDegrees}°`),
        ...(state.distances || []).map((d) => formatPhotoDistanceBadgeText(d)),
        ...(state.arrows || []).filter((r) => r.label.trim()).map((r) => r.label.trim()),
      ];
      const summary = summaryParts.join(' • ');

      const { id, createdAt: _ca, updatedAt: _ua, version: _v, ...rest } = currentAttachment;
      const updated = await ClinicOperationsService.saveAttachmentAsync({
        ...rest,
        id,
        notes: summary || rest.notes,
        annotations: state,
      });

      setCurrentAttachment(updated);
      setSavedAnnotations(state);
      setSaveSuccess(true);
      onSavedCopy?.(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const toolButtons: Array<{
    id: MeasurementToolMode;
    testId: string;
    icon: React.FC<{ className?: string }>;
    ar: string;
    en: string;
    ckb: string;
  }> = [
    {
      id: 'all',
      testId: 'photo-tool-all',
      icon: LayoutGrid,
      ar: 'جميع المقاييس',
      en: 'All Measurements',
      ckb: 'هەموو پێوانەکان',
    },
    {
      id: 'angle3',
      testId: 'photo-tool-angle3',
      icon: Crosshair,
      ar: 'زاوية 3 نقاط',
      en: '3-Pt Angle',
      ckb: 'گۆشەی ٣ خاڵی',
    },
    {
      id: 'cobb4',
      testId: 'photo-tool-cobb4',
      icon: MoveDiagonal,
      ar: 'كوب (4 نقاط)',
      en: 'Cobb (4-Pt)',
      ckb: 'کۆب (٤ خاڵ)',
    },
    {
      id: 'distance',
      testId: 'photo-tool-distance',
      icon: Ruler,
      ar: 'المسافات والأبعاد',
      en: 'Distance',
      ckb: 'مەودا و دووری',
    },
    {
      id: 'calibrate',
      testId: 'photo-tool-calibrate',
      icon: Scale,
      ar: 'معايرة المقياس',
      en: 'Calibrate',
      ckb: 'پێوەر ڕێکخستن',
    },
    {
      id: 'arrow',
      testId: 'photo-tool-arrow',
      icon: ArrowUpRight,
      ar: 'سهم وملاحظة',
      en: 'Arrow Note',
      ckb: 'تیر و تێبینی',
    },
    {
      id: 'pan',
      testId: 'photo-tool-pan',
      icon: Hand,
      ar: 'تحريك',
      en: 'Pan',
      ckb: 'جوڵاندن',
    },
  ];

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={bi(
        'استوديو قياس الزوايا والقوام',
        'Angle & Posture Measurement Studio',
        'ستۆدیۆی پێوانەکردنی گۆشە و شێوەی وەستان'
      )}
      subtitle={`${(currentAttachment || attachment).title} • ${(currentAttachment || attachment).capturedAt}`}
      size="xl"
      closeLabel={bi('إغلاق', 'Close', 'داخستن')}
      footer={
        <div className="w-full flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {saveError && (
              <div className="text-xs text-rose-700 dark:text-rose-300 flex items-center gap-1.5 min-w-0">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span className="truncate">{saveError}</span>
              </div>
            )}
            {saveSuccess && !saveError && (
              <div className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 min-w-0 font-semibold animate-in fade-in duration-200">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="truncate">
                  {bi('تم حفظ القياسات بنجاح في السجل المشفر', 'Measurements saved to encrypted record', 'پێوانەکان بە سەرکەوتوویی لە تۆماری نهێنیکراو پاشەکەوت کران')}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-card-stroke text-xs font-semibold text-muted-foreground-1 hover:bg-layer-hover cursor-pointer"
            >
              {bi('إغلاق', 'Close', 'داخستن')}
            </button>
            <button
              type="button"
              disabled={saving}
              data-testid="photo-studio-save-only-btn"
              onClick={handleSaveOnly}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
            >
              <Save className="w-4 h-4" />
              {saving
                ? bi('جاري الحفظ…', 'Saving…', 'پاشەکەوتکردن لە جێبەجێکردندایە…')
                : bi('حفظ القياسات', 'Save Measurements', 'پاشەکەوتکردنی پێوانەکان')}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Unified Measurement Toolbar (Horizontally Scrollable Strip) */}
        <div className="rounded-2xl bg-surface/60 border border-line-2 p-1 overflow-hidden">
          <div className="pr-hscroll overflow-x-auto flex items-center gap-1.5 whitespace-nowrap pb-1 pt-0.5 px-0.5">
            {toolButtons.map((btn) => {
              const Icon = btn.icon;
              const selected = activeTool === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  data-testid={btn.testId}
                  onClick={(e) => {
                    handleSelectTool(btn.id);
                    e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-colors shrink-0 ${
                    selected
                      ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                      : 'bg-card border-card-stroke text-foreground hover:bg-layer-hover'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{bi(btn.ar, btn.en, btn.ckb)}</span>
                </button>
              );
            })}

            <span className="h-5 w-px bg-card-divider mx-0.5 shrink-0" aria-hidden="true" />

            {/* History (Undo/Redo) & Zoom Controls */}
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              data-testid="photo-studio-undo-btn"
              title={bi('تراجع (Ctrl+Z)', 'Undo (Ctrl+Z)', 'گەڕانەوە (Ctrl+Z)')}
              aria-label={bi('تراجع', 'Undo', 'گەڕانەوە')}
              className="size-8 inline-flex items-center justify-center rounded-xl border border-card-stroke bg-card hover:bg-layer-hover text-foreground disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed shrink-0"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              data-testid="photo-studio-redo-btn"
              title={bi('إعادة (Ctrl+Shift+Z)', 'Redo (Ctrl+Shift+Z)', 'دووبارەکردنەوە')}
              aria-label={bi('إعادة', 'Redo', 'دووبارەکردنەوە')}
              className="size-8 inline-flex items-center justify-center rounded-xl border border-card-stroke bg-card hover:bg-layer-hover text-foreground disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed shrink-0"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>

            <span className="h-5 w-px bg-card-divider mx-0.5 shrink-0" aria-hidden="true" />

            <button
              type="button"
              onClick={() => canvasRef.current?.zoomBy(1.25)}
              data-testid="photo-studio-zoom-in-btn"
              title={bi('تكبير', 'Zoom In', 'گەورەکردن')}
              aria-label={bi('تكبير', 'Zoom In', 'گەورەکردن')}
              className="size-8 inline-flex items-center justify-center rounded-xl border border-card-stroke bg-card hover:bg-layer-hover text-foreground cursor-pointer shrink-0"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => canvasRef.current?.zoomBy(0.8)}
              data-testid="photo-studio-zoom-out-btn"
              title={bi('تصغير', 'Zoom Out', 'بچووککردنەوە')}
              aria-label={bi('تصغير', 'Zoom Out', 'بچووککردنەوە')}
              className="size-8 inline-flex items-center justify-center rounded-xl border border-card-stroke bg-card hover:bg-layer-hover text-foreground cursor-pointer shrink-0"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => canvasRef.current?.resetView()}
              data-testid="photo-studio-zoom-reset-btn"
              title={bi('إعادة الضبط (100%)', 'Reset View (100%)', 'ڕێکخستنەوەی پیشاندان (100%)')}
              aria-label={bi('إعادة الضبط 100%', 'Reset view 100%', 'ڕێکخستنەوەی پیشاندان')}
              className="h-8 inline-flex items-center justify-center gap-1 px-2.5 rounded-xl border border-card-stroke bg-card hover:bg-layer-hover text-xs font-semibold text-foreground cursor-pointer tabular-nums shrink-0"
            >
              <Maximize2 className="w-3 h-3" />
              <bdi dir="ltr">{zoomPercent}%</bdi>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Interactive Konva Stage Column */}
          <div className="lg:col-span-7 space-y-2">
            <KonvaMeasurementCanvas
              ref={canvasRef}
              sourceDataUrl={attachment.payloadDataUrl}
              imageTitle={attachment.title}
              attachmentWidthPx={attachment.widthPx}
              attachmentHeightPx={attachment.heightPx}
              activeTool={activeTool}
              annotations={activeTool === 'all' ? (savedAnnotations || emptyAnnotationState) : state}
              activeAngleIndex={safeAngleIdx}
              activeAnglePointRole={activeAngleRole}
              activeCobbIndex={safeCobbIdx}
              activeCobbPointRole={activeCobbRole}
              activeDistanceIndex={safeDistIdx}
              activeDistancePointRole={activeDistanceRole}
              activeArrowIndex={safeArrowIdx}
              activeArrowPointRole={activeArrowRole}
              activeCalibPointRole={calibPointRole}
              onCanvasTap={handleCanvasTap}
              onDragAnglePoint={(idx, role, pt) => mutateAnglePoint(idx, role, pt, false)}
              onDragCobbPoint={(idx, role, pt) => mutateCobbPoint(idx, role, pt, false)}
              onDragDistancePoint={(idx, role, pt) => mutateDistancePoint(idx, role, pt, false)}
              onDragArrowPoint={(idx, role, pt) => mutateArrowPoint(idx, role, pt, false)}
              onDragCalibrationPoint={(role, pt) => {
                if (role === 'A') setCalibDraftA(pt);
                else setCalibDraftB(pt);
                if (state.calibration) {
                  const nextA = role === 'A' ? pt : calibDraftA;
                  const nextB = role === 'B' ? pt : calibDraftB;
                  const num = Number(calibLengthInput);
                  if (Number.isFinite(num) && num > 0) {
                    const knownMm = calibUnit === 'cm' ? num * 10 : num;
                    const scale = computePhotoCalibrationScale(
                      nextA,
                      nextB,
                      knownMm,
                      aspectWidth,
                      aspectHeight
                    );
                    if (scale) {
                      setState((prev) => ({
                        ...prev,
                        calibration: scale,
                        distances: (prev.distances || []).map((d) =>
                          withRecomputedDistance(d, aspectWidth, aspectHeight, scale)
                        ),
                      }));
                    }
                  }
                }
              }}
              onChangePlumbXPercent={(pct) =>
                setState((prev) => ({ ...prev, plumbLineXPercent: Math.round(pct) }))
              }
              onChangeLevelYPercent={(pct) =>
                setState((prev) => ({ ...prev, horizontalLevelYPercent: Math.round(pct) }))
              }
              onZoomChange={setZoomPercent}
              onInteractionCommit={() => commitSnapshot(lastCommittedRef.current || undefined)}
              calibDraftPointA={activeTool === 'calibrate' ? calibDraftA : null}
              calibDraftPointB={activeTool === 'calibrate' ? calibDraftB : null}
              plumbLabel={bi('شاقول', 'Plumb', 'شاقوڵ')}
              levelLabel={bi('أفقي', 'Level', 'ئاسۆیی')}
              calibLabel={bi('معيار', 'Scale', 'پێوەر')}
              ariaLabel={bi(
                'لوحة قياس زوايا الصورة وخط الشاقول',
                'Interactive photo measurement canvas',
                'تەختەی کارلێکی پێوانەی وێنە'
              )}
            />

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground-1 px-1">
              <span>
                {bi(
                  'انقر على الصورة لوضع النقاط أو اسحب المؤشرات الدقيقة والخطوط مباشرة (عجلة الماوس للتكبير).',
                  'Tap the image to place points or drag precision pins & reference lines directly (scroll wheel zooms).',
                  'کرتە لە وێنەکە بکە بۆ دانانی خاڵەکان یان نیشانە وردەکان و هێڵەکان ڕاستەوخۆ ڕابکێشە.'
                )}
              </span>
              <span className="inline-flex items-center gap-1 text-primary font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                {bi(
                  'تبقى الصورة الأصلية دون تعديل',
                  'Original stays untouched',
                  'وێنە بنەڕەتییەکە بەبێ گۆڕانکاری دەمێنێتەوە'
                )}
              </span>
            </div>
          </div>

          {/* Right Inspector Panel Column */}
          <div className="lg:col-span-5 space-y-3">
            {/* TOOL 0: ALL MEASUREMENTS (Read-Only Unified Overview) */}
            {activeTool === 'all' && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-surface border border-card-divider space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-foreground inline-flex items-center gap-1.5">
                      <LayoutGrid className="w-4 h-4 text-primary" />
                      {bi(
                        'جميع المقاييس المحفوظة (عرض فقط)',
                        'All Saved Measurements (Read-Only)',
                        'سەرجەم پێوانە پاشەکەوتکراوەکان (تەنها پیشاندان)'
                      )}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                      {bi('وضع العرض الموحد', 'Unified View', 'پیشاندانی یەکگرتوو')}
                    </span>
                  </div>

                  <div className="text-[11px] text-muted-foreground-1 flex items-start gap-1.5 p-2 rounded-lg bg-layer border border-card-stroke leading-relaxed">
                    <Eye className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <span>
                      {bi(
                        'يُعرض هنا ملخص المقاييس التي تم تعديلها وحفظها على الصورة، هذا التبويب مخصص للعرض والمراجعة دون إمكانية التعديل.',
                        'Summary of measurements modified and saved on this photo. This tab is for view and review only with no editing controls.',
                        'لێرەدا پوختەی ئەو پێوانانە پیشان دەدرێت کە دەستکاریکراون و پاشەکەوتکراون، ئەم بەشە تەنها بۆ پیشاندان و پێداچوونەوەیە بەبێ دەستکاریکردن.'
                      )}
                    </span>
                  </div>

                  {(!savedAnnotations ||
                    (savedAngles.length === 0 &&
                      savedCobb.length === 0 &&
                      savedDist.length === 0 &&
                      savedArrows.length === 0 &&
                      !savedAnnotations.calibration)) ? (
                    <div className="p-4 rounded-xl bg-layer border border-dashed border-card-stroke text-center space-y-2">
                      <div className="w-9 h-9 mx-auto rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <LayoutGrid className="w-4 h-4" />
                      </div>
                      <div className="text-xs font-bold text-foreground">
                        {bi(
                          'لا توجد مقاييس محفوظة للعرض حالياً',
                          'No Saved Measurements To Display',
                          'هیچ پێوانەیەکی پاشەکەوتکراو نییە بۆ پیشاندان'
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground-1 leading-relaxed max-w-xs mx-auto">
                        {bi(
                          'قم باختيار أداة القياس المطلوبة (زوايا، كوب، مسافات) ووضع النقاط على الصورة ثم اضغط على زر "حفظ القياسات" لتظهر جميعها هنا.',
                          'Select any measurement tool (Angles, Cobb, Distances), position points, and click "Save Measurements" to display them here.',
                          'ئامرازی پێوانەی داواکراو هەڵبژێرە، خاڵەکان دابنێ و پاشان کرتە لە "پاشەکەوتکردنی پێوانەکان" بکە بۆ ئەوەی لێرە پیشان بدرێن.'
                        )}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {/* Saved Joint Angles */}
                      {savedAngles.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-layer border border-card-stroke space-y-1.5">
                          <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <Crosshair className="w-3.5 h-3.5 text-yellow-500" />
                            <span>{bi('زوايا المفاصل (3 نقاط)', 'Joint Angles (3-Point)', 'گۆشەکانی جومگە (٣ خاڵ)')}</span>
                            <span className="text-[10px] text-muted-foreground-1 font-normal">
                              ({savedAngles.length})
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {savedAngles.map((ang) => (
                              <div
                                key={ang.id}
                                className="flex items-center justify-between p-2 rounded-md bg-surface border border-card-stroke text-xs"
                              >
                                <span className="font-semibold text-foreground truncate">{ang.label}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[11px] text-muted-foreground-1">
                                    {bi('المكملة:', 'Suppl:', 'تەواوکەر:')}{' '}
                                    <bdi dir="ltr">{ang.supplementaryDegrees}°</bdi>
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-yellow-500/15 border border-yellow-500/30 text-yellow-700 dark:text-yellow-300 font-extrabold tabular-nums">
                                    <bdi dir="ltr">∠ {ang.angleDegrees}°</bdi>
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Saved Cobb Angles */}
                      {savedCobb.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-layer border border-card-stroke space-y-1.5">
                          <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <MoveDiagonal className="w-3.5 h-3.5 text-sky-500" />
                            <span>{bi('زوايا كوب للعمود الفقري', 'Spinal Cobb Angles', 'گۆشەکانی کۆب بۆ بڕبڕەی پشت')}</span>
                            <span className="text-[10px] text-muted-foreground-1 font-normal">
                              ({savedCobb.length})
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {savedCobb.map((c) => (
                              <div
                                key={c.id}
                                className="flex items-center justify-between p-2 rounded-md bg-surface border border-card-stroke text-xs"
                              >
                                <span className="font-semibold text-foreground truncate">{c.label}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[11px] text-muted-foreground-1">
                                    {bi('المنفرجة:', 'Obtuse:', 'کراوە:')}{' '}
                                    <bdi dir="ltr">{c.obtuseDegrees}°</bdi>
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-700 dark:text-sky-300 font-extrabold tabular-nums">
                                    <bdi dir="ltr">∠ {c.angleDegrees}°</bdi>
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Saved Distances */}
                      {savedDist.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-layer border border-card-stroke space-y-1.5">
                          <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <Ruler className="w-3.5 h-3.5 text-emerald-500" />
                            <span>{bi('المسافات والأبعاد', 'Linear Distances', 'مەودا و درێژییەکان')}</span>
                            <span className="text-[10px] text-muted-foreground-1 font-normal">
                              ({savedDist.length})
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {savedDist.map((d) => (
                              <div
                                key={d.id}
                                className="flex items-center justify-between p-2 rounded-md bg-surface border border-card-stroke text-xs"
                              >
                                <span className="font-semibold text-foreground truncate">{d.label}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[11px] text-muted-foreground-1">
                                    {bi('الميل:', 'Tilt:', 'لاری:')}{' '}
                                    <bdi dir="ltr">{d.tiltFromHorizontalDeg}°</bdi>
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold tabular-nums">
                                    <bdi dir="ltr">{formatPhotoDistanceBadgeText(d)}</bdi>
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Saved Arrows & Notes */}
                      {savedArrows.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-layer border border-card-stroke space-y-1.5">
                          <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <ArrowUpRight className="w-3.5 h-3.5 text-amber-500" />
                            <span>{bi('الملاحظات السريرية والتأشير', 'Clinical Arrows & Notes', 'تێبینییە پزیشکییەکان')}</span>
                          </div>
                          <div className="space-y-1.5">
                            {savedArrows.map((a) => (
                              <div
                                key={a.id}
                                className="flex items-center gap-2 p-2 rounded-md bg-surface border border-card-stroke text-xs"
                              >
                                <span
                                  className="w-3 h-3 rounded-full shrink-0 border border-card-stroke"
                                  style={{ backgroundColor: a.colorHex || '#f59e0b' }}
                                />
                                <span className="font-semibold text-foreground truncate">{a.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Saved Scale Calibration */}
                      {savedAnnotations.calibration && (
                        <div className="p-2.5 rounded-lg bg-layer border border-card-stroke space-y-1 text-xs">
                          <div className="font-bold text-foreground flex items-center gap-1.5">
                            <Scale className="w-3.5 h-3.5 text-purple-500" />
                            <span>{bi('معايرة المقياس', 'Scale Calibration', 'ڕێکخستنی پێوەر')}</span>
                          </div>
                          <div className="text-[11px] text-purple-700 dark:text-purple-300 font-semibold tabular-nums">
                            {bi('المعيار المحفوظ:', 'Saved Scale:', 'پێوەری پاشەکەوتکراو:')}{' '}
                            <bdi dir="ltr">
                              {savedAnnotations.calibration.knownLengthMm} mm (
                              {savedAnnotations.calibration.pixelsPerMm} px/mm)
                            </bdi>
                          </div>
                        </div>
                      )}

                      {/* Reference Grid & Plumb-Line Status */}
                      {(savedAnnotations.showPlumbLine || savedAnnotations.showHorizontalLevel) && (
                        <div className="p-2.5 rounded-lg bg-layer border border-card-stroke space-y-1 text-xs">
                          <div className="font-bold text-foreground flex items-center gap-1.5">
                            <Grid3x3 className="w-3.5 h-3.5 text-primary" />
                            <span>{bi('الخطوط المرجعية المحفوظة', 'Saved Reference Lines', 'هێڵە سەرچاوەییە پاشەکەوتکراوەکان')}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground-1 flex flex-wrap gap-3 pt-0.5">
                            {savedAnnotations.showPlumbLine && (
                              <span>
                                {bi('الشاقول العمودي:', 'Plumb:', 'شاقوڵ:')}{' '}
                                <bdi dir="ltr" className="font-bold text-foreground">{savedAnnotations.plumbLineXPercent}%</bdi>
                              </span>
                            )}
                            {savedAnnotations.showHorizontalLevel && (
                              <span>
                                {bi('المستوى الأفقي:', 'Level:', 'ئاسۆیی:')}{' '}
                                <bdi dir="ltr" className="font-bold text-foreground">{savedAnnotations.horizontalLevelYPercent}%</bdi>
                              </span>
                            )}
                            <span>
                              {bi('الشبكة:', 'Grid:', 'تۆڕ:')}{' '}
                              <bdi dir="ltr" className="font-bold text-foreground">{savedAnnotations.gridMode}</bdi>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TOOL 1: 3-Point Angles */}
            {(activeTool === 'angle3' || activeTool === 'pan') && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-surface border border-card-divider space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-foreground inline-flex items-center gap-1.5">
                      <Crosshair className="w-4 h-4 text-primary" />
                      {bi(
                        'قياسات الزوايا (3 نقاط)',
                        '3-Point Angle Measurements',
                        'پێوانەی گۆشەکان (٣ خاڵ)'
                      )}
                    </span>
                    <button
                      type="button"
                      data-testid="photo-studio-add-angle-btn"
                      onClick={handleAddAngle}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {bi('إضافة زاوية 3 نقاط', 'Add 3-Point Angle', 'زیادکردنی گۆشەی ٣ خاڵی')}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {angles.map((ang, idx) => {
                      const selected = idx === safeAngleIdx;
                      return (
                        <div key={ang.id} className="inline-flex items-center">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTool('angle3');
                              setActiveAngleIndex(idx);
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                              selected
                                ? 'bg-primary/15 border-primary/40 text-primary'
                                : 'bg-layer border-card-stroke text-muted-foreground-1 hover:text-foreground'
                            }`}
                          >
                            <span>{ang.label}</span>{' '}
                            <bdi dir="ltr" className="tabular-nums font-bold">
                              ({ang.angleDegrees}°)
                            </bdi>
                          </button>
                          {angles.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveAngle(idx)}
                              aria-label={bi(
                                `حذف ${ang.label}`,
                                `Remove ${ang.label}`,
                                `سڕینەوەی ${ang.label}`
                              )}
                              className="ms-1 p-1 rounded-lg text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {activeAngle && (
                  <div className="p-3.5 rounded-xl bg-surface border border-card-divider space-y-3">
                    <div className="flex items-end gap-2">
                      <div className="flex-1 min-w-0">
                        <label
                          htmlFor="photo-studio-angle-label"
                          className="block text-xs font-semibold text-foreground mb-1"
                        >
                          {bi('اسم الزاوية', 'Angle Label', 'ناوی گۆشە')}
                        </label>
                        <input
                          id="photo-studio-angle-label"
                          type="text"
                          data-testid="photo-studio-angle-label-input"
                          value={activeAngle.label}
                          onChange={(e) => {
                            const nextLabel = e.target.value;
                            setState((prev) => ({
                              ...prev,
                              angles: prev.angles.map((ang, i) =>
                                i === safeAngleIdx ? { ...ang, label: nextLabel } : ang
                              ),
                            }));
                          }}
                          className="w-full px-3 py-1.5 rounded-lg border border-card-stroke bg-layer text-xs text-foreground"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleResetActiveAngle}
                        title={bi('إعادة ضبط نقاط الزاوية', 'Reset angle points', 'ڕێکخستنەوەی خاڵەکانی گۆشە')}
                        aria-label={bi('إعادة ضبط نقاط الزاوية', 'Reset angle points', 'ڕێکخستنەوەی خاڵەکانی گۆشە')}
                        className="p-2 rounded-lg border border-card-stroke bg-layer hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div
                      data-testid="photo-studio-angle-readout"
                      className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-layer border border-card-stroke"
                    >
                      <div>
                        <div className="text-xs text-muted-foreground-1">
                          {bi('الزاوية المقاسة', 'Measured Angle', 'گۆشەی پێوانەکراو')}
                        </div>
                        <div className="text-lg font-extrabold text-primary tabular-nums">
                          <bdi dir="ltr">∠ {activeAngle.angleDegrees}°</bdi>
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="text-xs text-muted-foreground-1">
                          {bi('الزاوية المكملة', 'Supplementary', 'گۆشەی تەواوکەر')}
                        </div>
                        <div className="text-sm font-bold text-foreground tabular-nums">
                          <bdi dir="ltr">{activeAngle.supplementaryDegrees}°</bdi>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="block text-xs font-semibold text-foreground">
                        {bi('النقطة النشطة للنقر على الصورة', 'Active Tap Point', 'خاڵی چالاک بۆ کرتەکردن لەسەر وێنەکە')}
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            { role: 'A' as const, ar: 'النقطة A', en: 'Point A', ckb: 'خاڵی A', dotClass: 'bg-teal-600' },
                            { role: 'B' as const, ar: 'الرأس B', en: 'Vertex B', ckb: 'لووتکەی B', dotClass: 'bg-rose-500' },
                            { role: 'C' as const, ar: 'النقطة C', en: 'Point C', ckb: 'خاڵی C', dotClass: 'bg-teal-600' },
                          ] as const
                        ).map((item) => (
                          <button
                            key={item.role}
                            type="button"
                            onClick={() => setActiveAngleRole(item.role)}
                            className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                              activeAngleRole === item.role
                                ? 'bg-primary/15 border-primary text-primary'
                                : 'bg-layer border-card-stroke text-foreground hover:bg-layer-hover'
                            }`}
                          >
                            <span className={`w-2.5 h-2.5 rounded-full ${item.dotClass}`} />
                            {bi(item.ar, item.en, item.ckb)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 pt-1">
                      <div className="text-xs font-semibold text-foreground">
                        {bi('إحداثيات النقاط الدقيقة (0–100%)', 'Point Coordinates (0–100%)', 'پۆتانە وردەکانی خاڵەکان (0–100%)')}
                      </div>
                      {(
                        [
                          { role: 'A' as const, label: bi('النقطة A', 'Point A', 'خاڵی A'), pt: activeAngle.pointA, xTestId: 'angle-point-a-x', yTestId: 'angle-point-a-y' },
                          { role: 'B' as const, label: bi('الرأس B', 'Vertex B', 'لووتکەی B'), pt: activeAngle.vertexB, xTestId: 'angle-point-b-x', yTestId: 'angle-point-b-y' },
                          { role: 'C' as const, label: bi('النقطة C', 'Point C', 'خاڵی C'), pt: activeAngle.pointC, xTestId: 'angle-point-c-x', yTestId: 'angle-point-c-y' },
                        ] as const
                      ).map((row) => (
                        <div key={row.role} className="grid grid-cols-12 gap-2 items-center text-xs">
                          <span className="col-span-4 font-semibold text-foreground truncate">{row.label}</span>
                          <label className="col-span-4 flex items-center gap-1">
                            <span className="text-xs text-muted-foreground-1 shrink-0">X%</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.5}
                              dir="ltr"
                              data-testid={row.xTestId}
                              aria-label={`${row.label} X %`}
                              value={toPercent(row.pt.xNorm)}
                              onChange={(e) => updateAngleCoord(row.role, 'x', e.target.value)}
                              className="w-full px-2 py-1 rounded-lg border border-card-stroke bg-layer text-xs text-foreground tabular-nums"
                            />
                          </label>
                          <label className="col-span-4 flex items-center gap-1">
                            <span className="text-xs text-muted-foreground-1 shrink-0">Y%</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.5}
                              dir="ltr"
                              data-testid={row.yTestId}
                              aria-label={`${row.label} Y %`}
                              value={toPercent(row.pt.yNorm)}
                              onChange={(e) => updateAngleCoord(row.role, 'y', e.target.value)}
                              className="w-full px-2 py-1 rounded-lg border border-card-stroke bg-layer text-xs text-foreground tabular-nums"
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TOOL 2: 4-Point Cobb / Spinal Axis Angle */}
            {activeTool === 'cobb4' && (
              <div className="p-3.5 rounded-xl bg-surface border border-card-divider space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground inline-flex items-center gap-1.5">
                    <MoveDiagonal className="w-4 h-4 text-sky-500" />
                    {bi('قياس زاوية كوب (4 نقاط / خطان)', 'Cobb & Axis Angle (4 Points)', 'پێوانەی گۆشەی کۆب (٤ خاڵ)')}
                  </span>
                  <button
                    type="button"
                    data-testid="photo-studio-add-cobb-btn"
                    onClick={() => {
                      commitSnapshot(stateRef.current);
                      const created = withRecomputedCobb(
                        createDefaultPhotoCobbMeasurement(cobbAngles.length + 1, starterLang, aspectWidth, aspectHeight),
                        aspectWidth,
                        aspectHeight
                      );
                      setState((prev) => ({ ...prev, cobbAngles: [...(prev.cobbAngles || []), created] }));
                      setActiveCobbIndex(cobbAngles.length);
                      setActiveCobbRole('L1A');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {bi('إضافة زاوية كوب', 'Add Cobb Angle', 'زیادکردنی گۆشەی کۆب')}
                  </button>
                </div>

                {cobbAngles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {cobbAngles.map((c, i) => (
                      <div key={c.id} className="inline-flex items-center">
                        <button
                          type="button"
                          onClick={() => setActiveCobbIndex(i)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                            i === safeCobbIdx
                              ? 'bg-sky-500/15 border-sky-500/40 text-sky-700 dark:text-sky-300'
                              : 'bg-layer border-card-stroke text-muted-foreground-1'
                          }`}
                        >
                          <span>{c.label}</span>{' '}
                          <bdi dir="ltr" className="tabular-nums font-bold">({c.angleDegrees}°)</bdi>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            commitSnapshot(stateRef.current);
                            setState((prev) => ({
                              ...prev,
                              cobbAngles: (prev.cobbAngles || []).filter((_, idx) => idx !== i),
                            }));
                            setActiveCobbIndex((curr) => Math.max(0, curr >= i ? curr - 1 : curr));
                          }}
                          aria-label={bi(`حذف ${c.label}`, `Remove ${c.label}`, `سڕینەوەی ${c.label}`)}
                          className="ms-1 p-1 rounded-lg text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {activeCobb && (
                  <div className="space-y-2.5">
                    <input
                      type="text"
                      value={activeCobb.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        setState((prev) => ({
                          ...prev,
                          cobbAngles: (prev.cobbAngles || []).map((c, idx) =>
                            idx === safeCobbIdx ? { ...c, label: val } : c
                          ),
                        }));
                      }}
                      className="w-full px-3 py-1.5 rounded-lg border border-card-stroke bg-layer text-xs text-foreground"
                    />
                    <div
                      data-testid="photo-studio-cobb-readout"
                      className="flex items-center justify-between p-2.5 rounded-xl bg-layer border border-card-stroke"
                    >
                      <div>
                        <div className="text-xs text-muted-foreground-1">{bi('زاوية كوب الحادة', 'Cobb Angle (Acute)', 'گۆشەی کۆب')}</div>
                        <div className="text-lg font-extrabold text-sky-600 dark:text-sky-400 tabular-nums">
                          <bdi dir="ltr">∠ {activeCobb.angleDegrees}°</bdi>
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="text-xs text-muted-foreground-1">{bi('المكملة', 'Obtuse', 'تەواوکەر')}</div>
                        <div className="text-sm font-bold text-foreground tabular-nums">
                          <bdi dir="ltr">{activeCobb.obtuseDegrees}°</bdi>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['L1A', 'L1B', 'L2A', 'L2B'] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setActiveCobbRole(r)}
                          className={`py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                            activeCobbRole === r
                              ? 'bg-sky-500/15 border-sky-500 text-sky-700 dark:text-sky-300'
                              : 'bg-layer border-card-stroke text-foreground'
                          }`}
                        >
                          <bdi dir="ltr">{r}</bdi>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TOOL 3: Distance Caliper */}
            {activeTool === 'distance' && (
              <div className="p-3.5 rounded-xl bg-surface border border-card-divider space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground inline-flex items-center gap-1.5">
                    <Ruler className="w-4 h-4 text-emerald-500" />
                    {bi('قياس المسافات والأبعاد (D1–D2)', 'Distance & ΔX/ΔY Caliper', 'پێوانەی مەودا و دووری')}
                  </span>
                  <button
                    type="button"
                    data-testid="photo-studio-add-distance-btn"
                    onClick={() => {
                      commitSnapshot(stateRef.current);
                      const created = createDefaultPhotoDistanceMeasurement(
                        distances.length + 1,
                        starterLang,
                        aspectWidth,
                        aspectHeight,
                        state.calibration || null
                      );
                      setState((prev) => ({ ...prev, distances: [...(prev.distances || []), created] }));
                      setActiveDistanceIndex(distances.length);
                      setActiveDistanceRole('start');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {bi('إضافة مسافة', 'Add Distance', 'زیادکردنی مەودا')}
                  </button>
                </div>

                {distances.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {distances.map((d, i) => (
                      <div key={d.id} className="inline-flex items-center">
                        <button
                          type="button"
                          onClick={() => setActiveDistanceIndex(i)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                            i === safeDistIdx
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                              : 'bg-layer border-card-stroke text-muted-foreground-1'
                          }`}
                        >
                          <bdi dir="ltr">{formatPhotoDistanceBadgeText(d)}</bdi>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            commitSnapshot(stateRef.current);
                            setState((prev) => ({
                              ...prev,
                              distances: (prev.distances || []).filter((_, idx) => idx !== i),
                            }));
                            setActiveDistanceIndex((curr) => Math.max(0, curr >= i ? curr - 1 : curr));
                          }}
                          aria-label={bi(`حذف ${d.label}`, `Remove ${d.label}`, `سڕینەوەی ${d.label}`)}
                          className="ms-1 p-1 rounded-lg text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {activeDistance && (
                  <div className="space-y-2.5">
                    <input
                      type="text"
                      value={activeDistance.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        setState((prev) => ({
                          ...prev,
                          distances: (prev.distances || []).map((d, idx) =>
                            idx === safeDistIdx ? { ...d, label: val } : d
                          ),
                        }));
                      }}
                      className="w-full px-3 py-1.5 rounded-lg border border-card-stroke bg-layer text-xs text-foreground"
                    />
                    <div
                      data-testid="photo-studio-distance-readout"
                      className="p-2.5 rounded-xl bg-layer border border-card-stroke space-y-1 text-xs tabular-nums"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground-1">{bi('الطول الكلي:', 'Total Length:', 'درێژی گشتی:')}</span>
                        <bdi dir="ltr" className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                          {activeDistance.lengthMm !== null
                            ? `${(Math.round((activeDistance.lengthMm / 10) * 100) / 100)} cm (${activeDistance.lengthMm} mm)`
                            : `${activeDistance.pixelLength} px`}
                        </bdi>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground-1">
                        <span>{bi('الميل الأفقي:', 'Horizontal Tilt:', 'لاری ئاسۆیی:')}</span>
                        <bdi dir="ltr" className="font-bold text-foreground">{activeDistance.tiltFromHorizontalDeg}°</bdi>
                      </div>
                      {activeDistance.deltaXMm !== null && activeDistance.deltaYMm !== null && (
                        <div className="flex items-center justify-between text-muted-foreground-1">
                          <span>{bi('الإزاحة ΔX / ΔY:', 'Offset ΔX / ΔY:', 'جیاوازی ΔX / ΔY:')}</span>
                          <bdi dir="ltr" className="font-semibold text-foreground">
                            ΔX {activeDistance.deltaXMm} mm · ΔY {activeDistance.deltaYMm} mm
                          </bdi>
                        </div>
                      )}
                    </div>
                    {!state.calibration && (
                      <button
                        type="button"
                        onClick={() => setActiveTool('calibrate')}
                        className="w-full py-1.5 px-3 rounded-lg border border-purple-500/35 bg-purple-500/10 text-purple-700 dark:text-purple-300 text-xs font-semibold cursor-pointer"
                      >
                        {bi(
                          'لم تُعاير المسطرة بعد — انقر للمعايرة بالسنتيمتر/ملم',
                          'Uncalibrated — click to calibrate cm/mm scale',
                          'پێوەر ڕێکنەخراوە — کرتە بکە بۆ ڕێکخستن بە cm/mm'
                        )}
                      </button>
                    )}
                    <div className="grid grid-cols-2 gap-1.5">
                      {(['start', 'end'] as const).map((r, i) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setActiveDistanceRole(r)}
                          className={`py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                            activeDistanceRole === r
                              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                              : 'bg-layer border-card-stroke text-foreground'
                          }`}
                        >
                          {i === 0 ? bi('البداية D1', 'Start D1', 'دەستپێک D1') : bi('النهاية D2', 'End D2', 'کۆتایی D2')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TOOL 4: Scale Calibration */}
            {activeTool === 'calibrate' && (
              <div className="p-3.5 rounded-xl bg-surface border border-card-divider space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground inline-flex items-center gap-1.5">
                    <Scale className="w-4 h-4 text-purple-500" />
                    {bi('معايرة المقياس الطبي (mm / cm)', 'Scale Calibration (mm / cm)', 'ڕێکخستنی پێوەری پزیشکی (mm / cm)')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {bi(
                    'ضع نقطتي المرجع R1 و R2 على مسطرة أو جسم معروف الطول داخل الصورة ثم أدخل طوله الحقيقي لتحويل كل القياسات إلى ملم وسنتيمتر.',
                    'Place R1 and R2 across a reference ruler or known landmark inside the photo and enter its real length to calibrate all distances.',
                    'خاڵەکانی R1 و R2 لەسەر ڕاستەیەک یان شتێکی درێژی زانراو لە وێنەکە دابنێ و درێژییە ڕاستەقینەکەی بنووسە.'
                  )}
                </p>

                <div className="grid grid-cols-2 gap-1.5">
                  {(['A', 'B'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setCalibPointRole(r)}
                      className={`py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                        calibPointRole === r
                          ? 'bg-purple-500/15 border-purple-500 text-purple-700 dark:text-purple-300'
                          : 'bg-layer border-card-stroke text-foreground'
                      }`}
                    >
                      <bdi dir="ltr">{r === 'A' ? 'R1' : 'R2'}</bdi>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="number"
                    min={0.1}
                    step={0.5}
                    dir="ltr"
                    data-testid="photo-calib-length-input"
                    value={calibLengthInput}
                    onChange={(e) => setCalibLengthInput(e.target.value)}
                    className="col-span-5 px-2.5 py-1.5 rounded-lg border border-card-stroke bg-layer text-xs text-foreground tabular-nums text-center font-mono font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <select
                    value={calibUnit}
                    onChange={(e) => setCalibUnit(e.target.value as 'cm' | 'mm')}
                    className="col-span-3 px-1 py-1.5 rounded-lg border border-card-stroke bg-layer text-xs text-foreground font-bold text-center [text-align-last:center] cursor-pointer"
                  >
                    <option value="cm">cm</option>
                    <option value="mm">mm</option>
                  </select>
                  <button
                    type="button"
                    data-testid="photo-calib-apply-btn"
                    onClick={handleApplyCalibration}
                    className="col-span-4 py-1.5 px-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {bi('معايرة', 'Apply', 'جێبەجێکردن')}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: '5 cm', val: '5', unit: 'cm' as const },
                    { label: '10 cm', val: '10', unit: 'cm' as const },
                    { label: '100 mm', val: '100', unit: 'mm' as const },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setCalibLengthInput(p.val);
                        setCalibUnit(p.unit);
                      }}
                      className="px-2 py-1 rounded-md border border-card-stroke bg-layer text-xs font-semibold text-foreground hover:bg-layer-hover cursor-pointer"
                    >
                      <bdi dir="ltr">{p.label}</bdi>
                    </button>
                  ))}
                </div>

                {state.calibration && (
                  <div
                    data-testid="photo-calib-status-badge"
                    className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-xs font-semibold text-purple-800 dark:text-purple-200 flex items-center justify-between gap-2"
                  >
                    <span>
                      {bi('المعايرة نشطة:', 'Calibrated:', 'پێوەر چالاکە:')}{' '}
                      <bdi dir="ltr">{state.calibration.knownLengthMm} mm ({state.calibration.pixelsPerMm} px/mm)</bdi>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setState((prev) => ({
                          ...prev,
                          calibration: null,
                          distances: (prev.distances || []).map((d) =>
                            withRecomputedDistance(d, aspectWidth, aspectHeight, null)
                          ),
                        }))
                      }
                      className="text-rose-600 font-bold hover:underline cursor-pointer"
                    >
                      {bi('إلغاء', 'Clear', 'لابردن')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TOOL 5: Arrow & Callout Note */}
            {activeTool === 'arrow' && (
              <div className="p-3.5 rounded-xl bg-surface border border-card-divider space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground inline-flex items-center gap-1.5">
                    <ArrowUpRight className="w-4 h-4 text-amber-500" />
                    {bi('أسهم التأشير والملاحظات', 'Arrow & Callout Notes', 'تیر و تێبینییەکان')}
                  </span>
                  <button
                    type="button"
                    data-testid="photo-studio-add-arrow-btn"
                    onClick={() => {
                      commitSnapshot(stateRef.current);
                      const created = createDefaultPhotoArrowAnnotation(arrows.length + 1, starterLang);
                      setState((prev) => ({ ...prev, arrows: [...(prev.arrows || []), created] }));
                      setActiveArrowIndex(arrows.length);
                      setActiveArrowRole('start');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {bi('إضافة سهم', 'Add Arrow', 'زیادکردنی تیر')}
                  </button>
                </div>

                {arrows.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {arrows.map((a: PhotoArrowAnnotation, i) => (
                      <div key={a.id} className="inline-flex items-center">
                        <button
                          type="button"
                          onClick={() => setActiveArrowIndex(i)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                            i === safeArrowIdx
                              ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                              : 'bg-layer border-card-stroke text-muted-foreground-1'
                          }`}
                        >
                          {a.label || bi(`سهم ${i + 1}`, `Arrow ${i + 1}`, `تیر ${i + 1}`)}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            commitSnapshot(stateRef.current);
                            setState((prev) => ({
                              ...prev,
                              arrows: (prev.arrows || []).filter((_, idx) => idx !== i),
                            }));
                            setActiveArrowIndex((curr) => Math.max(0, curr >= i ? curr - 1 : curr));
                          }}
                          aria-label={bi(`حذف ${a.label}`, `Remove ${a.label}`, `سڕینەوەی ${a.label}`)}
                          className="ms-1 p-1 rounded-lg text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {activeArrow && (
                  <div className="space-y-2.5">
                    <input
                      type="text"
                      value={activeArrow.label}
                      placeholder={bi('اكتب ملاحظة التأشير (مثال: تضيّق L4-L5)', 'Enter annotation note...', 'تێبینی بنووسە...')}
                      onChange={(e) => {
                        const val = e.target.value;
                        setState((prev) => ({
                          ...prev,
                          arrows: (prev.arrows || []).map((a, idx) =>
                            idx === safeArrowIdx ? { ...a, label: val } : a
                          ),
                        }));
                      }}
                      className="w-full px-3 py-1.5 rounded-lg border border-card-stroke bg-layer text-xs text-foreground"
                    />
                    <div className="flex items-center gap-2">
                      {['#f59e0b', '#ef4444', '#06b6d4', '#10b981'].map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          aria-label={hex}
                          onClick={() =>
                            setState((prev) => ({
                              ...prev,
                              arrows: (prev.arrows || []).map((a, idx) =>
                                idx === safeArrowIdx ? { ...a, colorHex: hex } : a
                              ),
                            }))
                          }
                          className={`w-6 h-6 rounded-full border-2 cursor-pointer ${
                            activeArrow.colorHex === hex ? 'border-white ring-2 ring-primary' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Plumb-Line, Horizontal Level & Reference Grid Controls */}
            <div className="p-3.5 rounded-xl bg-surface border border-card-divider space-y-3">
              <div className="text-xs font-bold text-foreground inline-flex items-center gap-1.5">
                <Grid3x3 className="w-4 h-4 text-primary" />
                {bi('خط الشاقول والشبكة المرجعية', 'Plumb-Line & Reference Grid', 'هێڵی شاقوڵی و تۆڕی سەرچاوە')}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={state.showPlumbLine}
                  data-testid="photo-studio-plumb-toggle"
                  onClick={() => setState((p) => ({ ...p, showPlumbLine: !p.showPlumbLine }))}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    state.showPlumbLine
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                      : 'bg-layer border-card-stroke text-muted-foreground-1'
                  }`}
                >
                  <Ruler className="w-3.5 h-3.5" />
                  {bi('خط الشاقول', 'Plumb-Line', 'هێڵی شاقوڵی')}
                </button>

                <button
                  type="button"
                  aria-pressed={state.showHorizontalLevel}
                  data-testid="photo-studio-level-toggle"
                  onClick={() => setState((p) => ({ ...p, showHorizontalLevel: !p.showHorizontalLevel }))}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    state.showHorizontalLevel
                      ? 'bg-sky-500/15 border-sky-500/40 text-sky-700 dark:text-sky-300'
                      : 'bg-layer border-card-stroke text-muted-foreground-1'
                  }`}
                >
                  {bi('المستوى الأفقي', 'Horizontal Level', 'ئاستی ئاسۆیی')}
                </button>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="photo-studio-plumb-range" className="font-semibold text-foreground">
                    {bi('موضع خط الشاقول العمودي', 'Vertical Plumb Position', 'شوێنی هێڵی شاقوڵی ستوونی')}
                  </label>
                  <bdi dir="ltr" className="tabular-nums font-bold text-foreground">
                    {state.plumbLineXPercent}%
                  </bdi>
                </div>
                <input
                  id="photo-studio-plumb-range"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  disabled={!state.showPlumbLine}
                  data-testid="photo-studio-plumb-slider"
                  value={state.plumbLineXPercent}
                  onChange={(e) => setState((p) => ({ ...p, plumbLineXPercent: Number(e.target.value) }))}
                  className="w-full accent-amber-500 cursor-pointer disabled:opacity-40"
                />
              </div>

              {state.showHorizontalLevel && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="photo-studio-level-range" className="font-semibold text-foreground">
                      {bi('ارتفاع المستوى الأفقي', 'Horizontal Level Height', 'بەرزی ئاستی ئاسۆیی')}
                    </label>
                    <bdi dir="ltr" className="tabular-nums font-bold text-foreground">
                      {state.horizontalLevelYPercent}%
                    </bdi>
                  </div>
                  <input
                    id="photo-studio-level-range"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={state.horizontalLevelYPercent}
                    onChange={(e) => setState((p) => ({ ...p, horizontalLevelYPercent: Number(e.target.value) }))}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>
              )}

              <div>
                <label htmlFor="photo-studio-grid-mode" className="block text-xs font-semibold text-foreground mb-1">
                  {bi('وضع شبكة القوام', 'Posture Grid Mode', 'شێوازی تۆڕی شێوەی وەستان')}
                </label>
                <select
                  id="photo-studio-grid-mode"
                  data-testid="photo-studio-grid-select"
                  value={state.gridMode}
                  onChange={(e) =>
                    setState((p) => ({
                      ...p,
                      gridMode: e.target.value as PhotoAnnotationState['gridMode'],
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg border border-card-stroke bg-layer text-xs text-foreground"
                >
                  <option value="none">{bi('بدون شبكة', 'None', 'بەبێ تۆڕ')}</option>
                  <option value="3x3">{bi('شبكة 3×3', '3x3', 'تۆڕی ٣×٣')}</option>
                  <option value="6x6">{bi('شبكة 6×6', '6x6', 'تۆڕی ٦×٦')}</option>
                  <option value="12x12">{bi('شبكة 12×12 (دقيقة)', '12x12 (Fine)', 'تۆڕی ١٢×١٢ (ورد)')}</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalDialog>
  );
};

export default PhotoMeasurementStudioModal;
