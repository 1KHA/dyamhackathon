import { prisma } from '@/lib/prisma';
import { riyadhToday } from '@/lib/badge-dates';
import { checkInGeneral, notifyAttendance } from '@/lib/general-checkin';

/**
 * Entry / exit scanning — any number of check-ins AND check-outs per day, for
 * the venue (eventId null) or for one event (session). Shared by the admin
 * scanner and the organizer scanner. See mdfiles/attendance-inout.md.
 *
 * Every accepted scan appends an AttendanceScan row. The older one-per-day /
 * one-per-event records (AttendanceRecord, EventRegistration.status) are still
 * written on the FIRST entry exactly as before, so every existing report keeps
 * working; the scan log adds the time inside / outside on top.
 */

export type Direction = 'in' | 'out';
export type DirectionRequest = Direction | 'auto';
export type ScannerRole = 'admin' | 'organizer';

/** Request value → direction. Missing means 'in' (the old check-in-only behaviour). */
export function parseDirection(value: unknown): DirectionRequest {
  return value === 'out' || value === 'auto' ? value : 'in';
}

export const riyadhDayOf = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

// ---------------------------------------------------------------------------
// Time inside / outside
// ---------------------------------------------------------------------------

export interface ScanPoint {
  direction: string;
  createdAt: Date;
}

export interface PresenceSummary {
  /** Last effective state: inside now, outside (scanned out), or never entered. */
  state: 'inside' | 'outside' | 'none';
  firstIn: string | null;
  lastOut: string | null;
  /** When the current visit started (state = inside). */
  insideSince: string | null;
  insideMinutes: number;
  /** Time between an exit and the next re-entry (breaks during the day/event). */
  outsideMinutes: number;
  exits: number;
  /** An entry was never closed by an exit on a day that is over. */
  missingCheckout: boolean;
  /** Exit scans with no open entry (ignored in the totals). */
  unmatchedOuts: number;
  /** Event scope only. */
  lateMinutes?: number | null;
  leftEarlyMinutes?: number | null;
  missedMinutes?: number | null;
}

const minutes = (ms: number) => Math.max(0, Math.round(ms / 60000));

/**
 * Pair entries and exits in time order. Repeated entries while inside and exits
 * while outside are ignored, so a double scan never inflates the totals.
 * An open entry counts up to `now` on the current day; on a past day it counts
 * to the event end (event scope) or not at all (venue) and is flagged.
 */
export function summarizeScans(
  scans: ScanPoint[],
  opts: { now: Date; isToday: boolean; window?: { start: Date; end: Date } }
): PresenceSummary {
  const sorted = [...scans].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const intervals: Array<[number, number]> = [];
  let state: 'in' | 'out' | 'none' = 'none';
  let openAt = 0;
  let firstIn: number | null = null;
  let lastOut: number | null = null;
  let outside = 0;
  let exits = 0;
  let unmatchedOuts = 0;

  for (const s of sorted) {
    const t = s.createdAt.getTime();
    if (s.direction === 'in') {
      if (state === 'in') continue; // duplicate entry
      if (lastOut !== null) outside += t - lastOut;
      state = 'in';
      openAt = t;
      if (firstIn === null) firstIn = t;
    } else if (s.direction === 'out') {
      if (state !== 'in') {
        unmatchedOuts++;
        continue;
      }
      intervals.push([openAt, t]);
      state = 'out';
      lastOut = t;
      exits++;
    }
  }

  let missingCheckout = false;
  const nowMs = opts.now.getTime();
  if (state === 'in') {
    if (opts.isToday) {
      intervals.push([openAt, opts.window ? Math.min(nowMs, Math.max(openAt, opts.window.end.getTime())) : nowMs]);
    } else {
      missingCheckout = true;
      if (opts.window) intervals.push([openAt, Math.max(openAt, opts.window.end.getTime())]);
    }
  }

  const summary: PresenceSummary = {
    state: state === 'in' ? 'inside' : state === 'out' ? 'outside' : 'none',
    firstIn: firstIn !== null ? new Date(firstIn).toISOString() : null,
    lastOut: lastOut !== null ? new Date(lastOut).toISOString() : null,
    insideSince: state === 'in' ? new Date(openAt).toISOString() : null,
    insideMinutes: minutes(intervals.reduce((n, [a, b]) => n + (b - a), 0)),
    outsideMinutes: minutes(outside),
    exits,
    missingCheckout,
    unmatchedOuts,
  };

  if (opts.window) {
    const ws = opts.window.start.getTime();
    const we = opts.window.end.getTime();
    const upTo = Math.min(nowMs, we); // the part of the event that has happened so far
    const insideInWindow = intervals.reduce((n, [a, b]) => n + Math.max(0, Math.min(b, we) - Math.max(a, ws)), 0);
    summary.missedMinutes = upTo > ws ? minutes(upTo - ws - insideInWindow) : 0;
    summary.lateMinutes = firstIn !== null ? (firstIn > ws ? minutes(firstIn - ws) : 0) : null;
    // left before the end and never came back (only known once the event is over)
    summary.leftEarlyMinutes =
      nowMs >= we && state === 'out' && lastOut !== null && lastOut < we ? minutes(we - lastOut) : nowMs >= we ? 0 : null;
  }
  return summary;
}

