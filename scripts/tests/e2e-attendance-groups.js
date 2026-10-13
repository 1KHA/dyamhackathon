/**
 * e2e — admin attendance lists show approved participants only, and can be
 * filtered by group (phase: a team member's group is the team's phase, an
 * individual's their own). Applies to the daily list, event lists and the
 * entry/exit (presence) report.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `grp${Date.now()}`;

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const sign = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
async function api(pathname, cookie) {
  const res = await fetch(BASE + pathname, { headers: { cookie } });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const made = { participants: [], teams: [], phases: [], events: [] };
(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  const admin = await prisma.admin.findFirst();
  const aCk = sign({ id: admin.id, username: admin.username, role: 'admin' });
  const base = 8000 + Math.floor(Math.random() * 900);
  const R = await prisma.phase.create({ data: { name: `${TAG} الرياض`, order: base } });
  const B = await prisma.phase.create({ data: { name: `${TAG} رابغ`, order: base + 1 } });
  made.phases.push(R.id, B.id);
  const team = async (k, status, phaseId) => { const t = await prisma.team.create({ data: { teamName: `${TAG} ${k}`, status, phaseId } }); made.teams.push(t.id); return t; };
  const person = async (k, data) => { const p = await prisma.participant.create({ data: { email: `${TAG}-${k}@t.local`, fullName: `${TAG} ${k}`, ...data } }); made.participants.push(p.id); return p; };
  const tR = await team('tR', 'approved', R.id), tB = await team('tB', 'approved', B.id), tPending = await team('tP', 'pending', R.id);
  const r1 = await person('r1', { teamId: tR.id, isLeader: true, status: 'pending' }); // member status irrelevant: the TEAM is approved
  const r2 = await person('r2', { teamId: tR.id });
  const b1 = await person('b1', { teamId: tB.id, isLeader: true });
  const pend = await person('pend', { teamId: tPending.id, status: 'approved' }); // team not approved -> hidden
  const soloR = await person('soloR', { status: 'approved', phaseId: R.id });
  const rejected = await person('rej', { status: 'rejected', phaseId: R.id });
  const disabled = await person('dis', { status: 'approved', phaseId: R.id, isDisabled: true });
  const ok = [r1, r2, b1, soloR].map((p) => p.id);
  const notOk = [pend, rejected, disabled].map((p) => p.id);
  const all = [...ok, ...notOk];

  // everyone checked in today + one entry scan; everyone registered for an event
  for (const id of all) {
    await prisma.attendanceRecord.create({ data: { participantId: id, eventId: null, checkinDate: today, scannedBy: admin.id, method: 'scan' } });
    await prisma.attendanceScan.create({ data: { participantId: id, eventId: null, day: today, direction: 'in', scannedBy: admin.id, scannerRole: 'admin', method: 'scan' } });
  }
  const ev = await prisma.event.create({ data: { title: `${TAG} فعالية`, description: 'd', startDate: new Date(Date.now() - 3600_000), endDate: new Date(Date.now() + 3600_000), location: 'x', capacity: 50, type: 'workshop', plan: 'p', presenter: 'x' } });
  made.events.push(ev.id);
  for (const id of all) await prisma.eventRegistration.create({ data: { participantId: id, eventId: ev.id, status: 'attended' } });

  const ids = (rows) => (rows || []).map((r) => r.participantId);
  const has = (list, wanted) => wanted.every((id) => list.includes(id));
  const none = (list, unwanted) => !unwanted.some((id) => list.includes(id));

  section('daily list: approved only');
  let r = await api(`/api/admin/attendance?mode=general&date=${today}`, aCk);
  const checked = ids(r.json?.checkedIn), notChecked = ids(r.json?.notCheckedIn);
  check('approved team members + approved individual are listed', r.status === 200 && has(checked, ok), JSON.stringify(r.json?.counts));
  check('pending team / rejected / disabled are NOT listed anywhere', none(checked, notOk) && none(notChecked, notOk));
  check('their check-ins are reported as hidden', r.json.counts.hidden >= 3, String(r.json.counts.hidden));
  const row = (r.json.checkedIn || []).find((x) => x.participantId === r1.id);
  check('rows carry the group (team phase)', row && row.group === R.name, JSON.stringify(row && row.group));
  check('an individual\'s group is their own phase', (r.json.checkedIn || []).find((x) => x.participantId === soloR.id)?.group === R.name);

  section('daily list: one group');
  r = await api(`/api/admin/attendance?mode=general&date=${today}&phaseId=${R.id}`, aCk);
  let list = [...ids(r.json?.checkedIn), ...ids(r.json?.notCheckedIn)];
  check('Riyadh: its team members + individual, nobody else', has(list, [r1.id, r2.id, soloR.id]) && none(list, [b1.id, ...notOk]), JSON.stringify(r.json?.counts));
  check('  total counts only that group', r.json.counts.total === list.length);
  r = await api(`/api/admin/attendance?mode=general&date=${today}&phaseId=${B.id}`, aCk);
  list = [...ids(r.json?.checkedIn), ...ids(r.json?.notCheckedIn)];
  check('Rabigh: only its team member', has(list, [b1.id]) && none(list, [r1.id, r2.id, soloR.id, ...notOk]));

  section('event list');
  r = await api(`/api/admin/attendance?mode=event&eventId=${ev.id}`, aCk);
  check('event rows: approved only, hidden = 3', has(ids(r.json?.rows), ok) && none(ids(r.json?.rows), notOk) && r.json.counts.hidden === 3, JSON.stringify(r.json?.counts));
  r = await api(`/api/admin/attendance?mode=event&eventId=${ev.id}&phaseId=${B.id}`, aCk);
  check('event rows filtered by group', JSON.stringify(ids(r.json?.rows)) === JSON.stringify([b1.id]) && r.json.counts.attended === 1, JSON.stringify(ids(r.json?.rows)));

  section('entry/exit report');
  r = await api(`/api/admin/attendance/presence?mode=general&date=${today}`, aCk);
  check('presence: approved only', has(ids(r.json?.rows), ok) && none(ids(r.json?.rows), notOk));
  r = await api(`/api/admin/attendance/presence?mode=general&date=${today}&phaseId=${R.id}`, aCk);
  check('presence filtered by group, rows carry group', has(ids(r.json?.rows), [r1.id, r2.id, soloR.id]) && none(ids(r.json?.rows), [b1.id, ...notOk]) && r.json.rows.every((x) => x.group === R.name));
})()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    try {
      await prisma.eventRegistration.deleteMany({ where: { eventId: { in: made.events } } });
      await prisma.attendanceRecord.deleteMany({ where: { participantId: { in: made.participants } } });
      await prisma.attendanceScan.deleteMany({ where: { participantId: { in: made.participants } } });
      await prisma.event.deleteMany({ where: { id: { in: made.events } } });
      await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
      await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
      await prisma.phase.deleteMany({ where: { id: { in: made.phases } } });
    } catch (e) { console.error('cleanup error:', e.message); }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
