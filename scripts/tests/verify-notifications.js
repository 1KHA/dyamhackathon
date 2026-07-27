/**
 * Throwaway verification script for the notification fixes.
 *
 * Creates two clearly-marked temporary Notification rows, exercises the API
 * against them, then deletes them in a finally block. It never mutates any
 * pre-existing row.
 */
const path = require('path');
const REPO = '/Users/kha/Documents/Code/dyam_hackathon/dhwmk_alvira';

require(path.join(REPO, 'scripts/load-env.js')).loadEnv();

const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const STAMP = 'verify-' + process.pid;
const VICTIM = `${STAMP}-victim`;
const ATTACKER = `${STAMP}-attacker`;

let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ' -> ' + detail : ''}`);
  }
}

function cookieFor(claims) {
  return 'token=' + jwt.sign(claims, SECRET, { expiresIn: '10m' });
}

async function api(pathname, { cookie, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function main() {
  if (!SECRET) throw new Error('JWT_SECRET not loaded from .env');

  // ---- fixtures -----------------------------------------------------------
  const victimNotif = await prisma.notification.create({
    data: {
      title: 'TEMP victim', message: 'temp', type: 'info',
      recipientType: 'participant', recipientId: VICTIM,
    },
  });
  const attackerNotif = await prisma.notification.create({
    data: {
      title: 'TEMP attacker', message: 'temp', type: 'info',
      recipientType: 'participant', recipientId: ATTACKER,
    },
  });

  const attackerCookie = cookieFor({ id: ATTACKER, participantId: ATTACKER, role: 'participant' });

  // ---- 1. admin token now resolves (the 400 bug) --------------------------
  const admin = await prisma.admin.findFirst({ select: { id: true, username: true } });
  if (!admin) throw new Error('no admin rows to test against');

  // real admin token shape: { id, username, role } — NO adminId
  const adminCookie = cookieFor({ id: admin.id, username: admin.username, role: 'admin' });
  const adminRes = await api('/api/notifications?limit=5', { cookie: adminCookie });
  check('GET /api/notifications as admin returns 200 (was 400)',
    adminRes.status === 200, `status=${adminRes.status} body=${JSON.stringify(adminRes.json)}`);
  check('  admin response has notifications + unreadCount',
    adminRes.json && Array.isArray(adminRes.json.notifications) && typeof adminRes.json.unreadCount === 'number');

  // ---- 2. participant + mentor still work (no regression) -----------------
  const partRes = await api('/api/notifications?limit=5', { cookie: attackerCookie });
  check('GET /api/notifications as participant still 200', partRes.status === 200, `status=${partRes.status}`);
  check('  participant sees only their own row',
    partRes.json.notifications.length === 1 && partRes.json.notifications[0].id === attackerNotif.id);

  const mentor = await prisma.mentor.findFirst({ select: { id: true } });
  if (mentor) {
    const mentorCookie = cookieFor({ id: mentor.id, mentorId: mentor.id, role: 'mentor' });
    const mentorRes = await api('/api/notifications?limit=5', { cookie: mentorCookie });
    check('GET /api/notifications as mentor still 200', mentorRes.status === 200, `status=${mentorRes.status}`);
  } else {
    console.log('  SKIP  mentor check (no mentor rows)');
  }

  const noAuth = await api('/api/notifications');
  check('GET /api/notifications with no cookie -> 401', noAuth.status === 401, `status=${noAuth.status}`);

  // ---- 3. the IDOR ---------------------------------------------------------
  const idor = await api('/api/notifications/mark-read', {
    cookie: attackerCookie, method: 'POST', body: { notificationId: victimNotif.id },
  });
  check('mark-read on a foreign id returns success (silent no-op)',
    idor.status === 200 && idor.json && idor.json.success === true,
    `status=${idor.status} body=${JSON.stringify(idor.json)}`);

  const victimAfter = await prisma.notification.findUnique({ where: { id: victimNotif.id } });
  check("  victim's notification is STILL UNREAD (IDOR closed)",
    victimAfter.isRead === false, `isRead=${victimAfter.isRead}`);

  const own = await api('/api/notifications/mark-read', {
    cookie: attackerCookie, method: 'POST', body: { notificationId: attackerNotif.id },
  });
  const attackerAfter = await prisma.notification.findUnique({ where: { id: attackerNotif.id } });
  check('marking your OWN notification read still works',
    own.status === 200 && attackerAfter.isRead === true, `isRead=${attackerAfter.isRead}`);

  // mark-all-read must not touch the victim either
  await api('/api/notifications/mark-all-read', { cookie: attackerCookie, method: 'POST' });
  const victimAfterAll = await prisma.notification.findUnique({ where: { id: victimNotif.id } });
  check('mark-all-read does not touch other recipients',
    victimAfterAll.isRead === false, `isRead=${victimAfterAll.isRead}`);

  // ---- 4. stats route auth + scoping ---------------------------------------
  const statsNoAuth = await api('/api/admin/dashboard/stats');
  check('GET /api/admin/dashboard/stats with no cookie -> 401',
    statsNoAuth.status === 401, `status=${statsNoAuth.status}`);

  const statsAuthed = await api('/api/admin/dashboard/stats', { cookie: adminCookie });
  check('GET /api/admin/dashboard/stats as admin -> 200',
    statsAuthed.status === 200, `status=${statsAuthed.status}`);
  if (statsAuthed.status === 200) {
    const recents = statsAuthed.json.recentNotifications || [];
    check('  recentNotifications are all admin-scoped to this admin',
      recents.every(n => n.recipientType === 'admin' && n.recipientId === admin.id),
      JSON.stringify(recents.map(n => ({ t: n.recipientType, id: n.recipientId }))));
    check('  other stats fields still present (shape unchanged)',
      typeof statsAuthed.json.totalParticipants === 'number' &&
      Array.isArray(statsAuthed.json.upcomingEventsList));
  }

  const statsAsParticipant = await api('/api/admin/dashboard/stats', { cookie: attackerCookie });
  check('GET /api/admin/dashboard/stats as participant -> 401',
    statsAsParticipant.status === 401, `status=${statsAsParticipant.status}`);

  // ---- 5. seed endpoint gate ----------------------------------------------
  const seedNoAuth = await api('/api/seed-notifications', { method: 'POST' });
  check('POST /api/seed-notifications with no cookie -> 401/403',
    seedNoAuth.status === 401 || seedNoAuth.status === 403, `status=${seedNoAuth.status}`);

  const seedAsParticipant = await api('/api/seed-notifications', { method: 'POST', cookie: attackerCookie });
  check('POST /api/seed-notifications as participant -> 401/403',
    seedAsParticipant.status === 401 || seedAsParticipant.status === 403, `status=${seedAsParticipant.status}`);

  // ---- 6. the notifications pages render ----------------------------------
  for (const p of [
    '/admin-hackton-dashboard/notifications',
    '/participant-dashboard/notifications',
    '/mentor-dashboard/notifications',
  ]) {
    const res = await fetch(BASE + p);
    check(`page ${p} responds 200`, res.status === 200, `status=${res.status}`);
  }
}

main()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.message); })
  .finally(async () => {
    const removed = await prisma.notification.deleteMany({
      where: { recipientId: { in: [VICTIM, ATTACKER] } },
    });
    console.log(`\ncleaned up ${removed.count} temporary rows`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
