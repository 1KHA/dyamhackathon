/**
 * Targeted verification of the admin-route auth fix:
 *  - all 15 previously-open routes now reject anonymous calls (middleware
 *    layer catches them before the route body even runs)
 *  - every one of them still works correctly for a real admin token
 *    (no regression on the actual admin dashboard features)
 *  - the two mixed-audience routes (mentors GET, availability GET) accept
 *    participant/mentor tokens too, since real pages depend on that
 *  - passwordHash never appears in mentors/teams responses, for anyone
 *  - update-participant's new ownership check: admin bypass, leader-of-team
 *    allowed, non-leader rejected, wrong-team rejected, mass-assignment
 *    fields (status/teamId/isLeader/passwordHash) silently dropped
 *  - login and other public admin-prefixed behaviour unaffected
 */
const path = require('path');
const REPO = '/Users/kha/Documents/Code/dyam_hackathon/dhwmk_alvira';
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `authfix${Date.now()}`;

let pass = 0, fail = 0;
const made = { teams: [], participants: [], mentors: [], events: [], milestones: [] };

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}
const section = (s) => console.log(`\n--- ${s} ---`);

async function req(url, { cookie, method = 'GET', body } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function main() {
  const admin = await prisma.admin.findFirst({ select: { id: true, username: true } });
  const aCookie = 'token=' + jwt.sign({ id: admin.id, username: admin.username, role: 'admin' }, SECRET, { expiresIn: '30m' });

  // fixtures
  const team = await prisma.team.create({ data: { teamName: `${TAG} فريق`, status: 'pending', isTeamRegistration: true } });
  made.teams.push(team.id);
  const leader = await prisma.participant.create({ data: { email: `${TAG}-lead@t.test`, fullName: 'قائد', teamId: team.id, isLeader: true, passwordHash: 'HASH_SENTINEL_LEADER' } });
  const member = await prisma.participant.create({ data: { email: `${TAG}-mem@t.test`, fullName: 'عضو', teamId: team.id, passwordHash: 'HASH_SENTINEL_MEMBER' } });
  const outsider = await prisma.participant.create({ data: { email: `${TAG}-out@t.test`, fullName: 'خارجي', passwordHash: 'HASH_SENTINEL_OUTSIDER' } }); // no team
  made.participants.push(leader.id, member.id, outsider.id);
  const leaderCookie = 'token=' + jwt.sign({ id: leader.id, participantId: leader.id, role: 'participant' }, SECRET, { expiresIn: '30m' });
  const memberCookie = 'token=' + jwt.sign({ id: member.id, participantId: member.id, role: 'participant' }, SECRET, { expiresIn: '30m' });
  const outsiderCookie = 'token=' + jwt.sign({ id: outsider.id, participantId: outsider.id, role: 'participant' }, SECRET, { expiresIn: '30m' });
  const mentorCookie = 'token=' + jwt.sign({ id: 'sweep-m', mentorId: 'sweep-m', role: 'mentor' }, SECRET, { expiresIn: '30m' });

  const mentor = await prisma.mentor.create({
    data: { name: `${TAG} مرشد`, email: `${TAG}-m@t.test`, specialty: 's', phone: '05', status: 'active', passwordHash: 'HASH_SENTINEL' },
  });
  made.mentors.push(mentor.id);
  const event = await prisma.event.create({
    data: { title: `${TAG} فعالية`, description: 'د', startDate: new Date(Date.now() + 864e5), endDate: new Date(Date.now() + 9e8), location: 'ق', capacity: 10, type: 'ورشة', plan: 'خ', presenter: 'م', status: 'upcoming' },
  });
  made.events.push(event.id);
  const milestone = await prisma.milestone.create({
    data: { title: `${TAG} مرحلة`, description: 'د', dueDate: new Date(Date.now() + 6048e5), status: 'active', requirements: JSON.stringify(['ر']) },
  });
  made.milestones.push(milestone.id);

  // ============ 1. all 15 routes reject anonymous ============
  section('1. all 15 previously-open routes now reject anonymous calls');
  const anonProbes = [
    ['POST approve-team', '/api/admin/approve-team', 'POST', { teamId: team.id }],
    ['POST reject-team', '/api/admin/reject-team', 'POST', { teamId: team.id }],
    ['POST auto-create-teams', '/api/admin/auto-create-teams', 'POST', {}],
    ['POST delete-participant', '/api/admin/delete-participant', 'POST', { participantId: outsider.id }],
    ['POST delete-team', '/api/admin/delete-team', 'POST', { teamId: team.id }],
    ['POST update-team', '/api/admin/update-team', 'POST', { teamId: team.id }],
    ['GET teams', '/api/admin/teams', 'GET'],
    ['GET submissions', '/api/admin/submissions', 'GET'],
    ['GET events', '/api/admin/events', 'GET'],
    ['POST events', '/api/admin/events', 'POST', {}],
    ['PUT events', '/api/admin/events', 'PUT', {}],
    ['DELETE events', '/api/admin/events', 'DELETE', {}],
    [`GET milestones/${milestone.id}`, `/api/admin/milestones/${milestone.id}`, 'GET'],
    [`GET milestones/${milestone.id}/submissions`, `/api/admin/milestones/${milestone.id}/submissions`, 'GET'],
    [`POST milestones/.../review`, `/api/admin/milestones/${milestone.id}/submissions/xxx/review`, 'POST', { reviewStatus: 'accepted' }],
    ['POST mentors (create)', '/api/admin/mentors', 'POST', {}],
    ['PUT mentors (edit)', '/api/admin/mentors', 'PUT', {}],
    ['DELETE mentors', '/api/admin/mentors', 'DELETE', {}],
    [`POST mentors/${mentor.id}/availability`, `/api/admin/mentors/${mentor.id}/availability`, 'POST', {}],
    [`DELETE mentors/${mentor.id}/availability`, `/api/admin/mentors/${mentor.id}/availability`, 'DELETE', {}],
    ['POST update-participant', '/api/admin/update-participant', 'POST', { id: member.id, fullName: 'x' }],
  ];
  for (const [label, url, method, body] of anonProbes) {
    const r = await req(url, { method, body });
    check(`${label} -> 401`, r.status === 401, `status=${r.status} body=${JSON.stringify(r.json)}`);
  }

  // ============ 2. every route still works for a real admin ============
  section('2. admin token: routes still function correctly (no regression)');

  const getTeams = await req('/api/admin/teams', { cookie: aCookie });
  check('GET teams -> 200 for admin', getTeams.status === 200, `status=${getTeams.status}`);
  check('  our fixture team is present', getTeams.json.some((t) => t.id === team.id));

  const getEvents = await req('/api/admin/events', { cookie: aCookie });
  check('GET events -> 200 for admin', getEvents.status === 200 && getEvents.json.some((e) => e.id === event.id));

  const getSubs = await req('/api/admin/submissions', { cookie: aCookie });
  check('GET submissions -> 200 for admin', getSubs.status === 200);

  const getMilestone = await req(`/api/admin/milestones/${milestone.id}`, { cookie: aCookie });
  check('GET single milestone -> 200 for admin', getMilestone.status === 200 && getMilestone.json.title === `${TAG} مرحلة`);

  const approve = await req('/api/admin/approve-team', { method: 'POST', cookie: aCookie, body: { teamId: team.id } });
  check('POST approve-team -> 200 for admin (real workflow still works)', approve.status === 200, `status=${approve.status} ${JSON.stringify(approve.json)}`);
  const teamAfter = await prisma.team.findUnique({ where: { id: team.id } });
  check('  team actually approved in DB', teamAfter.status === 'approved');

  const createMentor = await req('/api/admin/mentors', {
    method: 'POST', cookie: aCookie,
    body: { name: `${TAG} مرشد جديد`, email: `${TAG}-new@t.test`, specialty: 's', phone: '05', password: 'x12345' },
  });
  check('POST mentors (create) -> 201 for admin', createMentor.status === 201, `status=${createMentor.status}`);
  check('  create response has NO passwordHash', createMentor.json && !('passwordHash' in createMentor.json));
  if (createMentor.json?.id) made.mentors.push(createMentor.json.id);

  const addAvail = await req(`/api/admin/mentors/${mentor.id}/availability`, {
    method: 'POST', cookie: aCookie, body: { start: new Date(Date.now() + 864e5).toISOString(), end: new Date(Date.now() + 9e5 + 864e5).toISOString() },
  });
  check('POST availability -> 201 for admin', addAvail.status === 201, `status=${addAvail.status}`);

  // ============ 3. passwordHash never leaks, to anyone ============
  section('3. passwordHash is gone from mentors/teams responses');
  const mentorsAsAdmin = await req('/api/admin/mentors', { cookie: aCookie });
  check('GET mentors (admin): no passwordHash anywhere',
    mentorsAsAdmin.status === 200 && !JSON.stringify(mentorsAsAdmin.json).includes('passwordHash') &&
    !JSON.stringify(mentorsAsAdmin.json).includes('HASH_SENTINEL'));

  const teamsAsAdmin = await req('/api/admin/teams', { cookie: aCookie });
  check('GET teams (admin): no member passwordHash anywhere',
    teamsAsAdmin.status === 200 && !JSON.stringify(teamsAsAdmin.json).includes('passwordHash'));

  // ============ 4. mixed-audience routes: participants/mentors still work ============
  section('4. mentors GET + availability GET remain usable by participants/mentors');
  const mentorsAsParticipant = await req('/api/admin/mentors', { cookie: memberCookie });
  check('GET mentors -> 200 for a PARTICIPANT (booking flow depends on this)',
    mentorsAsParticipant.status === 200 && !JSON.stringify(mentorsAsParticipant.json).includes('passwordHash'),
    `status=${mentorsAsParticipant.status}`);

  const mentorsAsMentor = await req('/api/admin/mentors', { cookie: mentorCookie });
  check('GET mentors -> 200 for a mentor too', mentorsAsMentor.status === 200);

  const availAsParticipant = await req(`/api/admin/mentors/${mentor.id}/availability`, { cookie: memberCookie });
  check('GET availability -> 200 for a PARTICIPANT (booking flow depends on this)',
    availAsParticipant.status === 200, `status=${availAsParticipant.status}`);

  const availAnon = await req(`/api/admin/mentors/${mentor.id}/availability`);
  check('  but still 401 anonymous', availAnon.status === 401);

  // mutations on these two routes stay admin-only even though GET is relaxed
  const mentorsPostAsParticipant = await req('/api/admin/mentors', { method: 'POST', cookie: memberCookie, body: {} });
  check('POST mentors -> 401 for a participant (mutation stays admin-only)', mentorsPostAsParticipant.status === 401);
  const availPostAsParticipant = await req(`/api/admin/mentors/${mentor.id}/availability`, { method: 'POST', cookie: memberCookie, body: {} });
  check('POST availability -> 401 for a participant (mutation stays admin-only)', availPostAsParticipant.status === 401);

  // ============ 5. update-participant ownership logic ============
  section('5. update-participant: admin OR team-leader-of-target, field blocklist');

  const byOutsider = await req('/api/admin/update-participant', {
    method: 'POST', cookie: outsiderCookie, body: { id: member.id, fullName: 'محاولة تعديل' },
  });
  check('a random participant cannot edit someone else -> 403', byOutsider.status === 403, `status=${byOutsider.status}`);

  const byMemberOnSelf = await req('/api/admin/update-participant', {
    method: 'POST', cookie: memberCookie, body: { id: member.id, fullName: 'محاولة تعديل نفسه' },
  });
  check('a non-leader member cannot edit via this route (not a leader) -> 403', byMemberOnSelf.status === 403, `status=${byMemberOnSelf.status}`);

  const byLeader = await req('/api/admin/update-participant', {
    method: 'POST', cookie: leaderCookie,
    // fullName is deliberately excluded from persistence, matching the
    // ROUTE'S PRE-EXISTING behavior (the original code already had
    // `delete dataToUpdate.fullName` — kept as-is, not a new restriction)
    body: { id: member.id, city: 'جدة', university: 'جامعة الملك سعود', status: 'approved', teamId: 'evil-team-id', isLeader: true, passwordHash: 'HACKED' },
  });
  check('the team leader CAN edit their own member -> 200', byLeader.status === 200, `status=${byLeader.status} ${JSON.stringify(byLeader.json)}`);
  check('  RESPONSE BODY has no passwordHash (the exact bug found in review: DB write was blocked but the response echoed the full row)',
    byLeader.json && !('passwordHash' in byLeader.json) && !JSON.stringify(byLeader.json).includes('HASH_SENTINEL_MEMBER'),
    JSON.stringify(byLeader.json));

  const memberAfter = await prisma.participant.findUnique({ where: { id: member.id } });
  check('  allowed field (city) was updated', memberAfter.city === 'جدة');
  check('  allowed field (university) was updated', memberAfter.university === 'جامعة الملك سعود');
  check('  fullName untouched (matches original route behavior, pre-existing)', memberAfter.fullName === 'عضو');
  check('  sensitive field status BLOCKED (unchanged)', memberAfter.status === 'pending' || memberAfter.status !== 'approved');
  check('  sensitive field teamId BLOCKED (still the real team)', memberAfter.teamId === team.id);
  check('  sensitive field isLeader BLOCKED (still false)', memberAfter.isLeader === false);
  check('  sensitive field passwordHash BLOCKED (not overwritten)', memberAfter.passwordHash !== 'HACKED');

  const byAdmin = await req('/api/admin/update-participant', {
    method: 'POST', cookie: aCookie, body: { id: outsider.id, city: 'الدمام' },
  });
  check('an admin can edit ANY participant (bypass) -> 200', byAdmin.status === 200, `status=${byAdmin.status}`);
  check('  RESPONSE BODY has no passwordHash',
    byAdmin.json && !('passwordHash' in byAdmin.json) && !JSON.stringify(byAdmin.json).includes('HASH_SENTINEL_OUTSIDER'),
    JSON.stringify(byAdmin.json));
  const outsiderAfter = await prisma.participant.findUnique({ where: { id: outsider.id } });
  check('  admin edit applied', outsiderAfter.city === 'الدمام');

  section('5b. update-team response body — the other route with the same bug class');
  const updateTeamRes = await req('/api/admin/update-team', {
    method: 'POST', cookie: aCookie, body: { teamId: team.id, teamName: `${TAG} فريق محدث` },
  });
  check('update-team succeeds for admin', updateTeamRes.status === 200, `status=${updateTeamRes.status}`);
  const updateTeamStr = JSON.stringify(updateTeamRes.json);
  check('  response has NO passwordHash anywhere in the team.participants array',
    !updateTeamStr.includes('passwordHash') && !updateTeamStr.includes('HASH_SENTINEL'),
    updateTeamStr.slice(0, 300));

  // ============ 6. login and other unaffected surfaces ============
  section('6. surfaces the fix must not touch');
  const badLogin = await req('/api/admin/login', { method: 'POST', body: { username: 'nope', password: 'nope' } });
  check('admin login still reachable anonymously (401 = bad creds, not middleware block)',
    badLogin.status === 401 && badLogin.json.error !== 'غير مصرح', JSON.stringify(badLogin.json));

  const publicEvents = await req('/api/events');
  check('public GET /api/events (non-admin-prefixed) still open', publicEvents.status === 200);

  const badgePage = await fetch(BASE + '/participant-dashboard/badge');
  check('an unrelated page still renders 200 (middleware matcher is scoped correctly)', badgePage.status === 200);
}

main()
  .catch((e) => { fail++; console.error('SCRIPT ERROR:', e.stack); })
  .finally(async () => {
    section('cleanup');
    await prisma.notification.deleteMany({ where: { OR: [{ recipientId: { in: made.participants } }, { relatedEntityId: { in: [...made.teams, ...made.mentors] } }] } });
    await prisma.mentorAvailability.deleteMany({ where: { mentorId: { in: made.mentors } } });
    await prisma.eventRegistration.deleteMany({ where: { eventId: { in: made.events } } });
    await prisma.event.deleteMany({ where: { id: { in: made.events } } });
    await prisma.milestoneSubmission.deleteMany({ where: { milestoneId: { in: made.milestones } } });
    await prisma.milestone.deleteMany({ where: { id: { in: made.milestones } } });
    await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
    await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
    await prisma.mentor.deleteMany({ where: { id: { in: made.mentors } } });
    console.log(`  DB — teams: ${await prisma.team.count()}, participants: ${await prisma.participant.count()}, mentors: ${await prisma.mentor.count()}`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
