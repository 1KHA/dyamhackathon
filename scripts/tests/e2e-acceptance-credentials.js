/**
 * End-to-end test: acceptance emails carry each participant's own login
 * credentials (team approval, individual approval, join-request acceptance).
 *
 * Needs: a running app (VERIFY_BASE_URL), its DB via DATABASE_URL, JWT_SECRET
 * matching the app, and an SMTP sink on SMTP_SINK_HOST:SMTP_SINK_PORT exposing
 * decoded messages at SMTP_SINK_STATS + "mails" ({mails:[{rcpt:[],text}]}).
 * See mdfiles/acceptance-credentials-email.md §Testing. Cleans up after itself.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const bcrypt = require(path.join(REPO, 'node_modules/bcryptjs'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const SINK_HOST = process.env.SMTP_SINK_HOST || '127.0.0.1';
const SINK_PORT = Number(process.env.SMTP_SINK_PORT || 2525);
const SINK_STATS = process.env.SMTP_SINK_STATS || 'http://127.0.0.1:2526/';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';
const TAG = `ac${Date.now()}`;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });

async function api(pathname, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, { method, headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* */ }
  return { status: res.status, json };
}
const mails = async () => (await (await fetch(SINK_STATS + 'mails')).json()).mails || [];
const resetSink = () => fetch(SINK_STATS + 'reset');
async function waitForServer() {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/admin/broadcast')).status === 401) return; } catch { /* */ } await sleep(2000); }
  throw new Error('server not reachable');
}
/** Pull "كلمة المرور: XXXX" out of a decoded mail body. */
const passwordIn = (text) => (/كلمة المرور:\s*(\S+)/.exec(text) || [])[1];
async function waitMails(n) { for (let i = 0; i < 30; i++) { const m = await mails(); if (m.length >= n) return m; await sleep(500); } return mails(); }

