import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { generateConsultantPassword as generatePassword } from '@/lib/consultant-auth';

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = () => NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

/**
 * PATCH /api/admin/consultants/:id
 * Body (all optional): { name, email, isDisabled, resetPassword: true | "<new password>" }
 * When a password is reset it is returned ONCE in the response.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const existing = await prisma.consultant.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 });

    const body = await request.json();
    const data: Record<string, unknown> = {};
    let password: string | undefined;

    if (body.name !== undefined) {
      const name = String(body.name || '').replace(/\s+/g, ' ').trim();
      if (!name || name.length > 80) return NextResponse.json({ error: 'الاسم مطلوب (حتى 80 حرفاً)' }, { status: 400 });
      data.name = name;
    }
    if (body.email !== undefined) {
      const email = String(body.email || '').trim().toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: 'البريد الإلكتروني غير صالح' }, { status: 400 });
      data.email = email || null;
    }
    if (body.isDisabled !== undefined) data.isDisabled = body.isDisabled === true;
    if (body.resetPassword) {
      const newPassword: string = typeof body.resetPassword === 'string' ? body.resetPassword : generatePassword();
      if (newPassword.length < 8) return NextResponse.json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' }, { status: 400 });
      data.passwordHash = await bcrypt.hash(newPassword, 10);
      password = newPassword;
    }

    const updated = await prisma.consultant.update({
      where: { id: params.id },
      data,
      select: { id: true, username: true, name: true, email: true, isDisabled: true, createdAt: true, updatedAt: true, _count: { select: { ratings: true } } },
    });
    return NextResponse.json({ success: true, consultant: { ...updated, ratedCount: updated._count.ratings, _count: undefined }, password });
  } catch (error) {
    console.error('Error updating consultant:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/consultants/:id — removes the account AND its ratings
 * (cascade). Prefer disabling; the UI asks for confirmation first.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const existing = await prisma.consultant.findUnique({ where: { id: params.id }, select: { id: true, _count: { select: { ratings: true } } } });
    if (!existing) return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 });
    await prisma.consultant.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true, deletedRatings: existing._count.ratings });
  } catch (error) {
    console.error('Error deleting consultant:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
