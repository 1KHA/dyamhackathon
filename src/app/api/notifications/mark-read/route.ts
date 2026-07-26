import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { markNotificationAsRead } from '@/lib/notifications';
import { resolveRecipientFromToken } from '@/lib/notification-auth';

// Ensure this route is dynamic
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const recipient = resolveRecipientFromToken(token);

    if (!recipient) {
      return NextResponse.json({ error: 'نوع المستخدم غير صحيح' }, { status: 400 });
    }

    const body = await request.json();
    const { notificationId } = body;

    if (!notificationId) {
      return NextResponse.json({ error: 'معرف الإشعار مطلوب' }, { status: 400 });
    }

    // Scoped to the caller: a notification belonging to someone else is a
    // silent no-op, so the response reveals nothing about which IDs exist.
    await markNotificationAsRead(
      notificationId,
      recipient.recipientType,
      recipient.recipientId
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error marking notification as read:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
