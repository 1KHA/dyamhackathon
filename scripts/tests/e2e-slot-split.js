/**
 * e2e — availability ranges are always split into 20-minute slots, each
 * followed by a 5-minute break (no back-to-back slots).
 *
 * A mentor dragging 10:00–12:00 on the calendar (or an admin adding a range)
 * must end up with five 20-minute rows (10:00, 10:25, 10:50, 11:15, 11:40),
 * never one 2-hour row; unaligned ranges snap to the 5-minute grid; re-adding
 * over existing slots does not duplicate; a slot touching an existing one is
 * skipped; absurd ranges are refused. In organization booking mode the break
 * also applies between colleagues' slots (identical windows still merge).
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `slot${Date.now()}`;
const MIN = 60_000;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
async function api(pathname, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, { method, headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const rows = (mentorId) => prisma.mentorAvailability.findMany({ where: { mentorId }, orderBy: { startTime: 'asc' } });
const all20 = (list) => list.every((r) => r.endTime - r.startTime === 20 * MIN && r.startTime.getTime() % (5 * MIN) === 0);
/** Every consecutive pair (sorted by start) leaves at least the 5-minute break. */
const gapsOk = (list) => list.every((r, i) => i === 0 || r.startTime - list[i - 1].endTime >= 5 * MIN);
const hm = (list) => list.map((x) => `${x.startTime.toISOString().slice(11, 16)}-${x.endTime.toISOString().slice(11, 16)}`).join(' ');

// Tomorrow at a whole UTC hour.
const base = new Date(Math.ceil((Date.now() + 24 * 3600_000) / (3600_000)) * 3600_000);
const at = (m) => new Date(base.getTime() + m * MIN);

