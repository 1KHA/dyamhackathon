import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { undoScan } from '@/lib/attendance-scans';

export const dynamic = 'force-dynamic';

/**
 * POST — undo a mistaken scan.
 *
 * body: { scanId }  — undo ONE entry/exit scan (src/lib/attendance-scans.ts
 *       undoScan). If it was the last entry of that scope/day and it created the
 *       day's check-in / the event attendance, that is undone too (server-decided).
 * body: { participantId, mode: 'event' | 'general', eventId?, date? }  (older form)
 *
 * Event mode: registration status back to 'registered' + delete the audit row.
 * General mode: delete that day's check-in record.
 */
export async function POST(request: NextRequest) {
  const adminId = requireAdmin(cookies().get('token')?.value);
  if (!adminId) {
    return NextResponse.json(
      { error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    // ---- one scan (the check-in is reverted only if this scan created it) ----
    if (body.scanId) {
      const r = await undoScan(String(body.scanId), { role: 'admin', id: adminId });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json({ success: true, undone: r.undone, revertedCheckin: r.revertedCheckin });
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
