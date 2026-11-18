import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import {
  RATING_CRITERIA, aggregateTeam, finalShare, getRatedTeams, getRatingSettings, ratingTotal, scoresFromRows,
} from '@/lib/rating';

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = () =>
  NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });

/**
 * GET /api/admin/ratings — settings, consultants, and per-team results:
 * every consultant's rating, the team average (0..100) and its share of the
 * final score (average × finalWeight ÷ 100, 35 % by default).
 */
export async function GET() {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const settings = await getRatingSettings();
    const [phases, teams, consultants] = await Promise.all([
      prisma.phase.findMany({ orderBy: { order: 'asc' }, select: { id: true, name: true, order: true, isDisabled: true } }),
      settings.phaseId ? getRatedTeams(settings.phaseId) : Promise.resolve([]),
      prisma.consultant.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, username: true, name: true, email: true, isDisabled: true, createdAt: true, _count: { select: { ratings: true } } },
      }),
    ]);

    const ratingRows = await prisma.teamRating.findMany({
      select: {
        teamId: true,
        consultantId: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        consultant: { select: { name: true, isDisabled: true } },
        scores: { select: { criterionKey: true, value: true } },
      },
    });

    const teamIds = new Set(teams.map((t) => t.id));
    const byTeam: Record<string, typeof ratingRows> = {};
    const offPhase = new Set<string>();
    for (const r of ratingRows) {
      (byTeam[r.teamId] ||= []).push(r);
      if (!teamIds.has(r.teamId)) offPhase.add(r.teamId);
    }
    // Ratings of teams that later left the phase / got disabled stay visible,
    // flagged rather than dropped.
    const offPhaseTeams = offPhase.size
      ? await prisma.team.findMany({ where: { id: { in: Array.from(offPhase) } }, select: { id: true, teamName: true, hackathonTrack: true } })
      : [];

    const baseTeams = [
      ...teams.map((t) => ({ ...t, onPhase: true })),
      ...offPhaseTeams.map((t) => ({
        id: t.id, teamName: (t.teamName || '').trim() || t.id, leaderName: '', hackathonTrack: t.hackathonTrack,
        ideaName: null, ideaDescription: '', membersCount: 0, onPhase: false,
      })),
    ];

    const results = baseTeams.map((t) => {
      const rows = (byTeam[t.id] || []).filter((r) => !r.consultant.isDisabled);
      const ratings = rows.map((r) => {
        const scores = scoresFromRows(r.scores);
        return {
          consultantId: r.consultantId,
          consultantName: r.consultant.name,
          scores,
          total: ratingTotal(scores),
          notes: r.notes,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
      });
      const agg = aggregateTeam(ratings);
      return {
        teamId: t.id,
        teamName: t.teamName,
        leaderName: t.leaderName,
        hackathonTrack: t.hackathonTrack,
        membersCount: t.membersCount,
        onPhase: t.onPhase,
        ratingsCount: agg.count,
        avgTotal: agg.avgTotal,
        finalShare: finalShare(agg.avgTotal, settings.finalWeight),
        criterionAvg: agg.criterionAvg,
        criterionAvgScore: agg.criterionAvgScore,
        ratings,
      };
    });

    // rank: highest average first; unrated teams last, then by name
    const collator = new Intl.Collator('ar');
    results.sort((a, b) => {
      if (a.ratingsCount === 0 && b.ratingsCount === 0) return collator.compare(a.teamName, b.teamName);
      if (a.ratingsCount === 0) return 1;
      if (b.ratingsCount === 0) return -1;
      return b.avgTotal - a.avgTotal || collator.compare(a.teamName, b.teamName);
    });
    let rank = 0;
    let prev = -1;
    const ranked = results.map((r, i) => {
      if (r.ratingsCount === 0) return { ...r, rank: null as number | null };
      if (r.avgTotal !== prev) { rank = i + 1; prev = r.avgTotal; }
      return { ...r, rank };
    });

    const activeConsultants = consultants.filter((c) => !c.isDisabled);
    const lastRating = ratingRows.reduce<Date | null>((m, r) => (!m || r.updatedAt > m ? r.updatedAt : m), null);

    return NextResponse.json({
      settings: {
        enabled: settings.enabled,
        phaseId: settings.phaseId,
        finalWeight: settings.finalWeight,
        updatedAt: settings.updatedAt,
      },
      serverTime: new Date().toISOString(),
      phases,
      criteria: RATING_CRITERIA,
      consultants: consultants.map((c) => ({
        id: c.id, username: c.username, name: c.name, email: c.email, isDisabled: c.isDisabled, createdAt: c.createdAt,
        ratedCount: c._count.ratings,
      })),
      summary: {
        teamsOnPhase: teams.length,
        teamsRated: ranked.filter((r) => r.onPhase && r.ratingsCount > 0).length,
        teamsFullyRated: ranked.filter((r) => r.onPhase && r.ratingsCount >= activeConsultants.length && activeConsultants.length > 0).length,
        consultantsActive: activeConsultants.length,
        totalRatings: ratingRows.length,
        lastRatingAt: lastRating,
      },
      results: ranked,
    });
  } catch (error) {
    console.error('Error reading ratings:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/ratings — update settings.
 * Body (all optional): { enabled, phaseId, finalWeight }
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

    if (body.finalWeight !== undefined) {
      const n = Number(body.finalWeight);
      if (!Number.isFinite(n) || n <= 0 || n > 100) {
        return NextResponse.json({ error: 'وزن التقييم في الدرجة النهائية يجب أن يكون رقماً بين 0 و 100' }, { status: 400 });
      }
      data.finalWeight = n;
    }

    const current = await getRatingSettings();
    const updated = await prisma.ratingSettings.update({ where: { id: current.id }, data });
    return NextResponse.json({
      settings: { enabled: updated.enabled, phaseId: updated.phaseId, finalWeight: updated.finalWeight, updatedAt: updated.updatedAt },
    });
  } catch (error) {
    console.error('Error updating rating settings:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
