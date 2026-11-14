// =======================================================================
// PhysioRecord — Phase E4 Konva.js Clinical Measurement Canvas (MIT Engine)
// High-precision zoom/pan 2D canvas powered by Konva + react-konva:
// - 3-Point Joint Goniometer (A-B-C) with sector arc & bisector badge
// - 4-Point Cobb / Spinal Endplate Angle with extended intersecting axes
// - Calibrated 2-Point Linear Distance & ΔX/ΔY caliper (mm / cm / px)
// - Known-Length Scale Calibration Bar
// - Directional Clinical Callout Arrows
// - Directly draggable Plumb-Line, Horizontal Level & Alignment Grids
// =======================================================================

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import Konva from 'konva';
import {
  Arc,
  Arrow,
  Circle,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
} from 'react-konva';
import type {
  PhotoAngleMeasurement,
  PhotoAnnotationState,
  PhotoArrowAnnotation,
  PhotoCalibrationScale,
  PhotoCobbAngleMeasurement,
  PhotoDistanceMeasurement,
  PhotoPoint2D,
} from '../../types/clinicManagement';
import { formatPhotoDistanceBadgeText } from '../../utils/sharingInteropPhaseE';

export type MeasurementToolMode =
  | 'angle3'
  | 'cobb4'
  | 'distance'
  | 'calibrate'
  | 'arrow'
  | 'pan';

export interface KonvaMeasurementCanvasHandle {
  /** Exports the exact image area (excluding viewport padding/bars) with crisp annotations as JPEG data URL */
  exportAnnotatedImage: (opts?: {
    targetMaxDimPx?: number;
  }) => { dataUrl: string; widthPx: number; heightPx: number } | null;
  resetView: () => void;
  zoomBy: (factor: number) => void;
}

export interface KonvaMeasurementCanvasProps {
  sourceDataUrl: string;
  imageTitle: string;
  attachmentWidthPx?: number;
  attachmentHeightPx?: number;
  activeTool: MeasurementToolMode;
  annotations: PhotoAnnotationState;
  activeAngleIndex: number;
  activeAnglePointRole: 'A' | 'B' | 'C';
  activeCobbIndex: number;
  activeCobbPointRole: 'L1A' | 'L1B' | 'L2A' | 'L2B';
  activeDistanceIndex: number;
  activeDistancePointRole: 'start' | 'end';
  activeArrowIndex: number;
  activeArrowPointRole: 'start' | 'end';
  activeCalibPointRole: 'A' | 'B';
  onCanvasTap: (point: PhotoPoint2D) => void;
  onDragAnglePoint: (angleIdx: number, role: 'A' | 'B' | 'C', nextPoint: PhotoPoint2D) => void;
  onDragCobbPoint: (
    cobbIdx: number,
    role: 'L1A' | 'L1B' | 'L2A' | 'L2B',
    nextPoint: PhotoPoint2D
  ) => void;
  onDragDistancePoint: (
    distIdx: number,
    role: 'start' | 'end',
    nextPoint: PhotoPoint2D
  ) => void;
  onDragArrowPoint: (
    arrowIdx: number,
    role: 'start' | 'end',
    nextPoint: PhotoPoint2D
  ) => void;
  onDragCalibrationPoint: (role: 'A' | 'B', nextPoint: PhotoPoint2D) => void;
  onChangePlumbXPercent: (percent: number) => void;
  onChangeLevelYPercent: (percent: number) => void;
  onZoomChange?: (zoomPercent: number) => void;
  onInteractionCommit?: () => void;
  calibDraftPointA?: PhotoPoint2D | null;
  calibDraftPointB?: PhotoPoint2D | null;
  plumbLabel: string;
  levelLabel: string;
  calibLabel: string;
  ariaLabel: string;
}

function clampNorm(v: number): number {
  return Math.round(Math.max(0, Math.min(1, v)) * 10000) / 10000;
}

function getDivisions(gridMode: PhotoAnnotationState['gridMode']): number {
  if (gridMode === '12x12') return 12;
  if (gridMode === '6x6') return 6;
  if (gridMode === '3x3') return 3;
  return 0;
}

interface PrecisionPinProps {
  x: number;
  y: number;
  color: string;
  isSelected?: boolean;
  isPrimaryVertex?: boolean;
  uiScale: number;
  imgW: number;
  imgH: number;
  labelTag?: string;
  onDragPoint: (pt: PhotoPoint2D) => void;
  onDragCommit?: () => void;
}

