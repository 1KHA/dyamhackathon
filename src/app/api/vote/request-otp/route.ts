import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmailSettings, toSmtpConfig, sendEmail } from '@/lib/mailer';
import {
  getVoteSettings,
  votingState,
  normalizeEmail,
  isValidEmail,
  cleanName,
  clientIp,
  hashIp,
  generateOtpCode,
  hashOtp,
  OTP_TTL_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_MAX_PER_EMAIL_PER_HOUR,
  OTP_MAX_PER_IP_PER_HOUR,
} from '@/lib/voting';

export const dynamic = 'force-dynamic';

/**
 * POST /api/vote/request-otp — public.
 * Body: { firstName, lastName, email, teamId? }
 * Validates the visitor's details, refuses emails that already voted, applies
 * rate limits, then emails a 6-digit code (only its HMAC is stored).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const firstName = cleanName(body?.firstName);
    const lastName = cleanName(body?.lastName);
    const email = normalizeEmail(body?.email);

    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'يرجى إدخال الاسم الأول واسم العائلة (حروف فقط).' }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'يرجى إدخال بريد إلكتروني صحيح.' }, { status: 400 });
    }

    const settings = await getVoteSettings();
    const state = votingState(settings);
    if (!state.open) {
      return NextResponse.json({ error: state.message, state }, { status: 403 });
    }

    // Optional early check that the chosen team is on the ballot — the real
    // check happens again at cast time.
    if (typeof body?.teamId === 'string' && body.teamId) {
      const team = await prisma.team.findFirst({
        where: { id: body.teamId, phaseId: settings.phaseId!, status: 'approved', isDisabled: false },
        select: { id: true },
      });
      if (!team) return NextResponse.json({ error: 'الفريق المختار غير موجود في قائمة التصويت.' }, { status: 400 });
    }

    // One vote per email — tell the visitor plainly (the requirement asks to
    // check whether the email voted before).
    const voter = await prisma.publicVoter.findUnique({ where: { email }, select: { vote: { select: { id: true } } } });
    if (voter?.vote) {
      return NextResponse.json(
        { error: 'هذا البريد الإلكتروني صوّت مسبقاً. يُسمح بصوت واحد فقط لكل بريد.', alreadyVoted: true },
        { status: 409 }
      );
    }

    // Rate limits (all derived from VoteOtp rows — no in-memory state, so
    // they hold across serverless instances).
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const ipHash = hashIp(clientIp(request.headers));

    const latest = await prisma.voteOtp.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (latest) {
      const since = (now.getTime() - latest.createdAt.getTime()) / 1000;
      if (since < OTP_RESEND_COOLDOWN_SECONDS) {
        const wait = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - since);
        return NextResponse.json(
          { error: `تم إرسال رمز قبل قليل. يمكنك طلب رمز جديد بعد ${wait} ثانية.`, retryAfter: wait },
          { status: 429 }
        );
      }
    }
    const perEmail = await prisma.voteOtp.count({ where: { email, createdAt: { gte: hourAgo } } });
    if (perEmail >= OTP_MAX_PER_EMAIL_PER_HOUR) {
      return NextResponse.json(
        { error: 'تم تجاوز عدد محاولات الإرسال لهذا البريد. حاول مرة أخرى بعد ساعة.' },
        { status: 429 }
      );
    }
    if (ipHash) {
      const perIp = await prisma.voteOtp.count({ where: { ipHash, createdAt: { gte: hourAgo } } });
      if (perIp >= OTP_MAX_PER_IP_PER_HOUR) {
        return NextResponse.json(
          { error: 'تم تجاوز عدد المحاولات من هذا الاتصال. حاول مرة أخرى لاحقاً.' },
          { status: 429 }
        );
      }
    }

    const emailSettings = await getEmailSettings();
    const config = emailSettings?.enabled ? toSmtpConfig(emailSettings) : null;
    if (!config) {
      return NextResponse.json(
        { error: 'خدمة البريد الإلكتروني غير مفعلة حالياً. يرجى المحاولة لاحقاً.' },
        { status: 503 }
      );
    }

    const code = generateOtpCode();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

    // Older unused codes for this email stop working as soon as a new one is
    // issued (expire them) — only the latest code is valid.
    await prisma.voteOtp.updateMany({
      where: { email, verifiedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    const otp = await prisma.voteOtp.create({
      data: { email, firstName, lastName, codeHash: hashOtp(email, code), expiresAt, ipHash },
      select: { id: true },
    });

    const result = await sendEmail({
      config,
      to: email,
      subject: `رمز التحقق للتصويت: ${code}`,
      title: 'رمز التحقق للتصويت في مياهثون',
      bodyText:
        `مرحباً ${firstName} ${lastName}،\n\n` +
        `رمز التحقق الخاص بك للتصويت هو:\n\n${code}\n\n` +
        `الرمز صالح لمدة ${OTP_TTL_MINUTES} دقائق ويُستخدم مرة واحدة.\n` +
        `إذا لم تطلب هذا الرمز فتجاهل هذه الرسالة.`,
    });

    if (!result.ok) {
      console.error('[vote] OTP email failed:', result.error);
      // Burn the code so nothing dangles, and let the visitor retry after the cooldown.
      await prisma.voteOtp.update({ where: { id: otp.id }, data: { expiresAt: now } }).catch(() => undefined);
      return NextResponse.json({ error: 'تعذر إرسال رمز التحقق. حاول مرة أخرى بعد قليل.' }, { status: 500 });
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[vote] (dev only) OTP for ${email}: ${code}`);
    }

    return NextResponse.json({
      success: true,
      message: `تم إرسال رمز التحقق إلى ${email}. تحقق من صندوق الوارد (أو الرسائل غير المرغوبة).`,
      expiresInSeconds: OTP_TTL_MINUTES * 60,
      resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    });
  } catch (error) {
    console.error('Error in request-otp:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}
