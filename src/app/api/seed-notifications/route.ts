import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { seedNotifications } from '@/lib/seed-notifications';
import { verifyToken } from '@/lib/notification-auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // This endpoint writes sample rows against hardcoded IDs — it is a
    // development aid and must never run against production data.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({
        success: false,
        error: 'This endpoint is disabled in production',
      }, { status: 403 });
    }

    // Admins only
    const claims = verifyToken(cookies().get('token')?.value);

    if (!claims || claims.role !== 'admin') {
      return NextResponse.json({
        success: false,
        error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.',
      }, { status: 401 });
    }

    const result = await seedNotifications();

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Successfully created ${result.count} sample notifications`,
        count: result.count,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to seed notifications',
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in seed notifications API:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
    }, { status: 500 });
  }
}
