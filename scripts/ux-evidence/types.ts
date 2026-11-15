// Shared types for UX visual & accessibility evidence generation

export type ThemePaletteId = 'theme-clinical-default' | 'theme-ocean-blue';
export type ColorMode = 'light' | 'dark';
export type SideLabel = 'before' | 'after';

export interface CaptureStateSpec {
  id: string;
  title: string;
  screen: string;
  theme: ThemePaletteId;
  mode: ColorMode;
  category: 'core' | 'chart-tab' | 'settings-tab' | 'modal' | 'team' | 'contrast';
}

export interface AxeRuleSummary {
  id: string;
  impact: string;
  nodes: number;
  help: string;
}

export interface AxeMetrics {
  violationCount: number;
  totalAffectedNodes: number;
  byImpact: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    unknown: number;
  };
  rules: AxeRuleSummary[];
}

export interface CapturedStateResult {
  spec: CaptureStateSpec;
  status: 'captured' | 'not_captured';
  screenshotPath?: string;
  axe?: AxeMetrics;
  reason?: string;
  horizontalOverflowPx?: number;
}

export interface SideRunResult {
  side: SideLabel;
  refLabel: string;
  baseUrl: string;
  startedAt: string;
  finishedAt: string;
  unavailableReason?: string;
  states: Record<string, CapturedStateResult>;
}

export interface MergedStateEntry {
  spec: CaptureStateSpec;
  before: CapturedStateResult;
  after: CapturedStateResult;
}

export interface EvidenceManifest {
  generatedAt: string;
  viewport: {
    width: number;
    height: number;
    deviceScaleFactor: number;
    isMobile: boolean;
    hasTouch: boolean;
  };
  language: 'ar';
  beforeRefLabel: string;
  afterRefLabel: string;
  beforeUnavailableReason?: string;
  entries: MergedStateEntry[];
}
