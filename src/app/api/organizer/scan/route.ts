import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireOrganizer } from '@/lib/organizer-auth';
import { findBadgeHolder } from '@/lib/general-checkin';
import { parseDirection, scanEvent, scanVenue } from '@/lib/attendance-scans';

export const dynamic = 'force-dynamic';

/**
 * POST — organizer badge scan:
 *   { badgeCode, method?: 'scan' | 'manual', direction?: 'in' | 'out' | 'auto',
 *     mode?: 'general' | 'event', eventId? }
 *
 * Same rules as the admin scanner (src/lib/attendance-scans.ts): entries and
 * exits any number of times a day, for the venue or for one event (strict
 * registration rule on event entry). Always saved under the server's today.
 * Organizers have no undo — an admin corrects mistakes from the admin page.
 */
export async function POST(request: NextRequest) {
  const organizer = await requireOrganizer(cookies().get('token')?.value);
  if (!organizer) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const badgeCode = String(body.badgeCode || '').trim().toUpperCase();
    const method = body.method === 'manual' ? 'manual' : 'scan';
    const mode = body.mode === 'event' ? 'event' : 'general';
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

    const params = { participantId: identity.participantId, direction, scannedBy: organizer.id, scannerRole: 'organizer' as const, method: method as 'scan' | 'manual' };
    const outcome =
      mode === 'event'
        ? await scanEvent({ ...params, eventId: eventId! })
        : await scanVenue({ ...params, eventId: null });
    return NextResponse.json({ ...outcome.body, ...identity }, { status: outcome.status });
  } catch (error) {
    console.error('Error recording organizer scan:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
