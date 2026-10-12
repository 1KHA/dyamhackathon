import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireOrganizer } from '@/lib/organizer-auth';
import { undoScan } from '@/lib/attendance-scans';

export const dynamic = 'force-dynamic';

/**
 * POST { scanId } — an organizer takes back one of THEIR OWN scans within
 * ORGANIZER_UNDO_MINUTES (a wrong entry/exit at the door). Anything older, or
 * someone else's scan, is for an admin to correct.
 */
export async function POST(request: NextRequest) {
  const organizer = await requireOrganizer(cookies().get('token')?.value);
  if (!organizer) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  try {
    const body = await request.json();
    if (!body.scanId) return NextResponse.json({ error: 'معرف المسح مطلوب' }, { status: 400 });
    const r = await undoScan(String(body.scanId), { role: 'organizer', id: organizer.id });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ success: true, undone: r.undone, revertedCheckin: r.revertedCheckin });
  } catch (error) {
    console.error('Error undoing organizer scan:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
