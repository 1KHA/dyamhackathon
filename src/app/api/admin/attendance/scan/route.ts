import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireAdmin } from '@/lib/notification-auth';
import { findBadgeHolder } from '@/lib/general-checkin';
import { parseDirection, scanEvent, scanVenue } from '@/lib/attendance-scans';

export const dynamic = 'force-dynamic';

/**
 * POST — record an entry or an exit from a scanned (or typed) badge code.
 *
 * body: { badgeCode, mode: 'event' | 'general', eventId?, method?: 'scan' | 'manual',
 *         direction?: 'in' | 'out' | 'auto' }   (missing direction = 'in', the old behaviour)
 *
 * Entries and exits can repeat any number of times a day; every accepted scan
 * is logged (AttendanceScan) so time inside / outside can be measured.
 * Event entry keeps the strict door policy (not registered / cancelled -> 409,
 * nothing written). See src/lib/attendance-scans.ts for every result name.
 * Every response carries the participant identity for the door display.
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
    const badgeCode = String(body.badgeCode || '').trim().toUpperCase();
    const mode = body.mode === 'general' ? 'general' : 'event';
    const method = body.method === 'manual' ? 'manual' : 'scan';
    const eventId = body.eventId ? String(body.eventId) : null;
    const direction = parseDirection(body.direction);

    if (!badgeCode) {
      return NextResponse.json({ error: 'رمز البطاقة مطلوب' }, { status: 400 });
    }
    if (mode === 'event' && !eventId) {
      return NextResponse.json({ error: 'يرجى اختيار الفعالية أولاً' }, { status: 400 });
    }

    const identity = await findBadgeHolder(badgeCode);
    if (!identity) {
      return NextResponse.json({ error: 'بطاقة غير معروفة — تحقق من الرمز' }, { status: 404 });
    }

    const params = { participantId: identity.participantId, direction, scannedBy: adminId, scannerRole: 'admin' as const, method: method as 'scan' | 'manual' };
    const outcome =
      mode === 'general'
        ? await scanVenue({ ...params, eventId: null })
        : await scanEvent({ ...params, eventId: eventId! });
    return NextResponse.json({ ...outcome.body, ...identity }, { status: outcome.status });
  } catch (error) {
    console.error('Error recording attendance:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
