import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { riyadhToday } from '@/lib/badge-dates';
import { attendanceAudience, GROUP_SELECT, groupName } from '@/lib/attendance-audience';

export const dynamic = 'force-dynamic';

function displayName(p: {
  fullName: string | null;
  firstName: string | null;
  secondName: string | null;
  familyName: string | null;
  email: string;
}): string {
  return (
    p.fullName ||
    `${p.firstName ?? ''} ${p.secondName ?? ''} ${p.familyName ?? ''}`.trim() ||
    p.email
  );
}

const participantSelect = {
  id: true,
  email: true,
  fullName: true,
  firstName: true,
  secondName: true,
  familyName: true,
  ...GROUP_SELECT,
} as const;

/**
 * GET — attendance tracking data.
 *
 *   ?mode=event&eventId=…  every registration with name/team/status/scan info + counts
 *   ?mode=general&date=…   checked-in list + absentee diff + counts (date defaults to today)
 *   &phaseId=…             only that group (phase); omitted = every group
 *
 * Only approved, active participants are listed (src/lib/attendance-audience.ts);
 * `counts.hidden` says how many rows of other accounts were left out.
 */
export async function GET(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json(
      { error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') === 'general' ? 'general' : 'event';
    const phaseId = searchParams.get('phaseId') || null;
    const audience = attendanceAudience(phaseId);

    // ---- general venue check-in ---------------------------------------------
    if (mode === 'general') {
      const date = searchParams.get('date') || riyadhToday();

      const [records, allParticipants, allRecords] = await Promise.all([
        prisma.attendanceRecord.findMany({
          where: { eventId: null, checkinDate: date, participant: audience },
          include: { participant: { select: participantSelect } },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.participant.findMany({ where: audience, select: participantSelect }),
        prisma.attendanceRecord.count({ where: { eventId: null, checkinDate: date } }),
      ]);

      const checkedInIds = new Set(records.map((r) => r.participantId));

      return NextResponse.json({
        mode: 'general',
        date,
        counts: {
          total: allParticipants.length,
          checkedIn: records.length,
          notCheckedIn: allParticipants.length - records.length,
          // check-ins of accounts outside the list (not approved / other group)
          hidden: allRecords - records.length,
        },
        checkedIn: records.map((r) => ({
          participantId: r.participantId,
          name: displayName(r.participant),
          email: r.participant.email,
          teamName: r.participant.team?.teamName ?? null,
          group: groupName(r.participant),
          time: r.createdAt,
          method: r.method,
          scannedBy: r.scannedBy,
        })),
        notCheckedIn: allParticipants
          .filter((p) => !checkedInIds.has(p.id))
          .map((p) => ({
            participantId: p.id,
            name: displayName(p),
            email: p.email,
            teamName: p.team?.teamName ?? null,
            group: groupName(p),
          })),
      });
    }

    // ---- event attendance -----------------------------------------------------
    const eventId = searchParams.get('eventId');
    if (!eventId) {
      return NextResponse.json({ error: 'معرف الفعالية مطلوب' }, { status: 400 });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, startDate: true, capacity: true },
    });
    if (!event) {
      return NextResponse.json({ error: 'الفعالية غير موجودة' }, { status: 404 });
    }

    const [registrations, scanRecords, allRegistrations] = await Promise.all([
      prisma.eventRegistration.findMany({
        where: { eventId, participant: audience },
        include: { participant: { select: participantSelect } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.attendanceRecord.findMany({ where: { eventId } }),
      prisma.eventRegistration.count({ where: { eventId } }),
    ]);

    const scanByParticipant = new Map(scanRecords.map((r) => [r.participantId, r]));

    const rows = registrations.map((reg) => {
      const scan = scanByParticipant.get(reg.participantId);
      return {
        registrationId: reg.id,
        participantId: reg.participantId,
        name: displayName(reg.participant),
        email: reg.participant.email,
        teamName: reg.participant.team?.teamName ?? null,
        group: groupName(reg.participant),
        status: reg.status,
        scannedAt: scan?.createdAt ?? null,
        method: scan?.method ?? null,
        scannedBy: scan?.scannedBy ?? null,
      };
    });

    // EventRegistration.status is the source of truth, so manual marking on the
    // events page counts too (its scannedAt simply stays null)
    const counts = {
      registered: rows.length,
      attended: rows.filter((r) => r.status === 'attended').length,
      absent: rows.filter((r) => r.status === 'absent').length,
      cancelled: rows.filter((r) => r.status === 'cancelled').length,
      remaining: rows.filter((r) => r.status === 'registered').length,
      hidden: allRegistrations - rows.length,
    };

    return NextResponse.json({
      mode: 'event',
      event: { id: event.id, title: event.title, startDate: event.startDate, capacity: event.capacity },
      counts,
      rows,
    });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
