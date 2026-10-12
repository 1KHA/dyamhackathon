import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireOrganizer } from '@/lib/organizer-auth';
import { participantDetails } from '@/lib/participant-details';

export const dynamic = 'force-dynamic';

/** GET — one participant's details, team, members, bookings and today's entries/exits (organizers). */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const organizer = await requireOrganizer(cookies().get('token')?.value);
  if (!organizer) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  try {
    const details = await participantDetails(params.id);
    if (!details) return NextResponse.json({ error: 'المشارك غير موجود' }, { status: 404 });
    return NextResponse.json(details);
  } catch (error) {
    console.error('Error loading participant details:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
