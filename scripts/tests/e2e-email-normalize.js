/**
 * End-to-end suite for case/space-insensitive email handling.
 *
 * Older registration paths stored emails exactly as typed ("  Name@Mail.com "),
 * which the login's exact lookup never matched. Covers: login (participant +
 * mentor) ignoring case and surrounding spaces, duplicate rows resolved by the
 * password, forgot-password finding such rows, and every write path storing
 * new emails trimmed + lowercased with case-insensitive duplicate checks.
 *
 * Needs a running app (VERIFY_BASE_URL), its DATABASE_URL and JWT_SECRET.
 * Run against the local Docker test DB — never production.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const bcrypt = require(path.join(REPO, 'node_modules/bcryptjs'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `em${Date.now()}`;

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const sign = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });

async function api(p, { cookie, method = 'GET', body } = {}) {
  const res = await fetch(BASE + p, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const login = (email, password) => api('/api/login', { method: 'POST', body: { email, password } });

(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  const P1 = 'Pass-One-111', P2 = 'Pass-Two-222';
  const [h1, h2] = await Promise.all([bcrypt.hash(P1, 10), bcrypt.hash(P2, 10)]);
  const tag = TAG.toLowerCase();
  const settingsBefore = await prisma.teamSettings.findFirst();

  section('fixtures (stored the old way: as typed)');
  const admin = await prisma.admin.create({ data: { username: `${TAG}-adm`, passwordHash: 'x' } });
  const aCookie = sign({ id: admin.id, username: admin.username, role: 'admin' });
  const team = await prisma.team.create({ data: { teamName: `${TAG} فريق`, status: 'approved' } });
  const spaced = await prisma.participant.create({ data: { email: `  Spaced.${TAG}@Mail.TEST `, fullName: 'مسافات', passwordHash: h1, status: 'approved', teamId: team.id } });
  const dupA = await prisma.participant.create({ data: { email: `dup.${tag}@x.test`, fullName: 'نسخة أ', passwordHash: h1, status: 'approved', teamId: team.id } });
  const dupB = await prisma.participant.create({ data: { email: ` DUP.${tag}@X.TEST`, fullName: 'نسخة ب', passwordHash: h2, status: 'approved', teamId: team.id } });
  const leader = await prisma.participant.create({ data: { email: `leader.${tag}@x.test`, fullName: 'قائد', status: 'approved', teamId: team.id, isLeader: true } });
  const mentor = await prisma.mentor.create({ data: { email: `  Mentor.${TAG}@X.test`, name: 'موجه', specialty: 's', phone: '0', status: 'active', passwordHash: h1 } });
  check('fixtures created', Boolean(spaced && dupA && dupB && leader && mentor));

  section('participant login ignores case and surrounding spaces');
  let r = await login(`spaced.${tag}@mail.test`, P1);
  check('lowercase, no spaces -> 200', r.status === 200 && r.json?.user?.id === spaced.id, `${r.status} ${JSON.stringify(r.json)}`);
  r = await login(`  SPACED.${TAG.toUpperCase()}@MAIL.TEST  `, P1);
  check('uppercase with spaces -> 200', r.status === 200 && r.json?.user?.id === spaced.id, `${r.status}`);
  r = await login(`spaced.${tag}@mail.test`, 'wrong-password');
  check('right email, wrong password -> 401', r.status === 401, String(r.status));
  r = await login(`nobody.${tag}@mail.test`, P1);
  check('unknown email -> 401', r.status === 401, String(r.status));
  r = await login('   ', P1);
  check('blank email -> 400', r.status === 400, String(r.status));

  section('duplicate rows that differ only in case/spaces: the password decides');
  r = await login(`Dup.${tag}@x.test`, P1);
  check('no exact match, password 1 -> account A', r.status === 200 && r.json?.user?.id === dupA.id, `${r.status} ${JSON.stringify(r.json?.user)}`);
  r = await login(`Dup.${tag}@x.test`, P2);
  check('no exact match, password 2 -> account B', r.status === 200 && r.json?.user?.id === dupB.id, `${r.status} ${JSON.stringify(r.json?.user)}`);
  r = await login(`Dup.${tag}@x.test`, 'wrong-password');
  check('no exact match, wrong password -> 401', r.status === 401, String(r.status));
  r = await login(`dup.${tag}@x.test`, P1);
  check('exact match still wins for its own password', r.status === 200 && r.json?.user?.id === dupA.id, `${r.status}`);

  section('mentor login ignores case and surrounding spaces');
  r = await login(`mentor.${tag}@x.test`, P1);
  check('mentor lowercase -> 200 as mentor', r.status === 200 && r.json?.user?.role === 'mentor' && r.json?.user?.id === mentor.id, `${r.status} ${JSON.stringify(r.json)}`);
  r = await login(`mentor.${tag}@x.test`, P2);
  check('mentor wrong password -> 401', r.status === 401, String(r.status));

  section('forgot-password finds rows stored with case/spaces');
  // An unknown address gets the generic 200 without trying to send; a found
  // account either sends (200) or fails on SMTP (5xx) — both mean "found".
  const unknown = await api('/api/forgot-password', { method: 'POST', body: { email: `nobody.${tag}@mail.test` } });
  check('unknown address -> generic 200', unknown.status === 200, String(unknown.status));
  const before = await prisma.emailLog.count({ where: { toEmail: { contains: `spaced.${tag}`, mode: 'insensitive' } } });
  r = await api('/api/forgot-password', { method: 'POST', body: { email: `spaced.${tag}@mail.test` } });
  const after = await prisma.emailLog.count({ where: { toEmail: { contains: `spaced.${tag}`, mode: 'insensitive' } } });
  check('spaced/capitalised account is found (send attempted)', r.status !== 200 || after > before, `status=${r.status} logs ${before}->${after} ${JSON.stringify(r.json)}`);
  // neither the typed nor the lowercased address matches exactly, and two rows match loosely
  const amb1 = await prisma.participant.create({ data: { email: ` Amb.${tag}@x.test`, fullName: 'غامض أ', status: 'approved', teamId: team.id } });
  const amb2 = await prisma.participant.create({ data: { email: `AMB.${tag}@x.test `, fullName: 'غامض ب', status: 'approved', teamId: team.id } });
  const amb = await api('/api/forgot-password', { method: 'POST', body: { email: `amb.${tag}@x.test` } });
  check('ambiguous duplicates -> generic 200, no send', amb.status === 200 && (await prisma.emailLog.count({ where: { toEmail: { contains: `amb.${tag}`, mode: 'insensitive' } } })) === 0, `${amb.status}`);
  check('ambiguous fixtures exist', Boolean(amb1 && amb2));

  section('new emails are stored trimmed + lowercased');
  // admin create-participant
  r = await api('/api/admin/create-participant', { cookie: aCookie, method: 'POST', body: { email: `  New.Admin.${TAG}@Mail.TEST `, fullName: 'جديد' } });
  const created = await prisma.participant.findFirst({ where: { fullName: 'جديد', email: { contains: tag } } });
  check('admin create stores normalized email', created && created.email === `new.admin.${tag}@mail.test`, `${r.status} ${created && JSON.stringify(created.email)}`);
  r = await api('/api/admin/create-participant', { cookie: aCookie, method: 'POST', body: { email: `NEW.ADMIN.${TAG.toUpperCase()}@mail.test`, fullName: 'مكرر' } });
  check('admin create rejects the same address in other case', r.status === 400, String(r.status));
  r = await api('/api/admin/create-participant', { cookie: aCookie, method: 'POST', body: { email: `spaced.${tag}@mail.test`, fullName: 'مكرر' } });
  check('admin create rejects an address stored with spaces/caps', r.status === 400, String(r.status));

  // admin update-participant: trimming an old value is not an "email change"
  r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: spaced.id, email: `spaced.${tag}@mail.test` } });
  const spacedNow = await prisma.participant.findUnique({ where: { id: spaced.id } });
  check('admin edit stores the trimmed email', spacedNow.email === `spaced.${tag}@mail.test`, `${r.status} ${JSON.stringify(spacedNow.email)}`);
  check('…and does not treat it as an email change (no credential re-send)', r.status === 200 && !r.json?.emailChange, JSON.stringify(r.json?.emailChange));

  // leader add-member
  await prisma.teamSettings.updateMany({ data: { memberAddStart: null, memberAddEnd: null } });
  const lCookie = sign({ id: leader.id, participantId: leader.id, role: 'participant', teamId: team.id, isLeader: true });
  const member = (email) => ({ firstName: 'عضو', secondName: 'ثاني', familyName: TAG, nationalId: `10${Date.now()}`, dob: '2000-01-01', email, phoneNumber: '0500000000', education: 'بكالوريوس', university: 'جامعة', major: 'حاسب', employmentStatus: 'طالب', nationality: 'سعودي', residence: 'الرياض', canAttend: true });
  r = await api('/api/participant/add-member', { cookie: lCookie, method: 'POST', body: member(`  Added.${TAG}@Mail.TEST `) });
  const added = await prisma.participant.findFirst({ where: { teamId: team.id, firstName: 'عضو' } });
  check('add-member stores normalized email', r.status === 201 && added && added.email === `added.${tag}@mail.test`, `${r.status} ${JSON.stringify(r.json)} ${added && added.email}`);
  r = await api('/api/participant/add-member', { cookie: lCookie, method: 'POST', body: member(`ADDED.${TAG.toUpperCase()}@MAIL.TEST`) });
  check('add-member rejects the same address in other case', r.status === 409, String(r.status));
  r = await api('/api/participant/add-member', { cookie: lCookie, method: 'POST', body: member(`dup.${tag}@x.test `) });
  check('add-member rejects an existing address with trailing space', r.status === 409, String(r.status));

  // admin mentor create + edit, mentor self-edit
  r = await api('/api/admin/mentors', { cookie: aCookie, method: 'POST', body: { name: 'موجه جديد', email: `  New.Mentor.${TAG}@X.TEST `, specialty: 's', phone: '0', password: 'Mentor-Pass-1' } });
  const newMentor = await prisma.mentor.findFirst({ where: { name: 'موجه جديد', email: { contains: tag } } });
  check('admin mentor create stores normalized email', newMentor && newMentor.email === `new.mentor.${tag}@x.test`, `${r.status} ${newMentor && newMentor.email}`);
  r = await api('/api/admin/mentors', { cookie: aCookie, method: 'PUT', body: { id: mentor.id, name: 'موجه', email: ` Mentor.${TAG}@X.test`, specialty: 's', phone: '0', status: 'active' } });
  const mentorNow = await prisma.mentor.findUnique({ where: { id: mentor.id } });
  check('admin mentor edit stores normalized email', mentorNow.email === `mentor.${tag}@x.test`, `${r.status} ${mentorNow.email}`);
  r = await api('/api/mentor/update-profile', { cookie: sign({ id: mentor.id, mentorId: mentor.id, role: 'mentor' }), method: 'PUT', body: { name: 'موجه', email: `  MENTOR.${TAG.toUpperCase()}@X.TEST `, specialty: 's', phone: '0' } });
  const mentorSelf = await prisma.mentor.findUnique({ where: { id: mentor.id } });
  check('mentor self-edit stores normalized email', mentorSelf.email === `mentor.${tag}@x.test`, `${r.status} ${mentorSelf.email}`);
  r = await login(`  Mentor.${TAG}@X.TEST`, P1);
  check('mentor still logs in after normalization', r.status === 200 && r.json?.user?.id === mentor.id, String(r.status));

  section('cleanup');
  const pIds = (await prisma.participant.findMany({ where: { OR: [{ email: { contains: tag, mode: 'insensitive' } }, { teamId: team.id }] }, select: { id: true } })).map((p) => p.id);
  await prisma.notification.deleteMany({ where: { recipientId: { in: [...pIds, mentor.id, newMentor?.id].filter(Boolean) } } });
  await prisma.emailLog.deleteMany({ where: { toEmail: { contains: tag, mode: 'insensitive' } } });
  await prisma.participant.deleteMany({ where: { id: { in: pIds } } });
  await prisma.team.delete({ where: { id: team.id } });
  await prisma.mentor.deleteMany({ where: { email: { contains: tag, mode: 'insensitive' } } });
  await prisma.admin.delete({ where: { id: admin.id } });
  if (settingsBefore) await prisma.teamSettings.update({ where: { id: settingsBefore.id }, data: { memberAddStart: settingsBefore.memberAddStart, memberAddEnd: settingsBefore.memberAddEnd } });
  console.log('  cleaned up');

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(2); });
