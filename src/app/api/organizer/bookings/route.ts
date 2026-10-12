import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireOrganizer } from '@/lib/organizer-auth';
import { riyadhToday } from '@/lib/badge-dates';

export const dynamic = 'force-dynamic';

const name = (p: { fullName: string | null; firstName: string | null; secondName: string | null; familyName: string | null; email: string }) =>
  p.fullName || `${p.firstName ?? ''} ${p.secondName ?? ''} ${p.familyName ?? ''}`.trim() || p.email;

/**
 * GET ?date=YYYY-MM-DD (default today, Asia/Riyadh) — every mentor session of
 * that day (not cancelled), sorted by start time, for the organizer board:
 * which team goes to which mentor, when. `serverNow` lets the page decide what
 * is "now", "next" and already finished.
 */
export async function GET(request: NextRequest) {
  const organizer = await requireOrganizer(cookies().get('token')?.value);
  if (!organizer) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  try {
    const date = new URL(request.url).searchParams.get('date') || riyadhToday();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'تاريخ غير صالح' }, { status: 400 });
    const from = new Date(`${date}T00:00:00+03:00`);
    const to = new Date(from.getTime() + 24 * 3600_000);

    const rows = await prisma.mentorBooking.findMany({
      where: { status: { not: 'cancelled' }, availability: { startTime: { gte: from, lt: to } } },
      select: {
        id: true, status: true,
        organization: { select: { name: true } },
        participant: {
          select: {
            fullName: true, firstName: true, secondName: true, familyName: true, email: true,
            team: { select: { teamName: true, participants: { select: { fullName: true, firstName: true, secondName: true, familyName: true, email: true, isLeader: true }, orderBy: [{ isLeader: 'desc' }, { createdAt: 'asc' }] } } },
          },
        },
        availability: { select: { startTime: true, endTime: true, mentor: { select: { name: true, organization: { select: { name: true } } } } } },
      },
      orderBy: { availability: { startTime: 'asc' } },
    });

    return NextResponse.json({
      date,
      serverNow: new Date().toISOString(),
      bookings: rows.map((b) => ({
        id: b.id,
        startTime: b.availability.startTime,
        endTime: b.availability.endTime,
        mentorName: b.availability.mentor.name,
        mentorOrganization: b.availability.mentor.organization?.name ?? null,
        bookedThroughOrganization: b.organization?.name ?? null,
        teamName: b.participant.team?.teamName ?? null,
        bookedBy: name(b.participant),
        members: b.participant.team ? b.participant.team.participants.map(name) : [name(b.participant)],
        status: b.status,
      })),
    });
  } catch (error) {
    console.error('Error loading organizer bookings:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
