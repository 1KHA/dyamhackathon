/**
 * LOCAL DEMO ONLY — give every demo participant random mentor sessions so the
 * organizer scan / bookings board can be tested at any time of the day.
 * Refuses to run unless DATABASE_URL points at localhost / 127.0.0.1.
 *
 *   DATABASE_URL=postgresql://…@127.0.0.1:5442/… node scripts/seed-local-demo-bookings.js
 *
 * 1. Adds 20-min slots (5-min break after each) for every demo mentor:
 *    today 08:00–22:00 and tomorrow 09:00–17:00 (Riyadh), skipping clashes.
 * 2. Books each demo participant into 2–3 random sessions with different
 *    mentors (some through the organization): never the same slot twice,
 *    never two sessions at once for one person or one team. A few sessions are
 *    placed in slots running now / next so the board has something on top.
 * Existing bookings and scans are kept.
 */
const { PrismaClient } = require('@prisma/client');

const url = process.env.DATABASE_URL || '';
const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
if (!['localhost', '127.0.0.1'].includes(host)) {
  console.error(`Refusing: DATABASE_URL host is "${host || 'unset'}" — local databases only.`);
  process.exit(1);
}

const prisma = new PrismaClient();
const MIN = 60_000;
const SLOT = 20 * MIN;
const BREAK = 5 * MIN;
const riyadhDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const at = (day, hm) => new Date(`${day}T${hm}:00+03:00`);
const fmt = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const overlaps = (a, b) => a.startTime < b.endTime && b.startTime < a.endTime;
const tooClose = (a, b) => a.startTime.getTime() < b.endTime.getTime() + BREAK && b.startTime.getTime() < a.endTime.getTime() + BREAK;

async function main() {
  const now = new Date();
  const today = riyadhDay(now);
  const tomorrow = riyadhDay(new Date(now.getTime() + 24 * 3600_000));

  const mentors = await prisma.mentor.findMany({ where: { email: { endsWith: '@demo.local' }, status: 'active' }, select: { id: true, name: true, organizationId: true } });
  const participants = await prisma.participant.findMany({
    where: { email: { endsWith: '@demo.local' } },
    select: { id: true, fullName: true, email: true, teamId: true },
    orderBy: { email: 'asc' },
  });
  if (!mentors.length || !participants.length) throw new Error('run scripts/seed-local-demo.js first');

  // ---- 1. slots ------------------------------------------------------------
  let added = 0;
  for (const m of mentors) {
    const existing = await prisma.mentorAvailability.findMany({ where: { mentorId: m.id }, select: { startTime: true, endTime: true } });
    for (const [day, from, to] of [[today, '08:00', '22:00'], [tomorrow, '09:00', '17:00']]) {
      for (let t = at(day, from).getTime(); t + SLOT <= at(day, to).getTime(); t += SLOT + BREAK) {
        const w = { startTime: new Date(t), endTime: new Date(t + SLOT) };
        if (existing.some((e) => tooClose(w, e))) continue;
        await prisma.mentorAvailability.create({ data: { mentorId: m.id, ...w } });
        existing.push(w);
        added++;
      }
    }
  }

  // ---- 2. bookings ---------------------------------------------------------
  const free = await prisma.mentorAvailability.findMany({
    where: { mentorId: { in: mentors.map((m) => m.id) }, endTime: { gt: new Date(now.getTime() - 3 * 3600_000) }, bookings: { none: { status: { not: 'cancelled' } } } },
    select: { id: true, mentorId: true, startTime: true, endTime: true },
    orderBy: { startTime: 'asc' },
  });
  const live = await prisma.mentorBooking.findMany({
    where: { status: { not: 'cancelled' }, participantId: { in: participants.map((p) => p.id) } },
    select: { participantId: true, availability: { select: { mentorId: true, startTime: true, endTime: true } } },
  });
  const teamOf = new Map(participants.map((p) => [p.id, p.teamId ?? `solo:${p.id}`]));
  const busyByGroup = new Map(); // team (or solo person) -> windows already booked
  const mentorsByPerson = new Map();
  for (const b of live) {
    const g = teamOf.get(b.participantId);
    busyByGroup.set(g, [...(busyByGroup.get(g) ?? []), b.availability]);
    mentorsByPerson.set(b.participantId, new Set([...(mentorsByPerson.get(b.participantId) ?? []), b.availability.mentorId]));
  }

  const used = new Set();
  const nowish = free.filter((s) => s.endTime > now && s.startTime.getTime() < now.getTime() + 60 * MIN); // running now / next hour
  const pick = (pool, person) => {
    const g = teamOf.get(person.id);
    const busy = busyByGroup.get(g) ?? [];
    const had = mentorsByPerson.get(person.id) ?? new Set();
    return shuffle([...pool]).find((s) => !used.has(s.id) && !had.has(s.mentorId) && !busy.some((w) => overlaps(w, s)));
  };

  const created = [];
  const order = shuffle([...participants]);
  for (const [i, person] of order.entries()) {
    const want = 2 + Math.floor(Math.random() * 2); // 2 or 3 sessions each
    for (let k = 0; k < want; k++) {
      // the first session of the first few people goes into a slot running now / next
      const pool = k === 0 && i < 6 && nowish.length ? nowish : free;
      const s = pick(pool, person) ?? pick(free, person);
      if (!s) break;
      const mentor = mentors.find((m) => m.id === s.mentorId);
      const viaOrg = mentor.organizationId && Math.random() < 0.6 ? mentor.organizationId : null;
      await prisma.mentorBooking.create({ data: { participantId: person.id, availabilityId: s.id, status: 'booked', organizationId: viaOrg } });
      used.add(s.id);
      const g = teamOf.get(person.id);
      busyByGroup.set(g, [...(busyByGroup.get(g) ?? []), s]);
      mentorsByPerson.set(person.id, new Set([...(mentorsByPerson.get(person.id) ?? []), s.mentorId]));
      created.push({ person, s, mentor, viaOrg: !!viaOrg });
    }
  }

  // ---- summary ---------------------------------------------------------------
  console.log(`slots added: ${added} · bookings created: ${created.length} · people booked: ${new Set(created.map((c) => c.person.id)).size}/${participants.length}`);
  const byPerson = new Map();
  for (const c of created.sort((a, b) => a.s.startTime - b.s.startTime)) {
    byPerson.set(c.person.email, [...(byPerson.get(c.person.email) ?? []), `${fmt(c.s.startTime)} ${c.mentor.name}${c.viaOrg ? ' (جهة)' : ''}`]);
  }
  for (const p of participants) console.log(`${p.email.padEnd(19)} ${p.fullName.padEnd(18)} ${(byPerson.get(p.email) ?? []).join(' | ')}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