(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  await waitForServer();

  const admin = await prisma.admin.upsert({ where: { username: `${TAG}-admin` }, update: {}, create: { username: `${TAG}-admin`, passwordHash: 'x' } });
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });
  const settings = await prisma.emailSettings.findFirst();
  const saved = { ...settings }; delete saved.id; delete saved.updatedAt;
  await prisma.emailSettings.update({ where: { id: settings.id }, data: { enabled: true, host: SINK_HOST, port: SINK_PORT, secure: false, username: '', password: '', fromEmail: `noreply@${TAG}.test`, fromName: 'E2E', adminInboxEmail: '' } });

  section('settings page exposes the credential variables');
  let r = await api('/api/admin/email-templates', { cookie: aCookie });
  const tpl = (k) => (r.json.templates || []).find((t) => t.key === k);
  for (const k of ['teamApproval', 'participantApproval', 'joinRequestAccepted']) {
    const t = tpl(k);
    check(`${k}: variables include email/password/loginUrl/participantName`, t && ['email', 'password', 'loginUrl', 'participantName'].every((v) => t.variables.includes(v)), t && t.variables.join(','));
    check(`${k}: default email body contains {{password}}`, t && t.emailBody.includes('{{password}}') && t.emailBody.includes('{{email}}'));
  }
  r = await api('/api/admin/email-templates/teamApproval', { cookie: aCookie, method: 'PUT', body: { dashboardTitle: 'x', dashboardMessage: 'y', emailSubject: 's', emailBody: `${TAG} custom {{email}} / {{password}} / {{loginUrl}}`, emailEnabled: true } });
  check('admin can save a template using {{password}}', r.status === 200, JSON.stringify(r.json).slice(0, 120));
  r = await api('/api/admin/email-templates/teamApproval', { cookie: aCookie, method: 'PUT', body: { dashboardTitle: 'x', dashboardMessage: 'y', emailSubject: 's', emailBody: '{{nope}}', emailEnabled: true } });
  check('unknown variable still rejected', r.status === 400);
  await api('/api/admin/email-templates/teamApproval', { cookie: aCookie, method: 'DELETE' });

  section('team approval: one email per member with their own password');
  const team = await prisma.team.create({ data: { teamName: `${TAG} team`, status: 'pending' } });
  const members = [];
  for (let i = 0; i < 3; i++) members.push(await prisma.participant.create({ data: { email: `${TAG}-m${i}@e2e.test`, fullName: `Member ${i}`, teamId: team.id, isLeader: i === 0 } }));
  await resetSink();
  r = await api('/api/admin/approve-team', { cookie: aCookie, method: 'POST', body: { teamId: team.id } });
  check('approve-team 200', r.status === 200 && r.json.success, JSON.stringify(r.json).slice(0, 120));
  const creds = r.json.credentials || [];
  check('response returns 3 credentials with 10-char random passwords', creds.length === 3 && creds.every((c) => /^[A-Za-z0-9]{10}$/.test(c.password)) && new Set(creds.map((c) => c.password)).size === 3, JSON.stringify(creds.map((c) => c.password)));
  check('passwords are NOT the old emailPrefix123 scheme', creds.every((c) => c.password !== c.email.split('@')[0] + '123'));
  let m = await waitMails(3);
  check('3 separate emails (no BCC batching)', m.length === 3 && m.every((x) => x.rcpt.length === 1), JSON.stringify(m.map((x) => x.rcpt)));
  for (const c of creds) {
    const mail = m.find((x) => x.rcpt[0] === c.email.toLowerCase());
    const pw = mail && passwordIn(mail.text);
    check(`${c.email}: email contains own address + own password`, mail && mail.text.includes(c.email) && pw === c.password, mail ? `found "${pw}"` : 'no mail');
    const others = creds.filter((o) => o.email !== c.email).map((o) => o.password);
    check(`${c.email}: contains no other member's password`, mail && others.every((o) => !mail.text.includes(o)));
    const row = await prisma.participant.findUnique({ where: { email: c.email } });
    check(`${c.email}: emailed password matches stored hash`, row.passwordHash && (await bcrypt.compare(c.password, row.passwordHash)));
    if (APP_URL) check(`${c.email}: login link uses NEXT_PUBLIC_APP_URL`, mail && mail.text.includes(`${APP_URL}/login`));
  }
  r = await api('/api/login', { method: 'POST', body: { email: creds[1].email, password: creds[1].password } });
  check('member can log in with the emailed password', r.status === 200, String(r.status));
  const notes = await prisma.notification.findMany({ where: { relatedEntityId: team.id, recipientType: 'participant' } });
  check('3 dashboard notifications, all emailStatus=sent', notes.length === 3 && notes.every((n) => n.emailStatus === 'sent'), JSON.stringify(notes.map((n) => n.emailStatus)));
  check('dashboard text does not leak the password', notes.every((n) => !creds.some((c) => n.message.includes(c.password))));
  const logs = await prisma.emailLog.findMany({ where: { templateKey: 'teamApproval', createdAt: { gte: new Date(Date.now() - 60000) } } });
  check('EmailLog: 3 sent rows, one per recipient', logs.filter((l) => l.status === 'sent').length >= 3);

  section('individual approval');
  const solo = await prisma.participant.create({ data: { email: `${TAG}-solo@e2e.test`, fullName: 'Solo One', status: 'pending' } });
  await resetSink();
  r = await api('/api/admin/approve-participant', { cookie: aCookie, method: 'POST', body: { participantId: solo.id } });
  check('approve-participant 200 with generatedPassword', r.status === 200 && /^[A-Za-z0-9]{10}$/.test(r.json.generatedPassword || ''), JSON.stringify(r.json).slice(0, 160));
  m = await waitMails(1);
  check('1 email to the participant with their password', m.length === 1 && m[0].rcpt[0] === solo.email && passwordIn(m[0].text) === r.json.generatedPassword, m[0] && passwordIn(m[0].text));
  const soloRow = await prisma.participant.findUnique({ where: { id: solo.id } });
  check('status approved, hash matches emailed password', soloRow.status === 'approved' && (await bcrypt.compare(r.json.generatedPassword, soloRow.passwordHash)));
  r = await api('/api/login', { method: 'POST', body: { email: solo.email, password: r.json.generatedPassword } });
  check('participant can log in', r.status === 200, String(r.status));

  section('individual approval when a password already exists');
  const existing = await prisma.participant.create({ data: { email: `${TAG}-has@e2e.test`, fullName: 'Has Pw', status: 'pending', passwordHash: await bcrypt.hash('keepme123', 10) } });
  await resetSink();
  r = await api('/api/admin/approve-participant', { cookie: aCookie, method: 'POST', body: { participantId: existing.id } });
  m = await waitMails(1);
  check('no new password generated; email says password unchanged', r.json.generatedPassword === null && m[0] && /لم تتغير/.test(m[0].text) && !passwordIn(m[0].text)?.match(/^[A-Za-z0-9]{10}$/), m[0] && passwordIn(m[0].text));
  check('old password still works', await bcrypt.compare('keepme123', (await prisma.participant.findUnique({ where: { id: existing.id } })).passwordHash));

  section('join request accepted into an approved team');
  const joiner = await prisma.participant.create({ data: { email: `${TAG}-join@e2e.test`, fullName: 'Joiner', status: 'approved' } });
  const req = await prisma.teamJoinRequest.create({ data: { participantId: joiner.id, teamId: team.id, status: 'pending' } });
  const leaderCookie = cookie({ id: members[0].id, participantId: members[0].id, role: 'participant' });
  await resetSink();
  r = await api('/api/team-leader/handle-join-request', { cookie: leaderCookie, method: 'POST', body: { requestId: req.id, action: 'accept' } });
  check('accept 200', r.status === 200, JSON.stringify(r.json).slice(0, 120));
  m = await waitMails(1);
  const jpw = m[0] && passwordIn(m[0].text);
  const jrow = await prisma.participant.findUnique({ where: { id: joiner.id } });
  check('joiner got a password by email that matches the stored hash', m.length === 1 && m[0].rcpt[0] === joiner.email && /^[A-Za-z0-9]{10}$/.test(jpw || '') && (await bcrypt.compare(jpw, jrow.passwordHash)), jpw);
  check('joiner is now on the team', jrow.teamId === team.id);

  section('cleanup');
  await prisma.teamJoinRequest.deleteMany({ where: { teamId: team.id } });
  await prisma.notification.deleteMany({ where: { recipientId: { in: [...members.map((x) => x.id), solo.id, existing.id, joiner.id] } } });
  await prisma.participant.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.team.delete({ where: { id: team.id } });
  await prisma.emailLog.deleteMany({ where: { toEmail: { contains: TAG } } });
  await prisma.admin.delete({ where: { id: admin.id } });
  await prisma.emailSettings.update({ where: { id: settings.id }, data: saved });
  console.log('  cleaned up');
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect(); process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('CRASH', e); await prisma.$disconnect(); process.exit(1); });