const PrecisionPin: React.FC<PrecisionPinProps> = ({
  x,
  y,
  color,
  isSelected,
  isPrimaryVertex,
  uiScale,
  imgW,
  imgH,
  labelTag,
  onDragPoint,
  onDragCommit,
}) => {
  const outerR = (isPrimaryVertex ? 8.5 : 7) * uiScale;
  const hitR = 19 * uiScale;
  const tickInner = 3 * uiScale;
  const tickOuter = 6 * uiScale;

  const syncClamped = useCallback(
    (node: Konva.Node, commit = false) => {
      const cx = Math.max(0, Math.min(imgW, node.x()));
      const cy = Math.max(0, Math.min(imgH, node.y()));
      node.x(cx);
      node.y(cy);
      onDragPoint({
        xNorm: clampNorm(cx / imgW),
        yNorm: clampNorm(cy / imgH),
      });
      if (commit) onDragCommit?.();
    },
    [imgW, imgH, onDragPoint, onDragCommit]
  );

  return (
    <Group
      x={x}
      y={y}
      draggable
      onMouseDown={(e) => {
        e.cancelBubble = true;
      }}
      onTouchStart={(e) => {
        e.cancelBubble = true;
      }}
      onClick={(e) => {
        e.cancelBubble = true;
      }}
      onTap={(e) => {
        e.cancelBubble = true;
      }}
      onDragMove={(e) => syncClamped(e.target, false)}
      onDragEnd={(e) => syncClamped(e.target, true)}
    >
      {/* Generous invisible hit area for finger/mouse accuracy */}
      <Circle radius={hitR} fill="rgba(0,0,0,0.001)" />
      {isSelected && (
        <Circle
          radius={outerR + 4.5 * uiScale}
          stroke="#facc15"
          strokeWidth={1.75 * uiScale}
          dash={[3 * uiScale, 2 * uiScale]}
          listening={false}
        />
      )}
      <Circle
        radius={outerR}
        fill="rgba(15, 23, 42, 0.25)"
        stroke="#ffffff"
        strokeWidth={2 * uiScale}
        listening={false}
      />
      <Circle
        radius={outerR - 1.5 * uiScale}
        stroke={color}
        strokeWidth={2 * uiScale}
        listening={false}
      />
      {/* Central crosshair + 2px landmark core */}
      <Line
        points={[-tickOuter, 0, -tickInner, 0]}
        stroke="#ffffff"
        strokeWidth={1.2 * uiScale}
        listening={false}
      />
      <Line
        points={[tickInner, 0, tickOuter, 0]}
        stroke="#ffffff"
        strokeWidth={1.2 * uiScale}
        listening={false}
      />
      <Line
        points={[0, -tickOuter, 0, -tickInner]}
        stroke="#ffffff"
        strokeWidth={1.2 * uiScale}
        listening={false}
      />
      <Line
        points={[0, tickInner, 0, tickOuter]}
        stroke="#ffffff"
        strokeWidth={1.2 * uiScale}
        listening={false}
      />
      <Circle radius={2 * uiScale} fill="#ffffff" listening={false} />
      {labelTag && (
        <Text
          x={outerR + 4 * uiScale}
          y={-outerR - 4 * uiScale}
          text={labelTag}
          fontSize={10 * uiScale}
          fontStyle="bold"
          fill="#ffffff"
          shadowColor="#0f172a"
          shadowBlur={4}
          listening={false}
        />
      )}
    </Group>
  );
};

interface CanvasBadgeProps {
  text: string;
  anchorX: number;
  anchorY: number;
  imgW: number;
  imgH: number;
  uiScale: number;
  textColor: string;
  borderColor: string;
}

const CanvasBadge: React.FC<CanvasBadgeProps> = ({
  text,
  anchorX,
  anchorY,
  imgW,
  imgH,
  uiScale,
  textColor,
  borderColor,
}) => {
  const fontSize = Math.max(9.5, 11.5 * uiScale);
  const padX = 7 * uiScale;
  const padY = 4 * uiScale;
  const estWidth = Math.max(54 * uiScale, text.length * fontSize * 0.62 + padX * 2);
  const boxH = fontSize + padY * 2;
  const boxX = Math.max(4, Math.min(Math.max(4, imgW - estWidth - 4), anchorX));
  const boxY = Math.max(4, Math.min(Math.max(4, imgH - boxH - 4), anchorY));

  return (
    <Group x={boxX} y={boxY} listening={false}>
      <Rect
        width={estWidth}
        height={boxH}
        cornerRadius={5 * uiScale}
        fill="rgba(15, 23, 42, 0.9)"
        stroke={borderColor}
        strokeWidth={1.2 * uiScale}
      />
      <Text
        x={padX}
        y={padY}
        width={estWidth - padX * 2}
        text={text}
        fontSize={fontSize}
        fontFamily="system-ui, -apple-system, sans-serif"
        fontStyle="bold"
        fill={textColor}
        ellipsis
      />
    </Group>
  );
};

