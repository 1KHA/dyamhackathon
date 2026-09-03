/**
 * Generates the fillable import templates in /imports.
 *
 * Re-run after a schema change so the templates never drift:
 *   node scripts/generate-import-templates.js
 *
 * Produces, for participants / teams / mentors:
 *   <entity>-template.csv   header row only — the file you fill in
 *   <entity>-example.csv    the same columns with sample rows, for reference
 * plus one Excel workbook containing all of them with an instructions sheet.
 *
 * Design rules (see imports/README.md):
 *   - Column names are the EXACT Prisma field names, so an importer can map
 *     them 1:1 with no translation table.
 *   - `status` is deliberately NOT a column: everything must import as
 *     "pending" so the admin approves it afterwards. A column would invite a
 *     typo that silently approves people.
 *   - Participants are linked to teams by `teamName`, not by id — ids do not
 *     exist until the rows are created.
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const OUT = path.join(REPO, 'imports');
const XLSX = require(path.join(REPO, 'node_modules/xlsx'));

const CHALLENGES = [
  'إنتاج المياه واستدامة الموارد المائية',
  'البنية التحتية للمياه',
  'إعادة الاستخدام والاقتصاد الدائري',
  'الاستدامة وتجربة المستفيد وجودة الحياة',
  'التقنيات الرقمية والذكاء الاصطناعي',
];
const PROFESSIONAL_FIELDS = ['ذكاء اصناعي', 'علم البيانات', 'برمجة'];

/** column, Arabic label, required?, note */
const PARTICIPANTS = [
  ['email',               'البريد الإلكتروني',        'مطلوب',  'فريد — لا يتكرر بين المشاركين ولا مع موجه'],
  ['fullName',            'الاسم كاملًا',              'مطلوب',  'يظهر في لوحة التحكم وفي رسائل البريد'],
  ['contactNumber',       'رقم التواصل',              'اختياري', 'أرقام فقط، مثال 0500000000'],
  ['gender',              'الجنس',                    'اختياري', 'ذكر أو أنثى'],
  ['isUniversityStudent', 'هل هو طالب جامعي؟',        'اختياري', 'TRUE أو FALSE'],
  ['university',          'الجامعة',                  'اختياري', ''],
  ['universityMajor',     'التخصص الجامعي',           'اختياري', ''],
  ['professionalField',   'المجال المهني',            'اختياري', PROFESSIONAL_FIELDS.join(' | ')],
  ['city',                'المدينة / رابط Github',    'اختياري', 'تنبيه: نموذج التسجيل العام يستخدم هذا الحقل لرابط Github'],
  ['canAttendHackathon',  'يستطيع الحضور؟',           'اختياري', 'TRUE أو FALSE'],
  ['teamName',            'اسم الفريق',               'اختياري', 'اتركه فارغاً للمشارك الفردي. إذا عُبِّئ فيجب أن يطابق اسم فريق في ملف الفرق'],
  ['isLeader',            'قائد الفريق؟',             'اختياري', 'TRUE لعضو واحد فقط في كل فريق، والباقي FALSE'],
];

const TEAMS = [
  ['teamName',        'اسم الفريق',     'مطلوب',  'فريد — وهو المفتاح الذي يربط المشاركين بالفريق'],
  ['hackathonTrack',  'المسار',         'مطلوب',  'يجب أن يكون أحد المسارات الخمسة المعتمدة (انظر ورقة القيم المسموحة)'],
  ['ideaDescription', 'وصف الفكرة',     'اختياري', ''],
  ['hearAboutUs',     'من أين سمعت عنا','اختياري', ''],
];

const MENTORS = [
  ['name',      'الاسم',            'مطلوب', ''],
  ['email',     'البريد الإلكتروني','مطلوب', 'فريد — لا يتكرر بين الموجهين'],
  ['specialty', 'التخصص',           'مطلوب', 'مثال: الذكاء الاصطناعي'],
  ['phone',     'رقم الجوال',       'مطلوب', 'أرقام فقط'],
];

const EXAMPLES = {
  participants: [
    ['sara@example.com',  'سارة عبدالله', '0501111111', 'أنثى', 'TRUE',  'جامعة الملك سعود', 'علوم حاسب', 'برمجة',        'https://github.com/sara',  'TRUE',  'فريق المياه', 'TRUE'],
    ['omar@example.com',  'عمر خالد',     '0502222222', 'ذكر',  'TRUE',  'جامعة الملك سعود', 'هندسة',      'علم البيانات', 'https://github.com/omar',  'TRUE',  'فريق المياه', 'FALSE'],
    ['huda@example.com',  'هدى فهد',      '0503333333', 'أنثى', 'FALSE', '',                 '',           'ذكاء اصناعي',  'https://github.com/huda',  'FALSE', '',            'FALSE'],
  ],
  teams: [
    ['فريق المياه', CHALLENGES[1], 'حل ذكي لرصد تسربات شبكات المياه', 'تويتر'],
  ],
  mentors: [
    ['د. أحمد الزهراني', 'ahmed.mentor@example.com', 'الذكاء الاصطناعي', '0504444444'],
    ['م. ليلى الحربي',   'laila.mentor@example.com', 'هندسة المياه',     '0505555555'],
  ],
};

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// BOM so Excel reads the Arabic correctly instead of mojibake.
const writeCsv = (file, rows) =>
  fs.writeFileSync(file, '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n', 'utf8');

