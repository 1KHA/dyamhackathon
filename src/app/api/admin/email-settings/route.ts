import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { encryptSecret, decryptSecret } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = NextResponse.json(
  { error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' },
  { status: 401 }
);

/**
 * GET — current settings with the password masked. `hasPassword` tells the UI
 * whether a password is stored and still decryptable.
 */
export async function GET() {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED;

  try {
    const row = await prisma.emailSettings.findFirst();

    if (!row) {
      return NextResponse.json({ error: 'إعدادات البريد غير موجودة' }, { status: 500 });
    }

    const { password, ...rest } = row;
    return NextResponse.json({
      ...rest,
      hasPassword: password !== '' && decryptSecret(password) !== null,
    });
  } catch (error) {
    console.error('Error fetching email settings:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

/**
 * PUT — update settings. A blank/absent password keeps the stored one;
 * a provided password is encrypted at rest.
 */
export async function PUT(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED;

  try {
    const body = await request.json();
    const existing = await prisma.emailSettings.findFirst();

    if (!existing) {
      return NextResponse.json({ error: 'إعدادات البريد غير موجودة' }, { status: 500 });
    }

    const port = Number.parseInt(String(body.port ?? existing.port), 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return NextResponse.json({ error: 'منفذ SMTP غير صالح' }, { status: 400 });
    }

    const updated = await prisma.emailSettings.update({
      where: { id: existing.id },
      data: {
        host: String(body.host ?? existing.host).trim(),
        port,
        secure: Boolean(body.secure ?? existing.secure),
        username: String(body.username ?? existing.username).trim(),
        // blank password = keep the stored one
        ...(body.password ? { password: encryptSecret(String(body.password)) } : {}),
        fromEmail: String(body.fromEmail ?? existing.fromEmail).trim(),
        fromName: String(body.fromName ?? existing.fromName).trim(),
        adminInboxEmail: String(body.adminInboxEmail ?? existing.adminInboxEmail).trim(),
        enabled: Boolean(body.enabled ?? existing.enabled),
      },
    });

    const { password, ...rest } = updated;
    return NextResponse.json({
      ...rest,
      hasPassword: password !== '' && decryptSecret(password) !== null,
    });
  } catch (error) {
    console.error('Error updating email settings:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
