/**
 * End-to-end test of the broadcast email queue over real HTTP.
 *
 * Needs: a running app (VERIFY_BASE_URL, default http://localhost:3000), its
 * Postgres reachable via DATABASE_URL, JWT_SECRET matching the app, and an SMTP
 * sink on SMTP_SINK_HOST:SMTP_SINK_PORT whose stats endpoint (SMTP_SINK_STATS)
 * returns {rcpt, unique, duplicates, rejected, recipients:{addr:count}}. The sink must answer 550 to any
 * RCPT containing "bounce". See mdfiles/email-queue.md §Testing.
 *
 * Creates N participants (default 5000), posts a broadcast, asserts the POST
 * returns immediately, polls until the queue drains, and checks every address
 * was delivered exactly once. Cleans up what it created.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const N = Number(process.env.BROADCAST_E2E_SIZE || 5000);
const SINK_HOST = process.env.SMTP_SINK_HOST || '127.0.0.1';
const SINK_PORT = Number(process.env.SMTP_SINK_PORT || 2525);
const SINK_STATS = process.env.SMTP_SINK_STATS || 'http://127.0.0.1:2526/';
const CRON_SECRET = process.env.CRON_SECRET || '';
const TAG = `bq${Date.now()}`;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });

async function api(pathname, { cookie: ck, method = 'GET', body, headers = {} } = {}) {
  const t0 = Date.now();
  const res = await fetch(BASE + pathname, {
    method,
    headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, json, ms: Date.now() - t0 };
}
const sinkStats = async () => (await fetch(SINK_STATS)).json();

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/api/admin/broadcast'); if (r.status === 401) return; } catch { /* not up */ }
    await sleep(2000);
  }
  throw new Error('server not reachable at ' + BASE);
}

