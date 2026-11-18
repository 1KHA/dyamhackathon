import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getVoteSettings, votingState, verifyVoteToken } from '@/lib/voting';

export const dynamic = 'force-dynamic';

/**
 * POST /api/vote/cast — public.
 * Body: { voteToken, teamId }. Records the single vote of a verified email.
 * Everything that matters is re-checked here: window open, token valid and
 * unused, team on the ballot, email has not voted. The voter + vote rows are
 * created in one transaction; the unique indexes make a double submit a 409.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const claims = verifyVoteToken(body?.voteToken);
    const teamId = typeof body?.teamId === 'string' ? body.teamId : '';
    if (!claims) {
      return NextResponse.json({ error: 'انتهت صلاحية التحقق. يرجى طلب رمز جديد.', tokenExpired: true }, { status: 401 });
    }
    if (!teamId) return NextResponse.json({ error: 'يرجى اختيار فريق.' }, { status: 400 });

    const settings = await getVoteSettings();
    const state = votingState(settings);
    if (!state.open) return NextResponse.json({ error: state.message, state }, { status: 403 });

    const otp = await prisma.voteOtp.findUnique({ where: { id: claims.otpId } });
    if (!otp || otp.email !== claims.email || !otp.verifiedAt || otp.usedAt) {
      return NextResponse.json({ error: 'انتهت صلاحية التحقق. يرجى طلب رمز جديد.', tokenExpired: true }, { status: 401 });
    }

    const team = await prisma.team.findFirst({
      where: { id: teamId, phaseId: settings.phaseId!, status: 'approved', isDisabled: false },
      select: { id: true, teamName: true },
    });
    if (!team) return NextResponse.json({ error: 'الفريق المختار غير موجود في قائمة التصويت.' }, { status: 400 });

    const now = new Date();
    try {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.publicVoter.findUnique({ where: { email: otp.email }, select: { id: true, vote: { select: { id: true } } } });
        if (existing?.vote) throw new AlreadyVoted();
        const voter =
          existing ??
          (await tx.publicVoter.create({
            data: { email: otp.email, firstName: otp.firstName, lastName: otp.lastName, verifiedAt: otp.verifiedAt! },
            select: { id: true, vote: true },
          }));
        await tx.publicVote.create({ data: { voterId: voter.id, teamId: team.id } });
        await tx.voteOtp.update({ where: { id: otp.id }, data: { usedAt: now } });
      });
    } catch (e) {
      if (e instanceof AlreadyVoted || (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
        return NextResponse.json(
          { error: 'هذا البريد الإلكتروني صوّت مسبقاً. يُسمح بصوت واحد فقط لكل بريد.', alreadyVoted: true },
          { status: 409 }
        );
      }
      throw e;
    }

    return NextResponse.json({
      success: true,
      message: `تم تسجيل صوتك لفريق «${(team.teamName || '').trim()}». شكراً لمشاركتك!`,
      team: { id: team.id, teamName: (team.teamName || '').trim() },
      votedAt: now.toISOString(),
    });
  } catch (error) {
    console.error('Error in cast vote:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}

class AlreadyVoted extends Error {}
