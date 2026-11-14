// =======================================================================
// PhysioRecord — Full Plaintext CSV & JSON Portability Export Modal (5.1)
// Mandatory privacy warning + master password verification before export.
// =======================================================================

import React, { useState } from 'react';
import {
  ShieldAlert,
  LockKeyhole,
  Download,
  FileJson,
  FileSpreadsheet,
  CheckCircle2,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { usePatients } from '../../context/PatientContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { EpisodeService } from '../../services/episodeService';
import { SessionService } from '../../services/sessionService';
import { SoapService } from '../../services/soapService';
import { downloadCsvFile } from '../../utils/csvExport';
import { buildFullVaultCsvFiles } from '../../utils/patientPortability';
import { localDate } from '../../utils/date';
import { ModalDialog } from '../ui/Dialog';

interface FullVaultExportModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const FullVaultExportModal: React.FC<FullVaultExportModalProps> = ({
  isOpen,
  onOpenChange,
}) => {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const { dek, verifyVaultPassword } = useVault();
  const { patients } = usePatients();
  const { currency } = useCurrency();

  const [password, setPassword] = useState('');
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleClose = (open: boolean) => {
    if (!open) {
      setPassword('');
      setVerified(false);
      setErrorMsg(null);
      setSuccessMsg(null);
    }
    onOpenChange(open);
  };

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!password) {
      setErrorMsg(isEn ? 'Enter your master vault password.' : 'أدخل كلمة مرور الخزينة الرئيسية.');
      return;
    }
    setVerifying(true);
    try {
      const ok = await verifyVaultPassword(password);
      if (!ok) {
        setErrorMsg(isEn ? 'Incorrect vault password.' : 'كلمة مرور الخزينة غير صحيحة.');
        setVerified(false);
        return;
      }
      setVerified(true);
      setPassword('');
    } finally {
      setVerifying(false);
    }
  };

  const handleExportCsvBundle = async () => {
    if (!verified) return;
    setExporting(true);
    setErrorMsg(null);
    try {
      const files = buildFullVaultCsvFiles({
        patients,
        invoices: ClinicOperationsService.getInvoicesIQD(),
        expenses: ClinicOperationsService.getExpensesIQD(),
        currencyCode: currency.code,
        lang: isEn ? 'en' : 'ar',
      });
      for (const f of files) {
        downloadCsvFile(f.filename, f.csvContent);
      }
      await ClinicOperationsService.appendAuditLogAsync({
        actionType: 'backup_exported',
        entityType: 'backup',
        entityId: 'full-vault-csv',
        summaryAr: `تصدير حزمة CSV فائقة الصلاحية غير مشفرة (${files.length} ملفات)`,
        summaryEn: `Exported plaintext CSV portability bundle (${files.length} files)`,
      });
      setSuccessMsg(
        isEn
          ? `Downloaded ${files.length} UTF-8 CSV files.`
          : `تم تنزيل ${files.length} ملفات CSV بصيغة UTF-8.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const handleExportFullJson = async () => {
    if (!verified || !dek) return;
    setExporting(true);
    setErrorMsg(null);
    try {
      await Promise.all([
        ClinicOperationsService.ensureColdStoreLoadedAsync('episodeClinical'),
        ClinicOperationsService.ensureColdStoreLoadedAsync('consents'),
        ClinicOperationsService.ensureColdStoreLoadedAsync('attachments'),
        ClinicOperationsService.ensureColdStoreLoadedAsync('noteTemplates'),
        ClinicOperationsService.ensureColdStoreLoadedAsync('patientMedications'),
      ]);
      const exportedPatients = [];
      for (const p of patients) {
        const eps = await EpisodeService.getEpisodesByPatient(p.id, dek);
        const epBundles = [];
        for (const ep of eps) {
          const sessions = await SessionService.getSessionsByEpisode(ep.id, dek);
          const sessionBundles = [];
          for (const sess of sessions) {
            const soap = await SoapService.getSoapNoteBySession(sess.id, dek);
            const addenda = await SoapService.getAddendaBySession(sess.id, dek);
            sessionBundles.push({ session: sess, soap, addenda });
          }
          epBundles.push({
            episode: ep,
            clinicalStore: ClinicOperationsService.getEpisodeClinicalStore(ep.id, p.id),
            sessions: sessionBundles,
          });
        }
        exportedPatients.push({
          patient: p,
          consents: ClinicOperationsService.getConsentsForPatient(p.id),
          attachmentsMetadata: ClinicOperationsService.getAttachmentsForPatient(p.id).map((a) => ({
            id: a.id,
            title: a.title,
            category: a.category,
            capturedAt: a.capturedAt,
            fileName: a.fileName,
            mimeType: a.mimeType,
            storedBytes: a.storedBytes,
          })),
          episodes: epBundles,
        });
      }

      const payload = {
        format: 'physiorecord-plaintext-portability-v1',
        exportedAt: new Date().toISOString(),
        clinicProfile: ClinicOperationsService.getClinicProfile(),
        patients: exportedPatients,
        appointments: ClinicOperationsService.getAppointments(),
        invoices: ClinicOperationsService.getInvoicesIQD(),
        expenses: ClinicOperationsService.getExpensesIQD(),
        noteTemplates: ClinicOperationsService.getAllNoteTemplates(),
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `physiorecord-full-export-${localDate()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      await ClinicOperationsService.appendAuditLogAsync({
        actionType: 'backup_exported',
        entityType: 'backup',
        entityId: 'full-vault-json',
        summaryAr: `تصدير الأرشيف الكامل بصيغة JSON غير مشفر (${exportedPatients.length} مريض)`,
        summaryEn: `Exported full plaintext JSON clinical archive (${exportedPatients.length} patients)`,
      });

      setSuccessMsg(
        isEn
          ? `Downloaded decrypted JSON archive for ${exportedPatients.length} patient(s).`
          : `تم تنزيل أرشيف JSON غير المشفر لـ ${exportedPatients.length} مريض.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={handleClose}
      size="md"
      title={isEn ? 'Full Plaintext CSV / JSON Data Export' : 'التصدير الكامل للبيانات (CSV / JSON)'}
      closeLabel={isEn ? 'Close' : 'إغلاق'}
    >
      <div className="space-y-4">
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/35 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
          <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="font-bold">
              {isEn ? 'Security Notice — Unencrypted Files' : 'تنبيه أمني — ملفات غير مشفرة'}
            </p>
            <p className="leading-relaxed">
              {isEn
                ? 'Unlike encrypted .physiorecord backups, CSV and JSON exports contain readable patient data on your disk. Store them securely and delete temporary files after migration.'
                : 'على عكس النسخ الاحتياطية المشفرة، فإن ملفات CSV و JSON تحتوي على بيانات سريرية ومالية مقروءة غير مشفرة. احفظها في مكان آمن واحذفها بعد النقل.'}
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            <span>{successMsg}</span>
          </div>
        )}

        {!verified ? (
          <form onSubmit={handleVerifyPassword} className="space-y-3 p-4 rounded-xl bg-surface border border-card-divider">
            <label className="block text-xs font-bold text-foreground flex items-center gap-1.5">
              <LockKeyhole className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              {isEn
                ? 'Re-enter Master Vault Password to Unlock Export'
                : 'أعد إدخال كلمة مرور الخزينة الرئيسية لتأكيد التصدير'}
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3 py-2.5 rounded-xl border border-card-stroke bg-layer text-sm text-foreground"
            />
            <button
              type="submit"
              disabled={verifying}
              className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed cursor-pointer"
            >
              {verifying
                ? isEn
                  ? 'Verifying Password…'
                  : 'جاري التحقق…'
                : isEn
                  ? 'Verify Password & Unlock Export'
                  : 'التحقق وفتح التصدير'}
            </button>
          </form>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              disabled={exporting}
              onClick={handleExportCsvBundle}
              className="w-full p-4 rounded-xl border border-card-stroke bg-surface hover:bg-layer-hover text-start flex items-center justify-between gap-3 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <div>
                  <div className="text-xs font-bold text-foreground">
                    {isEn
                      ? 'Export CSV Bundle (Patients, Invoices, Payments, Expenses)'
                      : 'تصدير حزمة CSV (المرضى، الفواتير، الدفعات، المصاريف)'}
                  </div>
                  <div className="text-xs text-muted-foreground-1">
                    {isEn ? 'Formula-safe UTF-8 with BOM for Excel' : 'ملفات متوافقة مع Excel وبحماية من حقن الصيغ'}
                  </div>
                </div>
              </div>
              <Download className="w-4 h-4 text-muted-foreground-1" />
            </button>

            <button
              type="button"
              disabled={exporting}
              onClick={handleExportFullJson}
              className="w-full p-4 rounded-xl border border-card-stroke bg-surface hover:bg-layer-hover text-start flex items-center justify-between gap-3 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <FileJson className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <div className="text-xs font-bold text-foreground">
                    {isEn
                      ? 'Export Full Clinical Archive (Decrypted JSON)'
                      : 'تصدير الأرشيف السريري الكامل (JSON)'}
                  </div>
                  <div className="text-xs text-muted-foreground-1">
                    {isEn
                      ? 'Includes patients, episodes, SOAP notes, addenda, consents & templates'
                      : 'يشمل المرضى، الحلقات، جلسات SOAP، الملاحق، الموافقات والقوالب'}
                  </div>
                </div>
              </div>
              <Download className="w-4 h-4 text-muted-foreground-1" />
            </button>
          </div>
        )}
      </div>
    </ModalDialog>
  );
};
