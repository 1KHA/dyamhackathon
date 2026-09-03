/**
 * End-to-end test for the bulk import feature (upload → preview → commit).
 *
 * Drives POST /api/admin/import over real HTTP with real multipart uploads,
 * for CSV and XLSX, covering: the dry-run preview, every validation rule,
 * refusal to commit while errors exist, all-or-nothing behaviour, and that
 * imported records land as NOT accepted (status 'pending', no password).
 * Cleans up everything it creates.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const XLSX = require(path.join(REPO, 'node_modules/xlsx'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `imp${Date.now()}`;

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });

const TRACK = 'البنية التحتية للمياه';

/** Build a CSV string (with BOM, like the real templates). */
const csv = (rows) => '﻿' + rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');

async function upload(entity, content, { commit = false, cookie: ck, filename = 'data.csv' } = {}) {
  const fd = new FormData();
  const blob = content instanceof Buffer ? new Blob([content]) : new Blob([content], { type: 'text/csv' });
  fd.append('file', blob, filename);
  fd.append('entity', entity);
  fd.append('commit', String(commit));
  const res = await fetch(BASE + '/api/admin/import', {
    method: 'POST', body: fd, headers: ck ? { cookie: ck } : {},
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const rowErrors = (p, n) => (p.rows.find((r) => r.rowNumber === n) || {}).errors || [];

async function waitForServer() {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/admin/import', { method: 'POST' })).status === 401) return; } catch {} await new Promise(r => setTimeout(r, 2000)); }
  throw new Error('server not reachable');
}

(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  await waitForServer();
  const admin = await prisma.admin.upsert({ where: { username: `${TAG}-adm` }, update: {}, create: { username: `${TAG}-adm`, passwordHash: 'x' } });
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });

  section('auth + basic guards');
  let r = await upload('teams', csv([['teamName']]), {});
  check('no admin cookie -> 401', r.status === 401, String(r.status));
  r = await upload('nonsense', csv([['x']]), { cookie: aCookie });
  check('unknown entity -> 400', r.status === 400, String(r.status));

  section('teams: preview then commit');
  const teamsCsv = csv([
    ['teamName', 'hackathonTrack', 'ideaDescription', 'hearAboutUs'],
    [`${TAG} فريق أ`, TRACK, 'فكرة أ', 'تويتر'],
    [`${TAG} فريق ب`, TRACK, 'فكرة ب', 'صديق'],
  ]);
  r = await upload('teams', teamsCsv, { cookie: aCookie });
  check('preview 200', r.status === 200, JSON.stringify(r.json).slice(0, 120));
  check('2 valid rows, 0 errors', r.json.validCount === 2 && r.json.errorCount === 0, JSON.stringify({ v: r.json.validCount, e: r.json.errorCount }));
  check('preview did NOT commit', r.json.committed === false);
  check('preview created nothing in the DB', (await prisma.team.count({ where: { teamName: { startsWith: TAG } } })) === 0);

  r = await upload('teams', teamsCsv, { commit: true, cookie: aCookie });
  check('commit 200, created 2', r.status === 200 && r.json.committed === true && r.json.created === 2, JSON.stringify(r.json).slice(0, 140));
  const teams = await prisma.team.findMany({ where: { teamName: { startsWith: TAG } } });
  check('2 teams exist', teams.length === 2, String(teams.length));
  check('teams are NOT accepted (status=pending)', teams.every((t) => t.status === 'pending'), JSON.stringify(teams.map(t => t.status)));
  check('teams not disabled, track + isTeamRegistration set', teams.every((t) => t.isDisabled === false && t.hackathonTrack === TRACK && t.isTeamRegistration === true));

  section('teams: validation rules');
  r = await upload('teams', csv([['teamName', 'hackathonTrack'], [`${TAG} فريق أ`, TRACK]]), { cookie: aCookie });
  check('duplicate team name vs DB -> row error', rowErrors(r.json, 2).some((e) => e.includes('مستخدم مسبقاً')), JSON.stringify(rowErrors(r.json, 2)));
  r = await upload('teams', csv([['teamName', 'hackathonTrack'], [`${TAG} X`, 'مسار غير موجود']]), { cookie: aCookie });
  check('unknown hackathonTrack -> row error', rowErrors(r.json, 2).some((e) => e.includes('غير معروفة')), JSON.stringify(rowErrors(r.json, 2)));
  r = await upload('teams', csv([['ideaDescription'], ['x']]), { cookie: aCookie });
  check('missing required columns -> fatal', r.json.fatal.length > 0, JSON.stringify(r.json.fatal));
  r = await upload('teams', csv([['teamName', 'hackathonTrack']]), { cookie: aCookie });
  check('no data rows -> fatal', r.json.fatal.length > 0, JSON.stringify(r.json.fatal));

  section('participants: link to teams, reject bad rows');
  const goodParticipants = csv([
    ['email', 'fullName', 'teamName', 'isLeader', 'gender', 'isUniversityStudent', 'canAttendHackathon', 'professionalField', 'contactNumber'],
    [`${TAG}-a@t.local`, 'سارة', `${TAG} فريق أ`, 'TRUE', 'أنثى', 'TRUE', 'TRUE', 'برمجة', '0501111111'],
    [`${TAG}-b@t.local`, 'عمر', `${TAG} فريق أ`, 'FALSE', 'ذكر', 'نعم', 'لا', 'علم البيانات', '0502222222'],
    [`${TAG}-c@t.local`, 'هدى', '', 'FALSE', 'أنثى', 'FALSE', 'FALSE', 'ذكاء اصناعي', '0503333333'],
  ]);
  r = await upload('participants', goodParticipants, { cookie: aCookie });
  check('3 valid participants', r.json.validCount === 3 && r.json.errorCount === 0, JSON.stringify(r.json.rows.map(x => x.errors)));
  r = await upload('participants', goodParticipants, { commit: true, cookie: aCookie });
  check('committed 3', r.json.committed === true && r.json.created === 3, JSON.stringify(r.json).slice(0, 140));

  const parts = await prisma.participant.findMany({ where: { email: { startsWith: TAG } }, include: { team: true } });
  check('3 participants exist', parts.length === 3, String(parts.length));
  check('all NOT accepted (status=pending)', parts.every((p) => p.status === 'pending'));
  check('no passwords set (approval generates them)', parts.every((p) => p.passwordHash === null));
  check('none disabled', parts.every((p) => p.isDisabled === false));
  const sara = parts.find((p) => p.email.includes('-a@'));
  check('team member linked to the right team', sara.team && sara.team.teamName === `${TAG} فريق أ`, String(sara.team && sara.team.teamName));
  check('leader flag imported', sara.isLeader === true);
  const huda = parts.find((p) => p.email.includes('-c@'));
  check('individual participant has no team', huda.teamId === null);
  const omar = parts.find((p) => p.email.includes('-b@'));
  check('نعم/لا parsed as booleans', omar.isUniversityStudent === true && omar.canAttendHackathon === false,
        JSON.stringify({ u: omar.isUniversityStudent, c: omar.canAttendHackathon }));
  check('phone kept its leading zero', omar.contactNumber === '0502222222', String(omar.contactNumber));

  section('participants: validation rules');
  r = await upload('participants', csv([['email', 'fullName', 'teamName'], [`${TAG}-a@t.local`, 'x', '']]), { cookie: aCookie });
  check('email already in DB -> row error', rowErrors(r.json, 2).some((e) => e.includes('مسجل مسبقاً')), JSON.stringify(rowErrors(r.json, 2)));
  r = await upload('participants', csv([['email', 'fullName'], [`${TAG}-dup@t.local`, 'a'], [`${TAG}-dup@t.local`, 'b']]), { cookie: aCookie });
  check('duplicate email inside the file -> row error', rowErrors(r.json, 3).some((e) => e.includes('مكرر داخل الملف')), JSON.stringify(rowErrors(r.json, 3)));
  r = await upload('participants', csv([['email', 'fullName', 'teamName'], [`${TAG}-z@t.local`, 'z', 'فريق غير موجود']]), { cookie: aCookie });
  check('unknown teamName -> row error', rowErrors(r.json, 2).some((e) => e.includes('غير موجود')), JSON.stringify(rowErrors(r.json, 2)));
  r = await upload('participants', csv([['email', 'fullName', 'teamName', 'isLeader'],
    [`${TAG}-l1@t.local`, 'l1', `${TAG} فريق ب`, 'TRUE'], [`${TAG}-l2@t.local`, 'l2', `${TAG} فريق ب`, 'TRUE']]), { cookie: aCookie });
  check('two leaders in one team -> row errors', rowErrors(r.json, 2).some((e) => e.includes('أكثر من قائد')), JSON.stringify(rowErrors(r.json, 2)));
  r = await upload('participants', csv([['email', 'fullName'], ['not-an-email', 'x']]), { cookie: aCookie });
  check('invalid email -> row error', rowErrors(r.json, 2).some((e) => e.includes('غير صالح')), JSON.stringify(rowErrors(r.json, 2)));
  r = await upload('participants', csv([['email', 'fullName', 'isLeader'], [`${TAG}-bool@t.local`, 'x', 'ربما']]), { cookie: aCookie });
  check('unparseable boolean -> row error', rowErrors(r.json, 2).some((e) => e.includes('TRUE')), JSON.stringify(rowErrors(r.json, 2)));
  r = await upload('participants', csv([['email', 'fullName', 'gender'], [`${TAG}-g@t.local`, 'x', 'غير محدد']]), { cookie: aCookie });
  check('unknown gender is a WARNING, row still valid', r.json.errorCount === 0 && r.json.warningCount === 1, JSON.stringify({ e: r.json.errorCount, w: r.json.warningCount }));
  r = await upload('participants', csv([['email', 'fullName', 'nickname'], [`${TAG}-u@t.local`, 'x', 'y']]), { cookie: aCookie });
  check('unknown column reported and ignored', r.json.unknownColumns.includes('nickname') && r.json.errorCount === 0, JSON.stringify(r.json.unknownColumns));

  section('commit is refused while any row has an error (all-or-nothing)');
  const mixed = csv([['email', 'fullName'], [`${TAG}-ok@t.local`, 'ok'], ['bad-email', 'bad']]);
  r = await upload('participants', mixed, { commit: true, cookie: aCookie });
  check('mixed file -> 400, not committed', r.status === 400 && r.json.committed === false, JSON.stringify(r.json).slice(0, 120));
  check('the VALID row was not created either', (await prisma.participant.count({ where: { email: `${TAG}-ok@t.local` } })) === 0);

  section('mentors + XLSX upload');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['name', 'email', 'specialty', 'phone'],
    [`${TAG} موجه`, `${TAG}-m1@t.local`, 'الذكاء الاصطناعي', '0509999999'],
  ]), 'الموجهون');
  const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  r = await upload('mentors', xlsxBuf, { commit: true, cookie: aCookie, filename: 'mentors.xlsx' });
  check('XLSX upload works, 1 mentor created', r.status === 200 && r.json.created === 1, JSON.stringify(r.json).slice(0, 140));
  const mentors = await prisma.mentor.findMany({ where: { email: { startsWith: TAG } } });
  check('mentor is NOT accepted (status=pending), no password', mentors.length === 1 && mentors[0].status === 'pending' && mentors[0].passwordHash === null,
        JSON.stringify(mentors.map((m) => ({ s: m.status, p: m.passwordHash }))));
  r = await upload('mentors', csv([['name', 'email'], ['x', `${TAG}-m2@t.local`]]), { cookie: aCookie });
  check('mentor missing required column specialty -> fatal', r.json.fatal.length > 0, JSON.stringify(r.json.fatal));

  section('the shipped templates parse cleanly');
  const fs = require('fs');
  for (const [entity, file] of [['teams', 'teams-template.csv'], ['participants', 'participants-template.csv'], ['mentors', 'mentors-template.csv']]) {
    const buf = fs.readFileSync(path.join(REPO, 'imports', file));
    const res = await upload(entity, buf, { cookie: aCookie, filename: file });
    // header-only template => "no data rows" fatal, but NO missing-column fatal
    const missingCols = (res.json.missingColumns || []).length;
    check(`${file}: headers match the validator exactly`, missingCols === 0, JSON.stringify(res.json.missingColumns));
  }
  const exBuf = fs.readFileSync(path.join(REPO, 'imports', 'teams-example.csv'));
  r = await upload('teams', exBuf, { cookie: aCookie, filename: 'teams-example.csv' });
  check('teams-example.csv validates with 0 errors', r.json.errorCount === 0, JSON.stringify(r.json.rows?.map(x => x.errors)));

  section('cleanup');
  await prisma.participant.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.team.deleteMany({ where: { teamName: { startsWith: TAG } } });
  await prisma.mentor.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.admin.delete({ where: { id: admin.id } });
  console.log('  cleaned up');

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('CRASH', e); await prisma.$disconnect(); process.exit(1); });
