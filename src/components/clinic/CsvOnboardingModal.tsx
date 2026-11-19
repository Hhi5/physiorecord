// =======================================================================
// PhysioRecord — Phase D2 Patient Import Wizard (CSV + Zero-Dep XLSX)
// Parses RFC-4180 CSV and OOXML XLSX locally, auto-guesses column mapping,
// normalizes Iraqi phone numbers (+964), runs duplicate dry-run preview,
// commits transactionally inside Dexie with batch rollback support.
// =======================================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  GitMerge,
  Columns3,
  X,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { usePatients } from '../../context/PatientContext';
import { useVault } from '../../context/VaultContext';
import type { PatientClinicalData, PatientRecord } from '../../types/clinical';
import { downloadCsvFile } from '../../utils/csvExport';
import {
  buildSamplePatientsCsvTemplate,
  parseCsvMatrix,
} from '../../utils/patientPortability';
import {
  autoGuessImportColumnMapping,
  buildMinimalXlsxBuffer,
  executePatientImportBatchTransactional,
  parseXlsxBufferToMatrix,
  rollbackImportedBatchTransactional,
  runImportWizardDryRun,
  type ImportColumnField,
  type ImportWizardDryRunReport,
  type ImportWizardPreviewRow,
} from '../../utils/dataQualityPhaseD';
import { ModalDialog } from '../ui/Dialog';

export const IMPORT_COLUMN_FIELD_LABELS: Record<
  ImportColumnField,
  { ar: string; en: string; ckb: string }
> = {
  fullNameAr: { ar: 'الاسم بالعربية', en: 'Arabic Name', ckb: 'ناو بە عەرەبی / کوردی' },
  fullName: { ar: 'الاسم بالإنكليزية', en: 'English / Full Name', ckb: 'ناوی تەواو / ئینگلیزی' },
  phone: { ar: 'رقم الهاتف', en: 'Phone Number', ckb: 'ژمارەی مۆبایل' },
  gender: { ar: 'الجنس', en: 'Gender', ckb: 'ڕەگەز' },
  age: { ar: 'العمر', en: 'Age', ckb: 'تەمەن' },
  dateOfBirth: { ar: 'تاريخ الميلاد', en: 'Date of Birth', ckb: 'ڕێکەوتی لەدایکبوون' },
  mrn: { ar: 'الرقم الطبي (MRN)', en: 'Medical Record # (MRN)', ckb: 'ژمارەی دۆسیەی پزیشکی (MRN)' },
  address: { ar: 'العنوان', en: 'Address', ckb: 'ناونیشان' },
  occupation: { ar: 'المهنة', en: 'Occupation', ckb: 'پیشە' },
  medicalHistory: { ar: 'التاريخ المرضي / الشكوى', en: 'Medical History / Complaint', ckb: 'مێژووی پزیشکی / سکاڵا' },
  redFlags: { ar: 'العلامات الحمراء', en: 'Red Flags', ckb: 'نیشانە سوورەکان' },
  referringPhysician: { ar: 'الطبيب المحيل', en: 'Referring Physician', ckb: 'پزیشکی نێردەر' },
  generalNotes: { ar: 'ملاحظات عامة', en: 'General Notes', ckb: 'تێبینیی گشتی' },
  ignore: { ar: 'تجاهل العمود', en: 'Ignore Column', ckb: 'پشتگوێخستنی ستوون' },
};

export interface CsvOnboardingModalProps {
  isOpen: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  existingPatients?: PatientRecord[];
  onImportRows?: (rows: PatientClinicalData[]) => Promise<void> | void;
  onImported?: (importedCount: number) => void;
  onOpenMergeModal?: () => void;
}

