import { prisma } from '@/lib/prisma';
import { riyadhToday } from '@/lib/badge-dates';
import type { Prisma } from '@prisma/client';
import { notifyAttendance } from '@/lib/general-checkin';

/**
 * Entry / exit scanning — any number of check-ins AND check-outs per day, for
 * the venue (eventId null) or for one event (session). Shared by the admin
 * scanner and the organizer scanner. See mdfiles/attendance-inout.md.
 *
 * Every accepted scan appends an AttendanceScan row. The older one-per-day /
 * one-per-event records (AttendanceRecord, EventRegistration.status) are still
 * written on the FIRST entry exactly as before, so every existing report keeps
 * working; the scan log adds the time inside / outside on top.
 *
 * Mistake guards (a scan must never register in AND out by accident):
 *  - each scan runs in a transaction holding a per-participant+scope advisory
 *    lock, so two devices scanning the same badge at once are serialized and
 *    the second one sees the first one's result;
 *  - 'auto' ignores a repeat within AUTO_REPEAT_GUARD_SECONDS of the person's
 *    last scan in that scope (the camera reading a badge twice) — nothing is
 *    written; staff who really mean the opposite pick «دخول» / «خروج»;
 *  - same-direction repeats ('in' while inside, 'out' while outside) write nothing;
 *  - the daily check-in row is created with ON CONFLICT DO NOTHING.
 */

