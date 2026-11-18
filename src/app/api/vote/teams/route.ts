import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getVoteSettings, votingState, getBallotTeams } from '@/lib/voting';

export const dynamic = 'force-dynamic';

/**
 * GET /api/vote/teams — public. The ballot: voting status + the teams of the
 * voting phase (name, leader, track, idea). No vote counts are exposed here on
 * purpose (no bandwagon effect); the admin screen has them.
 */
export async function GET() {
  try {
    const settings = await getVoteSettings();
    const state = votingState(settings);

    let phaseName: string | null = null;
    let teams: Awaited<ReturnType<typeof getBallotTeams>> = [];
    if (settings.phaseId) {
      const phase = await prisma.phase.findUnique({ where: { id: settings.phaseId }, select: { name: true } });
      phaseName = phase?.name ?? null;
      // The list is shown even when voting is closed (visitors can still read
      // the ideas); only the vote buttons are disabled.
      if (settings.enabled) teams = await getBallotTeams(settings.phaseId);
    }

    return NextResponse.json({
      state,
      phaseName,
      votingStart: settings.votingStart,
      votingEnd: settings.votingEnd,
      serverTime: new Date().toISOString(),
      teams,
    });
  } catch (error) {
    console.error('Error loading ballot:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
