/**
 * e2e — entry/exit scanning (check-in AND check-out, many times a day),
 * time inside/outside, organizer participant details and bookings board.
 * See mdfiles/attendance-inout.md.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `io${Date.now()}`;
const MIN = 60_000;

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const sign = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
async function api(pathname, { cookie, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const riyadhDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const today = riyadhDay(new Date());
const yesterday = riyadhDay(new Date(Date.now() - 24 * 3600_000));
const at = (day, hm) => new Date(`${day}T${hm}:00+03:00`);

const made = { participants: [], teams: [], events: [], mentors: [], organizers: [] };
(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  const admin = await prisma.admin.findFirst();
  const aCk = sign({ id: admin.id, username: admin.username, role: 'admin' });
  const org = await prisma.organizer.create({ data: { username: `${TAG}-org`, name: 'منظم', passwordHash: 'x' } });
  made.organizers.push(org.id);
  const oCk = sign({ id: org.id, username: org.username, role: 'organizer' });

  const team = await prisma.team.create({ data: { teamName: `${TAG} فريق`, status: 'approved' } });
  made.teams.push(team.id);
  const mk = async (k, data) => {
    const p = await prisma.participant.create({ data: { email: `${TAG}-${k}@t.local`, fullName: `${TAG} ${k}`, status: 'approved', badgeCode: `MIYAHTHONE-${TAG.toUpperCase()}${k.toUpperCase()}`, ...data } });
    made.participants.push(p.id);
    return p;
  };
  const L = await mk('lead', { teamId: team.id, isLeader: true, phoneNumber: '0500000001', nationalId: '1234567890', city: 'جدة' });
  const M = await mk('mate', { teamId: team.id, phoneNumber: '0500000002' });
  const S = await mk('solo', {});
  const P2 = await mk('p2', {});

  const scanA = (p, extra) => api('/api/admin/attendance/scan', { cookie: aCk, method: 'POST', body: { badgeCode: p.badgeCode, mode: 'general', method: 'scan', ...extra } });
  const venueScans = (p) => prisma.attendanceScan.count({ where: { participantId: p.id, eventId: null, day: today } });

  section('venue: entries and exits, many times a day');
  let r = await scanA(L, { direction: 'in' });
  check('first entry -> checkedIn, daily check-in created, inside', r.status === 200 && r.json.result === 'checkedIn' && r.json.createdCheckin === true && r.json.scanId && r.json.presence?.state === 'inside', JSON.stringify(r.json));
  check('  daily AttendanceRecord written once', (await prisma.attendanceRecord.count({ where: { participantId: L.id, eventId: null, checkinDate: today } })) === 1);
  r = await scanA(L, { direction: 'in' });
  check('entry again while inside -> alreadyCheckedIn, nothing written', r.json.result === 'alreadyCheckedIn' && !r.json.scanId && (await venueScans(L)) === 1, JSON.stringify(r.json));
  r = await scanA(L, { direction: 'out' });
  check('exit -> checkedOut, outside, 1 exit', r.status === 200 && r.json.result === 'checkedOut' && r.json.presence?.state === 'outside' && r.json.presence?.exits === 1, JSON.stringify(r.json));
  r = await scanA(L, { direction: 'out' });
  check('exit again while outside -> alreadyOut, nothing written', r.json.result === 'alreadyOut' && !r.json.scanId && (await venueScans(L)) === 2);
  r = await scanA(L, { direction: 'auto' });
  check('auto while outside -> re-entry', r.json.result === 'reEntered' && r.json.direction === 'in' && r.json.presence?.state === 'inside', JSON.stringify(r.json));
  r = await scanA(L, { direction: 'auto' });
  check('auto while inside -> exit (2 exits)', r.json.result === 'checkedOut' && r.json.direction === 'out' && r.json.presence?.exits === 2, JSON.stringify(r.json));
  check('  4 scans logged, still ONE daily check-in record', (await venueScans(L)) === 4 && (await prisma.attendanceRecord.count({ where: { participantId: L.id, eventId: null } })) === 1);
  r = await scanA(S, { direction: 'out' });
  check('exit without any entry today -> 409 notInside, nothing written', r.status === 409 && r.json.result === 'notInside' && (await venueScans(S)) === 0, JSON.stringify(r.json));
  r = await scanA(S, {});
  check('no direction = old behaviour (entry) -> checkedIn', r.status === 200 && r.json.result === 'checkedIn' && r.json.direction === 'in');

  section('time inside / outside (venue, a past day)');
  const put = (p, eventId, day, list) => prisma.attendanceScan.createMany({ data: list.map(([direction, hm]) => ({ participantId: p.id, eventId, day, direction, scannedBy: admin.id, scannerRole: 'admin', method: 'scan', createdAt: at(day, hm) })) });
  await put(M, null, yesterday, [['in', '09:00'], ['out', '10:00'], ['in', '10:30'], ['in', '10:40'], ['out', '12:00'], ['out', '12:05']]);
  await put(P2, null, yesterday, [['in', '09:00']]);
  r = await api(`/api/admin/attendance/presence?mode=general&date=${yesterday}`, { cookie: aCk });
  const rowM = r.json?.rows?.find((x) => x.participantId === M.id);
  check('presence report 200 for that day', r.status === 200 && r.json.date === yesterday, JSON.stringify(r.json && { s: r.status, d: r.json.date }));
  check('inside = 60 + 90 = 150 min, outside = 30 min, 2 exits (duplicates ignored)', rowM && rowM.summary.insideMinutes === 150 && rowM.summary.outsideMinutes === 30 && rowM.summary.exits === 2 && rowM.summary.unmatchedOuts === 1 && !rowM.summary.missingCheckout, JSON.stringify(rowM?.summary));
  check('  first entry 09:00, last exit 12:00, timeline of 6 scans', rowM && rowM.summary.firstIn === at(yesterday, '09:00').toISOString() && rowM.summary.lastOut === at(yesterday, '12:00').toISOString() && rowM.scans.length === 6);
  const rowP2 = r.json?.rows?.find((x) => x.participantId === P2.id);
  check('entry never closed on a past day -> flagged, not counted', rowP2 && rowP2.summary.missingCheckout === true && rowP2.summary.insideMinutes === 0, JSON.stringify(rowP2?.summary));

  section('time inside an event: late, left early, missed');
  const pastEvent = await prisma.event.create({ data: { title: `${TAG} ورشة أمس`, description: 'd', startDate: at(yesterday, '13:00'), endDate: at(yesterday, '16:00'), location: 'قاعة', capacity: 50, type: 'workshop', plan: 'p', presenter: 'x' } });
  made.events.push(pastEvent.id);
  await put(L, pastEvent.id, yesterday, [['in', '13:10'], ['out', '13:40'], ['in', '14:00'], ['out', '15:30']]);
  r = await api(`/api/admin/attendance/presence?mode=event&eventId=${pastEvent.id}`, { cookie: aCk });
  const ev = r.json?.rows?.find((x) => x.participantId === L.id)?.summary;
  check('event day defaults to the event day', r.status === 200 && r.json.date === yesterday, JSON.stringify(r.json && r.json.date));
  check('inside 30 + 90 = 120 min, out 20 min between, 2 exits', ev && ev.insideMinutes === 120 && ev.outsideMinutes === 20 && ev.exits === 2, JSON.stringify(ev));
  check('late 10 + break 20 + left early 30 = missed 60 of 180 min', ev && ev.lateMinutes === 10 && ev.leftEarlyMinutes === 30 && ev.missedMinutes === 60, JSON.stringify(ev));

  section('event scans now (strict registration)');
  const liveEvent = await prisma.event.create({ data: { title: `${TAG} جلسة الآن`, description: 'd', startDate: new Date(Date.now() - 30 * MIN), endDate: new Date(Date.now() + 90 * MIN), location: 'قاعة', capacity: 50, type: 'workshop', plan: 'p', presenter: 'x' } });
  made.events.push(liveEvent.id);
  await prisma.eventRegistration.create({ data: { participantId: L.id, eventId: liveEvent.id, status: 'registered' } });
  const scanE = (cookie, p, direction, url = '/api/admin/attendance/scan') => api(url, { cookie, method: 'POST', body: { badgeCode: p.badgeCode, mode: 'event', eventId: liveEvent.id, method: 'scan', direction } });
  r = await scanE(aCk, L, 'auto');
  check('registered, auto -> attended + entry', r.status === 200 && r.json.result === 'attended' && r.json.direction === 'in' && r.json.createdCheckin === true, JSON.stringify(r.json));
  check('  registration now attended', (await prisma.eventRegistration.findFirst({ where: { participantId: L.id, eventId: liveEvent.id } })).status === 'attended');
  r = await scanE(aCk, L, 'auto');
  check('auto -> exit from the event', r.json.result === 'checkedOut' && r.json.presence?.exits === 1 && typeof r.json.presence?.missedMinutes === 'number', JSON.stringify(r.json));
  r = await scanE(oCk, L, 'in', '/api/organizer/scan');
  check('organizer can scan event entries too -> reEntered', r.status === 200 && r.json.result === 'reEntered', JSON.stringify(r.json));
  r = await scanE(aCk, M, 'in');
  check('not registered -> 409 notRegistered, nothing written', r.status === 409 && r.json.result === 'notRegistered' && (await prisma.attendanceScan.count({ where: { participantId: M.id, eventId: liveEvent.id } })) === 0);
  r = await scanE(aCk, M, 'out');
  check('exit without entry -> 409 notInside', r.status === 409 && r.json.result === 'notInside');
  r = await api('/api/organizer/scan', { cookie: oCk, method: 'POST', body: { badgeCode: L.badgeCode, mode: 'event' } });
  check('organizer event mode without event -> 400', r.status === 400);
  r = await api(`/api/admin/attendance/presence?mode=event&eventId=${liveEvent.id}&date=${today}`, { cookie: aCk });
  const live = r.json?.rows?.find((x) => x.participantId === L.id);
  check('event presence today: inside now, 1 exit, scanned by admin + organizer', live && live.summary.state === 'inside' && live.summary.exits === 1 && live.scans.some((x) => x.by === 'organizer'), JSON.stringify(live?.summary));

  section('organizer: participant details');
  const mentor = await prisma.mentor.create({ data: { name: `${TAG} الموجه`, email: `${TAG}-m@t.local`, specialty: 'x', phone: '05', status: 'active' } });
  made.mentors.push(mentor.id);
  const slot = (from, len = 20) => prisma.mentorAvailability.create({ data: { mentorId: mentor.id, startTime: new Date(Date.now() + from * MIN), endTime: new Date(Date.now() + (from + len) * MIN) } });
  const sPast = await slot(-60), sNow = await slot(-5), sNext = await slot(30), sCancel = await slot(60);
  const book = (s, p, status = 'booked') => prisma.mentorBooking.create({ data: { participantId: p.id, availabilityId: s.id, status } });
  await book(sPast, L); await book(sNow, M); await book(sNext, L); await book(sCancel, L, 'cancelled');
  r = await api(`/api/organizer/participants/${L.id}`, { cookie: oCk });
  const d = r.json;
  check('details 200 with person, phone and city', r.status === 200 && d.participant.name === L.fullName && d.participant.phone === '0500000001' && d.participant.city === 'جدة', JSON.stringify(d && d.participant));
  check('  never national ID / badge code / password', !JSON.stringify(d).includes('1234567890') && !JSON.stringify(d).includes(L.badgeCode) && !('passwordHash' in d.participant));
  check('  team with both members, leader first, phones', d.team && d.team.members.length === 2 && d.team.members[0].id === L.id && d.team.members[1].phone === '0500000002');
  check('  team bookings: 3 (cancelled excluded), now -> next -> past', d.bookings.length === 3 && d.bookings[0].id && new Date(d.bookings[0].startTime).getTime() === sNow.startTime.getTime() && new Date(d.bookings[1].startTime).getTime() === sNext.startTime.getTime() && d.bookings[2].upcoming === false, JSON.stringify(d.bookings.map((b) => [b.startTime, b.upcoming])));
  check('  today\'s venue entries/exits included', d.venueToday.date === today && d.venueToday.scans.length === 4 && d.venueToday.summary.exits === 2);
  check('details of an unknown participant -> 404', (await api('/api/organizer/participants/nope', { cookie: oCk })).status === 404);
  r = await scanA(M, { direction: 'auto' });
  check('scan responses carry participantId (the page loads details from it)', r.json.participantId === M.id);

  section('organizer: bookings board');
  r = await api(`/api/organizer/bookings?date=${today}`, { cookie: oCk });
  const mine = (r.json?.bookings || []).filter((b) => b.mentorName === mentor.name);
  const todaysSlots = [sPast, sNow, sNext].filter((s) => riyadhDay(s.startTime) === today);
  check('board 200 with serverNow', r.status === 200 && !!r.json.serverNow);
  check('only non-cancelled sessions of that day, sorted by start', mine.length === todaysSlots.length && mine.every((b, i) => i === 0 || new Date(b.startTime) >= new Date(mine[i - 1].startTime)) && !mine.some((b) => new Date(b.startTime).getTime() === sCancel.startTime.getTime()), JSON.stringify(mine.map((b) => b.startTime)));
  const nowRow = mine.find((b) => new Date(b.startTime).getTime() === sNow.startTime.getTime());
  check('row shows team, booker, members and mentor', !nowRow || (nowRow.teamName === team.teamName && nowRow.members.length === 2 && nowRow.mentorName === mentor.name), JSON.stringify(nowRow));

  section('access');
  const pCk = sign({ id: L.id, participantId: L.id, role: 'participant' });
  check('participant -> organizer details 401', (await api(`/api/organizer/participants/${L.id}`, { cookie: pCk })).status === 401);
  check('participant -> organizer bookings 401', (await api('/api/organizer/bookings', { cookie: pCk })).status === 401);
  check('organizer -> admin presence report 401', (await api('/api/admin/attendance/presence?mode=general', { cookie: oCk })).status === 401);

  section('undo one scan');
  r = await scanA(P2, { direction: 'in' });
  const firstIn = r.json;
  check('P2 first entry created the check-in', firstIn.result === 'checkedIn' && firstIn.createdCheckin === true);
  r = await api('/api/admin/attendance/undo', { cookie: aCk, method: 'POST', body: { scanId: firstIn.scanId, revertCheckin: true } });
  check('undo that entry -> scan gone, daily check-in gone', r.status === 200 && (await prisma.attendanceScan.count({ where: { participantId: P2.id, day: today } })) === 0 && (await prisma.attendanceRecord.count({ where: { participantId: P2.id, checkinDate: today } })) === 0);
  const lastL = await prisma.attendanceScan.findFirst({ where: { participantId: L.id, eventId: null, day: today }, orderBy: { createdAt: 'desc' } });
  r = await api('/api/admin/attendance/undo', { cookie: aCk, method: 'POST', body: { scanId: lastL.id } });
  check('undo L\'s last exit only -> 3 scans left, check-in kept', r.status === 200 && (await venueScans(L)) === 3 && (await prisma.attendanceRecord.count({ where: { participantId: L.id, eventId: null } })) === 1);
})()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    try {
      await prisma.notification.deleteMany({ where: { recipientId: { in: made.participants } } });
      await prisma.mentorBooking.deleteMany({ where: { participantId: { in: made.participants } } });
      await prisma.mentorAvailability.deleteMany({ where: { mentorId: { in: made.mentors } } });
      await prisma.mentor.deleteMany({ where: { id: { in: made.mentors } } });
      await prisma.eventRegistration.deleteMany({ where: { eventId: { in: made.events } } });
      await prisma.attendanceRecord.deleteMany({ where: { participantId: { in: made.participants } } });
      await prisma.attendanceScan.deleteMany({ where: { participantId: { in: made.participants } } });
      await prisma.event.deleteMany({ where: { id: { in: made.events } } });
      await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
      await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
      await prisma.organizer.deleteMany({ where: { id: { in: made.organizers } } });
    } catch (e) { console.error('cleanup error:', e.message); }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
