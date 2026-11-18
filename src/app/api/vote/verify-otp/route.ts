import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getVoteSettings,
  votingState,
  normalizeEmail,
  otpMatches,
  signVoteToken,
  OTP_MAX_ATTEMPTS,
  VOTE_TOKEN_TTL_MINUTES,
} from '@/lib/voting';

export const dynamic = 'force-dynamic';

const WRONG = () => NextResponse.json({ error: 'رمز التحقق غير صحيح أو منتهي الصلاحية.' }, { status: 400 });

/**
 * POST /api/vote/verify-otp — public.
 * Body: { email, code } → { voteToken } valid for VOTE_TOKEN_TTL_MINUTES.
 * The vote itself is cast with /api/vote/cast.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const code = typeof body?.code === 'string' ? body.code.replace(/\D/g, '') : '';
    if (!email || code.length !== 6) return WRONG();

    const settings = await getVoteSettings();
    const state = votingState(settings);
    if (!state.open) return NextResponse.json({ error: state.message, state }, { status: 403 });

    const now = new Date();
    const otp = await prisma.voteOtp.findFirst({
      where: { email, verifiedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) return WRONG();

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: 'تم تجاوز عدد المحاولات لهذا الرمز. اطلب رمزاً جديداً.' },
        { status: 400 }
      );
    }

    if (!otpMatches(email, code, otp.codeHash)) {
      const updated = await prisma.voteOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      const left = OTP_MAX_ATTEMPTS - updated.attempts;
      return NextResponse.json(
        {
          error:
            left > 0
              ? `رمز التحقق غير صحيح. المحاولات المتبقية: ${left}.`
              : 'رمز التحقق غير صحيح وتم إيقاف هذا الرمز. اطلب رمزاً جديداً.',
          attemptsLeft: Math.max(left, 0),
        },
        { status: 400 }
      );
    }

    await prisma.voteOtp.update({ where: { id: otp.id }, data: { verifiedAt: now } });

    return NextResponse.json({
      success: true,
      voteToken: signVoteToken({ otpId: otp.id, email }),
      firstName: otp.firstName,
      lastName: otp.lastName,
      expiresInSeconds: VOTE_TOKEN_TTL_MINUTES * 60,
    });
  } catch (error) {
    console.error('Error in verify-otp:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}
