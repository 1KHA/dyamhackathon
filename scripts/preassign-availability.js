/**
 * One-off: pre-assign the same availability window to every bookable mentor
 * (status 'active', not disabled) — e.g. the Riyadh camp, 6–8 Oct 2026,
 * 13:00–16:00 Riyadh time. Mentors can delete or add slots afterwards from
 * their availability page.
 *
 * Same rule as src/lib/slots.ts (keep the two in sync): 20-minute slots, each
 * followed by a 5-minute break, starting at the window start —
 * 13:00, 13:25, 13:50, 14:15, 14:40, 15:05, 15:30 (last one ends 15:50).
 * A slot is skipped when it overlaps or touches (< 5 min) one of the mentor's
 * existing slots — and, in organization/both booking mode, a colleague's
 * non-identical slot — so re-running never duplicates anything.
 *
 * DRY RUN by default (reads only, writes nothing):
 *   node scripts/preassign-availability.js --from 2026-10-06 --to 2026-10-08 --start 13:00 --end 16:00
 * Create the rows (prints a manifest of every created id for rollback):
 *   ... --apply [--manifest path.json]
 * Leave specific mentors out: --exclude <mentorId>,<mentorId>
 *
 * Uses DATABASE_URL from the environment (nothing is loaded from .env here).
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const SLOT_MIN = 20; // SLOT_DURATION_MINUTES
const BREAK_MIN = 5; // SLOT_BREAK_MINUTES
const MIN = 60_000;
const RIYADH = '+03:00'; // Asia/Riyadh has no DST

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const FROM = arg('from');
const TO = arg('to', FROM);
const START = arg('start', '13:00');
const END = arg('end', '16:00');
const APPLY = process.argv.includes('--apply');
const MANIFEST = arg('manifest');
const EXCLUDE = (arg('exclude', '') || '').split(',').map((x) => x.trim()).filter(Boolean);

if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM || '') || !/^\d{4}-\d{2}-\d{2}$/.test(TO || '') || !/^\d{2}:\d{2}$/.test(START) || !/^\d{2}:\d{2}$/.test(END)) {
  console.error('usage: --from YYYY-MM-DD [--to YYYY-MM-DD] [--start HH:MM] [--end HH:MM] [--apply] [--manifest file]');
  process.exit(2);
}

/** Days FROM..TO inclusive, as YYYY-MM-DD. */
function days() {
  const out = [];
  for (let d = new Date(`${FROM}T00:00:00Z`); d <= new Date(`${TO}T00:00:00Z`); d = new Date(d.getTime() + 864e5)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** The slot windows for one day: 20 min each, 5-min break, inside START..END. */
function slotsForDay(day) {
  const from = new Date(`${day}T${START}:00${RIYADH}`).getTime();
  const to = new Date(`${day}T${END}:00${RIYADH}`).getTime();
  const slots = [];
  for (let t = from; t + SLOT_MIN * MIN <= to; t += (SLOT_MIN + BREAK_MIN) * MIN) {
    slots.push({ startTime: new Date(t), endTime: new Date(t + SLOT_MIN * MIN) });
  }
  return slots;
}

const tooClose = (a, b) =>
  a.startTime.getTime() < b.endTime.getTime() + BREAK_MIN * MIN && b.startTime.getTime() < a.endTime.getTime() + BREAK_MIN * MIN;
const sameWindow = (a, b) => a.startTime.getTime() === b.startTime.getTime() && a.endTime.getTime() === b.endTime.getTime();
const riyadh = (d) => new Date(d.getTime() + 3 * 3600e3).toISOString().slice(11, 16);

async function main() {
  const prisma = new PrismaClient();
  try {
    const candidates = days().flatMap(slotsForDay);
    if (candidates.length === 0) throw new Error('the window is shorter than one slot');
    if (candidates[0].startTime < new Date()) throw new Error('the first slot is in the past');
    const first = candidates[0].startTime;
    const last = candidates[candidates.length - 1].endTime;
    const near = { startTime: { lt: new Date(last.getTime() + BREAK_MIN * MIN) }, endTime: { gt: new Date(first.getTime() - BREAK_MIN * MIN) } };

    const settings = await prisma.teamSettings.findFirst();
    const mode = settings?.mentorBookingMode || 'individual';
    const mentors = await prisma.mentor.findMany({
      where: { status: 'active', isDisabled: false, id: { notIn: EXCLUDE } },
      select: { id: true, name: true, organizationId: true, organization: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    const excluded = await prisma.mentor.groupBy({
      by: ['status', 'isDisabled'],
      where: { NOT: { status: 'active', isDisabled: false } },
      _count: true,
    });
    const existing = await prisma.mentorAvailability.findMany({
      where: { ...near, mentor: { status: 'active', isDisabled: false } },
      select: { mentorId: true, startTime: true, endTime: true, mentor: { select: { organizationId: true } } },
    });

    const plan = [];
    const report = [];
    for (const m of mentors) {
      const own = existing.filter((e) => e.mentorId === m.id);
      const colleagues = m.organizationId && mode !== 'individual'
        ? existing.filter((e) => e.mentorId !== m.id && e.mentor.organizationId === m.organizationId)
        : [];
      const fresh = candidates.filter(
        (s) => !own.some((e) => tooClose(s, e)) && !colleagues.some((e) => tooClose(s, e) && !sameWindow(s, e))
      );
      fresh.forEach((s) => plan.push({ mentorId: m.id, startTime: s.startTime, endTime: s.endTime }));
      report.push({ name: m.name, org: m.organization?.name || '—', create: fresh.length, skip: candidates.length - fresh.length, existingInWindow: own.length });
    }

    console.log(`Database: ${new URL(process.env.DATABASE_URL).host}`);
    console.log(`Booking mode: ${mode}`);
    console.log(`Days: ${days().join(', ')}  window ${START}–${END} Riyadh`);
    console.log(`Slots per day: ${slotsForDay(FROM).map((s) => `${riyadh(s.startTime)}–${riyadh(s.endTime)}`).join('  ')}`);
    console.log(`Bookable mentors: ${mentors.length}  (excluded: ${excluded.map((e) => `${e.status}${e.isDisabled ? '/disabled' : ''}=${e._count}`).join(', ') || 'none'})`);
    if (EXCLUDE.length) {
      const left = await prisma.mentor.findMany({ where: { id: { in: EXCLUDE } }, select: { name: true } });
      console.log(`Left out by --exclude (${left.length}/${EXCLUDE.length} found): ${left.map((m) => m.name).join('، ')}`);
    }
    console.log(`Slots to create: ${plan.length}  (max ${mentors.length * candidates.length})`);
    console.table(report);

    if (!APPLY) {
      console.log('\nDRY RUN — nothing was written. Re-run with --apply to create the slots.');
      return;
    }
    const created = await prisma.mentorAvailability.createManyAndReturn({
      data: plan,
      select: { id: true, mentorId: true, startTime: true, endTime: true },
    });
    console.log(`\nCreated ${created.length} slots.`);
    if (MANIFEST) {
      fs.writeFileSync(MANIFEST, JSON.stringify({ createdAt: new Date().toISOString(), from: FROM, to: TO, start: START, end: END, rows: created }, null, 2));
      console.log(`Manifest (ids for rollback): ${MANIFEST}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
