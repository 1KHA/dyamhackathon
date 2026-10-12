/**
 * LOCAL DEMO DATA ONLY — fills a local database with accounts and data for
 * manual testing (attendance in/out, organizer details & bookings board,
 * milestones per group, mentor booking). Refuses to run unless DATABASE_URL
 * points at localhost / 127.0.0.1.
 *
 *   DATABASE_URL=postgresql://…@127.0.0.1:5442/… node scripts/seed-local-demo.js
 *
 * Times are relative to "now" (today in Riyadh), so the bookings board always
 * has a session running now, a next one and a finished one.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const url = process.env.DATABASE_URL || '';
const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
if (!['localhost', '127.0.0.1'].includes(host)) {
  console.error(`Refusing to seed: DATABASE_URL host is "${host || 'unset'}" — local databases only.`);
  process.exit(1);
}

const prisma = new PrismaClient();
const MIN = 60_000;
const riyadhDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const at = (day, hm) => new Date(`${day}T${hm}:00+03:00`);
const today = riyadhDay(new Date());
const tomorrow = riyadhDay(new Date(Date.now() + 24 * 3600_000));
const yesterday = riyadhDay(new Date(Date.now() - 24 * 3600_000));

const PASS = { admin: 'Admin@12345', organizer: 'Org@12345', participant: 'Test@12345', mentor: 'Mentor@12345' };

async function main() {
  const hash = {};
  for (const [k, v] of Object.entries(PASS)) hash[k] = await bcrypt.hash(v, 10);

  // ---- staff ----------------------------------------------------------------
  await prisma.admin.upsert({ where: { username: 'admin' }, update: { passwordHash: hash.admin }, create: { username: 'admin', passwordHash: hash.admin } });
  for (const [username, name] of [['org1', 'منظم البوابة الشمالية'], ['org2', 'منظم البوابة الجنوبية'], ['org3', 'منظم القاعة الرئيسية'], ['org4', 'منظم قاعة الإرشاد']]) {
    await prisma.organizer.upsert({ where: { username }, update: { passwordHash: hash.organizer, name, isDisabled: false }, create: { username, name, passwordHash: hash.organizer } });
  }

  // ---- settings & groups ------------------------------------------------------
  const settings = await prisma.teamSettings.findFirst();
  if (settings) await prisma.teamSettings.update({ where: { id: settings.id }, data: { mentorBookingMode: 'both' } });
  else await prisma.teamSettings.create({ data: { mentorBookingMode: 'both' } });
  const phase = async (name, order) => prisma.phase.upsert({ where: { name }, update: {}, create: { name, order } });
  const riyadh = await phase('مرحلة الرياض', 101);
  const rabigh = await phase('مرحلة رابغ', 102);

  // ---- participants & teams ---------------------------------------------------
  let n = 0;
  const people = [];
  const person = async (fullName, extra) => {
    n++;
    const email = `user${n}@demo.local`;
    const badgeCode = `MIYAHTHONE-DEMO${String(n).padStart(8, '0')}`;
    const data = {
      fullName, email, badgeCode, passwordHash: hash.participant, status: 'approved',
      phoneNumber: `05000000${String(n).padStart(2, '0')}`, city: n % 2 ? 'الرياض' : 'جدة',
      university: 'جامعة الملك سعود', major: 'هندسة بيئية', gender: n % 2 ? 'ذكر' : 'أنثى', nationality: 'سعودي', ...extra,
    };
    const p = await prisma.participant.upsert({ where: { email }, update: data, create: data });
    people.push({ ...p, password: PASS.participant });
    return p;
  };
  const team = async (teamName, phaseId, track) => {
    const existing = await prisma.team.findFirst({ where: { teamName } });
    const data = { teamName, status: 'approved', phaseId, hackathonTrack: track, ideaName: `فكرة ${teamName}` };
    return existing ? prisma.team.update({ where: { id: existing.id }, data }) : prisma.team.create({ data });
  };
  const t1 = await team('قطرة', riyadh.id, 'إنتاج المياه واستدامة الموارد المائية');
  const t2 = await team('موجة', riyadh.id, 'البنية التحتية للمياه');
  const t3 = await team('نبع', rabigh.id, 'التقنيات الرقمية والذكاء الاصطناعي');
  const t4 = await team('رافد', rabigh.id, 'إعادة الاستخدام والاقتصاد الدائري');
  const t5 = await team('مجرى', riyadh.id, 'الاستدامة وتجربة المستفيد وجودة الحياة');
  const members = {};
  for (const [t, names] of [
    [t1, ['سارة العتيبي', 'عمر الحربي', 'ريم القحطاني']],
    [t2, ['خالد الزهراني', 'نورة الشهري', 'فهد المطيري']],
    [t3, ['لينا الغامدي', 'ماجد السبيعي', 'هند العنزي']],
    [t4, ['سلطان القرني', 'دانة الحمدان', 'بدر العسيري']],
    [t5, ['جود الرشيدي', 'تركي البقمي', 'شهد الأحمدي']],
  ]) {
    members[t.id] = [];
    for (let i = 0; i < names.length; i++) members[t.id].push(await person(names[i], { teamId: t.id, isLeader: i === 0 }));
  }
  const solo1 = await person('يوسف الدوسري', { phaseId: riyadh.id });
  const solo2 = await person('أمل الشمري', { phaseId: rabigh.id });
  await person('رنا السهلي', { phaseId: riyadh.id });
  await person('عبدالرحمن الفيفي', { phaseId: rabigh.id });
  await person('مها الدخيل', { phaseId: riyadh.id });

  // ---- mentors, slots, bookings ----------------------------------------------
  const org = await prisma.organization.upsert({ where: { name: 'جهة المياه التجريبية' }, update: {}, create: { name: 'جهة المياه التجريبية', description: 'جهة للتجربة المحلية' } });
  const mentors = [];
  for (const [i, [name, orgId]] of [['م. عبدالله الراشد', org.id], ['د. منى السالم', org.id], ['م. سلمان العمري', null], ['أ. هيفاء الخالد', null]].entries()) {
    const email = `mentor${i + 1}@demo.local`;
    const data = { name, email, specialty: 'إدارة المياه', phone: `05500000${i + 1}`, status: 'active', passwordHash: hash.mentor, organizationId: orgId };
    mentors.push(await prisma.mentor.upsert({ where: { email }, update: data, create: data }));
  }
  const mentorIds = mentors.map((m) => m.id);
  await prisma.mentorBooking.deleteMany({ where: { availability: { mentorId: { in: mentorIds } } } });
  await prisma.mentorAvailability.deleteMany({ where: { mentorId: { in: mentorIds } } });
  // today: 20-min slots every 25 min from 1h ago for 5h (rounded to 5 min); tomorrow 13:00–16:00
  const start0 = Math.floor((Date.now() - 60 * MIN) / (5 * MIN)) * 5 * MIN;
  const todaySlots = [];
  for (let t = start0; t < start0 + 5 * 3600_000; t += 25 * MIN) todaySlots.push(new Date(t));
  const tomorrowSlots = ['13:00', '13:25', '13:50', '14:15', '14:40', '15:05', '15:30'].map((hm) => at(tomorrow, hm));
  const slotsBy = {};
  for (const m of mentors) {
    slotsBy[m.id] = [];
    for (const s of [...todaySlots, ...tomorrowSlots]) {
      slotsBy[m.id].push(await prisma.mentorAvailability.create({ data: { mentorId: m.id, startTime: s, endTime: new Date(s.getTime() + 20 * MIN) } }));
    }
  }
  const nowIdx = todaySlots.findIndex((s) => s.getTime() <= Date.now() && Date.now() < s.getTime() + 20 * MIN);
  const cur = nowIdx >= 0 ? nowIdx : todaySlots.findIndex((s) => s.getTime() > Date.now());
  const book = (mentor, idx, p, viaOrg = false) =>
    prisma.mentorBooking.create({ data: { participantId: p.id, availabilityId: slotsBy[mentor.id][idx].id, status: 'booked', ...(viaOrg ? { organizationId: org.id } : {}) } });
  const [lead1, lead2, lead3] = [members[t1.id][0], members[t2.id][0], members[t3.id][0]];
  await book(mentors[0], Math.max(0, cur - 2), lead1, true); // finished
  await book(mentors[0], cur, lead1, true);                  // now (or next)
  await book(mentors[2], cur, lead2);                        // same time, other mentor
  await book(mentors[1], cur + 1, lead3, true);              // next
  await book(mentors[3], cur + 2, solo1);                    // later
  await book(mentors[2], todaySlots.length + 1, lead2);      // tomorrow

  // ---- events (sessions) ------------------------------------------------------
  const DEMO = 'جلسة تجريبية محلية';
  const oldEvents = await prisma.event.findMany({ where: { description: DEMO }, select: { id: true } });
  await prisma.attendanceScan.deleteMany({ where: { eventId: { in: oldEvents.map((e) => e.id) } } });
  await prisma.attendanceRecord.deleteMany({ where: { eventId: { in: oldEvents.map((e) => e.id) } } });
  await prisma.eventRegistration.deleteMany({ where: { eventId: { in: oldEvents.map((e) => e.id) } } });
  await prisma.event.deleteMany({ where: { description: DEMO } });
  const ev = (title, startDate, endDate, location) =>
    prisma.event.create({ data: { title, description: DEMO, startDate, endDate, location, capacity: 100, type: 'workshop', plan: 'خطة', presenter: 'فريق مياهثون', status: 'upcoming' } });
  const H = 3600_000;
  const events = [
    await ev('حفل الافتتاح', new Date(Date.now() - 3 * H), new Date(Date.now() - 2 * H), 'القاعة الرئيسية'),
    await ev('ورشة التفكير التصميمي — جارية الآن', new Date(Date.now() - 30 * MIN), new Date(Date.now() + 2 * H), 'القاعة الرئيسية'),
    await ev('جلسة نموذج العمل التجاري', new Date(Date.now() + 2 * H), new Date(Date.now() + 3.5 * H), 'قاعة 2'),
    await ev('لقاء الموجهين المفتوح', new Date(Date.now() + 4 * H), new Date(Date.now() + 5 * H), 'قاعة الإرشاد'),
    await ev('ورشة النماذج الأولية', at(tomorrow, '10:00'), at(tomorrow, '13:00'), 'القاعة الرئيسية'),
    await ev('العرض التجريبي للفرق', at(tomorrow, '14:00'), at(tomorrow, '16:00'), 'المسرح'),
  ];
  const evYesterday = await ev('ورشة الأمس', at(yesterday, '13:00'), at(yesterday, '16:00'), 'القاعة الرئيسية');
  const everyone = people.map((p) => p.id);
  // only the first 8 users are registered — scan anyone else to see «تم تسجيله في الفعالية»
  for (const e of [...events, evYesterday]) {
    for (const pid of everyone.slice(0, 8)) {
      await prisma.eventRegistration.create({ data: { participantId: pid, eventId: e.id, status: 'registered' } });
    }
  }
  // user9 cancelled the live workshop — scanning re-activates the registration
  await prisma.eventRegistration.create({ data: { participantId: everyone[8], eventId: events[1].id, status: 'cancelled' } });

  // ---- yesterday's entries/exits so the presence report has history -----------
  await prisma.attendanceScan.deleteMany({ where: { participantId: { in: everyone } } });
  await prisma.attendanceRecord.deleteMany({ where: { participantId: { in: everyone } } });
  const admin = await prisma.admin.findUnique({ where: { username: 'admin' } });
  const scans = (p, eventId, day, list) => prisma.attendanceScan.createMany({ data: list.map(([direction, hm]) => ({ participantId: p.id, eventId, day, direction, scannedBy: admin.id, scannerRole: 'admin', method: 'scan', createdAt: at(day, hm) })) });
  await scans(lead1, null, yesterday, [['in', '09:00'], ['out', '10:15'], ['in', '10:45'], ['out', '15:30']]);
  await scans(lead2, null, yesterday, [['in', '09:20'], ['out', '12:00']]);
  await scans(lead1, evYesterday.id, yesterday, [['in', '13:10'], ['out', '13:40'], ['in', '14:00'], ['out', '15:30']]);
  await prisma.attendanceRecord.createMany({ data: [lead1, lead2].map((p) => ({ participantId: p.id, eventId: null, checkinDate: yesterday, scannedBy: admin.id, method: 'scan' })), skipDuplicates: true });

  // ---- milestones (groups / hidden) -------------------------------------------
  const ms = async (title, phaseId, status) => {
    const existing = await prisma.milestone.findFirst({ where: { title } });
    const data = { title, description: 'تسليم تجريبي', dueDate: new Date(Date.now() + 3 * 864e5), status, phaseId, requirements: JSON.stringify(['ملف PDF']) };
    return existing ? prisma.milestone.update({ where: { id: existing.id }, data }) : prisma.milestone.create({ data });
  };
  await ms('تسليم للجميع', null, 'upcoming');
  await ms('تسليم معسكر الرياض', riyadh.id, 'upcoming');
  await ms('تسليم معسكر رابغ', rabigh.id, 'upcoming');
  await ms('تسليم مخفي', null, 'hidden');

  // ---- print credentials -------------------------------------------------------
  const teamName = (p) => ({ [t1.id]: 'قطرة (الرياض)', [t2.id]: 'موجة (الرياض)', [t3.id]: 'نبع (رابغ)', [t4.id]: 'رافد (رابغ)', [t5.id]: 'مجرى (الرياض)' })[p.teamId] || (p.phaseId === riyadh.id ? 'فردي (الرياض)' : 'فردي (رابغ)');
  console.log(JSON.stringify({
    today, tomorrow, yesterday,
    admin: { username: 'admin', password: PASS.admin },
    organizers: ['org1', 'org2', 'org3', 'org4'].map((username) => ({ username, password: PASS.organizer })),
    mentors: mentors.map((m) => ({ email: m.email, name: m.name, org: m.organizationId ? 'جهة المياه التجريبية' : '—', password: PASS.mentor })),
    participants: people.map((p) => ({ email: p.email, name: p.fullName, team: teamName(p), leader: p.isLeader, badge: p.badgeCode, password: PASS.participant })),
    events: [...events, evYesterday].map((e) => e.title),
    organizerNames: ['org1 منظم البوابة الشمالية', 'org2 منظم البوابة الجنوبية', 'org3 منظم القاعة الرئيسية', 'org4 منظم قاعة الإرشاد'],
  }, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