fs.mkdirSync(OUT, { recursive: true });

const SPECS = { participants: PARTICIPANTS, teams: TEAMS, mentors: MENTORS };
for (const [name, spec] of Object.entries(SPECS)) {
  const headers = spec.map((c) => c[0]);
  writeCsv(path.join(OUT, `${name}-template.csv`), [headers]);
  writeCsv(path.join(OUT, `${name}-example.csv`), [headers, ...EXAMPLES[name]]);
}

// ---- one workbook with everything -----------------------------------------
const wb = XLSX.utils.book_new();
const rtl = (ws) => { ws['!views'] = [{ RTL: true }]; return ws; };

const instructions = [
  ['تعليمات تعبئة ملفات الاستيراد'],
  [],
  ['1. لا تُغيّر أسماء الأعمدة (الصف الأول) — هي أسماء الحقول في قاعدة البيانات.'],
  ['2. جميع السجلات تُستورد بحالة "قيد المراجعة" (pending) ولا تُقبل تلقائياً.'],
  ['   لهذا لا يوجد عمود للحالة إطلاقاً — القبول يتم لاحقاً من لوحة التحكم.'],
  ['3. المشاركون لا تُنشأ لهم كلمات مرور عند الاستيراد. كلمة المرور تُنشأ وتُرسل بالبريد عند القبول.'],
  ['4. اربط المشارك بفريقه عبر عمود teamName بحيث يطابق اسم الفريق في ورقة "الفرق" تماماً.'],
  ['5. اترك teamName فارغاً للمشارك الفردي (بدون فريق).'],
  ['6. ضع isLeader = TRUE لعضو واحد فقط في كل فريق.'],
  ['7. القيم المنطقية تُكتب TRUE أو FALSE.'],
  ['8. البريد الإلكتروني يجب أن يكون فريداً؛ أي تكرار سيُرفض.'],
  ['9. استورد الفرق أولاً ثم المشاركين، لأن المشاركين يشيرون إلى أسماء الفرق.'],
  [],
  ['ملاحظة: الحقل city يُستخدم في نموذج التسجيل العام لرابط Github — راجع imports/README.md.'],
];
XLSX.utils.book_append_sheet(wb, rtl(XLSX.utils.aoa_to_sheet(instructions)), 'تعليمات');

const sheetFor = (spec, examples) => {
  const aoa = [spec.map((c) => c[0]), ...examples];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = spec.map(() => ({ wch: 26 }));
  return rtl(ws);
};
XLSX.utils.book_append_sheet(wb, sheetFor(TEAMS, EXAMPLES.teams), 'الفرق');
XLSX.utils.book_append_sheet(wb, sheetFor(PARTICIPANTS, EXAMPLES.participants), 'المشاركون');
XLSX.utils.book_append_sheet(wb, sheetFor(MENTORS, EXAMPLES.mentors), 'الموجهون');

const dict = [['الملف', 'العمود', 'الاسم بالعربية', 'إلزامي؟', 'ملاحظات']];
for (const [file, spec] of [['المشاركون', PARTICIPANTS], ['الفرق', TEAMS], ['الموجهون', MENTORS]])
  for (const c of spec) dict.push([file, c[0], c[1], c[2], c[3]]);
const dictWs = XLSX.utils.aoa_to_sheet(dict);
dictWs['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 26 }, { wch: 10 }, { wch: 70 }];
XLSX.utils.book_append_sheet(wb, rtl(dictWs), 'دليل الحقول');

const allowed = [['المسارات المعتمدة (hackathonTrack)'], ...CHALLENGES.map((c) => [c]), [],
                 ['المجال المهني (professionalField)'], ...PROFESSIONAL_FIELDS.map((c) => [c]), [],
                 ['الجنس (gender)'], ['ذكر'], ['أنثى'], [],
                 ['القيم المنطقية'], ['TRUE'], ['FALSE']];
const allowedWs = XLSX.utils.aoa_to_sheet(allowed);
allowedWs['!cols'] = [{ wch: 46 }];
XLSX.utils.book_append_sheet(wb, rtl(allowedWs), 'القيم المسموحة');

XLSX.writeFile(wb, path.join(OUT, 'hackathon-import-template.xlsx'));

console.log('Wrote to', OUT);
for (const f of fs.readdirSync(OUT).sort()) console.log('  ' + f);
