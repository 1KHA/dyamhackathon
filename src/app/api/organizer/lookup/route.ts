import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireOrganizer } from '@/lib/organizer-auth';
import { findBadgeHolder } from '@/lib/general-checkin';
import { participantDetails } from '@/lib/participant-details';

export const dynamic = 'force-dynamic';

/**
 * GET ?badgeCode=… — READ-ONLY badge lookup for the organizer's «معلومات
 * المشارك» and «جلسات الإرشاد» scanners: the same details as the participant
 * card. Never records an entry or exit (only the attendance tab does).
 */
export async function GET(request: NextRequest) {
  const organizer = await requireOrganizer(cookies().get('token')?.value);
  if (!organizer) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  try {
    const badgeCode = String(new URL(request.url).searchParams.get('badgeCode') || '').trim().toUpperCase();
    if (!badgeCode) return NextResponse.json({ error: 'رمز البطاقة مطلوب' }, { status: 400 });
    const holder = await findBadgeHolder(badgeCode);
    if (!holder) return NextResponse.json({ error: 'بطاقة غير معروفة — تحقق من الرمز' }, { status: 404 });
    const details = await participantDetails(holder.participantId);
    if (!details) return NextResponse.json({ error: 'المشارك غير موجود' }, { status: 404 });
    return NextResponse.json(details);
  } catch (error) {
    console.error('Error in organizer badge lookup:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
