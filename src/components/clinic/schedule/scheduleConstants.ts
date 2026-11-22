// =======================================================================
// PhysioRecord — Static Clinic Room & Localized Schedule Lookup Tables
// =======================================================================

import type { AppointmentStatus } from '../../../types/clinicManagement';

export const CLINIC_ROOMS = [
  { ar: 'غرفة التقييم الأولي 1', en: 'Initial Evaluation Room 1', ckb: 'ژووری هەڵسەنگاندنی سەرەتایی 1' },
  { ar: 'وحدة العلاج الطبيعي 1', en: 'PT Treatment Room 1', ckb: 'ژووری چارەسەری سروشتی 1' },
  { ar: 'وحدة العلاج الطبيعي 2', en: 'PT Treatment Room 2', ckb: 'ژووری چارەسەری سروشتی 2' },
  { ar: 'وحدة العلاج الكهربائي واليدوي', en: 'Electro & Manual Therapy Bay', ckb: 'بەشی چارەسەری کارەبایی و دەستی' },
  { ar: 'قاعة التأهيل الحركي والرياضي', en: 'Active Rehab & Sports Gym', ckb: 'هۆڵی ڕاهێنانی جووڵەیی و وەرزشی' },
];

export const STATUS_CKB: Record<AppointmentStatus, string> = {
  scheduled: 'خشتەکراو',
  arrived: 'گەیشتووەتە کلینیک',
  in_session: 'لە دانیشتندایە',
  completed: 'تەواوبوو',
  cancelled: 'هەڵوەشاوە',
  no_show: 'ئامادە نەبوو',
};

export const WEEKDAY_CKB: Record<number, string> = {
  6: 'شەممە',
  0: 'یەکشەممە',
  1: 'دووشەممە',
  2: 'سێشەممە',
  3: 'چوارشەممە',
  4: 'پێنجشەممە',
  5: 'هەینی',
};

export const GOVERNORATE_CKB: Record<string, string> = {
  Baghdad: 'بەغدا',
  Basra: 'بەسڕە',
  Nineveh: 'نەینەوا',
  Erbil: 'هەولێر',
  Najaf: 'نەجەف',
  Karbala: 'کەربەلا',
  Babil: 'بابل',
  Anbar: 'ئەنبار',
  Diyala: 'دیالە',
  Kirkuk: 'کەرکووک',
  Sulaymaniyah: 'سلێمانی',
  Duhok: 'دهۆک',
  Wasit: 'واست',
  Maysan: 'میسان',
  'Dhi Qar': 'زیقار',
  Muthanna: 'موسەنا',
  'Al-Qadisiyah': 'قادسیە',
  Saladin: 'سەلاحەدین',
};
