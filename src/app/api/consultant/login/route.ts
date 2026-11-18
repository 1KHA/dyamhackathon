import { NextRequest, NextResponse } from 'next/server';
import { isSecureRequest } from '@/lib/cookie-security';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { DISABLED_ACCOUNT_MESSAGE } from '@/lib/account-status';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * POST — consultant (مستشار التقييم) login: { username, password }.
 * Issues the same `token` cookie as the other roles, with role 'consultant'.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!username || !password) {
      return NextResponse.json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' }, { status: 400 });
    }

    const consultant = await prisma.consultant.findUnique({ where: { username } });
    if (!consultant || !(await bcrypt.compare(password, consultant.passwordHash))) {
      return NextResponse.json({ error: 'بيانات الاعتماد غير صالحة' }, { status: 401 });
    }

    // after the password check, so this cannot be used to probe usernames
    if (consultant.isDisabled) {
      return NextResponse.json({ error: DISABLED_ACCOUNT_MESSAGE }, { status: 403 });
    }

    const token = jwt.sign(
      { id: consultant.id, username: consultant.username, role: 'consultant' },
      JWT_SECRET,
      { expiresIn: '60m' }
    );

    const response = NextResponse.json({
      success: true,
      user: { id: consultant.id, username: consultant.username, name: consultant.name, role: 'consultant' },
    });
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: 'lax',
      maxAge: 60 * 60, // matches the JWT lifetime; middleware slides it
      path: '/',
    });
    return response;
  } catch (error) {
    console.error('Error during consultant login:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
