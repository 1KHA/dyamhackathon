/**
 * Covers the milestone submission + review notification flows, which the
 * earlier end-to-end run skipped.
 *
 * submit-milestone takes a JSON body of file METADATA ({ milestoneId, filePath,
 * fileName }) — the actual upload is a separate endpoint. So no real file is
 * needed here.
 */
const path = require('path');
const REPO = '/Users/kha/Documents/Code/dyam_hackathon/dhwmk_alvira';
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `ms${Date.now()}`;

let pass = 0, fail = 0;
const made = { participants: [], teams: [], milestones: [] };

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}
const section = (s) => console.log(`\n--- ${s} ---`);

const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
const notifs = (t, id) => prisma.notification.findMany({ where: { recipientType: t, recipientId: id }, orderBy: { createdAt: 'asc' } });

async function api(p, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function main() {
  const admins = await prisma.admin.findMany({ select: { id: true, username: true } });
  const admin = admins[0];
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });

  // fixtures: a team with two members
  const team = await prisma.team.create({
    data: { teamName: `${TAG} فريق`, status: 'approved', isTeamRegistration: true },
  });
  made.teams.push(team.id);

  const leader = await prisma.participant.create({
    data: { email: `${TAG}-lead@example.invalid`, fullName: 'قائد', firstName: 'قائد', secondName: 'ا', familyName: 'ب', isLeader: true, teamId: team.id, status: 'approved' },
  });
  const mate = await prisma.participant.create({
    data: { email: `${TAG}-mate@example.invalid`, fullName: 'زميل', firstName: 'زميل', secondName: 'ا', familyName: 'ب', teamId: team.id, status: 'approved' },
  });
  made.participants.push(leader.id, mate.id);

  const lCookie = cookie({ id: leader.id, participantId: leader.id, role: 'participant', teamId: team.id, isLeader: true });

  const milestone = await prisma.milestone.create({
    data: {
      title: `${TAG} مرحلة`, description: 'وصف', dueDate: new Date(Date.now() + 6048e5),
      status: 'active', requirements: JSON.stringify(['متطلب']),
    },
  });
  made.milestones.push(milestone.id);

  // ============ submission -> all admins ============
  section('milestone submission (JSON metadata, no file upload)');
  const adminBefore = (await notifs('admin', admin.id)).length;

  const sub = await api('/api/participant/submit-milestone', {
    method: 'POST', cookie: lCookie,
    body: { milestoneId: milestone.id, filePath: `milestones/${TAG}-fake.pdf`, fileName: `${TAG}-fake.pdf` },
  });
  check('POST /api/participant/submit-milestone succeeds',
    sub.status === 200, `status=${sub.status} ${JSON.stringify(sub.json)}`);

  const adminAfter = await notifs('admin', admin.id);
  check('all admins notified of the submission', adminAfter.length === adminBefore + 1,
    `${adminBefore} -> ${adminAfter.length}`);
  const subNotif = adminAfter[adminAfter.length - 1];
  check('  notification names the team and milestone',
    subNotif && subNotif.message.includes(`${TAG} فريق`) && subNotif.message.includes(`${TAG} مرحلة`),
    subNotif?.message);
  check('  links to the submissions page',
    subNotif?.actionUrl === '/admin-hackton-dashboard/submissions', subNotif?.actionUrl);
  check('  submission row persisted + count incremented',
    (await prisma.milestoneSubmission.count({ where: { milestoneId: milestone.id } })) === 1);

  // duplicate submission must be rejected and must NOT re-notify
  const dup = await api('/api/participant/submit-milestone', {
    method: 'POST', cookie: lCookie,
    body: { milestoneId: milestone.id, filePath: 'x', fileName: 'x' },
  });
  check('duplicate submission is rejected', dup.status === 400, `status=${dup.status}`);
  check('  and does not send a second notification',
    (await notifs('admin', admin.id)).length === adminAfter.length);

  // ============ review -> the whole team ============
  section('milestone review');
  const submission = await prisma.milestoneSubmission.findFirst({ where: { milestoneId: milestone.id } });
  const leaderBefore = (await notifs('participant', leader.id)).length;
  const mateBefore = (await notifs('participant', mate.id)).length;

  const review = await api(`/api/admin/milestones/${milestone.id}/submissions/${submission.id}/review`, {
    method: 'POST', cookie: aCookie,
    body: { reviewStatus: 'accepted', reviewComment: 'عمل ممتاز' },
  });
  check('POST review succeeds', review.status === 200, `status=${review.status} ${JSON.stringify(review.json)}`);

  const leaderAfter = await notifs('participant', leader.id);
  const mateAfter = await notifs('participant', mate.id);
  check('the whole team is notified, not just the submitter',
    leaderAfter.length === leaderBefore + 1 && mateAfter.length === mateBefore + 1,
    `leader ${leaderBefore}->${leaderAfter.length}, teammate ${mateBefore}->${mateAfter.length}`);

  const rn = leaderAfter[leaderAfter.length - 1];
  check('  accepted review is type=success', rn?.type === 'success', rn?.type);
  check('  relatedEntityType is milestone_submission',
    rn?.relatedEntityType === 'milestone_submission', rn?.relatedEntityType);

  // rejection path
  const review2 = await api(`/api/admin/milestones/${milestone.id}/submissions/${submission.id}/review`, {
    method: 'POST', cookie: aCookie, body: { reviewStatus: 'rejected', reviewComment: 'يحتاج تعديل' },
  });
  check('rejection review succeeds', review2.status === 200, `status=${review2.status}`);
  const afterReject = await notifs('participant', leader.id);
  check('  rejection is type=error',
    afterReject[afterReject.length - 1]?.type === 'error',
    afterReject[afterReject.length - 1]?.type);

  // ============ these reach the bell ============
  section('reaching the UI');
  const bell = await api('/api/notifications?limit=20', { cookie: lCookie });
  check('submission review notifications appear in the participant bell',
    bell.status === 200 && bell.json.total === afterReject.length,
    `bell total=${bell.json?.total} db=${afterReject.length}`);

  const adminBell = await api('/api/notifications?limit=20', { cookie: aCookie });
  check('submission notification appears in the admin bell',
    adminBell.status === 200 && adminBell.json.notifications.some(n => n.id === subNotif.id));
}

main()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    section('cleanup');
    await prisma.notification.deleteMany({
      where: { OR: [
        { recipientId: { in: made.participants } },
        { relatedEntityId: { in: [...made.milestones, ...made.teams] } },
        { message: { contains: TAG } },
      ] },
    });
    await prisma.milestoneSubmission.deleteMany({ where: { milestoneId: { in: made.milestones } } });
    await prisma.milestone.deleteMany({ where: { id: { in: made.milestones } } });
    await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
    await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
    // sweep any admin rows this run generated
    const swept = await prisma.notification.deleteMany({
      where: { relatedEntityId: { in: made.milestones } },
    });
    console.log(`  cleanup done; notifications remaining: ${await prisma.notification.count()}`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