(async () => {
  if (!SECRET) throw new Error('JWT_SECRET is required');
  await waitForServer();
  await fetch(SINK_STATS + 'reset');

  const admin = await prisma.admin.upsert({ where: { username: `${TAG}-admin` }, update: {}, create: { username: `${TAG}-admin`, passwordHash: 'x' } });
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });
  const settings = await prisma.emailSettings.findFirst();
  const savedSettings = { ...settings };
  await prisma.emailSettings.update({ where: { id: settings.id }, data: { enabled: true, host: SINK_HOST, port: SINK_PORT, secure: false, username: '', fromEmail: `noreply@${TAG}.test`, fromName: 'E2E', password: '', adminInboxEmail: `admins@${TAG}.test` } });

  section(`setup: ${N} participants (+1 bouncing address)`);
  const emails = Array.from({ length: N }, (_, i) => `${TAG}-${String(i).padStart(5, '0')}@e2e.test`);
  emails.push(`${TAG}-bounce@e2e.test`);
  const t0 = Date.now();
  await prisma.participant.createMany({ data: emails.map((email, i) => ({ email, fullName: `${TAG} ${i}`, passwordHash: 'x' })), skipDuplicates: true });
  const created = await prisma.participant.count({ where: { email: { startsWith: TAG } } });
  check(`created ${N + 1} participants`, created === N + 1, `${created} in ${Date.now() - t0}ms`);
  const preexisting = await prisma.participant.count() - created;
  if (preexisting > 0) console.log(`      note: ${preexisting} pre-existing participants will also receive the broadcast`);

  section('cron endpoint auth gate');
  let r = await api('/api/cron/drain-email-queue');
  check('no secret -> 401', r.status === 401, String(r.status));
  r = await api('/api/cron/drain-email-queue', { headers: { authorization: 'Bearer wrong' } });
  check('wrong secret -> 401', r.status === 401, String(r.status));
  if (CRON_SECRET) {
    r = await api('/api/cron/drain-email-queue', { headers: { authorization: `Bearer ${CRON_SECRET}` } });
    check('right secret -> 200 with drain result', r.status === 200 && typeof r.json.claimed === 'number', JSON.stringify(r.json));
  } else console.log('      (CRON_SECRET not set for this run; skipping positive check)');

  section('POST broadcast to all participants (dashboard + email)');
  r = await api('/api/admin/broadcast', { cookie: aCookie, method: 'POST', body: { title: `${TAG} title`, body: 'hello from the queue', emailSubject: `${TAG} subject`, channels: ['dashboard', 'email'], audience: { type: 'all-participants' } } });
  check('200 success', r.status === 200 && r.json.success === true, JSON.stringify(r.json).slice(0, 200));
  const b = r.json.broadcast;
  const total = created + preexisting;
  check(`response returned quickly (${r.ms}ms < 5000ms) — sending is NOT in the request`, r.ms < 5000, `${r.ms}ms`);
  check(`queued == ${total}`, r.json.queued === total, String(r.json.queued));
  check('status queued, notifications created', b.status === 'queued' && b.notificationCount === total && b.totalRecipients === total, JSON.stringify({ st: b.status, n: b.notificationCount, t: b.totalRecipients }));

  section('background drain (waitUntil) completes');
  let row = null; const tStart = Date.now();
  for (let i = 0; i < 120; i++) {
    const h = await api('/api/admin/broadcast', { cookie: aCookie });
    row = (h.json.broadcasts || []).find((x) => x.id === b.id);
    if (row && (row.status === 'completed' || row.status === 'partial')) break;
    await sleep(1000);
  }
  const tDrain = Date.now() - tStart;
  check('reached a terminal status', row && (row.status === 'completed' || row.status === 'partial'), row && row.status);
  check('status partial (one bounce)', row && row.status === 'partial', row && row.status);
  check(`sent == ${total - 1}, failed == 1`, row && row.emailSentCount === total - 1 && row.emailFailedCount === 1, row && JSON.stringify({ s: row.emailSentCount, f: row.emailFailedCount }));
  console.log(`      drained ${total} recipients in ~${tDrain}ms via real SMTP (batches of 50)`);

  // The SMTP path addresses each BCC-only message `To:` the sender, so the
  // sink also sees the from-address once per message — count only the
  // addresses this test created.
  const stats = await sinkStats();
  const mine = Object.entries(stats.recipients || {}).filter(([e]) => e.startsWith(TAG.toLowerCase()) || e.includes('@e2e.test'));
  const dupes = mine.filter(([, n]) => n > 1).length;
  check(`SMTP sink received exactly ${total - 1} unique recipients, 0 duplicates`, mine.length === total - 1 && dupes === 0, JSON.stringify({ unique: mine.length, dupes, messages: stats.messages }));
  check('bounce address rejected by the server once', stats.rejected === 1, String(stats.rejected));
  const bounceRow = await prisma.broadcastRecipient.findFirst({ where: { broadcastId: b.id, email: `${TAG}-bounce@e2e.test` } });
  check('bounce row failed permanently, attempts=1', bounceRow && bounceRow.status === 'failed' && bounceRow.attempts === 1 && /rejected by SMTP/.test(bounceRow.error || ''), bounceRow && JSON.stringify({ s: bounceRow.status, a: bounceRow.attempts, e: bounceRow.error }));
  const open = await prisma.broadcastRecipient.count({ where: { broadcastId: b.id, status: { in: ['pending', 'sending'] } } });
  check('no rows left pending/sending', open === 0, String(open));
  const stamped = await prisma.notification.groupBy({ by: ['emailStatus'], where: { relatedEntityId: b.id }, _count: { _all: true } });
  const cnt = (s) => stamped.find((g) => g.emailStatus === s)?._count._all ?? 0;
  check(`notifications stamped: ${total - 1} sent / 1 failed`, cnt('sent') === total - 1 && cnt('failed') === 1, JSON.stringify(stamped));
  const logs = await prisma.emailLog.findMany({ where: { broadcastId: b.id } });
  const logSent = logs.filter((l) => l.status === 'sent').reduce((a, l) => a + l.recipientCount, 0);
  const logFailed = logs.filter((l) => l.status === 'failed').reduce((a, l) => a + l.recipientCount, 0);
  check('EmailLog rows add up to the real numbers', logSent === total - 1 && logFailed === 1, `${logSent}/${logFailed} over ${logs.length} rows`);

  section('retry failed (admin button)');
  r = await api(`/api/admin/broadcast/${b.id}/retry`, { cookie: aCookie, method: 'POST' });
  check('retry -> requeued 1', r.status === 200 && r.json.requeued === 1, JSON.stringify(r.json));
  for (let i = 0; i < 30; i++) { const h = await api('/api/admin/broadcast', { cookie: aCookie }); row = (h.json.broadcasts || []).find((x) => x.id === b.id); if (row.status === 'partial') break; await sleep(1000); }
  check('permanent bounce fails again -> partial, counts unchanged', row.status === 'partial' && row.emailSentCount === total - 1 && row.emailFailedCount === 1, JSON.stringify({ st: row.status, s: row.emailSentCount, f: row.emailFailedCount }));
  r = await api(`/api/admin/broadcast/${b.id}/retry`, { method: 'POST' });
  check('retry without admin cookie -> 401', r.status === 401, String(r.status));

  section('dashboard-only broadcast is terminal immediately');
  r = await api('/api/admin/broadcast', { cookie: aCookie, method: 'POST', body: { title: `${TAG} dash`, body: 'x', channels: ['dashboard'], audience: { type: 'all-admins' } } });
  check('completed, queued 0', r.status === 200 && r.json.queued === 0 && r.json.broadcast.status === 'completed', JSON.stringify(r.json).slice(0, 200));

  section('cleanup');
  await prisma.broadcast.deleteMany({ where: { title: { startsWith: TAG } } }); // cascades to recipients
  await prisma.notification.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.emailLog.deleteMany({ where: { subject: { startsWith: TAG } } });
  await prisma.participant.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.admin.delete({ where: { id: admin.id } });
  delete savedSettings.id; delete savedSettings.updatedAt;
  await prisma.emailSettings.update({ where: { id: settings.id }, data: savedSettings });
  console.log('  cleaned up');

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('CRASH', e); await prisma.$disconnect(); process.exit(1); });
