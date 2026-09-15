/**
 * e2e — admin edits a team member's / leader's profile from the teams page.
 *
 * POST /api/admin/update-participant:
 *   - admin may edit any participant's profile fields, including fullName;
 *   - protected fields (status, teamId, isLeader, passwordHash, isDisabled,
 *     phase…) and unknown keys are ignored, never 500;
 *   - duplicate email → 409, bad email → 400, unknown id → 404;
 *   - team leader path unchanged: may edit own team member (fullName still
 *     not applied for leaders), other team → 403, unauthenticated → 401.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `medit${Date.now()}`;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
async function api(pathname, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, { method, headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const made = { teams: [], participants: [] };

(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  const admin = await prisma.admin.findFirst();
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });

  const team = await prisma.team.create({ data: { teamName: `${TAG} team`, status: 'approved' } }); made.teams.push(team.id);
  const other = await prisma.team.create({ data: { teamName: `${TAG} other`, status: 'approved' } }); made.teams.push(other.id);
  const leader = await prisma.participant.create({ data: { email: `${TAG}-leader@e2e.test`, fullName: 'Leader', teamId: team.id, isLeader: true, status: 'approved', passwordHash: 'hash-leader' } });
  const member = await prisma.participant.create({ data: { email: `${TAG}-member@e2e.test`, fullName: 'Member One', teamId: team.id, status: 'approved', passwordHash: 'hash-member', phoneNumber: '0500000000', city: 'الرياض' } });
  const stranger = await prisma.participant.create({ data: { email: `${TAG}-stranger@e2e.test`, fullName: 'Stranger', teamId: other.id, isLeader: true, status: 'approved' } });
  made.participants.push(leader.id, member.id, stranger.id);
  const lCookie = cookie({ id: leader.id, participantId: leader.id, role: 'participant' });

  section('admin edits a member from the team page');
  let r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: member.id, fullName: 'Member Edited', email: `  ${TAG}-MEMBER-new@e2e.test `, contactNumber: '0555555555', gender: 'أنثى', city: 'جدة', isUniversityStudent: true, canAttendHackathon: 'true' } });
  check('200 with the public row (no passwordHash)', r.status === 200 && r.json?.id === member.id && !('passwordHash' in (r.json || {})), JSON.stringify(r.json).slice(0, 120));
  let row = await prisma.participant.findUnique({ where: { id: member.id } });
  check('  fullName updated by admin', row.fullName === 'Member Edited', row.fullName);
  check('  email trimmed + lowercased', row.email === `${TAG}-member-new@e2e.test`.toLowerCase(), row.email);
  check('  other profile fields persisted (contactNumber, gender, city, booleans coerced)', row.contactNumber === '0555555555' && row.gender === 'أنثى' && row.city === 'جدة' && row.isUniversityStudent === true && row.canAttendHackathon === true);
  check('  team / role / status / password untouched', row.teamId === team.id && row.isLeader === false && row.status === 'approved' && row.passwordHash === 'hash-member');

  section('admin edits the leader');
  r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: leader.id, fullName: 'Leader Edited', phoneNumber: '0511111111' } });
  row = await prisma.participant.findUnique({ where: { id: leader.id } });
  check('leader profile updated, still the leader', r.status === 200 && row.fullName === 'Leader Edited' && row.phoneNumber === '0511111111' && row.isLeader === true);

  section('protected + unknown fields are ignored, never 500');
  r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: member.id, city: 'مكة', status: 'rejected', teamId: other.id, isLeader: true, passwordHash: 'pwned', isDisabled: true, phaseStatus: 'failed', badgeCode: 'X', role: 'admin', nonsenseField: 1, team: { id: 'x' } } });
  row = await prisma.participant.findUnique({ where: { id: member.id } });
  check('200 and only city changed', r.status === 200 && row.city === 'مكة' && row.status === 'approved' && row.teamId === team.id && row.isLeader === false && row.passwordHash === 'hash-member' && row.isDisabled === false && row.phaseStatus === 'active' && row.badgeCode === null, JSON.stringify({ s: row.status, t: row.teamId === team.id, l: row.isLeader, d: row.isDisabled }));
  r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: member.id, status: 'rejected' } });
  check('only protected fields -> 400 (nothing to update)', r.status === 400, `status=${r.status}`);

  section('validation');
  r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: member.id, email: stranger.email } });
  check('duplicate email -> 409 with Arabic message', r.status === 409 && /مستخدم/.test(r.json?.error || ''), JSON.stringify(r.json));
  r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: member.id, email: 'not-an-email' } });
  check('bad email -> 400', r.status === 400);
  r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: 'does-not-exist', city: 'x' } });
  check('unknown id -> 404', r.status === 404, `status=${r.status}`);
  r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { city: 'x' } });
  check('missing id -> 400', r.status === 400);

  section('team-leader path unchanged');
  r = await api('/api/admin/update-participant', { cookie: lCookie, method: 'POST', body: { id: member.id, fullName: 'Leader Renamed Me', contactNumber: '0599999999' } });
  row = await prisma.participant.findUnique({ where: { id: member.id } });
  check('leader edits own member: 200, contactNumber applied', r.status === 200 && row.contactNumber === '0599999999', `status=${r.status}`);
  check('  fullName NOT applied for leaders (historical behaviour kept)', row.fullName === 'Member Edited', row.fullName);
  r = await api('/api/admin/update-participant', { cookie: lCookie, method: 'POST', body: { id: stranger.id, city: 'x' } });
  check('leader editing another team\'s participant -> 403', r.status === 403, `status=${r.status}`);
  r = await api('/api/admin/update-participant', { method: 'POST', body: { id: member.id, city: 'x' } });
  check('unauthenticated -> 401', r.status === 401);
  const mCookie = cookie({ id: member.id, participantId: member.id, role: 'participant' });
  r = await api('/api/admin/update-participant', { cookie: mCookie, method: 'POST', body: { id: leader.id, city: 'x' } });
  check('non-leader member -> 403', r.status === 403);

  section('teams API reflects the edit');
  const teams = await api(`/api/admin/teams?search=${encodeURIComponent(TAG)}`, { cookie: aCookie });
  const t = (teams.json || []).find((x) => x.id === team.id);
  check('team list shows the edited member data', !!t && t.participants.some((p) => p.id === member.id && p.fullName === 'Member Edited' && p.city === 'مكة'));
})()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    try {
      await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
      await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
    } catch (e) { console.error('cleanup error:', e.message); }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