let mentor, admin, org, m1, m2, originalMode;
(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  admin = await prisma.admin.findFirst();
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });
  mentor = await prisma.mentor.create({ data: { name: `${TAG} mentor`, email: `${TAG}@e2e.test`, specialty: 'x', phone: '05', status: 'active' } });
  const mCookie = cookie({ id: mentor.id, mentorId: mentor.id, role: 'mentor' });

  section('mentor: a 2-hour drag becomes five 20-minute slots with 5-minute breaks');
  let r = await api('/api/mentor/availability', { cookie: mCookie, method: 'POST', body: { startTime: at(0), endTime: at(120) } });
  let list = await rows(mentor.id);
  check('POST 201 with created=5', r.status === 201 && r.json.created === 5 && r.json.slots?.length === 5, JSON.stringify(r.json).slice(0, 160));
  check('  starts 0/25/50/75/100 min, each exactly 20 min, last ends at the range end', list.length === 5 && all20(list) && list.every((x, i) => x.startTime.getTime() === at(i * 25).getTime()) && list[4].endTime.getTime() === at(120).getTime(), hm(list));
  check('  5-minute break between every pair', gapsOk(list));
  check('  response keeps first row fields at top level (id/startTime) for old callers', typeof r.json.id === 'string' && !!r.json.startTime);

  section('re-adding / touching existing slots');
  r = await api('/api/mentor/availability', { cookie: mCookie, method: 'POST', body: { startTime: at(0), endTime: at(120) } });
  check('same range again: created=0, skipped=5', r.status === 201 && r.json.created === 0 && r.json.skipped === 5, JSON.stringify({ c: r.json.created, s: r.json.skipped }));
  r = await api('/api/mentor/availability', { cookie: mCookie, method: 'POST', body: { startTime: at(120), endTime: at(170) } });
  check('range right after the last slot: back-to-back 12:00 skipped, 12:25 created', r.status === 201 && r.json.created === 1 && r.json.skipped === 1 && new Date(r.json.slots[0].startTime).getTime() === at(145).getTime(), JSON.stringify({ c: r.json.created, s: r.json.skipped, first: r.json.slots?.[0]?.startTime }));
  r = await api('/api/mentor/availability', { cookie: mCookie, method: 'POST', body: { startTime: at(170), endTime: at(190) } });
  check('a slot exactly 5 minutes after an existing one is allowed', r.status === 201 && r.json.created === 1);
  r = await api('/api/mentor/availability', { cookie: mCookie, method: 'POST', body: { startTime: at(10), endTime: at(30) } });
  check('a range overlapping an existing slot creates nothing', r.status === 201 && r.json.created === 0 && r.json.skipped === 1);
  list = await rows(mentor.id);
  check('  still all 20 min with breaks, no duplicate start times', all20(list) && gapsOk(list) && new Set(list.map((x) => x.startTime.getTime())).size === list.length, hm(list));

  section('unaligned ranges snap to the 5-minute grid');
  r = await api('/api/mentor/availability', { cookie: mCookie, method: 'POST', body: { startTime: at(247), endTime: at(292) } }); // 14:07–14:52
  const snapped = (await rows(mentor.id)).filter((x) => x.startTime >= at(240) && x.endTime <= at(300));
  check('14:07–14:52 → 14:05–14:25 and 14:30–14:50', r.json.created === 2 && snapped.length === 2 && snapped[0].startTime.getTime() === at(245).getTime() && snapped[1].startTime.getTime() === at(270).getTime() && snapped[1].endTime.getTime() === at(290).getTime(), hm(snapped));
  r = await api('/api/mentor/availability', { cookie: mCookie, method: 'POST', body: { startTime: at(360), endTime: at(365) } }); // 5-minute drag
  check('a 5-minute range still yields one full 20-minute slot', r.json.created === 1 && (await prisma.mentorAvailability.findFirst({ where: { mentorId: mentor.id, startTime: at(360) } }))?.endTime.getTime() === at(380).getTime());

  section('validation');
  check('end before start -> 400', (await api('/api/mentor/availability', { cookie: mCookie, method: 'POST', body: { startTime: at(600), endTime: at(590) } })).status === 400);
  check('garbage dates -> 400', (await api('/api/mentor/availability', { cookie: mCookie, method: 'POST', body: { startTime: 'x', endTime: 'y' } })).status === 400);
  const before = (await rows(mentor.id)).length;
  const huge = await api('/api/mentor/availability', { cookie: mCookie, method: 'POST', body: { startTime: at(1440), endTime: at(1440 + 13 * 60) } });
  check('13-hour range -> 400 (max 12 h)', huge.status === 400 && /12/.test(huge.json?.error || ''), JSON.stringify(huge.json));
  check('  nothing created by the refused requests', (await rows(mentor.id)).length === before);

  section('admin route applies the same rule');
  r = await api(`/api/admin/mentors/${mentor.id}/availability`, { cookie: aCookie, method: 'POST', body: { start: at(2010), end: at(2100) } }); // 90 min, grid-aligned
  check('admin 90-minute range -> 3 slots', r.status === 201 && r.json.created === 3, JSON.stringify(r.json).slice(0, 120));
  check('  every row of this mentor is 20 minutes with breaks between', all20(await rows(mentor.id)) && gapsOk(await rows(mentor.id)));
  check('admin bad range -> 400', (await api(`/api/admin/mentors/${mentor.id}/availability`, { cookie: aCookie, method: 'POST', body: { start: at(3000), end: at(2990) } })).status === 400);

  section('participant view sees the individual slots');
  const pub = await api(`/api/admin/mentors/${mentor.id}/availability`, { cookie: aCookie });
  check('GET lists only 20-minute slots', Array.isArray(pub.json) && pub.json.length === (await rows(mentor.id)).length && pub.json.every((s) => new Date(s.endTime) - new Date(s.startTime) === 20 * MIN));

  section('organizations: the break also applies between colleagues in organization mode');
  originalMode = (await prisma.teamSettings.findFirst())?.mentorBookingMode ?? 'individual';
  org = await prisma.organization.create({ data: { name: `${TAG} org` } });
  m1 = await prisma.mentor.create({ data: { name: `${TAG} m1`, email: `${TAG}-m1@e2e.test`, specialty: 'x', phone: '05', status: 'active', organizationId: org.id } });
  m2 = await prisma.mentor.create({ data: { name: `${TAG} m2`, email: `${TAG}-m2@e2e.test`, specialty: 'x', phone: '05', status: 'active', organizationId: org.id } });
  const c1 = cookie({ id: m1.id, mentorId: m1.id, role: 'mentor' });
  const c2 = cookie({ id: m2.id, mentorId: m2.id, role: 'mentor' });
  const setMode = (mode) => api('/api/admin/team-settings', { method: 'PUT', cookie: aCookie, body: { mentorBookingMode: mode } });
  check('set individual mode -> 200', (await setMode('individual')).status === 200);
  await api('/api/mentor/availability', { cookie: c1, method: 'POST', body: { startTime: at(4000), endTime: at(4020) } });
  r = await api('/api/mentor/availability', { cookie: c2, method: 'POST', body: { startTime: at(4020), endTime: at(4040) } });
  check('individual mode: colleague may add right after (own calendar only)', r.status === 201 && r.json.created === 1);
  check('set organization mode -> 200', (await setMode('organization')).status === 200);
  r = await api('/api/mentor/availability', { cookie: c2, method: 'POST', body: { startTime: at(4100), endTime: at(4120) } });
  check('  baseline: m2 adds 4100', r.json.created === 1);
  r = await api('/api/mentor/availability', { cookie: c1, method: 'POST', body: { startTime: at(4120), endTime: at(4140) } });
  check('organization mode: back-to-back with a colleague -> skipped', r.status === 201 && r.json.created === 0 && r.json.skipped === 1, JSON.stringify(r.json).slice(0, 120));
  r = await api('/api/mentor/availability', { cookie: c1, method: 'POST', body: { startTime: at(4110), endTime: at(4130) } });
  check('organization mode: overlapping a colleague -> skipped', r.json.created === 0);
  r = await api('/api/mentor/availability', { cookie: c1, method: 'POST', body: { startTime: at(4100), endTime: at(4120) } });
  check('organization mode: the exact same window is allowed (merges into one org slot)', r.json.created === 1);
  r = await api('/api/mentor/availability', { cookie: c1, method: 'POST', body: { startTime: at(4125), endTime: at(4145) } });
  check('organization mode: 5 minutes after a colleague is allowed', r.json.created === 1);
})()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    try {
      if (originalMode) await prisma.teamSettings.updateMany({ data: { mentorBookingMode: originalMode } });
      for (const m of [mentor, m1, m2].filter(Boolean)) {
        await prisma.mentorAvailability.deleteMany({ where: { mentorId: m.id } });
        await prisma.mentor.delete({ where: { id: m.id } });
      }
      if (org) await prisma.organization.delete({ where: { id: org.id } });
    } catch (e) { console.error('cleanup error:', e.message); }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