/** Scans of one participant for one scope on one day, oldest first. */
export function scopeScans(participantId: string, eventId: string | null, day: string) {
  return prisma.attendanceScan.findMany({
    where: { participantId, eventId, day },
    orderBy: { createdAt: 'asc' },
    select: { id: true, direction: true, createdAt: true, scannedBy: true, scannerRole: true, method: true },
  });
}

/** Current effective state from the scans (duplicates ignored). */
function stateOf(scans: ScanPoint[]): 'in' | 'out' | 'none' {
  const s = summarizeScans(scans, { now: new Date(), isToday: true });
  return s.state === 'inside' ? 'in' : s.state === 'outside' ? 'out' : 'none';
}

// ---------------------------------------------------------------------------
// Recording a scan
// ---------------------------------------------------------------------------

export interface ScanOutcome {
  status: number;
  body: Record<string, unknown>;
}

interface ScanParams {
  participantId: string;
  eventId: string | null;
  direction: DirectionRequest;
  scannedBy: string;
  scannerRole: ScannerRole;
  method: 'scan' | 'manual';
}

async function writeScan(p: ScanParams, direction: Direction, day: string) {
  return prisma.attendanceScan.create({
    data: {
      participantId: p.participantId,
      eventId: p.eventId,
      day,
      direction,
      scannedBy: p.scannedBy,
      scannerRole: p.scannerRole,
      method: p.method,
    },
    select: { id: true, createdAt: true },
  });
}

async function presenceNow(participantId: string, eventId: string | null, day: string, window?: { start: Date; end: Date }) {
  const scans = await scopeScans(participantId, eventId, day);
  return summarizeScans(scans, { now: new Date(), isToday: true, window });
}

/**
 * Venue (general) scan. Result names keep the old ones for the old cases:
 *   in  : checkedIn (first entry today) | reEntered | alreadyCheckedIn (already inside)
 *   out : checkedOut | alreadyOut (already outside) | notInside (409, never entered today)
 */
export async function scanVenue(p: ScanParams): Promise<ScanOutcome> {
  const day = riyadhToday();
  const before = await scopeScans(p.participantId, null, day);
  const state = stateOf(before);
  const direction: Direction = p.direction === 'auto' ? (state === 'in' ? 'out' : 'in') : p.direction;

  if (direction === 'in') {
    if (state === 'in') {
      return { status: 200, body: { success: true, result: 'alreadyCheckedIn', direction, date: day, presence: await presenceNow(p.participantId, null, day) } };
    }
    // First entry of the day still writes the daily check-in (+ notification).
    const existing = await prisma.attendanceRecord.findFirst({
      where: { participantId: p.participantId, eventId: null, checkinDate: day },
      select: { id: true },
    });
    let recordId: string | undefined;
    let createdCheckin = false;
    if (!existing) {
      const r = await checkInGeneral({ participantId: p.participantId, scannedBy: p.scannedBy, method: p.method });
      if (r.result === 'checkedIn') {
        recordId = r.recordId;
        createdCheckin = true;
      }
    }
    const scan = await writeScan(p, 'in', day);
    return {
      status: 200,
      body: {
        success: true,
        result: createdCheckin ? 'checkedIn' : before.length === 0 ? 'alreadyCheckedIn' : 'reEntered',
        direction,
        date: day,
        scanId: scan.id,
        createdCheckin,
        ...(recordId ? { recordId } : {}),
        presence: await presenceNow(p.participantId, null, day),
      },
    };
  }

  // out
  if (state !== 'in') {
    if (state === 'out') {
      return { status: 200, body: { success: true, result: 'alreadyOut', direction, date: day, presence: await presenceNow(p.participantId, null, day) } };
    }
    return { status: 409, body: { error: 'لم يُسجَّل دخوله اليوم — سجّل الدخول أولاً', result: 'notInside', direction, date: day } };
  }
  const scan = await writeScan(p, 'out', day);
  return {
    status: 200,
    body: { success: true, result: 'checkedOut', direction, date: day, scanId: scan.id, presence: await presenceNow(p.participantId, null, day) },
  };
}

