import React, { useEffect, useState } from 'react';
import { CheckCircle2, Edit2, Users } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService, ROLE_PERMISSIONS } from '../../services/clinicOperationsService';
import type { ClinicRoleId, ClinicStaffMember } from '../../types/clinicManagement';
import { STAFF_ROLE_CKB } from './settingsI18nLabels';

interface StaffRosterSettingsTabProps {
  isModalOpen: boolean;
}

export const StaffRosterSettingsTab: React.FC<StaffRosterSettingsTabProps> = ({ isModalOpen }) => {
  const { bi } = useLanguage();
  const [staffRoster, setStaffRoster] = useState<ClinicStaffMember[]>(() =>
    ClinicOperationsService.getStaffRoster()
  );
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editingNameAr, setEditingNameAr] = useState('');
  const [editingNameEn, setEditingNameEn] = useState('');
  const [editingSpecialtyAr, setEditingSpecialtyAr] = useState('');
  const [editingSpecialtyEn, setEditingSpecialtyEn] = useState('');
  const [editingRole, setEditingRole] = useState<ClinicRoleId>('senior_pt');
  const [staffSavedMsg, setStaffSavedMsg] = useState(false);

  useEffect(() => {
    const syncRoster = () => setStaffRoster(ClinicOperationsService.getStaffRoster());
    if (isModalOpen) {
      syncRoster();
    }
    return ClinicOperationsService.subscribe(syncRoster);
  }, [isModalOpen]);

  const handleStartEditStaff = (member: ClinicStaffMember) => {
    setEditingStaffId(member.id);
    setEditingNameAr(member.nameAr);
    setEditingNameEn(member.nameEn);
    setEditingSpecialtyAr(member.specialtyAr);
    setEditingSpecialtyEn(member.specialtyEn);
    setEditingRole(member.role);
  };

  const handleCancelEditStaff = () => {
    setEditingStaffId(null);
  };

  const handleSaveStaffMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaffId || !editingNameAr.trim()) return;

    const updatedRoster = staffRoster.map((s) =>
      s.id === editingStaffId
        ? {
            ...s,
            nameAr: editingNameAr.trim(),
            nameEn: editingNameEn.trim() || editingNameAr.trim(),
            specialtyAr: editingSpecialtyAr.trim(),
            specialtyEn: editingSpecialtyEn.trim() || editingSpecialtyAr.trim(),
            role: editingRole,
          }
        : s
    );

    setStaffRoster(updatedRoster);
    ClinicOperationsService.saveStaffRoster(updatedRoster);
    setEditingStaffId(null);
    setStaffSavedMsg(true);
    setTimeout(() => setStaffSavedMsg(false), 2500);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
          <Users className="size-4 text-primary" />
          <span>{bi('إدارة وتعديل أعضاء الكادر', 'Staff Roster Management', 'بەڕێوەبردن و دەستکاریکردنی ئەندامانی ستاف')}</span>
        </div>
        <p className="text-xs text-muted-foreground-1 leading-relaxed">
          {bi(
            'يمكنك تعديل أسماء الأطباء والمعالجين وموظفي الاستقبال، مسمياتهم الوظيفية وتخصصاتهم لتظهر في سجلات الحضور وسجل النشاط والفواتير.',
            'Edit staff member names, clinical specialties, and system roles to reflect accurately across schedules, audit logs, and receipts.',
            'دەتوانیت ناوی پزیشک و چارەسەرکاران و کارمەندانی پێشوازی، ناونیشانی کاری و پسپۆڕییەکانیان دەستکاری بکەیت تا لە تۆمارەکانی ئامادەبوون و چالاکی و پسوڵەکاندا دەربکەون.'
          )}
        </p>
      </div>

      {staffSavedMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>
            {bi(
              'تم تحديث بيانات الكادر وحفظها بنجاح.',
              'Staff roster changes saved successfully.',
              'زانیارییەکانی ستاف بە سەرکەوتوویی نوێکرانەوە و پاشەکەوت کران.'
            )}
          </span>
        </div>
      )}

      {/* Editing Form (if an item is in edit mode) */}
      {editingStaffId && (
        <form
          onSubmit={handleSaveStaffMember}
          className="p-4 rounded-xl bg-card border-2 border-primary space-y-3"
        >
          <div className="flex items-center justify-between pb-2 border-b border-card-divider">
            <span className="text-xs font-bold text-primary flex items-center gap-1.5">
              <Edit2 className="size-3.5" />
              <span>{bi('تعديل بيانات عضو الكادر', 'Edit Staff Member', 'دەستکاریکردنی زانیاری ئەندامی ستاف')}</span>
            </span>
            <button
              type="button"
              onClick={handleCancelEditStaff}
              className="text-xs text-muted-foreground-1 hover:text-foreground cursor-pointer"
            >
              {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
            </button>
          </div>

          <div className="space-y-2">
            <div>
              <label htmlFor="staff-edit-name-ar" className="block text-xs font-bold text-muted-foreground-1 mb-1">
                {bi('الاسم الثلاثي بالعربية *', 'Full Name (Arabic) *', 'ناوی سیانی (عەرەبی) *')}
              </label>
              <input
                id="staff-edit-name-ar"
                type="text"
                required
                value={editingNameAr}
                onChange={(e) => setEditingNameAr(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground focus:outline-none focus:border-primary"
                placeholder={bi('مثال: د. زيد العاني', 'e.g. Dr. Zaid Al-Ani', 'نموونە: د. زەید عانی')}
              />
            </div>

            <div>
              <label htmlFor="staff-edit-name-en" className="block text-xs font-bold text-muted-foreground-1 mb-1">
                {bi('الاسم بالإنجليزية (اختياري)', 'Full Name (English)', 'ناو بە ئینگلیزی (بژاردەیی)')}
              </label>
              <input
                id="staff-edit-name-en"
                type="text"
                dir="ltr"
                value={editingNameEn}
                onChange={(e) => setEditingNameEn(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground text-start focus:outline-none focus:border-primary"
                placeholder="e.g. Dr. Zaid Al-Ani"
              />
            </div>

            <div>
              <label htmlFor="staff-edit-spec-ar" className="block text-xs font-bold text-muted-foreground-1 mb-1">
                {bi('التخصص السريري بالعربية', 'Specialty (Arabic)', 'پسپۆڕی کلینیکی (عەرەبی)')}
              </label>
              <input
                id="staff-edit-spec-ar"
                type="text"
                value={editingSpecialtyAr}
                onChange={(e) => setEditingSpecialtyAr(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground focus:outline-none focus:border-primary"
                placeholder={bi('مثال: تأهيل العظام والعمود الفقري', 'e.g. Orthopedic & Spine Rehab', 'نموونە: چاککردنەوەی ئێسک و بڕبڕەی پشت')}
              />
            </div>

            <div>
              <label htmlFor="staff-edit-spec-en" className="block text-xs font-bold text-muted-foreground-1 mb-1">
                {bi('التخصص بالإنجليزية', 'Specialty (English)', 'پسپۆڕی بە ئینگلیزی')}
              </label>
              <input
                id="staff-edit-spec-en"
                type="text"
                dir="ltr"
                value={editingSpecialtyEn}
                onChange={(e) => setEditingSpecialtyEn(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground text-start focus:outline-none focus:border-primary"
                placeholder="e.g. Orthopedic & Spine Rehabilitation"
              />
            </div>

            <div>
              <label htmlFor="staff-edit-role" className="block text-xs font-bold text-muted-foreground-1 mb-1">
                {bi('الصلاحية الوظيفية في النظام', 'System Role', 'دەسەڵاتی کارکردن لە سیستەمدا')}
              </label>
              <select
                id="staff-edit-role"
                value={editingRole}
                onChange={(e) => setEditingRole(e.target.value as ClinicRoleId)}
                className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground focus:outline-none focus:border-primary"
              >
                <option value="admin">
                  {bi('مدير العيادة والنظام (Admin)', 'Clinic Admin', 'بەڕێوەبەری کلینیک و سیستەم (Admin)')}
                </option>
                <option value="senior_pt">
                  {bi('أخصائي علاج طبيعي أقدم (Senior PT)', 'Senior PT', 'پسپۆڕی چارەسەری سروشتی باڵا (Senior PT)')}
                </option>
                <option value="assistant_pt">
                  {bi('معالج طبيعي ممارس (Assistant PT)', 'Assistant PT', 'چارەسەرکاری سروشتی (Assistant PT)')}
                </option>
                <option value="receptionist">
                  {bi('موظف الاستقبال والحسابات (Receptionist)', 'Receptionist', 'کارمەندی پێشوازی و ژمێریاری (Receptionist)')}
                </option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleCancelEditStaff}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground hover:bg-layer-hover cursor-pointer"
            >
              {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
            </button>
            <button
              type="submit"
              className="min-h-[36px] px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
            >
              {bi('حفظ التعديلات', 'Save Changes', 'پاشەکەوتکردنی گۆڕانکارییەکان')}
            </button>
          </div>
        </form>
      )}

      {/* Roster Cards List */}
      <div className="space-y-2.5">
        {staffRoster.map((member) => {
          const roleMeta = ROLE_PERMISSIONS[member.role];
          return (
            <div
              key={member.id}
              className="p-3.5 rounded-xl bg-card border border-card-line hover:border-line-2 transition-colors flex items-start justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">
                    {bi(member.nameAr, member.nameEn, member.nameAr)}
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      member.role === 'admin'
                        ? 'text-primary'
                        : member.role === 'senior_pt'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : member.role === 'assistant_pt'
                        ? 'text-sky-700 dark:text-sky-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {bi(roleMeta.labelAr, roleMeta.labelEn, STAFF_ROLE_CKB[member.role])}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground-1">
                  {bi(member.specialtyAr, member.specialtyEn, member.specialtyAr)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleStartEditStaff(member)}
                className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-layer border border-layer-line text-xs font-semibold text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary inline-flex items-center gap-1 cursor-pointer transition-colors shrink-0"
              >
                <Edit2 className="size-3" />
                <span>{bi('تعديل', 'Edit', 'دەستکاریکردن')}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