export const CsvOnboardingModal: React.FC<CsvOnboardingModalProps> = ({
  isOpen,
  onOpenChange,
  onClose,
  existingPatients,
  onImportRows,
  onImported,
  onOpenMergeModal,
}) => {
  const { language, isRtl, bi } = useLanguage();
  const { patients, savePatient, refreshPatients } = usePatients();
  const { dek } = useVault();

  const resolvedExistingPatients = existingPatients ?? patients;

  const [csvText, setCsvText] = useState('');
  const [parsedMatrix, setParsedMatrix] = useState<string[][] | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [columnMapping, setColumnMapping] = useState<ImportColumnField[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importing, setImporting] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [importedResult, setImportedResult] = useState<number | null>(null);
  const [lastImportedBatchId, setLastImportedBatchId] = useState<string | null>(null);
  const [rollbackedCount, setRollbackedCount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleOpenChange = (open: boolean) => {
    onOpenChange?.(open);
    if (!open) {
      onClose?.();
    }
  };

  const activeMatrix = useMemo<string[][]>(() => {
    if (parsedMatrix !== null) return parsedMatrix;
    if (!csvText.trim()) return [];
    return parseCsvMatrix(csvText);
  }, [parsedMatrix, csvText]);

  const headers = useMemo(() => activeMatrix[0] || [], [activeMatrix]);
  const headersSignature = useMemo(() => JSON.stringify(headers), [headers]);

  useEffect(() => {
    const parsedHeaders = JSON.parse(headersSignature) as string[];
    if (parsedHeaders.length === 0) {
      setColumnMapping([]);
    } else {
      setColumnMapping(autoGuessImportColumnMapping(parsedHeaders));
    }
  }, [headersSignature]);

  const effectiveColumnMapping = useMemo<ImportColumnField[]>(() => {
    if (headers.length === 0) return [];
    if (columnMapping.length === headers.length) return columnMapping;
    return autoGuessImportColumnMapping(headers);
  }, [headers, columnMapping]);

  const dryRunReport: ImportWizardDryRunReport = useMemo(
    () =>
      runImportWizardDryRun({
        matrix: activeMatrix,
        columnMapping: effectiveColumnMapping,
        existingPatients: resolvedExistingPatients,
      }),
    [activeMatrix, effectiveColumnMapping, resolvedExistingPatients]
  );

  const allPreviewRows = useMemo<ImportWizardPreviewRow[]>(
    () =>
      [
        ...dryRunReport.readyRows,
        ...dryRunReport.duplicateRows,
        ...dryRunReport.invalidRows,
      ].sort((a, b) => a.rowNumber - b.rowNumber),
    [dryRunReport]
  );

  const rowsToCommit = useMemo<ImportWizardPreviewRow[]>(() => {
    if (skipDuplicates) return dryRunReport.readyRows;
    return [...dryRunReport.readyRows, ...dryRunReport.duplicateRows].sort(
      (a, b) => a.rowNumber - b.rowNumber
    );
  }, [dryRunReport, skipDuplicates]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportedResult(null);
    setLastImportedBatchId(null);
    setRollbackedCount(null);
    setErrorMsg(null);

    try {
      if (file.name.toLowerCase().endsWith('.xlsx')) {
        const buf = await file.arrayBuffer();
        const matrix = await parseXlsxBufferToMatrix(buf);
        if (matrix.length === 0) {
          setParsedMatrix(null);
          setUploadedFileName(null);
          setErrorMsg(
            bi(
              'ملف Excel فارغ أو لا يحتوي على صفوف صالحة.',
              'XLSX file is empty or contains no valid rows.',
              'فایلی Excel بەتاڵە یان هیچ ڕیزێکی دروستی تێدا نییە.'
            )
          );
          return;
        }
        setParsedMatrix(matrix);
        setUploadedFileName(file.name);
        setCsvText('');
        setColumnMapping(autoGuessImportColumnMapping(matrix[0] || []));
        return;
      }

      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () =>
          reject(
            new Error(
              bi('تعذّر قراءة ملف CSV.', 'Failed to read CSV file.', 'خوێندنەوەی فایلی CSV سەرکەوتوو نەبوو.')
            )
          );
        reader.readAsText(file, 'utf-8');
      });

      const matrix = parseCsvMatrix(content);
      setParsedMatrix(null);
      setUploadedFileName(file.name);
      setCsvText(content);
      setColumnMapping(autoGuessImportColumnMapping(matrix[0] || []));
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : bi(
              'تعذّر قراءة الملف المحدد.',
              'Failed to read selected file.',
              'خوێندنەوەی فایلە هەڵبژێردراوەکە سەرکەوتوو نەبوو.'
            )
      );
    }
  };

  const handlePasteChange = (nextText: string) => {
    setParsedMatrix(null);
    setUploadedFileName(null);
    setCsvText(nextText);
    setImportedResult(null);
    setLastImportedBatchId(null);
    setRollbackedCount(null);
    setErrorMsg(null);
  };

  const handleDownloadSampleXlsx = () => {
    const sampleCsv = buildSamplePatientsCsvTemplate(language === 'en' ? 'en' : 'ar');
    const sampleRows = parseCsvMatrix(sampleCsv);
    const bytes = buildMinimalXlsxBuffer(sampleRows);
    const copy = new Uint8Array(bytes);
    const blob = new Blob([copy.buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    if (typeof document === 'undefined' || typeof URL === 'undefined') return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'physiorecord-patients-template.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleCommitImport = async () => {
    if (rowsToCommit.length === 0) {
      setErrorMsg(
        bi(
          'لا توجد صفوف صالحة جاهزة للاستيراد.',
          'No valid rows available to import.',
          'هیچ ڕیزێکی دروستی ئامادە بۆ هاوردەکردن نییە.'
        )
      );
      return;
    }

    setImporting(true);
    setErrorMsg(null);
    setRollbackedCount(null);

    try {
      if (dek) {
        const result = await executePatientImportBatchTransactional({
          rows: rowsToCommit,
          dek,
          existingPatients: resolvedExistingPatients,
        });
        setLastImportedBatchId(result.batchId);
        setImportedResult(result.count);
        await refreshPatients();
        onImported?.(result.count);
      } else {
        const fallbackBatchId = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const importedAt = new Date().toISOString();
        const taggedRows: PatientClinicalData[] = rowsToCommit.map((row) => ({
          ...row.data,
          isImported: true,
          tags: Array.from(new Set([...(row.data.tags || []), 'imported'])),
          importedBatchId: fallbackBatchId,
          importedAt,
        }));

        if (onImportRows) {
          await onImportRows(taggedRows);
        } else {
          for (const item of taggedRows) {
            await savePatient(item);
          }
        }
        setLastImportedBatchId(fallbackBatchId);
        setImportedResult(taggedRows.length);
        onImported?.(taggedRows.length);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  const handleRollbackBatch = async () => {
    if (!lastImportedBatchId) return;
    if (!dek) {
      setErrorMsg(
        bi(
          'التراجع عن الدفعة يتطلب وجود خزينة مفتوحة (DEK).',
          'Batch rollback requires an active unlocked vault.',
          'پاشگەزبوونەوە لە کۆمەڵە پێویستی بە قاسەی کراوە (DEK) هەیە.'
        )
      );
      return;
    }

    setRollingBack(true);
    setErrorMsg(null);
    try {
      const removedCount = await rollbackImportedBatchTransactional(
        lastImportedBatchId,
        dek
      );
      await refreshPatients();
      setRollbackedCount(removedCount);
      setImportedResult(null);
      setLastImportedBatchId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setRollingBack(false);
    }
  };

  const getDuplicateBadgeText = (row: ImportWizardPreviewRow): string => {
    if (row.intraFileDuplicate) {
      return bi('مكرر داخل الملف', 'Duplicate in File', 'دووبارە لەناو فایلدا');
    }
    const firstMatch = row.duplicateMatches[0];
    if (!firstMatch) {
      return bi('مكرر محتمل', 'Potential Duplicate', 'دووبارەبوونەوەی ئەگەری');
    }
    if (firstMatch.matchConfidence === 'exact_name_and_phone') {
      return bi(
        'تطابق تام (الاسم + الهاتف)',
        'Exact Match (Name + Phone)',
        'لێکچوونی تەواو (ناو + مۆبایل)'
      );
    }
    if (firstMatch.matchConfidence === 'phone_suffix_match') {
      return bi('تطابق رقم الهاتف', 'Phone Match', 'لێکچوونی ژمارەی مۆبایل');
    }
    return bi('تطابق الاسم', 'Name Match', 'لێکچوونی ناو');
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      size="xl"
      title={bi(
        'معالج استيراد المرضى (CSV و Excel XLSX)',
        'Patient Import Wizard (CSV & XLSX)',
        'یاریدەدەری هاوردەکردنی نەخۆش (CSV و Excel XLSX)'
      )}
      subtitle={bi(
        'تحليل محلي 100% — ربط الأعمدة وتوحيد الهواتف (+964) وفحص التكرار قبل التشفير داخل الخزينة.',
        '100% local parser — column mapping, Iraqi phone (+964) normalization, duplicate dry-run, and transactional vault encryption.',
        'شیکردنەوەی ١٠٠٪ ناوخۆیی — بەستنەوەی ستوونەکان، ڕێکخستنی ژمارەی مۆبایل (+964)، پشکنینی دووبارەبوونەوە پێش شفرەکردن لەناو قاسەدا.'
      )}
      closeLabel={bi('إغلاق', 'Close', 'داخستن')}
    >
      <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
        {/* Templates & File Picker Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-surface border border-card-divider">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="download-sample-csv-btn"
              onClick={() =>
                downloadCsvFile(
                  'physiorecord-patients-template.csv',
                  buildSamplePatientsCsvTemplate(language === 'en' ? 'en' : 'ar')
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-card-stroke bg-layer hover:bg-layer-hover text-xs font-semibold text-foreground cursor-pointer"
            >
              <Download className="w-4 h-4 text-primary" />
              <span>{bi('تنزيل نموذج CSV', 'Download Sample CSV', 'داگرتنی قاڵبی CSV')}</span>
            </button>

            <button
              type="button"
              data-testid="download-sample-xlsx-btn"
              onClick={handleDownloadSampleXlsx}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-xs font-semibold text-foreground cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{bi('تنزيل نموذج XLSX', 'Download Sample XLSX', 'داگرتنی قاڵبی XLSX')}</span>
            </button>
          </div>

          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>
              {bi(
                'اختيار ملف CSV أو XLSX',
                'Choose .CSV / .XLSX File',
                'هەڵبژاردنی فایلی CSV یان XLSX'
              )}
            </span>
            <input
              type="file"
              accept=".csv,.txt,.xlsx"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>

        {/* Loaded XLSX indicator */}
        {parsedMatrix !== null && uploadedFileName && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/30 text-xs text-foreground">
            <div className="flex items-center gap-2 font-semibold">
              <FileSpreadsheet className="w-4 h-4 text-primary shrink-0" />
              <span>
                {`${bi('تمت قراءة ملف Excel:', 'Loaded Excel workbook:', 'فایلی Excel خوێندرایەوە:')} ${uploadedFileName} (${Math.max(
                  0,
                  parsedMatrix.length - 1
                )} ${bi('صف بيانات', 'data rows', 'ڕیزی داتا')})`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setParsedMatrix(null);
                setUploadedFileName(null);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-primary/15 text-xs font-semibold text-primary cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>{bi('مسح الملف', 'Clear File', 'سڕینەوەی فایل')}</span>
            </button>
          </div>
        )}

        {/* CSV Direct Paste Area */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">
            {bi(
              'أو الصق محتوى جدول CSV مباشرة',
              'Or Paste CSV Data Directly',
              'یان ناوەڕۆکی خشتەی CSV ڕاستەوخۆ بلکێنە'
            )}
          </label>
          <textarea
            rows={4}
            value={csvText}
            onChange={(e) => handlePasteChange(e.target.value)}
            dir="ltr"
            placeholder="fullNameAr,phone,gender,age,medicalHistory&#10;علي حسن,07701234567,ذكر,35,ألم أسفل الظهر"
            className="w-full px-3 py-2 rounded-xl border border-card-stroke bg-layer text-xs font-mono text-foreground"
          />
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {importedResult !== null && (
          <div
            data-testid="import-commit-success-banner"
            className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-2 font-semibold"
          >
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                {`${bi(
                  'تم تشفير واستيراد',
                  'Successfully encrypted and imported',
                  'بە سەرکەوتوویی شفرەکرا و هاوردەکرا'
                )} ${importedResult} ${bi(
                  'سجل مريض بنجاح.',
                  'patient record(s).',
                  'تۆماری نەخۆش.'
                )}`}
              </span>
              {lastImportedBatchId && (
                <span
                  className="font-mono text-xs px-2 py-0.5 rounded-md bg-emerald-500/15"
                  dir="ltr"
                >
                  {lastImportedBatchId}
                </span>
              )}
            </div>

            {lastImportedBatchId && (
              <button
                type="button"
                data-testid="import-rollback-batch-btn"
                disabled={rollingBack || !dek}
                onClick={handleRollbackBatch}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  {rollingBack
                    ? bi('جاري التراجع…', 'Rolling back…', 'خەریکی پاشگەزبوونەوەیە…')
                    : bi(
                        'التراجع عن آخر دفعة استيراد',
                        'Rollback Last Import Batch',
                        'پاشگەزبوونەوە لە دوایین هاوردەکردن'
                      )}
                </span>
              </button>
            )}
          </div>
        )}

        {rollbackedCount !== null && (
          <div
            role="status"
            className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2 font-semibold"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>
              {rollbackedCount > 0
                ? `${bi(
                    'تم التراجع عن آخر دفعة وحذف',
                    'Rolled back the last batch and removed',
                    'دوایین کۆمەڵە پاشگەزکرایەوە و سڕدرایەوە:'
                  )} ${rollbackedCount} ${bi(
                    'سجل مريض مستورد.',
                    'imported patient record(s).',
                    'تۆماری نەخۆش.'
                  )}`
                : bi(
                    'لم يتم حذف أي سجل (قد تكون السجلات مرتبطة بحلقات علاجية أو فواتير).',
                    'No records deleted (imported patients may already have linked episodes or invoices).',
                    'هیچ تۆمارێک نەسڕدرایەوە (لەوانەیە نەخۆشەکان پەیوەست بن بە ئەڵقەی چارەسەر یان پسوڵەوە).'
                  )}
            </span>
          </div>
        )}

        {/* Interactive Column Mapping Editor */}
        {headers.length > 0 && (
          <div
            data-testid="import-column-mapping-section"
            className="p-3.5 rounded-xl bg-surface border border-card-divider space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <Columns3 className="w-4 h-4 text-primary" />
                <span>
                  {bi(
                    'مطابقة أعمدة الملف مع حقول المريض',
                    'Map File Columns to Patient Fields',
                    'هاوتاکردنی ستوونەکانی فایل لەگەڵ خانەکانی نەخۆش'
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setColumnMapping(autoGuessImportColumnMapping(headers))}
                className="text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                {bi('إعادة التخمين التلقائي', 'Auto-Guess Mapping', 'پێشبینیکردنی خۆکار')}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {headers.map((header, colIndex) => (
                <div
                  key={`${colIndex}-${header}`}
                  className="p-2.5 rounded-xl bg-layer border border-card-stroke space-y-1"
                >
                  <label
                    htmlFor={`import-col-map-${colIndex}`}
                    className="block text-xs font-semibold text-muted-foreground-1 truncate"
                    title={header}
                  >
                    {header || `${bi('عمود', 'Column', 'ستوون')} ${colIndex + 1}`}
                  </label>
                  <select
                    id={`import-col-map-${colIndex}`}
                    data-testid={`import-col-map-${colIndex}`}
                    value={effectiveColumnMapping[colIndex] ?? 'ignore'}
                    onChange={(e) => {
                      const nextField = e.target.value as ImportColumnField;
                      setColumnMapping((prev) => {
                        const base =
                          prev.length === headers.length
                            ? [...prev]
                            : autoGuessImportColumnMapping(headers);
                        base[colIndex] = nextField;
                        return base;
                      });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-card-stroke bg-surface text-xs font-semibold text-foreground focus:outline-none focus:border-primary"
                  >
                    {(
                      Object.entries(IMPORT_COLUMN_FIELD_LABELS) as Array<
                        [ImportColumnField, { ar: string; en: string; ckb: string }]
                      >
                    ).map(([fieldKey, labels]) => (
                      <option key={fieldKey} value={fieldKey}>
                        {bi(labels.ar, labels.en, labels.ckb)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Interactive Dry-Run Preview Panel */}
        {dryRunReport.totalRows > 0 && (
          <div
            data-testid="import-wizard-dry-run-panel"
            className="space-y-3 p-3.5 rounded-xl bg-surface border border-card-divider"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-primary" />
                <span>
                  {bi(
                    'نتائج الفحص التجريبي قبل الاستيراد (Dry-Run)',
                    'Pre-Import Dry-Run Preview',
                    'ئەنجامەکانی پشکنینی تاقیکاری پێش هاوردەکردن (Dry-Run)'
                  )}
                </span>
              </span>

              {dryRunReport.phoneNormalizedCount > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {`${bi('توحيد', 'Normalized', 'ڕێکخستنی')} ${dryRunReport.phoneNormalizedCount} ${bi(
                    'رقم هاتف (+964)',
                    'phone(s) (+964)',
                    'ژمارەی مۆبایل (+964)'
                  )}`}
                </span>
              )}
            </div>

            {/* Summary KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-layer border border-card-stroke">
                <div className="text-muted-foreground-1 font-medium">
                  {bi('الإجمالي', 'Total', 'کۆی گشتی')}
                </div>
                <div
                  data-testid="import-dryrun-total-count"
                  className="text-sm font-extrabold font-mono tabular-nums text-foreground mt-0.5"
                >
                  {dryRunReport.totalRows}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                <div className="text-emerald-700 dark:text-emerald-300 font-medium">
                  {bi('جاهز للاستيراد', 'Valid Ready', 'ئامادەی هاوردەکردن')}
                </div>
                <div
                  data-testid="import-dryrun-valid-count"
                  className="text-sm font-extrabold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-0.5"
                >
                  {dryRunReport.readyRows.length}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
                <div className="text-amber-700 dark:text-amber-300 font-medium">
                  {bi('تكرارات مكتشفة', 'Duplicates Detected', 'دووبارەبووە دۆزراوەکان')}
                </div>
                <div
                  data-testid="import-dryrun-duplicate-count"
                  className="text-sm font-extrabold font-mono tabular-nums text-amber-700 dark:text-amber-300 mt-0.5"
                >
                  {dryRunReport.duplicateRows.length}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25">
                <div className="text-rose-700 dark:text-rose-300 font-medium">
                  {bi('صفوف غير صالحة', 'Invalid Rows', 'ڕیزە نادروستەکان')}
                </div>
                <div
                  data-testid="import-dryrun-invalid-count"
                  className="text-sm font-extrabold font-mono tabular-nums text-rose-700 dark:text-rose-300 mt-0.5"
                >
                  {dryRunReport.invalidRows.length}
                </div>
              </div>
            </div>

            {/* Duplicate Handling Options */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="import-skip-duplicates-checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="rounded border-card-stroke text-primary focus:ring-primary/35 accent-primary"
                />
                <span>
                  {bi(
                    'تجاهل السجلات المكررة المكتشفة',
                    'Skip detected duplicates',
                    'پشتگوێخستنی تۆمارە دووبارە دۆزراوەکان'
                  )}
                </span>
              </label>

              {dryRunReport.duplicateRows.length > 0 && onOpenMergeModal && (
                <button
                  type="button"
                  data-testid="import-open-merge-tool-btn"
                  onClick={onOpenMergeModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs font-bold cursor-pointer"
                >
                  <GitMerge className="w-3.5 h-3.5" />
                  <span>
                    {bi(
                      'فتح أداة دمج المكررين',
                      'Open Merge Tool',
                      'کردنەوەی ئامرازی تێکەڵکردنی دووبارەکان'
                    )}
                  </span>
                </button>
              )}
            </div>

            {/* Preview Table */}
            <div className="max-h-64 overflow-auto rounded-xl border border-card-stroke bg-layer">
              <table className="w-full text-xs">
                <thead className="bg-surface text-muted-foreground-1 border-b border-card-divider sticky top-0">
                  <tr>
                    <th className="p-2 text-start">#</th>
                    <th className="p-2 text-start">{bi('الاسم', 'Name', 'ناو')}</th>
                    <th className="p-2 text-start">
                      {bi('الهاتف الموحّد (+964)', 'Normalized Phone', 'مۆبایلی ڕێکخراو (+964)')}
                    </th>
                    <th className="p-2 text-start">{bi('الحالة', 'Status', 'دۆخ')}</th>
                    <th className="p-2 text-start">{bi('الإجراء', 'Action', 'کردار')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-divider">
                  {allPreviewRows.map((row) => {
                    const isDuplicate =
                      row.isValid &&
                      (row.duplicateMatches.length > 0 || row.intraFileDuplicate);
                    const willImport =
                      row.isValid && (!isDuplicate || !skipDuplicates);

                    return (
                      <tr key={row.rowNumber} className="hover:bg-layer-hover/50">
                        <td className="p-2 font-mono tabular-nums text-muted-foreground-1">
                          {row.rowNumber}
                        </td>
                        <td className="p-2 font-semibold text-foreground">
                          {row.rawName || (
                            <span className="text-rose-600 dark:text-rose-400">
                              {bi('— بدون اسم —', '— Missing name —', '— بێ ناو —')}
                            </span>
                          )}
                        </td>
                        <td className="p-2 font-mono text-foreground" dir="ltr">
                          <bdi dir="ltr">{row.normalizedPhone || '—'}</bdi>
                        </td>
                        <td className="p-2">
                          {!row.isValid ? (
                            <span className="inline-flex items-center gap-1 text-xs text-rose-700 dark:text-rose-400 font-medium">
                              <AlertTriangle className="w-3 h-3" />
                              {bi(
                                row.skipReasonAr || 'صف غير صالح',
                                row.skipReasonEn || 'Invalid row',
                                row.skipReasonAr ? undefined : 'ڕیزی نادروست'
                              )}
                            </span>
                          ) : isDuplicate ? (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 font-medium">
                              <AlertTriangle className="w-3 h-3" />
                              {getDuplicateBadgeText(row)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              {bi('جاهز', 'Valid', 'دروستە')}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-xs font-semibold">
                          {willImport ? (
                            <span className="text-emerald-700 dark:text-emerald-300">
                              {bi('سيتم الاستيراد', 'Import', 'هاوردە دەکرێت')}
                            </span>
                          ) : (
                            <span className="text-muted-foreground-1">
                              {bi('تخطي', 'Skip', 'تێپەڕاندن')}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="px-4 py-2 rounded-xl border border-card-stroke text-xs font-semibold text-muted-foreground-1 hover:bg-layer-hover cursor-pointer"
          >
            {bi('إغلاق', 'Close', 'داخستن')}
          </button>
          <button
            type="button"
            data-testid="commit-csv-import-btn"
            disabled={importing || rowsToCommit.length === 0}
            onClick={handleCommitImport}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed cursor-pointer"
          >
            {importing
              ? bi(
                  'جاري التشفير والاستيراد…',
                  'Encrypting & Importing…',
                  'خەریکی شفرەکردن و هاوردەکردنە…'
                )
              : `${bi('استيراد المرضى', 'Import Patients', 'هاوردەکردنی نەخۆشەکان')} (${rowsToCommit.length})`}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
};
