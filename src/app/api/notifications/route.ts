import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getNotifications, getUnreadNotificationCount } from '@/lib/notifications';
import { resolveRecipientFromToken } from '@/lib/notification-auth';

// Ensure this route is dynamic
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    // Determine user type and ID from the token claims
    const recipient = resolveRecipientFromToken(token);

    if (!recipient) {
      return NextResponse.json({ error: 'نوع المستخدم غير صحيح' }, { status: 400 });
    }

    const { recipientType, recipientId } = recipient;

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const isRead = searchParams.get('isRead');
    const type = searchParams.get('type');

    const options = {
      page,
      limit,
      ...(isRead !== null && { isRead: isRead === 'true' }),
      ...(type && { type }),
    };

    const result = await getNotifications(recipientType, recipientId, options);
    const unreadCount = await getUnreadNotificationCount(recipientType, recipientId);

    return NextResponse.json({
      ...result,
      unreadCount,
    });

  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
