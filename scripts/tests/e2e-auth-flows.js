/**
 * Login / guard / logout behaviour across all three roles.
 *
 * Two bugs motivated this suite:
 *
 *  1. The mentor TopBar's "logout" was `window.location.href = "/"` with no
 *     /api/logout call. The session cookie survived, so `/` → `/login` saw a
 *     valid mentor session and redirected straight back into the mentor
 *     dashboard — "it spins and re-enters the dashboard".
 *
 *  2. All three route guards kept `redirectAttempts` in React state, used it
 *     as a useEffect dependency, AND reset it to 0 at the top of every run.
 *     The ">2 attempts" circuit breaker could therefore never trip: each
 *     failed check re-triggered the effect forever, hammering /api/<role>/me
 *     and /api/logout — "it keeps spinning".
 *
 * Guard internals are React-side and can't be driven headlessly, so this
 * asserts the API contracts they depend on, plus the source-level invariants
 * that keep the loop closed.
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '../..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const bcrypt = require(path.join(REPO, 'node_modules/bcryptjs'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `auth${Date.now()}`;
const PASSWORD = 'AuthFlow!2026';

let pass = 0, fail = 0;
const made = { participants: [], teams: [], mentors: [] };

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
    redirect: 'manual',
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
}
const cookieFrom = (setCookie) => {
  const m = setCookie && setCookie.match(/token=([^;]+)/);
  return m ? `token=${m[1]}` : null;
};

/** Strip comments so assertions test CODE, not explanatory prose that may
 *  legitimately quote the old buggy line. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Source-level checks — no DB or server needed, so they run anywhere. */
function sourceInvariants() {
  const guardPath = (g) => path.join(REPO, `src/components/auth/${g}RouteGuard.tsx`);
  if (!fs.existsSync(guardPath('Mentor'))) {
    console.log('\n  SKIP  source invariants (running without repo sources, e.g. inside the app container)');
    return;
  }

  section('A. guard source invariants (the infinite-loop fix)');
  for (const g of ['Mentor', 'Participant', 'Admin']) {
    const src = stripComments(fs.readFileSync(guardPath(g), 'utf8'));
    const deps = (src.match(/\}, \[[^\]]*\]\);/) || [''])[0];

    check(`${g}RouteGuard: attempt counter is a ref, not state`,
      /redirectAttemptsRef\s*=\s*useRef\(0\)/.test(src) && !/setRedirectAttempts/.test(src));
    check(`  ${g}: counter is NOT a useEffect dependency`, !/redirectAttempts/.test(deps), deps);
    check(`  ${g}: counter reset only on success, not at the top of every run`,
      !/if \(pathname !== '\/(admin-)?login'\) \{\s*setRedirectAttempts/.test(src) &&
      /redirectAttemptsRef\.current = 0/.test(src));
    check(`  ${g}: cleanup guards against post-unmount setState`,
      /let cancelled = false/.test(src) && /cancelled = true/.test(src));
  }

  const pGuard = stripComments(fs.readFileSync(guardPath('Participant'), 'utf8'));
  check('ParticipantRouteGuard: unmemoized `logout` no longer a dependency',
    !/logout/.test(pGuard), 'logout was destructured-but-unused and changed identity every render');

  section('B. mentor logout is wired to the auth context');
  const topbar = stripComments(fs.readFileSync(path.join(REPO, 'components/mentor/TopBar.tsx'), 'utf8'));
  check('mentor TopBar no longer fakes logout with window.location',
    !/const handleLogout[^}]*window\.location\.href/s.test(topbar));
  check('  it calls the auth-context logout (which hits /api/logout)',
    /useAuth\(\)/.test(topbar) && /await logout\(\)/.test(topbar));

  const partTopbar = stripComments(fs.readFileSync(path.join(REPO, 'components/participant/TopBar.tsx'), 'utf8'));
  check('  participant TopBar still uses the same pattern (unchanged)',
    /await logout\(\)/.test(partTopbar));
}

