import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireConsultant } from '@/lib/consultant-auth';
import {
  RATING_CRITERIA, aggregateTeam, getRatedTeams, getRatingSettings, ratingTotal, scoresFromRows,
} from '@/lib/rating';

export const dynamic = 'force-dynamic';

/**
 * GET /api/consultant/teams — the rated phase's teams with the caller's own
 * rating and the combined (average) total of all consultants per team.
 */
export async function GET() {
  const me = await requireConsultant(cookies().get('token')?.value);
  if (!me) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  try {
    const settings = await getRatingSettings();
    const phase = settings.phaseId
      ? await prisma.phase.findUnique({ where: { id: settings.phaseId }, select: { name: true } })
      : null;
    const teams = settings.phaseId ? await getRatedTeams(settings.phaseId) : [];
    const teamIds = teams.map((t) => t.id);

    const ratings = teamIds.length
      ? await prisma.teamRating.findMany({
          where: { teamId: { in: teamIds }, consultant: { isDisabled: false } },
          select: {
            teamId: true,
            consultantId: true,
            notes: true,
            updatedAt: true,
            scores: { select: { criterionKey: true, value: true } },
          },
        })
      : [];

    const byTeam: Record<string, { consultantId: string; notes: string | null; updatedAt: Date; scores: Record<string, number> }[]> = {};
    for (const r of ratings) {
      (byTeam[r.teamId] ||= []).push({ consultantId: r.consultantId, notes: r.notes, updatedAt: r.updatedAt, scores: scoresFromRows(r.scores) });
    }

    return NextResponse.json({
      consultant: me,
      settings: {
        enabled: settings.enabled,
        phaseId: settings.phaseId,
        phaseName: phase?.name ?? null,
        finalWeight: settings.finalWeight,
      },
      criteria: RATING_CRITERIA,
      serverTime: new Date().toISOString(),
      teams: teams.map((t) => {
        const list = byTeam[t.id] || [];
        const mine = list.find((r) => r.consultantId === me.id);
        const agg = aggregateTeam(list);
        return {
          ...t,
          myRating: mine ? { scores: mine.scores, total: ratingTotal(mine.scores), notes: mine.notes, updatedAt: mine.updatedAt } : null,
          aggregate: { count: agg.count, avgTotal: agg.avgTotal },
        };
      }),
    });
  } catch (error) {
    console.error('Error listing teams for rating:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
