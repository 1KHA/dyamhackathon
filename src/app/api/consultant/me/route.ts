import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireConsultant } from '@/lib/consultant-auth';

export const dynamic = 'force-dynamic';

/** GET — the signed-in consultant. */
export async function GET() {
  const consultant = await requireConsultant(cookies().get('token')?.value);
  if (!consultant) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }
  return NextResponse.json({ success: true, role: 'consultant', ...consultant, serverNow: new Date().toISOString() });
}