async function main() {
  sourceInvariants();

  // Everything below needs both the DB and a running server.
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
  } catch {
    console.log('\n  SKIP  runtime checks — database unreachable from here.');
    console.log('        Run inside the app container, or against a host-exposed DB.');
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  const admin = await prisma.admin.findFirst({ select: { id: true, username: true } });

  const team = await prisma.team.create({ data: { teamName: `${TAG} فريق`, status: 'approved', isTeamRegistration: true } });
  made.teams.push(team.id);
  const participant = await prisma.participant.create({
    data: { email: `${TAG}-p@t.test`, fullName: 'مشارك', teamId: team.id, status: 'approved', passwordHash: hash },
  });
  made.participants.push(participant.id);
  const mentor = await prisma.mentor.create({
    data: { name: `${TAG} مرشد`, email: `${TAG}-m@t.test`, specialty: 'س', phone: '05', status: 'active', passwordHash: hash },
  });
  made.mentors.push(mentor.id);

  // ============ 1. each role can log in ============
  section('1. login issues a usable session for every role');

  const pLogin = await req('/api/login', { method: 'POST', body: { email: participant.email, password: PASSWORD } });
  check('participant logs in', pLogin.status === 200 && pLogin.json?.success, `status=${pLogin.status}`);
  const pCookie = cookieFrom(pLogin.setCookie);
  check('  httpOnly cookie set', !!pCookie && /httponly/i.test(pLogin.setCookie || ''));

  const mLogin = await req('/api/login', { method: 'POST', body: { email: mentor.email, password: PASSWORD } });
  check('mentor logs in (same endpoint as participant)', mLogin.status === 200 && mLogin.json?.success, `status=${mLogin.status}`);
  const mCookie = cookieFrom(mLogin.setCookie);
  check('  httpOnly cookie set', !!mCookie && /httponly/i.test(mLogin.setCookie || ''));
  check('  role is mentor', mLogin.json?.user?.role === 'mentor', JSON.stringify(mLogin.json?.user));

  const aCookie = 'token=' + jwt.sign({ id: admin.id, username: admin.username, role: 'admin' }, SECRET, { expiresIn: '30m' });

  // ============ 2. the endpoint each guard polls ============
  section('2. guard endpoints answer correctly (what drives the spinner)');

  const mMe = await req('/api/mentor/me', { cookie: mCookie });
  check('mentor: /api/mentor/me -> 200', mMe.status === 200, `status=${mMe.status}`);
  check('  shape the guard checks: success && role === "mentor"',
    mMe.json?.success === true && mMe.json?.role === 'mentor', JSON.stringify(mMe.json));

  const pMe = await req('/api/participant/me', { cookie: pCookie });
  check('participant: /api/participant/me -> 200', pMe.status === 200);
  check('  guard-visible role', pMe.json?.role === 'participant' || !!pMe.json?.id);

  const aMe = await req('/api/admin/me', { cookie: aCookie });
  check('admin: /api/admin/me -> 200', aMe.status === 200);
  check('  shape the guard checks: success && role === "admin"',
    aMe.json?.success === true && aMe.json?.role === 'admin');

  // ============ 3. cross-role rejection — the loop trigger ============
  section('3. wrong-role access is rejected cleanly (this is what used to loop)');
  check('participant hitting /api/mentor/me -> rejected',
    [401, 403].includes((await req('/api/mentor/me', { cookie: pCookie })).status));
  check('mentor hitting /api/participant/me -> rejected',
    [401, 403].includes((await req('/api/participant/me', { cookie: mCookie })).status));
  check('mentor hitting /api/admin/me -> rejected',
    [401, 403].includes((await req('/api/admin/me', { cookie: mCookie })).status));
  check('no cookie at all -> 401 on every guard endpoint',
    (await req('/api/mentor/me')).status === 401 &&
    (await req('/api/participant/me')).status === 401 &&
    (await req('/api/admin/me')).status === 401);

  // ============ 4. logout actually ends the session ============
  section('4. logout genuinely invalidates the session (the mentor bug)');

  const mLogout = await req('/api/logout', { method: 'POST', cookie: mCookie });
  check('mentor logout responds 200', mLogout.status === 200, `status=${mLogout.status}`);
  check('  response expires the token cookie',
    !!mLogout.setCookie && /token=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(mLogout.setCookie),
    mLogout.setCookie);
  check('  legacy auth-token cookie cleared too',
    !!mLogout.setCookie && mLogout.setCookie.includes('auth-token'));

  const pLogout = await req('/api/logout', { method: 'POST', cookie: pCookie });
  check('participant logout responds 200 + expires cookie',
    pLogout.status === 200 && /token=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(pLogout.setCookie || ''));

  // ============ 5. pages still render ============
  section('5. pages render');
  for (const p of ['/login', '/admin-login', '/mentor-dashboard', '/participant-dashboard']) {
    check(`page ${p} -> 200`, (await fetch(BASE + p)).status === 200);
  }
}

main()
  .catch((e) => { fail++; console.error('SCRIPT ERROR:', e.stack); })
  .finally(async () => {
    // nothing to clean if we never reached the DB
    if (!made.participants.length && !made.teams.length && !made.mentors.length) {
      console.log(`\n${pass} passed, ${fail} failed`);
      await prisma.$disconnect().catch(() => {});
      process.exit(fail === 0 ? 0 : 1);
    }
    section('cleanup');
    await prisma.notification.deleteMany({ where: { recipientId: { in: [...made.participants, ...made.mentors] } } });
    await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
    await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
    await prisma.mentor.deleteMany({ where: { id: { in: made.mentors } } });
    console.log(`  DB — participants: ${await prisma.participant.count()}, mentors: ${await prisma.mentor.count()}`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
