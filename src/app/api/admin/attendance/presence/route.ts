import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { riyadhToday } from '@/lib/badge-dates';
import { riyadhDayOf, scannerNames, summarizeScans } from '@/lib/attendance-scans';
import { attendanceAudience, GROUP_SELECT, groupName } from '@/lib/attendance-audience';

export const dynamic = 'force-dynamic';

/**
 * GET — time inside / outside per participant, from the entry/exit scan log.
 *
 *   ?mode=general&date=YYYY-MM-DD          venue, that day (default today)
 *   ?mode=event&eventId=…&date=YYYY-MM-DD  one event (default: the event's day)
 *   &phaseId=…                             only that group; approved accounts only
 *
 * One row per participant who has at least one scan in that scope/day, with
 * the summary (first entry, last exit, minutes inside / outside, exits; for an
 * event also late / left early / missed) and the scan timeline.
 */
export async function GET(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }
  try {
    const sp = new URL(request.url).searchParams;
    const mode = sp.get('mode') === 'event' ? 'event' : 'general';
    const audience = attendanceAudience(sp.get('phaseId') || null);
    let eventId: string | null = null;
    let window: { start: Date; end: Date } | undefined;
    let eventTitle: string | undefined;
    let day = sp.get('date') || '';

    if (mode === 'event') {
      eventId = sp.get('eventId');
      if (!eventId) return NextResponse.json({ error: 'معرف الفعالية مطلوب' }, { status: 400 });
      const event = await prisma.event.findUnique({ where: { id: eventId }, select: { title: true, startDate: true, endDate: true } });
      if (!event) return NextResponse.json({ error: 'الفعالية غير موجودة' }, { status: 404 });
      window = { start: event.startDate, end: event.endDate };
      eventTitle = event.title;
      if (!day) day = riyadhDayOf(event.startDate);
    }
    if (!day) day = riyadhToday();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: 'تاريخ غير صالح' }, { status: 400 });

    const scans = await prisma.attendanceScan.findMany({
      where: { eventId, day, participant: audience },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, participantId: true, direction: true, createdAt: true, scannedBy: true, scannerRole: true, method: true,
        participant: { select: { fullName: true, firstName: true, secondName: true, familyName: true, email: true, ...GROUP_SELECT } },
      },
    });

    const now = new Date();
    const isToday = day === riyadhToday();
    const names = await scannerNames(scans);
    const byParticipant = new Map<string, typeof scans>();
    for (const s of scans) {
      const list = byParticipant.get(s.participantId);
      if (list) list.push(s);
      else byParticipant.set(s.participantId, [s]);
    }

    const rows = Array.from(byParticipant.values()).map((list) => {
      const p = list[0].participant;
      return {
        participantId: list[0].participantId,
        name: p.fullName || `${p.firstName ?? ''} ${p.secondName ?? ''} ${p.familyName ?? ''}`.trim() || p.email,
        email: p.email,
        teamName: p.team?.teamName ?? null,
        group: groupName(p),
        summary: summarizeScans(list, { now, isToday, window }),
        scans: list.map((s) => ({ id: s.id, direction: s.direction, at: s.createdAt, by: s.scannerRole, byName: names.get(s.scannedBy) ?? '—', method: s.method })),
      };
    });
    const order = { inside: 0, outside: 1, none: 2 } as const;
    rows.sort((a, b) => order[a.summary.state] - order[b.summary.state] || (a.summary.firstIn ?? '').localeCompare(b.summary.firstIn ?? ''));

    return NextResponse.json({
      mode,
      date: day,
      isToday,
      ...(window ? { event: { id: eventId, title: eventTitle, startDate: window.start, endDate: window.end } } : {}),
      counts: {
        people: rows.length,
        insideNow: rows.filter((r) => r.summary.state === 'inside').length,
        scans: scans.length,
        exits: rows.reduce((n, r) => n + r.summary.exits, 0),
      },
      rows,
    });
  } catch (error) {
    console.error('Error building presence report:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
