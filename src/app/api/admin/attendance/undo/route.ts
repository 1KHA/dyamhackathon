import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';

export const dynamic = 'force-dynamic';

/**
 * POST — undo a mistaken scan.
 *
 * body: { scanId, revertCheckin? }  — undo ONE entry/exit scan. With
 *       revertCheckin (that scan created the day's check-in / event attendance)
 *       and no other entry left for that scope/day, the check-in is undone too.
 * body: { participantId, mode: 'event' | 'general', eventId?, date? }  (older form)
 *
 * Event mode: registration status back to 'registered' + delete the audit row.
 * General mode: delete that day's check-in record.
 */
export async function POST(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json(
      { error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    // ---- one scan ------------------------------------------------------------
    if (body.scanId) {
      const scan = await prisma.attendanceScan.findUnique({ where: { id: String(body.scanId) } });
      if (!scan) return NextResponse.json({ success: true, undone: false });
      await prisma.attendanceScan.delete({ where: { id: scan.id } });
      if (body.revertCheckin) {
        const entriesLeft = await prisma.attendanceScan.count({
          where: { participantId: scan.participantId, eventId: scan.eventId, day: scan.day, direction: 'in' },
        });
        if (entriesLeft === 0) {
          if (scan.eventId) {
            await prisma.$transaction([
              prisma.eventRegistration.updateMany({
                where: { participantId: scan.participantId, eventId: scan.eventId, status: 'attended' },
                data: { status: 'registered' },
              }),
              prisma.attendanceRecord.deleteMany({ where: { participantId: scan.participantId, eventId: scan.eventId } }),
            ]);
          } else {
            await prisma.attendanceRecord.deleteMany({
              where: { participantId: scan.participantId, eventId: null, checkinDate: scan.day },
            });
          }
        }
      }
      return NextResponse.json({ success: true, undone: true });
    }

    const participantId = String(body.participantId || '');
    const mode = body.mode === 'general' ? 'general' : 'event';

    if (!participantId) {
      return NextResponse.json({ error: 'معرف المشارك مطلوب' }, { status: 400 });
    }

    if (mode === 'general') {
      const date = String(body.date || '');
      if (!date) {
        return NextResponse.json({ error: 'التاريخ مطلوب' }, { status: 400 });
      }
      const deleted = await prisma.attendanceRecord.deleteMany({
        where: { participantId, eventId: null, checkinDate: date },
      });
      await prisma.attendanceScan.deleteMany({ where: { participantId, eventId: null, day: date } });
      return NextResponse.json({ success: true, undone: deleted.count > 0 });
    }

    const eventId = String(body.eventId || '');
    if (!eventId) {
      return NextResponse.json({ error: 'معرف الفعالية مطلوب' }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.eventRegistration.updateMany({
        where: { participantId, eventId, status: 'attended' },
        data: { status: 'registered' },
      }),
      prisma.attendanceRecord.deleteMany({ where: { participantId, eventId } }),
      prisma.attendanceScan.deleteMany({ where: { participantId, eventId } }),
    ]);

    return NextResponse.json({ success: true, undone: true });
  } catch (error) {
    console.error('Error undoing attendance:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
