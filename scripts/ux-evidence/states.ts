import type { CaptureStateSpec, ColorMode, ThemePaletteId } from './types';

function makeSpec(
  screenId: string,
  titleBase: string,
  screen: string,
  theme: ThemePaletteId,
  mode: ColorMode,
  category: CaptureStateSpec['category']
): CaptureStateSpec {
  const themeShort = theme === 'theme-ocean-blue' ? 'ocean-blue' : 'clinical-default';
  return {
    id: `${screenId}__${themeShort}__${mode}`,
    title: `${titleBase} · ${themeShort} · ${mode}`,
    screen,
    theme,
    mode,
    category,
  };
}

function pairLightDark(
  screenId: string,
  titleBase: string,
  screen: string,
  theme: ThemePaletteId,
  category: CaptureStateSpec['category']
): CaptureStateSpec[] {
  return [
    makeSpec(screenId, titleBase, screen, theme, 'light', category),
    makeSpec(screenId, titleBase, screen, theme, 'dark', category),
  ];
}

export const ORDERED_STATE_SPECS: CaptureStateSpec[] = [
  // First-run Vault Setup & Recovery Key (captured once at startup before unlock)
  makeSpec('lock-setup', 'LockScreen (First-Run Vault Setup)', 'LockScreenSetup', 'theme-clinical-default', 'light', 'core'),
  makeSpec('lock-recovery', 'LockScreen (Recovery Key Challenge)', 'LockScreenRecovery', 'theme-clinical-default', 'light', 'core'),

  // LockScreen (Unlock state after vault initialization) — Clinical Default & Ocean Blue
  ...pairLightDark('lock-unlock', 'LockScreen (Before Unlock)', 'LockScreen', 'theme-clinical-default', 'core'),
  ...pairLightDark('lock-unlock', 'LockScreen (Before Unlock)', 'LockScreen', 'theme-ocean-blue', 'contrast'),

  // TodayCommandView (Today, End of Day, Schedule subtabs) + WalkInQuickAddModal
  ...pairLightDark('today-main', 'TodayCommandView (Today Queue)', 'TodayCommandView', 'theme-clinical-default', 'core'),
  ...pairLightDark('today-main', 'TodayCommandView (Today Queue)', 'TodayCommandView', 'theme-ocean-blue', 'contrast'),
  ...pairLightDark('today-eod', 'TodayCommandView (End of Day)', 'TodayCommandView:eod', 'theme-clinical-default', 'core'),
  ...pairLightDark('modal-walkin', 'WalkInQuickAddModal', 'WalkInQuickAddModal', 'theme-clinical-default', 'modal'),

  // AppointmentScheduleView (standalone & Today Schedule tab)
  ...pairLightDark('schedule-view', 'AppointmentScheduleView', 'AppointmentScheduleView', 'theme-clinical-default', 'core'),
  ...pairLightDark('schedule-view', 'AppointmentScheduleView', 'AppointmentScheduleView', 'theme-ocean-blue', 'contrast'),

  // PatientDirectory + QuickView + New PatientModal
  ...pairLightDark('patient-directory', 'PatientDirectory', 'PatientDirectory', 'theme-clinical-default', 'core'),
  ...pairLightDark('patient-directory', 'PatientDirectory', 'PatientDirectory', 'theme-ocean-blue', 'contrast'),
  ...pairLightDark('modal-quick-view', 'PatientQuickViewModal', 'PatientQuickViewModal', 'theme-clinical-default', 'modal'),
  ...pairLightDark('modal-patient-new', 'PatientModal (New Patient)', 'PatientModal', 'theme-clinical-default', 'modal'),

  // MasterPatientChart (all 5 tabs: Evaluation, Sessions, Progress/Comparison, Plan/HEP, Profile + Exam Widgets & Shelf + Episode/Session Modals)
  ...pairLightDark('chart-evaluation', 'MasterPatientChart (Tab 1: Assessment & Exam Widgets)', 'MasterPatientChart:evaluation', 'theme-clinical-default', 'chart-tab'),
  ...pairLightDark('chart-evaluation', 'MasterPatientChart (Tab 1: Assessment & Exam Widgets)', 'MasterPatientChart:evaluation', 'theme-ocean-blue', 'contrast'),
  ...pairLightDark('chart-widgets-detail', 'MasterPatientChart (ROM / MMT / Special Tests / Functional Scales)', 'MasterPatientChart:widgets', 'theme-clinical-default', 'chart-tab'),
  ...pairLightDark('chart-widgets-detail', 'MasterPatientChart (ROM / MMT / Special Tests / Functional Scales)', 'MasterPatientChart:widgets', 'theme-ocean-blue', 'contrast'),
  ...pairLightDark('modal-exam-shelf', 'ExamWidgetShelf Modal', 'ExamWidgetShelf', 'theme-clinical-default', 'modal'),
  ...pairLightDark('chart-sessions', 'MasterPatientChart (Tab 2: Sessions)', 'MasterPatientChart:sessions', 'theme-clinical-default', 'chart-tab'),
  ...pairLightDark('modal-episode-new', 'EpisodeModal (New Episode)', 'EpisodeModal', 'theme-clinical-default', 'modal'),
  ...pairLightDark('modal-session-new', 'SessionModal (New Session)', 'SessionModal', 'theme-clinical-default', 'modal'),
  ...pairLightDark('chart-comparison', 'MasterPatientChart (Tab 3: Progress & Comparison)', 'MasterPatientChart:comparison', 'theme-clinical-default', 'chart-tab'),
  ...pairLightDark('chart-hep', 'MasterPatientChart (Tab 4: Plan, Goals & HEP)', 'MasterPatientChart:hep', 'theme-clinical-default', 'chart-tab'),
  ...pairLightDark('chart-profile', 'MasterPatientChart (Tab 5: Patient Profile & Finance Summary)', 'MasterPatientChart:profile', 'theme-clinical-default', 'chart-tab'),

  // TreatmentSessionView (SOAP, Vitals, Modalities, Lower Sections)
  ...pairLightDark('treatment-session-top', 'TreatmentSessionView (Header & Subjective/SOAP)', 'TreatmentSessionView:top', 'theme-clinical-default', 'core'),
  ...pairLightDark('treatment-session-top', 'TreatmentSessionView (Header & Subjective/SOAP)', 'TreatmentSessionView:top', 'theme-ocean-blue', 'contrast'),
  ...pairLightDark('treatment-session-body', 'TreatmentSessionView (Interventions, Manual Therapy & Plan)', 'TreatmentSessionView:body', 'theme-clinical-default', 'core'),

  // IraqiFinancialLedgerView (all tabs)
  ...pairLightDark('finance-invoices', 'IraqiFinancialLedgerView (Invoices)', 'IraqiFinancialLedgerView:invoices', 'theme-clinical-default', 'core'),
  ...pairLightDark('finance-invoices', 'IraqiFinancialLedgerView (Invoices)', 'IraqiFinancialLedgerView:invoices', 'theme-ocean-blue', 'contrast'),
  ...pairLightDark('finance-installments', 'IraqiFinancialLedgerView (Installments & Aging)', 'IraqiFinancialLedgerView:installments', 'theme-clinical-default', 'core'),
  ...pairLightDark('finance-expenses', 'IraqiFinancialLedgerView (Expenses)', 'IraqiFinancialLedgerView:expenses', 'theme-clinical-default', 'core'),
  ...pairLightDark('finance-zreport', 'IraqiFinancialLedgerView (Daily Cash Close / Z-Report)', 'IraqiFinancialLedgerView:z_report', 'theme-clinical-default', 'core'),
  ...pairLightDark('finance-monthly', 'IraqiFinancialLedgerView (Monthly & CSV)', 'IraqiFinancialLedgerView:monthly', 'theme-clinical-default', 'core'),

  // SettingsModal (all tabs) + child modals
  ...pairLightDark('settings-currency', 'SettingsModal (Tab: Currency)', 'SettingsModal:currency', 'theme-clinical-default', 'settings-tab'),
  ...pairLightDark('settings-currency', 'SettingsModal (Tab: Currency)', 'SettingsModal:currency', 'theme-ocean-blue', 'contrast'),
  ...pairLightDark('settings-clinic', 'SettingsModal (Tab: Clinic)', 'SettingsModal:clinic', 'theme-clinical-default', 'settings-tab'),
  ...pairLightDark('settings-display', 'SettingsModal (Tab: Display & Theme)', 'SettingsModal:display', 'theme-clinical-default', 'settings-tab'),
  ...pairLightDark('settings-display', 'SettingsModal (Tab: Display & Theme)', 'SettingsModal:display', 'theme-ocean-blue', 'contrast'),
  ...pairLightDark('settings-security', 'SettingsModal (Tab: Security)', 'SettingsModal:security', 'theme-clinical-default', 'settings-tab'),
  ...pairLightDark('settings-modules', 'SettingsModal (Tab: Modules)', 'SettingsModal:modules', 'theme-clinical-default', 'settings-tab'),
  ...pairLightDark('settings-developer', 'SettingsModal (Tab: Developer)', 'SettingsModal:developer', 'theme-clinical-default', 'settings-tab'),
  ...pairLightDark('modal-synthetic-data', 'SyntheticDataModal', 'SyntheticDataModal', 'theme-clinical-default', 'modal'),
  ...pairLightDark('modal-whats-new', 'WhatsNewModal', 'WhatsNewModal', 'theme-clinical-default', 'modal'),
  ...pairLightDark('modal-backup-restore', 'BackupRestoreModal', 'BackupRestoreModal', 'theme-clinical-default', 'modal'),

  // AppLayout overlays & Team-mode views touched by fixes
  ...pairLightDark('app-user-menu', 'AppLayout (User Menu)', 'AppLayout:userMenu', 'theme-clinical-default', 'modal'),
  ...pairLightDark('settings-staff', 'SettingsModal (Tab: Staff Roster - Team Mode)', 'SettingsModal:staff', 'theme-clinical-default', 'team'),
  ...pairLightDark('team-reception', 'ReceptionCommandCenterView (Team Mode)', 'ReceptionCommandCenterView', 'theme-clinical-default', 'team'),
  ...pairLightDark('team-mobile-more', 'AppLayout (Mobile More Drawer - Team Mode)', 'AppLayout:mobileMore', 'theme-clinical-default', 'team'),
  ...pairLightDark('team-activity-log', 'ActivityLogView (Team Mode)', 'ActivityLogView', 'theme-clinical-default', 'team'),
];
