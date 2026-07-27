/**
 * passwordHash response-body leak sweep.
 *
 * Every route that can return a Participant or Mentor row to a client is
 * called for real, with fixtures carrying a distinctive sentinel hash value.
 * The assertion is on the RESPONSE BODY (not the database) — that distinction
 * is the whole point: an earlier fix blocked the hash from being *written*
 * while the route still echoed the full row back, and DB-only assertions
 * missed it entirely.
 *
 * Also asserts the underlying features still work (team add/remove, profile
 * updates, approvals), since the fix touches their response shapes.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '../..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `leak${Date.now()}`;
const SENTINEL = '$2b$10$SENTINELHASHVALUEDONOTLEAK';

let pass = 0, fail = 0;
const made = { teams: [], participants: [], mentors: [] };

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
  let text = ''; let json = null;
  try { text = await res.text(); json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

/** The core assertion: neither the key nor the sentinel value may appear. */
function noHash(label, res, extra = '') {
  const leaksKey = res.text.includes('passwordHash');
  const leaksValue = res.text.includes('SENTINELHASHVALUEDONOTLEAK');
  check(
    `${label} — response body carries NO passwordHash`,
    !leaksKey && !leaksValue,
    leaksKey ? 'response contains the key "passwordHash"' : leaksValue ? 'response contains the sentinel HASH VALUE' : extra
  );
}

