/**
 * e2e — milestones per group (phase). See Milestone_Groups_Report.md.
 *
 *  - a milestone with no phase is for everyone; one with a phase only for that
 *    phase's members (team members via the team's phase, individuals their own)
 *  - the new-milestone notification reaches the same audience
 *  - submitting to another group's milestone is refused (403)
 *  - a milestone already submitted to stays visible after the team changes group
 *  - reviewing a submission never moves the team between phases
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `mgrp${Date.now()}`;

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
const pCookie = (id) => cookie({ id, participantId: id, role: 'participant' });
async function api(pathname, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, { method, headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const made = { phases: [], teams: [], participants: [], milestones: [] };
(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  const admin = await prisma.admin.findFirst();
  const aCk = cookie({ id: admin.id, username: admin.username, role: 'admin' });

  // Two groups with orders far from any real phase (order is unique).
  const base = 9000 + Math.floor(Math.random() * 900);
  const riyadh = await prisma.phase.create({ data: { name: `${TAG} الرياض`, order: base } });
  const rabigh = await prisma.phase.create({ data: { name: `${TAG} رابغ`, order: base + 1 } });
  made.phases.push(riyadh.id, rabigh.id);
  const team = async (name, phaseId) => { const t = await prisma.team.create({ data: { teamName: `${TAG} ${name}`, status: 'approved', phaseId } }); made.teams.push(t.id); return t; };
  const person = async (name, data) => { const p = await prisma.participant.create({ data: { fullName: `${TAG} ${name}`, email: `${TAG}-${name}@t.test`, status: 'approved', ...data } }); made.participants.push(p.id); return p; };
  const tR = await team('فريق-الرياض', riyadh.id);
  const tB = await team('فريق-رابغ', rabigh.id);
  const leadR = await person('leadR', { teamId: tR.id, isLeader: true });
  const mateR = await person('mateR', { teamId: tR.id });
  const leadB = await person('leadB', { teamId: tB.id, isLeader: true });
  const soloR = await person('soloR', { phaseId: riyadh.id });

  const mk = async (title, phaseId) => {
    const r = await api('/api/admin/milestones', { method: 'POST', cookie: aCk, body: {
      title: `${TAG} ${title}`, description: 'd', requirements: 'r', status: 'active',
      dueDate: new Date(Date.now() + 3 * 864e5).toISOString(), phaseId } });
    if (r.json?.id) made.milestones.push(r.json.id);
    return r;
  };
  section('create one milestone per audience');
  const rAll = await mk('للجميع', null), rR = await mk('الرياض', riyadh.id), rB = await mk('رابغ', rabigh.id);
  check('3 milestones created (201)', [rAll, rR, rB].every((r) => r.status === 201 && r.json?.id), JSON.stringify([rAll.status, rR.status, rB.status]));
  const mAll = rAll.json.id, mR = rR.json.id, mB = rB.json.id;

  section('new-milestone notification reaches its audience only');
  const notified = async (mid) => (await prisma.notification.findMany({ where: { relatedEntityType: 'milestone', relatedEntityId: mid }, select: { recipientId: true } })).map((n) => n.recipientId);
  const nR = await notified(mR), nB = await notified(mB), nAll = await notified(mAll);
  check('Riyadh milestone -> Riyadh team members + Riyadh individual', [leadR.id, mateR.id, soloR.id].every((id) => nR.includes(id)), JSON.stringify(nR.length));
  check('  …and NOT the Rabigh team', !nR.includes(leadB.id));
  check('Rabigh milestone -> Rabigh team only', nB.includes(leadB.id) && ![leadR.id, mateR.id, soloR.id].some((id) => nB.includes(id)));
  check('milestone for everyone -> all four', [leadR.id, mateR.id, leadB.id, soloR.id].every((id) => nAll.includes(id)));

  section('who sees what');
  const seen = async (pid) => ((await api('/api/milestones', { cookie: pCookie(pid) })).json || []).map((m) => m.id);
  let s = await seen(leadR.id);
  check('Riyadh leader sees everyone + Riyadh, not Rabigh', s.includes(mAll) && s.includes(mR) && !s.includes(mB));
  s = await seen(mateR.id);
  check('Riyadh member (team phase) sees the same', s.includes(mAll) && s.includes(mR) && !s.includes(mB));
  s = await seen(soloR.id);
  check('Riyadh individual (own phase) sees everyone + Riyadh', s.includes(mAll) && s.includes(mR) && !s.includes(mB));
  s = await seen(leadB.id);
  check('Rabigh leader sees everyone + Rabigh, not Riyadh', s.includes(mAll) && s.includes(mB) && !s.includes(mR));
  const adminList = ((await api('/api/milestones', { cookie: aCk })).json || []).map((m) => m.id);
  check('admin still sees all three', [mAll, mR, mB].every((id) => adminList.includes(id)));

  section('submitting is limited to the group');
  const submit = (pid, mid) => api('/api/participant/submit-milestone', { method: 'POST', cookie: pCookie(pid), body: { milestoneId: mid, filePath: `${TAG}/f.pdf`, fileName: 'f.pdf' } });
  let r = await submit(leadR.id, mB);
  check('Riyadh leader -> Rabigh milestone: 403', r.status === 403, `status=${r.status} ${JSON.stringify(r.json)}`);
  r = await submit(leadR.id, mR);
  check('Riyadh leader -> Riyadh milestone: accepted', r.status >= 200 && r.status < 300, `status=${r.status} ${JSON.stringify(r.json)}`);
  r = await submit(leadB.id, mAll);
  check('Rabigh leader -> milestone for everyone: accepted', r.status >= 200 && r.status < 300, `status=${r.status}`);

  section('a submitted milestone stays visible after a group change');
  await prisma.team.update({ where: { id: tR.id }, data: { phaseId: rabigh.id } });
  s = await seen(leadR.id);
  check('moved team still sees its Riyadh submission, and now Rabigh', s.includes(mR) && s.includes(mB) && s.includes(mAll));
  s = await seen(mateR.id);
  check('…teammates too (team submission)', s.includes(mR));
  await prisma.team.update({ where: { id: tR.id }, data: { phaseId: riyadh.id } });

  section('reviews never move a team');
  const sub = await prisma.milestoneSubmission.findFirst({ where: { participantId: leadR.id, milestoneId: mR } });
  for (const status of ['accepted', 'rejected']) {
    r = await api(`/api/admin/milestones/${mR}/submissions/${sub.id}/review`, { method: 'POST', cookie: aCk, body: { reviewStatus: status, reviewComment: 'x' } });
    const t = await prisma.team.findUnique({ where: { id: tR.id } });
    check(`${status}: 200, team stays in its group and is not marked failed`, r.status === 200 && r.json?.phaseAdvanced === false && t.phaseId === riyadh.id && t.phaseStatus !== 'failed', JSON.stringify({ s: r.status, p: t.phaseId === riyadh.id, st: t.phaseStatus }));
  }
})()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    try {
      await prisma.notification.deleteMany({ where: { OR: [{ relatedEntityId: { in: made.milestones } }, { recipientId: { in: made.participants } }] } });
      await prisma.emailLog.deleteMany({ where: { OR: [{ subject: { contains: TAG } }, { toEmail: { startsWith: TAG } }] } });
      await prisma.milestoneSubmission.deleteMany({ where: { milestoneId: { in: made.milestones } } });
      await prisma.milestone.deleteMany({ where: { id: { in: made.milestones } } });
      await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
      await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
      await prisma.phase.deleteMany({ where: { id: { in: made.phases } } });
    } catch (e) { console.error('cleanup error:', e.message); }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