/** An 'auto' scan this soon after the person's previous scan is treated as a repeat. */
export const AUTO_REPEAT_GUARD_SECONDS = 60;
/** Organizers may undo their own scans for this long. */
export const ORGANIZER_UNDO_MINUTES = 5;

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
export function scopeScans(participantId: string, eventId: string | null, day: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  return db.attendanceScan.findMany({
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

type Tx = Prisma.TransactionClient;

/**
 * Run `fn` in a transaction that holds an advisory lock for this participant
 * and scope: concurrent scans of the same badge wait for each other.
 */
async function withScanLock<T>(participantId: string, eventId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const key = `attendance-scan:${participantId}:${eventId ?? 'venue'}`;
  return prisma.$transaction(
    async (tx) => {
      // wrapped in a sub-select: pg_advisory_xact_lock returns void, which Prisma cannot deserialize
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS l`;
      return fn(tx);
    },
    { maxWait: 10_000, timeout: 15_000 }
  );
}

function writeScan(tx: Tx, p: ScanParams, direction: Direction, day: string) {
  return tx.attendanceScan.create({
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

/** 'auto' within the guard window of the last scan → a repeat, not a new entry/exit. */
function repeatOf(before: { direction: string; createdAt: Date }[], requested: DirectionRequest) {
  if (requested !== 'auto' || before.length === 0) return null;
  const last = before[before.length - 1];
  const secondsAgo = Math.floor((Date.now() - last.createdAt.getTime()) / 1000);
  return secondsAgo < AUTO_REPEAT_GUARD_SECONDS ? { lastDirection: last.direction, secondsAgo } : null;
}

/**
 * Venue (general) scan. Result names keep the old ones for the old cases:
 *   in  : checkedIn (first entry today) | reEntered | alreadyCheckedIn (already inside)
 *   out : checkedOut | alreadyOut (already outside) | notInside (409, never entered today)
 *   auto: repeatIgnored (scanned again within the guard window — nothing written)
 */
export async function scanVenue(p: ScanParams): Promise<ScanOutcome> {
  const day = riyadhToday();
  const decided = await withScanLock(p.participantId, null, async (tx) => {
    const before = await scopeScans(p.participantId, null, day, tx);
    const repeat = repeatOf(before, p.direction);
    if (repeat) return { kind: 'repeat' as const, ...repeat };
    const state = stateOf(before);
    const direction: Direction = p.direction === 'auto' ? (state === 'in' ? 'out' : 'in') : p.direction;

    if (direction === 'in') {
      if (state === 'in') return { kind: 'noop' as const, direction, result: 'alreadyCheckedIn' };
      // first entry of the day also writes the daily check-in (exactly once)
      const created = await tx.attendanceRecord.createMany({
        data: [{ participantId: p.participantId, eventId: null, checkinDate: day, scannedBy: p.scannedBy, method: p.method }],
        skipDuplicates: true,
      });
      const scan = await writeScan(tx, p, 'in', day);
      const createdCheckin = created.count === 1;
      const recordId = createdCheckin
        ? (await tx.attendanceRecord.findFirst({ where: { participantId: p.participantId, eventId: null, checkinDate: day }, select: { id: true } }))?.id
        : undefined;
      return {
        kind: 'written' as const,
        direction,
        scan,
        createdCheckin,
        recordId,
        result: createdCheckin ? 'checkedIn' : before.length === 0 ? 'alreadyCheckedIn' : 'reEntered',
      };
    }
    if (state !== 'in') {
      return state === 'out'
        ? { kind: 'noop' as const, direction, result: 'alreadyOut' }
        : { kind: 'rejected' as const, direction };
    }
    const scan = await writeScan(tx, p, 'out', day);
    return { kind: 'written' as const, direction, scan, createdCheckin: false, recordId: undefined, result: 'checkedOut' };
  });

  if (decided.kind === 'repeat') {
    return {
      status: 200,
      body: { success: true, result: 'repeatIgnored', direction: decided.lastDirection, secondsAgo: decided.secondsAgo, date: day, presence: await presenceNow(p.participantId, null, day) },
    };
  }
  if (decided.kind === 'rejected') {
    return { status: 409, body: { error: 'لم يُسجَّل دخوله اليوم — سجّل الدخول أولاً', result: 'notInside', direction: decided.direction, date: day } };
  }
  if (decided.kind === 'written' && decided.createdCheckin) await notifyAttendance(p.participantId, 'الحضور العام');
  return {
    status: 200,
    body: {
      success: true,
      result: decided.result,
      direction: decided.direction,
      date: day,
      // scannedAt: the server time the scan was saved — screens show this, never the phone's clock
      ...(decided.kind === 'written' ? { scanId: decided.scan.id, scannedAt: decided.scan.createdAt, createdCheckin: decided.createdCheckin, ...(decided.recordId ? { recordId: decided.recordId } : {}) } : {}),
      presence: await presenceNow(p.participantId, null, day),
    },
  };
}

/**
 * Event (session) scan. Anyone who exists can be scanned into an event: a
 * participant who never registered is registered on the spot, a cancelled
 * registration is re-activated (`autoRegistered` / `reactivated` in the
 * response). The first entry marks the registration attended as before.
 * Unknown event 404.
 *   in  : attended (+wasAbsent, autoRegistered, reactivated) | reEntered | alreadyAttended
 *   out : checkedOut | alreadyOut | notInside (409)
 *   auto: repeatIgnored
 */
export async function scanEvent(p: ScanParams & { eventId: string }): Promise<ScanOutcome> {
  const event = await prisma.event.findUnique({
    where: { id: p.eventId },
    select: { id: true, title: true, startDate: true, endDate: true },
  });
  if (!event) return { status: 404, body: { error: 'الفعالية غير موجودة' } };
  const window = { start: event.startDate, end: event.endDate };
  const day = riyadhToday();

  const decided = await withScanLock(p.participantId, event.id, async (tx) => {
    const before = await scopeScans(p.participantId, event.id, day, tx);
    const repeat = repeatOf(before, p.direction);
    if (repeat) return { kind: 'repeat' as const, ...repeat };
    const state = stateOf(before);
    const direction: Direction = p.direction === 'auto' ? (state === 'in' ? 'out' : 'in') : p.direction;

    if (direction === 'out') {
      if (state !== 'in') {
        return state === 'out'
          ? { kind: 'noop' as const, direction, result: 'alreadyOut' }
          : { kind: 'rejected' as const, direction, status: 409, error: 'لم يُسجَّل دخوله لهذه الفعالية اليوم', result: 'notInside' };
      }
      const scan = await writeScan(tx, p, 'out', day);
      return { kind: 'written' as const, direction, scan, createdCheckin: false, result: 'checkedOut', wasAbsent: false, autoRegistered: false, reactivated: false };
    }

    // in — whoever is at the door is registered (never refused for not registering)
    let registration = await tx.eventRegistration.findUnique({
      where: { participantId_eventId: { participantId: p.participantId, eventId: event.id } },
    });
    if (state === 'in') return { kind: 'noop' as const, direction, result: 'alreadyAttended' };
    const autoRegistered = !registration;
    const reactivated = registration?.status === 'cancelled';
    if (!registration) {
      registration = await tx.eventRegistration.create({
        data: { participantId: p.participantId, eventId: event.id, status: 'registered' },
      });
    }

    let result = 'reEntered';
    let wasAbsent = false;
    let createdCheckin = false;
    if (registration.status !== 'attended') {
      wasAbsent = registration.status === 'absent';
      await tx.eventRegistration.update({ where: { id: registration.id }, data: { status: 'attended' } });
      await tx.attendanceRecord.upsert({
        where: { participantId_eventId: { participantId: p.participantId, eventId: event.id } },
        create: { participantId: p.participantId, eventId: event.id, scannedBy: p.scannedBy, method: p.method },
        update: { scannedBy: p.scannedBy, method: p.method, createdAt: new Date() },
      });
      result = 'attended';
      createdCheckin = true;
    } else if (before.length === 0) {
      // marked attended earlier (manually or on another day) — first scan today
      result = 'alreadyAttended';
    }
    const scan = await writeScan(tx, p, 'in', day);
    return { kind: 'written' as const, direction, scan, createdCheckin, result, wasAbsent, autoRegistered, reactivated };
  });

  const base = { date: day, eventTitle: event.title };
  if (decided.kind === 'repeat') {
    return {
      status: 200,
      body: { success: true, result: 'repeatIgnored', direction: decided.lastDirection, secondsAgo: decided.secondsAgo, ...base, presence: await presenceNow(p.participantId, event.id, day, window) },
    };
  }
  if (decided.kind === 'rejected') {
    return { status: decided.status, body: { error: decided.error, result: decided.result, direction: decided.direction, ...base } };
  }
  if (decided.kind === 'written' && decided.createdCheckin) await notifyAttendance(p.participantId, event.title);
  return {
    status: 200,
    body: {
      success: true,
      result: decided.result,
      direction: decided.direction,
      ...(decided.kind === 'written' && decided.result === 'attended' ? { wasAbsent: decided.wasAbsent } : {}),
      ...(decided.kind === 'written' && decided.autoRegistered ? { autoRegistered: true } : {}),
      ...(decided.kind === 'written' && decided.reactivated ? { reactivated: true } : {}),
      ...base,
      ...(decided.kind === 'written' ? { scanId: decided.scan.id, scannedAt: decided.scan.createdAt, createdCheckin: decided.createdCheckin } : {}),
      presence: await presenceNow(p.participantId, event.id, day, window),
    },
  };
}

// ---------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------

export type UndoResult = { ok: true; undone: boolean; revertedCheckin: boolean } | { ok: false; status: number; error: string };

/**
 * Remove ONE scan. When it was the scope's last entry of that day and the
 * day's check-in (venue) / the event attendance was created by this same scan
 * (same scanner, within a minute), that is undone too — decided here, never
 * by the client. Organizers may only undo their own scans, for
 * ORGANIZER_UNDO_MINUTES.
 */
export async function undoScan(scanId: string, actor: { role: ScannerRole; id: string }): Promise<UndoResult> {
  const scan = await prisma.attendanceScan.findUnique({ where: { id: scanId } });
  if (!scan) return { ok: true, undone: false, revertedCheckin: false };
  if (actor.role === 'organizer') {
    if (scan.scannerRole !== 'organizer' || scan.scannedBy !== actor.id) {
      return { ok: false, status: 403, error: 'يمكنك التراجع عن عمليات المسح التي قمت بها فقط' };
    }
    if (Date.now() - scan.createdAt.getTime() > ORGANIZER_UNDO_MINUTES * 60_000) {
      return { ok: false, status: 403, error: `انتهت مهلة التراجع (${ORGANIZER_UNDO_MINUTES} دقائق) — تواصل مع المسؤول` };
    }
  }

  return withScanLock(scan.participantId, scan.eventId, async (tx) => {
    await tx.attendanceScan.delete({ where: { id: scan.id } });
    if (scan.direction !== 'in') return { ok: true as const, undone: true, revertedCheckin: false };
    const entriesLeft = await tx.attendanceScan.count({
      where: { participantId: scan.participantId, eventId: scan.eventId, day: scan.day, direction: 'in' },
    });
    if (entriesLeft > 0) return { ok: true as const, undone: true, revertedCheckin: false };

    const near = { gte: new Date(scan.createdAt.getTime() - 60_000), lte: new Date(scan.createdAt.getTime() + 60_000) };
    if (scan.eventId) {
      const rec = await tx.attendanceRecord.findFirst({
        where: { participantId: scan.participantId, eventId: scan.eventId, scannedBy: scan.scannedBy, createdAt: near },
      });
      if (!rec) return { ok: true as const, undone: true, revertedCheckin: false };
      await tx.attendanceRecord.delete({ where: { id: rec.id } });
      await tx.eventRegistration.updateMany({
        where: { participantId: scan.participantId, eventId: scan.eventId, status: 'attended' },
        data: { status: 'registered' },
      });
      return { ok: true as const, undone: true, revertedCheckin: true };
    }
    const removed = await tx.attendanceRecord.deleteMany({
      where: { participantId: scan.participantId, eventId: null, checkinDate: scan.day, scannedBy: scan.scannedBy, createdAt: near },
    });
    return { ok: true as const, undone: true, revertedCheckin: removed.count > 0 };
  });
}

/** id → display name of whoever scanned (organizer name / admin username). */
export async function scannerNames(scans: { scannedBy: string; scannerRole: string }[]): Promise<Map<string, string>> {
  const orgIds = Array.from(new Set(scans.filter((s) => s.scannerRole === 'organizer').map((s) => s.scannedBy)));
  const adminIds = Array.from(new Set(scans.filter((s) => s.scannerRole !== 'organizer').map((s) => s.scannedBy)));
  const [orgs, admins] = await Promise.all([
    orgIds.length ? prisma.organizer.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true, username: true } }) : [],
    adminIds.length ? prisma.admin.findMany({ where: { id: { in: adminIds } }, select: { id: true, username: true } }) : [],
  ]);
  const map = new Map<string, string>();
  orgs.forEach((o) => map.set(o.id, `${o.name} (${o.username})`));
  admins.forEach((a) => map.set(a.id, `مسؤول: ${a.username}`));
  return map;
}
