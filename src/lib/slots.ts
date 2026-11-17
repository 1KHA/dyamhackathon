/**
 * Availability slots are ALWAYS SLOT_DURATION_MINUTES (20) long, and every slot
 * is followed by a SLOT_BREAK_MINUTES (5) empty break. Any range a mentor or
 * admin submits — a click-and-drag over two hours, an unaligned 10:07–10:40 —
 * is snapped to the 5-minute grid and cut into slots starting at the range
 * start (10:00–12:00 → 10:00, 10:25, 10:50, 11:15, 11:40), so a single
 * oversized availability row or two back-to-back slots can never be created.
 *
 * Organization members (booking mode organization/both) follow the
 * organization's rhythm instead: when colleagues already have slots that day,
 * a new range is cut on the SAME start times (e.g. their 14:10, 14:35, 15:00 …),
 * so the slots merge into the organization's ones instead of being skipped as
 * "too close" — a 14:30–16:30 range becomes 14:35, 15:00, 15:25, 15:50.
 */
import { prisma } from './prisma';
import { SLOT_BREAK_MINUTES, SLOT_DURATION_MINUTES, SLOT_GRID_MINUTES } from './constants';
import { BOOKABLE_MENTOR_WHERE, getBookingMode } from './organizations';

const GRID_MS = SLOT_GRID_MINUTES * 60_000;
const SLOT_MS = SLOT_DURATION_MINUTES * 60_000;
const BREAK_MS = SLOT_BREAK_MINUTES * 60_000;
/** One slot plus its break: the rhythm every mentor's day is cut on. */
const CYCLE_MS = SLOT_MS + BREAK_MS;
/** How far around a range colleagues' slots set the organization's rhythm. */
const RHYTHM_WINDOW_MS = 6 * 3600_000;
const mod = (n: number, m: number) => ((n % m) + m) % m;
/** Longest range accepted in one request (a full working day). */
export const MAX_RANGE_HOURS = 12;

export type SlotWindow = { startTime: Date; endTime: Date };

export type SplitResult =
  | { ok: true; slots: SlotWindow[]; from: number; to: number }
  | { ok: false; error: string };

/** Floor the start / ceil the end to the grid, then cut into slot + break cycles. */
export function splitIntoSlots(startInput: unknown, endInput: unknown): SplitResult {
  const start = new Date(String(startInput));
  const end = new Date(String(endInput));
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { ok: false, error: 'صيغة الوقت غير صالحة' };
  }
  const from = Math.floor(start.getTime() / GRID_MS) * GRID_MS;
  const rangeEnd = Math.ceil(end.getTime() / GRID_MS) * GRID_MS;
  if (rangeEnd <= from) {
    return { ok: false, error: 'وقت النهاية يجب أن يكون بعد وقت البداية' };
  }
  if (rangeEnd - from > MAX_RANGE_HOURS * 3600_000) {
    return { ok: false, error: `لا يمكن إضافة أكثر من ${MAX_RANGE_HOURS} ساعة في المرة الواحدة` };
  }
  // A click (or a range shorter than one slot) still yields one full slot.
  const to = Math.max(rangeEnd, from + SLOT_MS);
  const slots: SlotWindow[] = [];
  for (let t = from; t + SLOT_MS <= to; t += SLOT_MS + BREAK_MS) {
    slots.push({ startTime: new Date(t), endTime: new Date(t + SLOT_MS) });
  }
  return { ok: true, slots, from, to };
}

/**
 * Cut [from, to] on a rhythm: slot starts ≡ phase (mod slot + break). A range
 * too short for any rhythm slot (a click) gets the rhythm slot containing
 * `from`, else the next one.
 */
export function splitOnPhase(from: number, to: number, phase: number): SlotWindow[] {
  let t = from + mod(phase - from, CYCLE_MS); // first rhythm start at or after `from`
  const first = t;
  const slots: SlotWindow[] = [];
  for (; t + SLOT_MS <= to; t += CYCLE_MS) slots.push({ startTime: new Date(t), endTime: new Date(t + SLOT_MS) });
  if (slots.length === 0) {
    const s = from < first - CYCLE_MS + SLOT_MS ? first - CYCLE_MS : first;
    slots.push({ startTime: new Date(s), endTime: new Date(s + SLOT_MS) });
  }
  return slots;
}

/**
 * The organization's rhythm near `at`: the start offset most of the colleagues'
 * slots share (ties: the one closest to `at`). Null when there are none.
 */
