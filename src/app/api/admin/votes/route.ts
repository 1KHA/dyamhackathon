import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { getVoteSettings, votingState, getBallotTeams, computeResults } from '@/lib/voting';

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = () =>
  NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });

/**
 * GET /api/admin/votes — settings, status, per-team results and the 5% score.
 * Score rule (new_req/طريقة حساب 5% للتصويت.png):
 *   درجة التصويت = (أصوات الفريق ÷ أعلى عدد أصوات) × maxScore
 */
export async function GET() {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const settings = await getVoteSettings();
    const state = votingState(settings);

    const [phases, teams, grouped, voterCount, lastVote] = await Promise.all([
      prisma.phase.findMany({ orderBy: { order: 'asc' }, select: { id: true, name: true, order: true, isDisabled: true } }),
      settings.phaseId ? getBallotTeams(settings.phaseId) : Promise.resolve([]),
      prisma.publicVote.groupBy({ by: ['teamId'], _count: { _all: true } }),
      prisma.publicVoter.count(),
      prisma.publicVote.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);

    const countByTeam: Record<string, number> = {};
    for (const t of teams) countByTeam[t.id] = 0;
    // Votes for teams no longer on the ballot (moved phase / disabled after
    // voting) are still counted and flagged, never silently dropped.
    const offBallot: string[] = [];
    for (const g of grouped) {
      if (!(g.teamId in countByTeam)) offBallot.push(g.teamId);
      countByTeam[g.teamId] = g._count._all;
    }
    const offBallotTeams = offBallot.length
      ? await prisma.team.findMany({ where: { id: { in: offBallot } }, select: { id: true, teamName: true } })
      : [];
    const nameById = new Map<string, { teamName: string; leaderName: string; hackathonTrack: string | null; onBallot: boolean }>();
    for (const t of teams) nameById.set(t.id, { teamName: t.teamName, leaderName: t.leaderName, hackathonTrack: t.hackathonTrack, onBallot: true });
    for (const t of offBallotTeams) nameById.set(t.id, { teamName: (t.teamName || '').trim() || t.id, leaderName: '', hackathonTrack: null, onBallot: false });

    const { totalVotes, topVotes, results } = computeResults(countByTeam, settings.maxScore);

    return NextResponse.json({
      settings: {
        enabled: settings.enabled,
        phaseId: settings.phaseId,
        votingStart: settings.votingStart,
        votingEnd: settings.votingEnd,
        maxScore: settings.maxScore,
        updatedAt: settings.updatedAt,
      },
      state,
      serverTime: new Date().toISOString(),
      phases,
      summary: {
        totalVotes,
        topVotes,
        voters: voterCount,
        teamsOnBallot: teams.length,
        teamsWithVotes: results.filter((r) => r.votes > 0).length,
        lastVoteAt: lastVote?.createdAt ?? null,
      },
      results: results.map((r) => ({
        ...r,
        teamName: nameById.get(r.teamId)?.teamName ?? r.teamId,
        leaderName: nameById.get(r.teamId)?.leaderName ?? '',
        hackathonTrack: nameById.get(r.teamId)?.hackathonTrack ?? null,
        onBallot: nameById.get(r.teamId)?.onBallot ?? false,
      })),
    });
  } catch (error) {
    console.error('Error reading votes:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/votes — update settings.
 * Body (all optional): { enabled, phaseId, votingStart, votingEnd, maxScore }
 * Dates are ISO strings or null to clear.
 */
export async function PUT(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.enabled !== undefined) data.enabled = body.enabled === true;

    if (body.phaseId !== undefined) {
      if (body.phaseId === null || body.phaseId === '') data.phaseId = null;
      else {
        const phase = await prisma.phase.findUnique({ where: { id: String(body.phaseId) }, select: { id: true } });
        if (!phase) return NextResponse.json({ error: 'المرحلة غير موجودة' }, { status: 400 });
        data.phaseId = phase.id;
      }
    }

    const parseDate = (v: unknown): Date | null | 'invalid' => {
      if (v === null || v === undefined || v === '') return null;
      const d = new Date(String(v));
      return isNaN(d.getTime()) ? 'invalid' : d;
    };
    if (body.votingStart !== undefined) {
      const d = parseDate(body.votingStart);
      if (d === 'invalid') return NextResponse.json({ error: 'صيغة تاريخ البداية غير صالحة' }, { status: 400 });
      data.votingStart = d;
    }
    if (body.votingEnd !== undefined) {
      const d = parseDate(body.votingEnd);
      if (d === 'invalid') return NextResponse.json({ error: 'صيغة تاريخ النهاية غير صالحة' }, { status: 400 });
      data.votingEnd = d;
    }

    if (body.maxScore !== undefined) {
      const n = Number(body.maxScore);
      if (!Number.isFinite(n) || n <= 0 || n > 100) {
        return NextResponse.json({ error: 'الدرجة القصوى يجب أن تكون رقماً بين 0 و 100' }, { status: 400 });
      }
      data.maxScore = n;
    }

    const current = await getVoteSettings();
    const start = (data.votingStart !== undefined ? data.votingStart : current.votingStart) as Date | null;
    const end = (data.votingEnd !== undefined ? data.votingEnd : current.votingEnd) as Date | null;
    if (start && end && end <= start) {
      return NextResponse.json({ error: 'يجب أن يكون موعد انتهاء التصويت بعد موعد البداية' }, { status: 400 });
    }

    const updated = await prisma.voteSettings.update({ where: { id: current.id }, data });
    return NextResponse.json({
      settings: {
        enabled: updated.enabled,
        phaseId: updated.phaseId,
        votingStart: updated.votingStart,
        votingEnd: updated.votingEnd,
        maxScore: updated.maxScore,
        updatedAt: updated.updatedAt,
      },
      state: votingState(updated),
    });
  } catch (error) {
    console.error('Error updating vote settings:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