/**
 * Event (session) scan. Entry keeps the strict door policy: unknown event 404,
 * not registered / cancelled 409, nothing written. The first entry marks the
 * registration attended exactly as before.
 *   in  : attended (+wasAbsent) | reEntered | alreadyAttended
 *   out : checkedOut | alreadyOut | notInside (409)
 */
export async function scanEvent(p: ScanParams & { eventId: string }): Promise<ScanOutcome> {
  const event = await prisma.event.findUnique({
    where: { id: p.eventId },
    select: { id: true, title: true, startDate: true, endDate: true },
  });
  if (!event) return { status: 404, body: { error: 'الفعالية غير موجودة' } };
  const window = { start: event.startDate, end: event.endDate };
  const day = riyadhToday();
  const before = await scopeScans(p.participantId, event.id, day);
  const state = stateOf(before);
  const direction: Direction = p.direction === 'auto' ? (state === 'in' ? 'out' : 'in') : p.direction;
  const base = { direction, date: day, eventTitle: event.title };

  if (direction === 'out') {
    if (state !== 'in') {
      if (state === 'out') {
        return { status: 200, body: { success: true, result: 'alreadyOut', ...base, presence: await presenceNow(p.participantId, event.id, day, window) } };
      }
      return { status: 409, body: { error: 'لم يُسجَّل دخوله لهذه الفعالية اليوم', result: 'notInside', ...base } };
    }
    const scan = await writeScan(p, 'out', day);
    return { status: 200, body: { success: true, result: 'checkedOut', ...base, scanId: scan.id, presence: await presenceNow(p.participantId, event.id, day, window) } };
  }

  // in — registration rules first (nothing is written on rejection)
  const registration = await prisma.eventRegistration.findUnique({
    where: { participantId_eventId: { participantId: p.participantId, eventId: event.id } },
  });
  if (!registration) {
    return { status: 409, body: { error: 'غير مسجل في هذه الفعالية', result: 'notRegistered', ...base } };
  }
  if (registration.status === 'cancelled') {
    return { status: 409, body: { error: 'تسجيله في هذه الفعالية ملغى', result: 'cancelled', ...base } };
  }
  if (state === 'in') {
    return { status: 200, body: { success: true, result: 'alreadyAttended', ...base, presence: await presenceNow(p.participantId, event.id, day, window) } };
  }

  let result = 'reEntered';
  let wasAbsent = false;
  let createdCheckin = false;
  if (registration.status !== 'attended') {
    wasAbsent = registration.status === 'absent';
    await prisma.$transaction([
      prisma.eventRegistration.update({ where: { id: registration.id }, data: { status: 'attended' } }),
      prisma.attendanceRecord.upsert({
        where: { participantId_eventId: { participantId: p.participantId, eventId: event.id } },
        create: { participantId: p.participantId, eventId: event.id, scannedBy: p.scannedBy, method: p.method },
        update: { scannedBy: p.scannedBy, method: p.method, createdAt: new Date() },
      }),
    ]);
    await notifyAttendance(p.participantId, event.title);
    result = 'attended';
    createdCheckin = true;
  } else if (before.length === 0) {
    // marked attended earlier (manually or on another day) — first scan today
    result = 'alreadyAttended';
  }
  const scan = await writeScan(p, 'in', day);
  return {
    status: 200,
    body: {
      success: true,
      result,
      ...(result === 'attended' ? { wasAbsent } : {}),
      ...base,
      scanId: scan.id,
      createdCheckin,
      presence: await presenceNow(p.participantId, event.id, day, window),
    },
  };
}