async function main() {
  const admin = await prisma.admin.findFirst({ select: { id: true, username: true } });
  const aCookie = 'token=' + jwt.sign({ id: admin.id, username: admin.username, role: 'admin' }, SECRET, { expiresIn: '30m' });

  // ---- fixtures, all carrying the sentinel hash ----
  const team = await prisma.team.create({ data: { teamName: `${TAG} فريق`, status: 'approved', isTeamRegistration: true } });
  made.teams.push(team.id);
  const leader = await prisma.participant.create({
    data: { email: `${TAG}-lead@t.test`, fullName: 'قائد', teamId: team.id, isLeader: true, status: 'approved', passwordHash: SENTINEL },
  });
  const member = await prisma.participant.create({
    data: { email: `${TAG}-mem@t.test`, fullName: 'عضو', teamId: team.id, status: 'approved', passwordHash: SENTINEL },
  });
  const solo = await prisma.participant.create({
    data: { email: `${TAG}-solo@t.test`, fullName: 'منفرد', status: 'pending', passwordHash: SENTINEL },
  });
  const spare = await prisma.participant.create({
    data: { email: `${TAG}-spare@t.test`, fullName: 'احتياطي', status: 'pending', passwordHash: SENTINEL },
  });
  made.participants.push(leader.id, member.id, solo.id, spare.id);
  const mentor = await prisma.mentor.create({
    data: { name: `${TAG} مرشد`, email: `${TAG}-m@t.test`, specialty: 's', phone: '05', status: 'active', passwordHash: SENTINEL },
  });
  made.mentors.push(mentor.id);

  const leaderCookie = 'token=' + jwt.sign({ id: leader.id, participantId: leader.id, role: 'participant', teamId: team.id, isLeader: true }, SECRET, { expiresIn: '30m' });
  const mentorCookie = 'token=' + jwt.sign({ id: mentor.id, mentorId: mentor.id, role: 'mentor' }, SECRET, { expiresIn: '30m' });

  // ============ the 4 originally-reported routes ============
  section('the 4 originally-reported team member routes');

  const partRemove = await req('/api/participant/remove-member', {
    method: 'POST', cookie: leaderCookie, body: { participantId: member.id },
  });
  check('participant/remove-member works', partRemove.status === 200, `status=${partRemove.status} ${partRemove.text.slice(0, 120)}`);
  noHash('participant/remove-member', partRemove);

  // put the member back for the admin add-member test
  await prisma.participant.update({ where: { id: member.id }, data: { teamId: null } });
  const adminAdd = await req('/api/admin/add-member', {
    method: 'POST', cookie: aCookie, body: { teamId: team.id, participantId: member.id },
  });
  check('admin/add-member works', adminAdd.status === 200, `status=${adminAdd.status} ${adminAdd.text.slice(0, 120)}`);
  noHash('admin/add-member', adminAdd);

  const adminRemove = await req('/api/admin/remove-member', {
    method: 'POST', cookie: aCookie, body: { participantId: member.id },
  });
  check('admin/remove-member works', adminRemove.status === 200, `status=${adminRemove.status} ${adminRemove.text.slice(0, 120)}`);
  noHash('admin/remove-member', adminRemove);

  const partUpdateTeam = await req('/api/participant/update-team', {
    method: 'POST', cookie: leaderCookie, body: { teamName: `${TAG} فريق محدث`, ideaDescription: 'وصف' },
  });
  check('participant/update-team works', partUpdateTeam.status === 200, `status=${partUpdateTeam.status} ${partUpdateTeam.text.slice(0, 120)}`);
  noHash('participant/update-team', partUpdateTeam);

  // ============ additional routes found by the sweep ============
  section('additional leaks found by the full sweep');

  const teamDetails = await req('/api/participant/team-details', { cookie: leaderCookie });
  check('participant/team-details works', teamDetails.status === 200, `status=${teamDetails.status}`);
  noHash('participant/team-details', teamDetails);

  const me = await req('/api/participant/me', { cookie: leaderCookie });
  check('participant/me works', me.status === 200, `status=${me.status}`);
  noHash('participant/me (was a documented HIGH finding)', me);

  const updateProfile = await req('/api/participant/update-profile', {
    method: 'POST', cookie: leaderCookie, body: { city: 'الرياض' },
  });
  check('participant/update-profile works', updateProfile.status === 200, `status=${updateProfile.status}`);
  noHash('participant/update-profile', updateProfile);

  const adminParticipants = await req('/api/admin/participants', { cookie: aCookie });
  check('admin/participants works', adminParticipants.status === 200, `status=${adminParticipants.status}`);
  noHash('admin/participants (list)', adminParticipants);

  const approve = await req('/api/admin/approve-participant', {
    method: 'POST', cookie: aCookie, body: { participantId: solo.id },
  });
  check('admin/approve-participant works', approve.status === 200, `status=${approve.status} ${approve.text.slice(0, 120)}`);
  noHash('admin/approve-participant', approve);

  const reject = await req('/api/admin/reject-participant', {
    method: 'POST', cookie: aCookie, body: { participantId: spare.id },
  });
  check('admin/reject-participant works', reject.status === 200, `status=${reject.status}`);
  noHash('admin/reject-participant', reject);

  const createPart = await req('/api/admin/create-participant', {
    method: 'POST', cookie: aCookie,
    body: { fullName: `${TAG} جديد`, email: `${TAG}-new@t.test`, contactNumber: '0500000000', city: 'جدة' },
  });
  check('admin/create-participant works', createPart.status === 201, `status=${createPart.status} ${createPart.text.slice(0, 120)}`);
  noHash('admin/create-participant', createPart);
  if (createPart.json?.participant?.id) made.participants.push(createPart.json.participant.id);

  const mentorProfile = await req('/api/mentor/update-profile', {
    method: 'PUT', cookie: mentorCookie,
    body: { name: `${TAG} مرشد محدث`, email: `${TAG}-m@t.test`, specialty: 'تقنية', phone: '0511111111' },
  });
  check('mentor/update-profile works', mentorProfile.status === 200, `status=${mentorProfile.status} ${mentorProfile.text.slice(0, 120)}`);
  noHash('mentor/update-profile', mentorProfile);

  // ============ previously-fixed routes stay fixed ============
  section('regression: previously-fixed routes still clean');
  const teams = await req('/api/admin/teams', { cookie: aCookie });
  noHash('admin/teams', teams);
  const mentors = await req('/api/admin/mentors', { cookie: aCookie });
  noHash('admin/mentors', mentors);
  const updateTeamAdmin = await req('/api/admin/update-team', {
    method: 'POST', cookie: aCookie, body: { teamId: team.id, teamName: `${TAG} إداري` },
  });
  noHash('admin/update-team', updateTeamAdmin);
  const updatePart = await req('/api/admin/update-participant', {
    method: 'POST', cookie: aCookie, body: { id: leader.id, city: 'مكة' },
  });
  noHash('admin/update-participant', updatePart);

  // ============ features still behave correctly ============
  section('feature behaviour preserved');
  const teamAfter = await prisma.team.findUnique({ where: { id: team.id }, include: { participants: true } });
  check('team name update persisted', teamAfter.teamName === `${TAG} إداري`, teamAfter.teamName);
  const soloAfter = await prisma.participant.findUnique({ where: { id: solo.id } });
  // note: approve-participant only GENERATES a password when none exists, and
  // these fixtures are seeded with the sentinel — so the hash is expected to
  // be unchanged here. What matters is that the status transition happened.
  check('approval persisted (status -> approved)', soloAfter.status === 'approved', soloAfter.status);
  check('  existing password left alone (route only generates when absent)',
    soloAfter.passwordHash === SENTINEL);
  const spareAfter = await prisma.participant.findUnique({ where: { id: spare.id } });
  check('rejection persisted', spareAfter.status === 'rejected');
  const leaderAfter = await prisma.participant.findUnique({ where: { id: leader.id } });
  check('profile update persisted', leaderAfter.city === 'مكة' || leaderAfter.city === 'الرياض', leaderAfter.city);
  check('hashes still intact in the DB (only hidden from responses, not destroyed)',
    leaderAfter.passwordHash === SENTINEL);
}

main()
  .catch((e) => { fail++; console.error('SCRIPT ERROR:', e.stack); })
  .finally(async () => {
    section('cleanup');
    await prisma.notification.deleteMany({ where: { recipientId: { in: made.participants } } });
    await prisma.notification.deleteMany({ where: { relatedEntityId: { in: [...made.teams, ...made.participants, ...made.mentors] } } });
    await prisma.attendanceRecord.deleteMany({ where: { participantId: { in: made.participants } } });
    await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
    await prisma.participant.deleteMany({ where: { email: { contains: TAG } } });
    await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
    await prisma.mentor.deleteMany({ where: { id: { in: made.mentors } } });
    console.log(`  DB — participants: ${await prisma.participant.count()}, teams: ${await prisma.team.count()}, mentors: ${await prisma.mentor.count()}`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
