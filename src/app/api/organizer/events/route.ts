import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireOrganizer } from '@/lib/organizer-auth';

export const dynamic = 'force-dynamic';

/** GET — events (sessions) organizers can scan entries/exits for, newest first. */
export async function GET() {
  const organizer = await requireOrganizer(cookies().get('token')?.value);
  if (!organizer) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  const events = await prisma.event.findMany({
    where: { status: { not: 'cancelled' } },
    select: { id: true, title: true, startDate: true, endDate: true, location: true },
    orderBy: { startDate: 'desc' },
  });
  return NextResponse.json({ events });
}