function organizationPhase(colleagues: SlotWindow[], at: number): number | null {
  const byPhase = new Map<number, { n: number; dist: number }>();
  for (const c of colleagues) {
    const p = mod(c.startTime.getTime(), CYCLE_MS);
    const dist = Math.abs(c.startTime.getTime() - at);
    const cur = byPhase.get(p);
    byPhase.set(p, cur ? { n: cur.n + 1, dist: Math.min(cur.dist, dist) } : { n: 1, dist });
  }
  const best = Array.from(byPhase.entries()).sort((a, b) => b[1].n - a[1].n || a[1].dist - b[1].dist)[0];
  return best ? best[0] : null;
}

/** Two windows clash when they overlap or leave less than the break between them. */
const tooClose = (a: SlotWindow, b: SlotWindow) =>
  a.startTime.getTime() < b.endTime.getTime() + BREAK_MS &&
  b.startTime.getTime() < a.endTime.getTime() + BREAK_MS;

const sameWindow = (a: SlotWindow, b: SlotWindow) =>
  a.startTime.getTime() === b.startTime.getTime() && a.endTime.getTime() === b.endTime.getTime();

/**
 * Create the slot rows for a range. A slot is skipped when it overlaps one of
 * the mentor's existing slots or sits closer than the break to it (dragging
 * over existing slots never duplicates them or packs them back-to-back).
 *
 * When participants book organizations (mode organization/both), a member's
 * slot is the whole organization's slot, so colleagues' slots keep the break
 * too — except the exact same window, which merges into one organization slot
 * (see organizationSlots). So the range is first re-cut on the organization's
 * rhythm (alignedToOrganization), and what still clashes is skipped.
 */
export async function createSlotsForMentor(
  mentorId: string,
  startInput: unknown,
  endInput: unknown
): Promise<
  | {
      ok: true;
      created: Array<{ id: string; startTime: Date; endTime: Date; mentorId: string }>;
      skipped: number;
      /** skipped because of the mentor's own slots / a colleague's (organization) slots */
      skippedOwn: number;
      skippedOrganization: number;
      /** the range was re-cut on the organization's start times */
      alignedToOrganization: boolean;
    }
  | { ok: false; error: string }
> {
  const split = splitIntoSlots(startInput, endInput);
  if (!split.ok) return split;
  const timeFields = { startTime: true, endTime: true } as const;

  // organization members: colleagues' slots that day set the rhythm
  let colleagues: SlotWindow[] = [];
  let slots = split.slots;
  let alignedToOrganization = false;
  const mentor = await prisma.mentor.findUnique({ where: { id: mentorId }, select: { organizationId: true } });
  if (mentor?.organizationId && (await getBookingMode()) !== 'individual') {
    colleagues = await prisma.mentorAvailability.findMany({
      where: {
        startTime: { lt: new Date(split.to + RHYTHM_WINDOW_MS) },
        endTime: { gt: new Date(split.from - RHYTHM_WINDOW_MS) },
        mentorId: { not: mentorId },
        mentor: { organizationId: mentor.organizationId, ...BOOKABLE_MENTOR_WHERE },
      },
      select: timeFields,
    });
    const phase = organizationPhase(colleagues, split.from);
    if (phase !== null && phase !== mod(split.from, CYCLE_MS)) {
      slots = splitOnPhase(split.from, split.to, phase);
      alignedToOrganization = true;
    }
  }

  const rangeStart = slots[0].startTime;
  const rangeEnd = slots[slots.length - 1].endTime;
  const near = {
    startTime: { lt: new Date(rangeEnd.getTime() + BREAK_MS) },
    endTime: { gt: new Date(rangeStart.getTime() - BREAK_MS) },
  };
  const own = await prisma.mentorAvailability.findMany({ where: { mentorId, ...near }, select: timeFields });

  let skippedOwn = 0;
  let skippedOrganization = 0;
  const fresh = slots.filter((s) => {
    if (own.some((e) => tooClose(s, e))) return (skippedOwn++, false);
    if (colleagues.some((e) => tooClose(s, e) && !sameWindow(s, e))) return (skippedOrganization++, false);
    return true;
  });

  const created: Array<{ id: string; startTime: Date; endTime: Date; mentorId: string }> = [];
  for (const s of fresh) {
    created.push(
      await prisma.mentorAvailability.create({
        data: { mentorId, startTime: s.startTime, endTime: s.endTime },
        select: { id: true, startTime: true, endTime: true, mentorId: true },
      })
    );
  }
  return { ok: true, created, skipped: skippedOwn + skippedOrganization, skippedOwn, skippedOrganization, alignedToOrganization };
}
