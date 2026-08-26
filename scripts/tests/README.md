# Test suites

Standalone node scripts, not a framework (none is installed in this repo —
see `mdfiles/09-testing-and-qa.md`). Each script drives real HTTP requests
against a running server and asserts against the actual Postgres database
using Prisma directly. Every script creates its own fixtures and deletes them
in a `finally` block, so the database is unchanged after a run.

## Prerequisites

- The local Docker Postgres running (`miyahthone-postgres`) with all migrations
  applied (`npx prisma migrate deploy`).
- Mailpit running for the email suites (`docker run -d --name miyahthone-mailpit
  -p 1025:1025 -p 8025:8025 axllent/mailpit`).
- A production build served locally — **not** `next dev`. The dev server was
  found to hang under the load these suites generate; every suite here is
  written and verified against `next start`.

```bash
npm run build
npx next start -p 3002
```

## Running

Run everything and get a combined total:

```bash
JWT_SECRET=$(grep '^JWT_SECRET' .env | sed 's/^JWT_SECRET=//' | tr -d '"\r') \
VERIFY_BASE_URL=http://localhost:3002 \
node scripts/tests/run-all.js
```

Or run one suite at a time the same way, substituting the filename.

## What each suite covers

| Suite | Assertions | Scope |
|---|---|---|
| `verify-notifications.js` | 19 | Notification API auth, recipient resolution, IDOR, stats scoping, seed gate |
| `verify-mentor-flows.js` | 15 | Mentor creation/approval notifications, booking cancellation, duplicate suppression |
| `e2e-notifications.js` | 37 | Team registration → approval → event registration → capacity warning → milestone → join requests → booking; cross-role isolation; pagination |
| `e2e-milestone.js` | 15 | Milestone submission + review notifications, duplicate rejection, whole-team notification |
| `e2e-phase1.js` | 24 | SMTP settings CRUD, encryption at rest, test button → Mailpit |
| `e2e-phase2.js` | 21 | Notification template editing, placeholder validation, reset-to-default |
| `e2e-phase3.js` | 30 | Live email delivery per flow, BCC batching, HTML escaping, SMTP-down isolation |
| `e2e-phase4.js` | 26 | Broadcast channel × audience combinations, history |
| `e2e-att-1.js` | 10 | QR badge issuance, format, persistence, role restriction |
| `e2e-att-2.js` | 29 | Attendance scan outcomes, general check-in, stats, undo |
| `e2e-golden-path.js` | 43 | Full user journey through real HTTP, including the actual `/api/login` flow |
| `e2e-admin-auth-fix.js` | 58 | Every previously-open admin route now requires auth; `passwordHash` absent from every response body (`mentors`, `teams`, `update-participant`, `update-team`); ownership logic on `update-participant` |
| `e2e-passwordhash-leak.js` | 34 | Systemic sweep: all 13 routes that could return a Participant/Mentor row are called for real with sentinel-hash fixtures, asserting on **response bodies**; plus feature-behaviour checks (team add/remove, approvals, profile updates) |
| `e2e-login-errors.js` | 25 | Login failure feedback: the API distinguishes wrong-password / account-not-activated / team-not-approved; both login pages are wired to a toaster that is actually mounted and render a persistent inline error |

**Total: 386 assertions.**

## History

These suites were originally written and run from an ephemeral session
scratchpad and never committed — a review from a later session correctly
flagged that the cited "323 assertions" couldn't be found or re-run anywhere
in the repo. They are copied here for exactly that reason: so results are
reproducible by anyone, not just re-describable in a chat transcript.

That same review also caught a real bug the original `e2e-admin-auth-fix.js`
run had missed: `update-participant`'s mass-assignment fix blocked
`passwordHash` from being *written*, but the route still returned the *entire*
updated row — hash included — because the Prisma `update()` call had no
`select`. The suite here includes the assertion that would have caught it
(and now does): checking the response *body*, not just the database, for the
sentinel hash value.

## Broadcast email queue (2026-08-26)

| Script | What | Needs |
|---|---|---|
| `queue-integration.js` | Library-level test of `src/lib/email-queue.ts` with a faked transport: 5,000-recipient drain, partial batches + backoff, max attempts, 4 concurrent drainers (no duplicates), budget release/resume, stale-claim recovery, master switch, retry-failed, de-dup, admin inbox. Compiles the TS via `tsc` on each run. **Wipes Broadcast rows — scratch DB only.** | `DATABASE_URL` (Postgres), `DATABASE_TYPE=postgresql`, `JWT_SECRET` |
| `e2e-broadcast-queue.js` | Real HTTP: creates 5,000 participants, posts a broadcast, asserts the POST returns immediately, waits for the background drain, checks an SMTP sink received every address exactly once, cron auth gate, retry endpoint. Cleans up. | running app (`VERIFY_BASE_URL`), same DB + `JWT_SECRET` as the app, `CRON_SECRET`, an SMTP sink on `SMTP_SINK_HOST:SMTP_SINK_PORT` with a stats endpoint at `SMTP_SINK_STATS` (see `mdfiles/email-queue.md` §6) |
