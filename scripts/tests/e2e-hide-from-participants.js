/**
 * e2e — an admin can hide a mentor or an organization from participants.
 *
 *  - hidden mentor: gone from the participant mentor list, not bookable, and its
 *    slots leave its organization's slots; admins still see it (with the flag)
 *  - hidden organization: gone from /api/organizations (404 by id), its members
 *    are gone from the participant mentor list, nothing of it is bookable
 *  - showing again restores everything; only admins can flip the flags
 *
 * Restores mentorBookingMode and cleans all fixtures.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `hide${Date.now()}`;
const HOUR = 3600_000;

let pass = 0, fail = 0;
const made = { participants: [], mentors: [], orgs: [] };
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
async function api(pathname, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, { method, headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const T0 = Date.now() + 48 * HOUR;
const slot = (mentorId, h) => prisma.mentorAvailability.create({ data: { mentorId, startTime: new Date(T0 + h * HOUR), endTime: new Date(T0 + h * HOUR + 20 * 60_000) } });

let originalMode;
(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  const admin = await prisma.admin.findFirst();
  const aCk = cookie({ id: admin.id, username: admin.username, role: 'admin' });
  originalMode = (await prisma.teamSettings.findFirst())?.mentorBookingMode ?? 'individual';
  await api('/api/admin/team-settings', { method: 'PUT', cookie: aCk, body: { mentorBookingMode: 'both' } });

  const solo = await prisma.participant.create({ data: { fullName: `${TAG} مشارك`, email: `${TAG}-p@t.test`, status: 'approved' } });
  made.participants.push(solo.id);
  const pCk = cookie({ id: solo.id, participantId: solo.id, role: 'participant' });
  const org = await prisma.organization.create({ data: { name: `${TAG} جهة` } });
  made.orgs.push(org.id);
  const mk = async (name, extra = {}) => { const m = await prisma.mentor.create({ data: { name: `${TAG} ${name}`, email: `${TAG}-${name}@t.test`, specialty: 'x', phone: '05', status: 'active', ...extra } }); made.mentors.push(m.id); return m; };
  const m1 = await mk('m1', { organizationId: org.id });
  const m2 = await mk('m2', { organizationId: org.id });
  const solo1 = await mk('s1');
  const s1 = await slot(m1.id, 1), s2 = await slot(m2.id, 2), sSolo = await slot(solo1.id, 3), sSolo2 = await slot(solo1.id, 4);

  const listIds = async (ck) => ((await api('/api/admin/mentors', { cookie: ck })).json || []).map((m) => m.id);
  const orgIds = async (ck) => ((await api('/api/organizations', { cookie: ck })).json?.organizations || []).map((o) => o.id);

  section('baseline: everything visible');
  const base = await listIds(pCk);
  check('participant sees m1, m2 and the solo mentor', [m1.id, m2.id, solo1.id].every((id) => base.includes(id)));
  check('participant sees the organization', (await orgIds(pCk)).includes(org.id));
  check('organization has 2 slot windows', (await api(`/api/organizations?id=${org.id}`, { cookie: pCk })).json?.slots?.length === 2);

  section('hide a mentor without organization');
  check('participant cannot flip the flag (401)', (await api('/api/admin/mentors', { method: 'PUT', cookie: pCk, body: { id: solo1.id, hiddenFromParticipants: true } })).status === 401);
  let r = await api('/api/admin/mentors', { method: 'PUT', cookie: aCk, body: { id: solo1.id, hiddenFromParticipants: true } });
  check('admin hides the solo mentor -> 200, flag returned', r.status === 200 && r.json?.hiddenFromParticipants === true, JSON.stringify(r.json).slice(0, 120));
  const fresh = await prisma.mentor.findUnique({ where: { id: solo1.id } });
  check('  name/email/status untouched by the toggle', fresh.name === solo1.name && fresh.email === solo1.email && fresh.status === 'active');
  check('  gone from the participant list', !(await listIds(pCk)).includes(solo1.id));
  const adminRow = ((await api('/api/admin/mentors', { cookie: aCk })).json || []).find((m) => m.id === solo1.id);
  check('  admin list still has it, flagged hidden', adminRow?.hiddenFromParticipants === true);
  r = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCk, body: { availabilityId: sSolo.id } });
  check('  booking its slot -> 403', r.status === 403, `status=${r.status}`);
  await api('/api/admin/mentors', { method: 'PUT', cookie: aCk, body: { id: solo1.id, hiddenFromParticipants: false } });
  check('shown again -> back in the participant list', (await listIds(pCk)).includes(solo1.id));
  r = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCk, body: { availabilityId: sSolo2.id } });
  check('  and bookable again (201)', r.status === 201, `status=${r.status} ${JSON.stringify(r.json).slice(0, 100)}`);

  section('hide one member of a visible organization');
  await api('/api/admin/mentors', { method: 'PUT', cookie: aCk, body: { id: m2.id, hiddenFromParticipants: true } });
  const orgDetail = await api(`/api/organizations?id=${org.id}`, { cookie: pCk });
  check('organization slots drop the hidden member (1 window left)', orgDetail.status === 200 && orgDetail.json.slots.length === 1 && orgDetail.json.slots[0].id === s1.id, JSON.stringify(orgDetail.json?.slots?.map((s) => s.id)));
  r = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCk, body: { availabilityId: s2.id, organizationId: org.id } });
  check('  booking the hidden member\'s slot via the organization -> 403', r.status === 403, `status=${r.status}`);
  await api('/api/admin/mentors', { method: 'PUT', cookie: aCk, body: { id: m2.id, hiddenFromParticipants: false } });

  section('hide the organization');
  check('participant cannot flip the org flag (401)', (await api(`/api/admin/organizations/${org.id}`, { method: 'PUT', cookie: pCk, body: { hiddenFromParticipants: true } })).status === 401);
  r = await api(`/api/admin/organizations/${org.id}`, { method: 'PUT', cookie: aCk, body: { hiddenFromParticipants: true } });
  check('admin hides the organization -> 200, flag returned, name kept', r.status === 200 && r.json?.organization?.hiddenFromParticipants === true && r.json.organization.name === org.name, JSON.stringify(r.json).slice(0, 140));
  check('  gone from the participant organization list', !(await orgIds(pCk)).includes(org.id));
  check('  by id -> 404 for the participant', (await api(`/api/organizations?id=${org.id}`, { cookie: pCk })).status === 404);
  check('  by id -> 200 for the admin', (await api(`/api/organizations?id=${org.id}`, { cookie: aCk })).status === 200);
  const pl = await listIds(pCk);
  check('  its members are gone from the participant mentor list', !pl.includes(m1.id) && !pl.includes(m2.id));
  check('  the solo mentor is still listed', pl.includes(solo1.id));
  r = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCk, body: { availabilityId: s1.id, organizationId: org.id } });
  check('  booking via the organization -> 403', r.status === 403, `status=${r.status}`);
  r = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCk, body: { availabilityId: s1.id } });
  check('  booking the member individually -> 403', r.status === 403, `status=${r.status}`);
  const adminOrgs = (await api('/api/admin/organizations', { cookie: aCk })).json?.organizations || [];
  check('  admin organization list still has it, flagged hidden', adminOrgs.find((o) => o.id === org.id)?.hiddenFromParticipants === true);

  await api(`/api/admin/organizations/${org.id}`, { method: 'PUT', cookie: aCk, body: { hiddenFromParticipants: false } });
  check('shown again -> organization and members back', (await orgIds(pCk)).includes(org.id) && (await listIds(pCk)).includes(m1.id));
})()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    try {
      if (originalMode) await prisma.teamSettings.updateMany({ data: { mentorBookingMode: originalMode } });
      await prisma.notification.deleteMany({ where: { recipientId: { in: [...made.participants, ...made.mentors] } } });
      await prisma.mentorBooking.deleteMany({ where: { participantId: { in: made.participants } } });
      await prisma.mentorAvailability.deleteMany({ where: { mentorId: { in: made.mentors } } });
      await prisma.mentor.deleteMany({ where: { id: { in: made.mentors } } });
      await prisma.organization.deleteMany({ where: { id: { in: made.orgs } } });
      await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
    } catch (e) { console.error('cleanup error:', e.message); }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
