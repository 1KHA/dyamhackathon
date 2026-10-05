/**
 * Availability slots are ALWAYS SLOT_DURATION_MINUTES (20) long, and every slot
 * is followed by a SLOT_BREAK_MINUTES (5) empty break. Any range a mentor or
 * admin submits — a click-and-drag over two hours, an unaligned 10:07–10:40 —
 * is snapped to the 5-minute grid and cut into slots starting at the range
 * start (10:00–12:00 → 10:00, 10:25, 10:50, 11:15, 11:40), so a single
 * oversized availability row or two back-to-back slots can never be created.
 */
import { prisma } from './prisma';
import { SLOT_BREAK_MINUTES, SLOT_DURATION_MINUTES, SLOT_GRID_MINUTES } from './constants';
import { BOOKABLE_MENTOR_WHERE, getBookingMode } from './organizations';

const GRID_MS = SLOT_GRID_MINUTES * 60_000;
const SLOT_MS = SLOT_DURATION_MINUTES * 60_000;
const BREAK_MS = SLOT_BREAK_MINUTES * 60_000;
/** Longest range accepted in one request (a full working day). */
export const MAX_RANGE_HOURS = 12;

export type SlotWindow = { startTime: Date; endTime: Date };

export type SplitResult =
  | { ok: true; slots: SlotWindow[] }
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
  return { ok: true, slots };
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
 * (see organizationSlots).
 */
export async function createSlotsForMentor(
  mentorId: string,
  startInput: unknown,
  endInput: unknown
): Promise<
  | { ok: true; created: Array<{ id: string; startTime: Date; endTime: Date; mentorId: string }>; skipped: number }
  | { ok: false; error: string }
> {
  const split = splitIntoSlots(startInput, endInput);
  if (!split.ok) return split;

  const rangeStart = split.slots[0].startTime;
  const rangeEnd = split.slots[split.slots.length - 1].endTime;
  const near = {
    startTime: { lt: new Date(rangeEnd.getTime() + BREAK_MS) },
    endTime: { gt: new Date(rangeStart.getTime() - BREAK_MS) },
  };
  const timeFields = { startTime: true, endTime: true } as const;

  const own = await prisma.mentorAvailability.findMany({ where: { mentorId, ...near }, select: timeFields });

  let colleagues: SlotWindow[] = [];
  const mentor = await prisma.mentor.findUnique({ where: { id: mentorId }, select: { organizationId: true } });
  if (mentor?.organizationId && (await getBookingMode()) !== 'individual') {
    colleagues = await prisma.mentorAvailability.findMany({
      where: {
        ...near,
        mentorId: { not: mentorId },
        mentor: { organizationId: mentor.organizationId, ...BOOKABLE_MENTOR_WHERE },
      },
      select: timeFields,
    });
  }

  const fresh = split.slots.filter(
    (s) => !own.some((e) => tooClose(s, e)) && !colleagues.some((e) => tooClose(s, e) && !sameWindow(s, e))
  );

  const created: Array<{ id: string; startTime: Date; endTime: Date; mentorId: string }> = [];
  for (const s of fresh) {
    created.push(
      await prisma.mentorAvailability.create({
        data: { mentorId, startTime: s.startTime, endTime: s.endTime },
        select: { id: true, startTime: true, endTime: true, mentorId: true },
      })
    );
  }
  return { ok: true, created, skipped: split.slots.length - fresh.length };
}
