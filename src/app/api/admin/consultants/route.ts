import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { CONSULTANT_USERNAME_RE as USERNAME_RE, generateConsultantPassword as generatePassword } from '@/lib/consultant-auth';

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = () => NextResponse.json({ error: 'غير مصرح' }, { status: 401 });


const PUBLIC = { id: true, username: true, name: true, email: true, isDisabled: true, createdAt: true, updatedAt: true, _count: { select: { ratings: true } } } as const;

/** GET /api/admin/consultants — all consultant accounts. */
export async function GET() {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  const rows = await prisma.consultant.findMany({ orderBy: { createdAt: 'asc' }, select: PUBLIC });
  return NextResponse.json({ consultants: rows.map((c) => ({ ...c, ratedCount: c._count.ratings, _count: undefined })) });
}

/**
 * POST /api/admin/consultants — create an account.
 * Body: { username, name, email?, password? } — a password is generated when
 * none is given and returned ONCE in the response (only the hash is stored).
 */
export async function POST(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const body = await request.json();
    const username = String(body.username || '').trim();
    const name = String(body.name || '').replace(/\s+/g, ' ').trim();
    const email = String(body.email || '').trim().toLowerCase() || null;
    const givenPassword = typeof body.password === 'string' ? body.password : '';

    if (!USERNAME_RE.test(username)) {
      return NextResponse.json({ error: 'اسم المستخدم: 3–40 حرفاً لاتينياً أو رقماً أو . _ -' }, { status: 400 });
    }
    if (!name || name.length > 80) return NextResponse.json({ error: 'الاسم مطلوب (حتى 80 حرفاً)' }, { status: 400 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: 'البريد الإلكتروني غير صالح' }, { status: 400 });
    if (givenPassword && givenPassword.length < 8) return NextResponse.json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' }, { status: 400 });

    if (await prisma.consultant.findUnique({ where: { username }, select: { id: true } })) {
      return NextResponse.json({ error: 'اسم المستخدم مستخدم مسبقاً' }, { status: 409 });
    }

    const password = givenPassword || generatePassword();
    const created = await prisma.consultant.create({
      data: { username, name, email, passwordHash: await bcrypt.hash(password, 10) },
      select: PUBLIC,
    });
    return NextResponse.json({ success: true, consultant: { ...created, ratedCount: 0, _count: undefined }, password }, { status: 201 });
  } catch (error) {
    console.error('Error creating consultant:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
