import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { markAllNotificationsAsRead } from '@/lib/notifications';
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

    // Determine user type and ID from the token claims
    const recipient = resolveRecipientFromToken(token);

    if (!recipient) {
      return NextResponse.json({ error: 'نوع المستخدم غير صحيح' }, { status: 400 });
    }

    await markAllNotificationsAsRead(recipient.recipientType, recipient.recipientId);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