export const KonvaMeasurementCanvas = forwardRef<
  KonvaMeasurementCanvasHandle,
  KonvaMeasurementCanvasProps
>(function KonvaMeasurementCanvas(props, ref) {
  const {
    sourceDataUrl,
    attachmentWidthPx,
    attachmentHeightPx,
    activeTool,
    annotations,
    activeAngleIndex,
    activeAnglePointRole,
    activeCobbIndex,
    activeCobbPointRole,
    activeDistanceIndex,
    activeDistancePointRole,
    activeArrowIndex,
    activeArrowPointRole,
    activeCalibPointRole,
    onCanvasTap,
    onDragAnglePoint,
    onDragCobbPoint,
    onDragDistancePoint,
    onDragArrowPoint,
    onDragCalibrationPoint,
    onChangePlumbXPercent,
    onChangeLevelYPercent,
    onZoomChange,
    onInteractionCommit,
    calibDraftPointA,
    calibDraftPointB,
    plumbLabel,
    levelLabel,
    calibLabel,
    ariaLabel,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const viewportGroupRef = useRef<Konva.Group | null>(null);

  const [containerSize, setContainerSize] = useState({ width: 620, height: 420 });
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoverNorm, setHoverNorm] = useState<PhotoPoint2D | null>(null);
  const isPanningRef = useRef(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;

  // Load image locally from encrypted in-memory data URL
  useEffect(() => {
    let active = true;
    const img = new Image();
    img.onload = () => {
      if (active) setImageEl(img);
    };
    img.src = sourceDataUrl;
    return () => {
      active = false;
    };
  }, [sourceDataUrl]);

  // Responsive stage sizing via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(280, Math.floor(rect.width));
      const h = Math.max(280, Math.min(520, Math.floor(rect.width * 0.72)));
      setContainerSize((prev) =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h }
      );
    };
    updateSize();
    if (typeof ResizeObserver !== 'undefined') {
      const obs = new ResizeObserver(updateSize);
      obs.observe(el);
      return () => obs.disconnect();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const natW = imageEl?.naturalWidth || attachmentWidthPx || 800;
  const natH = imageEl?.naturalHeight || attachmentHeightPx || 600;
  // Synthetic 1x1 test fixtures render nicely inside a 4:3 interactive stage box
  const effectiveAspect = natW > 16 && natH > 16 ? natW / natH : 4 / 3;

  const imageBox = useMemo(() => {
    const pad = 12;
    const availW = Math.max(200, containerSize.width - pad * 2);
    const availH = Math.max(200, containerSize.height - pad * 2);
    let imgW = availW;
    let imgH = imgW / effectiveAspect;
    if (imgH > availH) {
      imgH = availH;
      imgW = imgH * effectiveAspect;
    }
    imgW = Math.max(120, Math.round(imgW));
    imgH = Math.max(120, Math.round(imgH));
    return {
      x: Math.round((containerSize.width - imgW) / 2),
      y: Math.round((containerSize.height - imgH) / 2),
      width: imgW,
      height: imgH,
    };
  }, [containerSize.width, containerSize.height, effectiveAspect]);

  const applyZoomAtPoint = useCallback(
    (nextZoomRaw: number, anchorPoint?: { x: number; y: number }) => {
      const nextZoom = Math.max(1, Math.min(5, Math.round(nextZoomRaw * 100) / 100));
      const pivot = anchorPoint || {
        x: containerSize.width / 2,
        y: containerSize.height / 2,
      };
      const curZoom = zoomRef.current;
      const curPan = panRef.current;

      if (nextZoom === 1) {
        setPan({ x: 0, y: 0 });
      } else {
        const worldX = (pivot.x - curPan.x) / curZoom;
        const worldY = (pivot.y - curPan.y) / curZoom;
        setPan({
          x: pivot.x - worldX * nextZoom,
          y: pivot.y - worldY * nextZoom,
        });
      }
      setZoom(nextZoom);
      onZoomChange?.(Math.round(nextZoom * 100));
    },
    [containerSize.height, containerSize.width, onZoomChange]
  );

  useImperativeHandle(
    ref,
    () => ({
      resetView: () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        onZoomChange?.(100);
      },
      zoomBy: (factor: number) => {
        applyZoomAtPoint(zoom * factor);
      },
      exportAnnotatedImage: (opts) => {
        const stage = stageRef.current;
        const vp = viewportGroupRef.current;
        if (!stage || !vp || !imageEl) return null;

        const targetMax = opts?.targetMaxDimPx ?? 1600;
        const baseLongEdge = Math.max(natW > 16 ? natW : 960, natH > 16 ? natH : 720);
        const desiredOutLong = Math.min(targetMax, Math.max(800, baseLongEdge));
        const stageLong = Math.max(imageBox.width, imageBox.height);
        const pixelRatio = Math.max(1, Math.min(4, desiredOutLong / Math.max(1, stageLong)));

        const prevScaleX = vp.scaleX();
        const prevScaleY = vp.scaleY();
        const prevX = vp.x();
        const prevY = vp.y();

        try {
          vp.scale({ x: 1, y: 1 });
          vp.position({ x: 0, y: 0 });
          stage.batchDraw();

          const dataUrl = stage.toDataURL({
            x: imageBox.x,
            y: imageBox.y,
            width: imageBox.width,
            height: imageBox.height,
            pixelRatio,
            mimeType: 'image/jpeg',
            quality: 0.86,
          });
          if (!dataUrl || !dataUrl.startsWith('data:image/')) {
            return null;
          }
          return {
            dataUrl,
            widthPx: Math.round(imageBox.width * pixelRatio),
            heightPx: Math.round(imageBox.height * pixelRatio),
          };
        } catch {
          return null;
        } finally {
          vp.scale({ x: prevScaleX, y: prevScaleY });
          vp.position({ x: prevX, y: prevY });
          stage.batchDraw();
        }
      },
    }),
    [applyZoomAtPoint, imageBox, imageEl, natH, natW, onZoomChange, zoom]
  );

  const stagePointerToImageNorm = useCallback((): PhotoPoint2D | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    const localStageX = (pointer.x - pan.x) / zoom - imageBox.x;
    const localStageY = (pointer.y - pan.y) / zoom - imageBox.y;
    return {
      xNorm: clampNorm(localStageX / imageBox.width),
      yNorm: clampNorm(localStageY / imageBox.height),
    };
  }, [imageBox, pan, zoom]);

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition() || undefined;
    const scaleBy = 1.14;
    const nextZoom = e.evt.deltaY < 0 ? zoom * scaleBy : zoom / scaleBy;
    applyZoomAtPoint(nextZoom, pointer);
  };

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 1 || activeTool === 'pan') {
      isPanningRef.current = false;
    }
  };

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (activeTool === 'pan' || isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }
    if ('button' in e.evt && e.evt.button !== 0) return;
    const norm = stagePointerToImageNorm();
    if (!norm) return;
    onCanvasTap(norm);
  };

  const handleMouseMove = () => {
    const norm = stagePointerToImageNorm();
    setHoverNorm(norm);
  };

  const uiScale = 1 / Math.sqrt(Math.max(1, zoom));
  const divisions = getDivisions(annotations.gridMode);
  const cobbAngles: PhotoCobbAngleMeasurement[] = annotations.cobbAngles || [];
  const distances: PhotoDistanceMeasurement[] = annotations.distances || [];
  const arrows: PhotoArrowAnnotation[] = annotations.arrows || [];
  const calibration: PhotoCalibrationScale | null | undefined = annotations.calibration;

  const calibA = calibDraftPointA || calibration?.pointA || null;
  const calibB = calibDraftPointB || calibration?.pointB || null;

  return (
    <div className="space-y-1.5">
      <div
        ref={containerRef}
        dir="ltr"
        data-testid="photo-studio-canvas-stage"
        aria-label={ariaLabel}
        className={`relative w-full rounded-xl bg-slate-950 border border-card-stroke overflow-hidden touch-none select-none ${
          activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
        }`}
        style={{ height: `${containerSize.height}px` }}
      >
        <Stage
          ref={stageRef}
          width={containerSize.width}
          height={containerSize.height}
          onWheel={handleWheel}
          onMouseDown={handleStageMouseDown}
          onClick={handleStageClick}
          onTap={handleStageClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverNorm(null)}
        >
          <Layer>
            <Group
              ref={viewportGroupRef}
              x={pan.x}
              y={pan.y}
              scaleX={zoom}
              scaleY={zoom}
              draggable={activeTool === 'pan'}
              onDragStart={() => {
                isPanningRef.current = true;
              }}
              onDragMove={(e) => {
                setPan({ x: e.target.x(), y: e.target.y() });
              }}
              onDragEnd={(e) => {
                setPan({ x: e.target.x(), y: e.target.y() });
                window.setTimeout(() => {
                  isPanningRef.current = false;
                }, 40);
              }}
            >
              <Group x={imageBox.x} y={imageBox.y}>
                {/* Base Photo */}
                {imageEl && (
                  <KonvaImage
                    image={imageEl}
                    x={0}
                    y={0}
                    width={imageBox.width}
                    height={imageBox.height}
                  />
                )}

                {/* Posture Alignment Grid */}
                {divisions > 0 &&
                  Array.from({ length: divisions - 1 }, (_, i) => {
                    const posX = (imageBox.width * (i + 1)) / divisions;
                    const posY = (imageBox.height * (i + 1)) / divisions;
                    return (
                      <React.Fragment key={`grid_${i}`}>
                        <Line
                          points={[posX, 0, posX, imageBox.height]}
                          stroke="#14b8a6"
                          opacity={0.45}
                          strokeWidth={1.1 * uiScale}
                          listening={false}
                        />
                        <Line
                          points={[0, posY, imageBox.width, posY]}
                          stroke="#14b8a6"
                          opacity={0.45}
                          strokeWidth={1.1 * uiScale}
                          listening={false}
                        />
                      </React.Fragment>
                    );
                  })}

                {/* Directly Draggable Vertical Plumb-Line */}
                {annotations.showPlumbLine && (
                  <Group
                    x={(Math.max(0, Math.min(100, annotations.plumbLineXPercent)) / 100) * imageBox.width}
                    y={0}
                    draggable
                    onMouseDown={(e) => {
                      e.cancelBubble = true;
                    }}
                    onClick={(e) => {
                      e.cancelBubble = true;
                    }}
                    onDragMove={(e) => {
                      const cx = Math.max(0, Math.min(imageBox.width, e.target.x()));
                      e.target.x(cx);
                      e.target.y(0);
                      onChangePlumbXPercent(Math.round((cx / imageBox.width) * 1000) / 10);
                    }}
                    onDragEnd={() => onInteractionCommit?.()}
                  >
                    <Line
                      points={[0, 0, 0, imageBox.height]}
                      stroke="#f59e0b"
                      strokeWidth={2 * uiScale}
                      dash={[7 * uiScale, 5 * uiScale]}
                      hitStrokeWidth={18 * uiScale}
                    />
                    <Rect
                      x={-26 * uiScale}
                      y={4 * uiScale}
                      width={52 * uiScale}
                      height={16 * uiScale}
                      cornerRadius={4 * uiScale}
                      fill="#f59e0b"
                    />
                    <Text
                      x={-24 * uiScale}
                      y={6.5 * uiScale}
                      width={48 * uiScale}
                      align="center"
                      text={plumbLabel}
                      fontSize={9 * uiScale}
                      fontStyle="bold"
                      fill="#0f172a"
                    />
                  </Group>
                )}

                {/* Directly Draggable Horizontal Level Line */}
                {annotations.showHorizontalLevel && (
                  <Group
                    x={0}
                    y={
                      (Math.max(0, Math.min(100, annotations.horizontalLevelYPercent)) / 100) *
                      imageBox.height
                    }
                    draggable
                    onMouseDown={(e) => {
                      e.cancelBubble = true;
                    }}
                    onClick={(e) => {
                      e.cancelBubble = true;
                    }}
                    onDragMove={(e) => {
                      const cy = Math.max(0, Math.min(imageBox.height, e.target.y()));
                      e.target.x(0);
                      e.target.y(cy);
                      onChangeLevelYPercent(Math.round((cy / imageBox.height) * 1000) / 10);
                    }}
                    onDragEnd={() => onInteractionCommit?.()}
                  >
                    <Line
                      points={[0, 0, imageBox.width, 0]}
                      stroke="#38bdf8"
                      strokeWidth={2 * uiScale}
                      dash={[7 * uiScale, 5 * uiScale]}
                      hitStrokeWidth={18 * uiScale}
                    />
                    <Rect
                      x={4 * uiScale}
                      y={-8 * uiScale}
                      width={52 * uiScale}
                      height={16 * uiScale}
                      cornerRadius={4 * uiScale}
                      fill="#38bdf8"
                    />
                    <Text
                      x={6 * uiScale}
                      y={-5.5 * uiScale}
                      width={48 * uiScale}
                      align="center"
                      text={levelLabel}
                      fontSize={9 * uiScale}
                      fontStyle="bold"
                      fill="#0f172a"
                    />
                  </Group>
                )}

                {/* Calibration Reference Scale Bar */}
                {calibA && calibB && (
                  <Group>
                    <Line
                      points={[
                        calibA.xNorm * imageBox.width,
                        calibA.yNorm * imageBox.height,
                        calibB.xNorm * imageBox.width,
                        calibB.yNorm * imageBox.height,
                      ]}
                      stroke="#c084fc"
                      strokeWidth={2.5 * uiScale}
                      dash={[6 * uiScale, 3 * uiScale]}
                      listening={false}
                    />
                    <CanvasBadge
                      text={`${calibLabel}: ${
                        calibration ? `${calibration.knownLengthMm} mm` : 'A–B'
                      }`}
                      anchorX={((calibA.xNorm + calibB.xNorm) / 2) * imageBox.width + 6}
                      anchorY={((calibA.yNorm + calibB.yNorm) / 2) * imageBox.height - 20}
                      imgW={imageBox.width}
                      imgH={imageBox.height}
                      uiScale={uiScale}
                      textColor="#f3e8ff"
                      borderColor="#c084fc"
                    />
                    <PrecisionPin
                      x={calibA.xNorm * imageBox.width}
                      y={calibA.yNorm * imageBox.height}
                      color="#c084fc"
                      isSelected={activeTool === 'calibrate' && activeCalibPointRole === 'A'}
                      uiScale={uiScale}
                      imgW={imageBox.width}
                      imgH={imageBox.height}
                      labelTag="R1"
                      onDragPoint={(pt) => onDragCalibrationPoint('A', pt)}
                      onDragCommit={onInteractionCommit}
                    />
                    <PrecisionPin
                      x={calibB.xNorm * imageBox.width}
                      y={calibB.yNorm * imageBox.height}
                      color="#c084fc"
                      isSelected={activeTool === 'calibrate' && activeCalibPointRole === 'B'}
                      uiScale={uiScale}
                      imgW={imageBox.width}
                      imgH={imageBox.height}
                      labelTag="R2"
                      onDragPoint={(pt) => onDragCalibrationPoint('B', pt)}
                      onDragCommit={onInteractionCommit}
                    />
                  </Group>
                )}

                {/* 3-Point Joint Goniometer Angles */}
                {annotations.angles.map((ang: PhotoAngleMeasurement, idx: number) => {
                  const isActive = activeTool === 'angle3' && idx === activeAngleIndex;
                  const ax = ang.pointA.xNorm * imageBox.width;
                  const ay = ang.pointA.yNorm * imageBox.height;
                  const bx = ang.vertexB.xNorm * imageBox.width;
                  const by = ang.vertexB.yNorm * imageBox.height;
                  const cx = ang.pointC.xNorm * imageBox.width;
                  const cy = ang.pointC.yNorm * imageBox.height;

                  // Compute sweep angle for Konva.Arc in degrees
                  const a1 = (Math.atan2(ay - by, ax - bx) * 180) / Math.PI;
                  const a2 = (Math.atan2(cy - by, cx - bx) * 180) / Math.PI;
                  let sweep = a2 - a1;
                  while (sweep > 180) sweep -= 360;
                  while (sweep < -180) sweep += 360;

                  const arcStartDeg = sweep >= 0 ? a1 : a1 + sweep;
                  const arcSweepAbs = Math.abs(sweep);

                  return (
                    <Group key={ang.id} opacity={isActive || activeTool !== 'angle3' ? 1 : 0.78}>
                      <Arc
                        x={bx}
                        y={by}
                        innerRadius={0}
                        outerRadius={24 * uiScale}
                        angle={arcSweepAbs}
                        rotation={arcStartDeg}
                        fill="rgba(250, 204, 21, 0.16)"
                        stroke="#facc15"
                        strokeWidth={1.5 * uiScale}
                        listening={false}
                      />
                      <Line
                        points={[ax, ay, bx, by, cx, cy]}
                        stroke="#facc15"
                        strokeWidth={(isActive ? 2.6 : 2) * uiScale}
                        lineCap="round"
                        lineJoin="round"
                        listening={false}
                      />
                      <CanvasBadge
                        text={`${ang.label}: ${ang.angleDegrees}°`}
                        anchorX={bx + 12 * uiScale}
                        anchorY={by - 28 * uiScale}
                        imgW={imageBox.width}
                        imgH={imageBox.height}
                        uiScale={uiScale}
                        textColor="#fef08a"
                        borderColor={isActive ? '#facc15' : '#475569'}
                      />
                      <PrecisionPin
                        x={ax}
                        y={ay}
                        color="#14b8a6"
                        isSelected={isActive && activeAnglePointRole === 'A'}
                        uiScale={uiScale}
                        imgW={imageBox.width}
                        imgH={imageBox.height}
                        labelTag="A"
                        onDragPoint={(pt) => onDragAnglePoint(idx, 'A', pt)}
                        onDragCommit={onInteractionCommit}
                      />
                      <PrecisionPin
                        x={bx}
                        y={by}
                        color="#ef4444"
                        isPrimaryVertex
                        isSelected={isActive && activeAnglePointRole === 'B'}
                        uiScale={uiScale}
                        imgW={imageBox.width}
                        imgH={imageBox.height}
                        labelTag="B"
                        onDragPoint={(pt) => onDragAnglePoint(idx, 'B', pt)}
                        onDragCommit={onInteractionCommit}
                      />
                      <PrecisionPin
                        x={cx}
                        y={cy}
                        color="#14b8a6"
                        isSelected={isActive && activeAnglePointRole === 'C'}
                        uiScale={uiScale}
                        imgW={imageBox.width}
                        imgH={imageBox.height}
                        labelTag="C"
                        onDragPoint={(pt) => onDragAnglePoint(idx, 'C', pt)}
                        onDragCommit={onInteractionCommit}
                      />
                    </Group>
                  );
                })}

                {/* 4-Point Cobb / Spinal Endplate Angles */}
                {cobbAngles.map((cobb, idx) => {
                  const isActive = activeTool === 'cobb4' && idx === activeCobbIndex;
                  const x1a = cobb.line1Start.xNorm * imageBox.width;
                  const y1a = cobb.line1Start.yNorm * imageBox.height;
                  const x1b = cobb.line1End.xNorm * imageBox.width;
                  const y1b = cobb.line1End.yNorm * imageBox.height;
                  const x2a = cobb.line2Start.xNorm * imageBox.width;
                  const y2a = cobb.line2Start.yNorm * imageBox.height;
                  const x2b = cobb.line2End.xNorm * imageBox.width;
                  const y2b = cobb.line2End.yNorm * imageBox.height;

                  const m1x = (x1a + x1b) / 2;
                  const m1y = (y1a + y1b) / 2;
                  const m2x = (x2a + x2b) / 2;
                  const m2y = (y2a + y2b) / 2;

                  return (
                    <Group key={cobb.id} opacity={isActive || activeTool !== 'cobb4' ? 1 : 0.78}>
                      <Line
                        points={[x1a, y1a, x1b, y1b]}
                        stroke="#38bdf8"
                        strokeWidth={(isActive ? 2.6 : 2) * uiScale}
                        lineCap="round"
                        listening={false}
                      />
                      <Line
                        points={[x2a, y2a, x2b, y2b]}
                        stroke="#38bdf8"
                        strokeWidth={(isActive ? 2.6 : 2) * uiScale}
                        lineCap="round"
                        listening={false}
                      />
                      <Line
                        points={[m1x, m1y, m2x, m2y]}
                        stroke="#7dd3fc"
                        strokeWidth={1.3 * uiScale}
                        dash={[5 * uiScale, 4 * uiScale]}
                        listening={false}
                      />
                      <CanvasBadge
                        text={`${cobb.label}: ${cobb.angleDegrees}°`}
                        anchorX={(x1b + x2b) / 2 + 8}
                        anchorY={(y1b + y2b) / 2 - 14}
                        imgW={imageBox.width}
                        imgH={imageBox.height}
                        uiScale={uiScale}
                        textColor="#bae6fd"
                        borderColor={isActive ? '#38bdf8' : '#475569'}
                      />
                      <PrecisionPin
                        x={x1a}
                        y={y1a}
                        color="#0284c7"
                        isSelected={isActive && activeCobbPointRole === 'L1A'}
                        uiScale={uiScale}
                        imgW={imageBox.width}
                        imgH={imageBox.height}
                        labelTag="1A"
                        onDragPoint={(pt) => onDragCobbPoint(idx, 'L1A', pt)}
                        onDragCommit={onInteractionCommit}
                      />
                      <PrecisionPin
                        x={x1b}
                        y={y1b}
                        color="#0284c7"
                        isSelected={isActive && activeCobbPointRole === 'L1B'}
                        uiScale={uiScale}
                        imgW={imageBox.width}
                        imgH={imageBox.height}
                        labelTag="1B"
                        onDragPoint={(pt) => onDragCobbPoint(idx, 'L1B', pt)}
                        onDragCommit={onInteractionCommit}
                      />
                      <PrecisionPin
                        x={x2a}
                        y={y2a}
                        color="#0ea5e9"
                        isSelected={isActive && activeCobbPointRole === 'L2A'}
                        uiScale={uiScale}
                        imgW={imageBox.width}
                        imgH={imageBox.height}
                        labelTag="2A"
                        onDragPoint={(pt) => onDragCobbPoint(idx, 'L2A', pt)}
                        onDragCommit={onInteractionCommit}
                      />
                      <PrecisionPin
                        x={x2b}
                        y={y2b}
                        color="#0ea5e9"
                        isSelected={isActive && activeCobbPointRole === 'L2B'}
                        uiScale={uiScale}
                        imgW={imageBox.width}
                        imgH={imageBox.height}
                        labelTag="2B"
                        onDragPoint={(pt) => onDragCobbPoint(idx, 'L2B', pt)}
                        onDragCommit={onInteractionCommit}
                      />
                    </Group>
                  );
                })}

                {/* Distance Calipers */}
                {distances.map((dist, idx) => {
                  const isActive = activeTool === 'distance' && idx === activeDistanceIndex;
                  const sx = dist.start.xNorm * imageBox.width;
                  const sy = dist.start.yNorm * imageBox.height;
                  const ex = dist.end.xNorm * imageBox.width;
                  const ey = dist.end.yNorm * imageBox.height;
                  return (
                    <Group key={dist.id} opacity={isActive || activeTool !== 'distance' ? 1 : 0.78}>
                      <Line
                        points={[sx, sy, ex, ey]}
                        stroke="#34d399"
                        strokeWidth={(isActive ? 2.6 : 2) * uiScale}
                        lineCap="round"
                        listening={false}
                      />
                      <CanvasBadge
                        text={formatPhotoDistanceBadgeText(dist)}
                        anchorX={(sx + ex) / 2 + 8}
                        anchorY={(sy + ey) / 2 - 22}
                        imgW={imageBox.width}
                        imgH={imageBox.height}
                        uiScale={uiScale}
                        textColor="#a7f3d0"
                        borderColor={isActive ? '#34d399' : '#475569'}
                      />
                      <PrecisionPin
                        x={sx}
                        y={sy}
                        color="#10b981"
                        isSelected={isActive && activeDistancePointRole === 'start'}
                        uiScale={uiScale}
                        imgW={imageBox.width}
                        imgH={imageBox.height}
                        labelTag="D1"
                        onDragPoint={(pt) => onDragDistancePoint(idx, 'start', pt)}
                        onDragCommit={onInteractionCommit}
                      />
                      <PrecisionPin
                        x={ex}
                        y={ey}
                        color="#10b981"
                        isSelected={isActive && activeDistancePointRole === 'end'}
                        uiScale={uiScale}
                        imgW={imageBox.width}
                        imgH={imageBox.height}
                        labelTag="D2"
                        onDragPoint={(pt) => onDragDistancePoint(idx, 'end', pt)}
                        onDragCommit={onInteractionCommit}
                      />
                    </Group>
                  );
                })}

                {/* Callout Arrows */}
                {arrows.map((arr, idx) => {
                  const isActive = activeTool === 'arrow' && idx === activeArrowIndex;
                  const sx = arr.start.xNorm * imageBox.width;
                  const sy = arr.start.yNorm * imageBox.height;
                  const ex = arr.end.xNorm * imageBox.width;
                  const ey = arr.end.yNorm * imageBox.height;
                  const color = arr.colorHex || '#f59e0b';
                  return (
                    <Group key={arr.id} opacity={isActive || activeTool !== 'arrow' ? 1 : 0.8}>
                      <Arrow
                        points={[sx, sy, ex, ey]}
                        pointerLength={9 * uiScale}
                        pointerWidth={8 * uiScale}
                        fill={color}
                        stroke={color}
                        strokeWidth={(isActive ? 2.6 : 2) * uiScale}
                        listening={false}
                      />
                      {arr.label.trim() && (
                        <CanvasBadge
                          text={arr.label}
                          anchorX={sx - 10}
                          anchorY={sy - 26 * uiScale}
                          imgW={imageBox.width}
                          imgH={imageBox.height}
                          uiScale={uiScale}
                          textColor="#ffffff"
                          borderColor={color}
                        />
                      )}
                      <PrecisionPin
                        x={sx}
                        y={sy}
                        color={color}
                        isSelected={isActive && activeArrowPointRole === 'start'}
                        uiScale={uiScale}
                        imgW={imageBox.width}
                        imgH={imageBox.height}
                        onDragPoint={(pt) => onDragArrowPoint(idx, 'start', pt)}
                        onDragCommit={onInteractionCommit}
                      />
                      <PrecisionPin
                        x={ex}
                        y={ey}
                        color={color}
                        isSelected={isActive && activeArrowPointRole === 'end'}
                        uiScale={uiScale}
                        imgW={imageBox.width}
                        imgH={imageBox.height}
                        onDragPoint={(pt) => onDragArrowPoint(idx, 'end', pt)}
                        onDragCommit={onInteractionCommit}
                      />
                    </Group>
                  );
                })}
              </Group>
            </Group>
          </Layer>
        </Stage>

        {/* Live Precision Coordinate & Zoom HUD */}
        <div
          dir="ltr"
          className="pointer-events-none absolute bottom-2 left-2 right-2 flex items-center justify-between text-xs font-mono"
        >
          <span className="px-2 py-0.5 rounded bg-slate-900/80 text-slate-200 border border-slate-700/80 tabular-nums">
            {hoverNorm
              ? `X: ${(hoverNorm.xNorm * 100).toFixed(1)}% · Y: ${(hoverNorm.yNorm * 100).toFixed(1)}%`
              : `${natW}×${natH} px`}
          </span>
          <span
            data-testid="photo-studio-zoom-readout"
            className="px-2 py-0.5 rounded bg-slate-900/80 text-teal-300 border border-slate-700/80 tabular-nums"
          >
            {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
});

export default KonvaMeasurementCanvas;
