import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireConsultant } from '@/lib/consultant-auth';
import {
  RATING_CRITERIA, aggregateTeam, getRatingSettings, getTeamForRating, getTeamRatings, parseScores, ratingTotal,
} from '@/lib/rating';

export const dynamic = 'force-dynamic';

const NOTES_MAX = 2000;

async function teamPayload(teamId: string, consultantId: string, phaseId: string) {
  const [team, ratings] = await Promise.all([getTeamForRating(teamId, phaseId), getTeamRatings(teamId)]);
  if (!team) return null;
  const mine = ratings.find((r) => r.consultantId === consultantId);
  const agg = aggregateTeam(ratings);
  return {
    team,
    myRating: mine ? { scores: mine.scores, total: mine.total, notes: mine.notes, updatedAt: mine.updatedAt } : null,
    // other consultants are summarised, never named, to the consultant
    aggregate: agg,
  };
}

/** GET /api/consultant/teams/:id — full team info + my rating + combined totals. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireConsultant(cookies().get('token')?.value);
  if (!me) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  try {
    const settings = await getRatingSettings();
    if (!settings.phaseId) return NextResponse.json({ error: 'لم يتم تحديد مرحلة التقييم بعد' }, { status: 404 });
    const payload = await teamPayload(params.id, me.id, settings.phaseId);
    if (!payload) return NextResponse.json({ error: 'الفريق غير موجود ضمن مرحلة التقييم' }, { status: 404 });
    return NextResponse.json({ ...payload, criteria: RATING_CRITERIA, settings: { enabled: settings.enabled, finalWeight: settings.finalWeight } });
  } catch (error) {
    console.error('Error reading team for rating:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

/**
 * PUT /api/consultant/teams/:id — save (create or replace) my rating.
 * Body: { scores: { [criterionKey]: 1..5 }, notes?: string }
 * The consultant can change their rating at any time while rating is enabled.
 */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireConsultant(cookies().get('token')?.value);
  if (!me) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  try {
    const settings = await getRatingSettings();
    if (!settings.enabled) return NextResponse.json({ error: 'التقييم مغلق حالياً من قبل الإدارة' }, { status: 403 });
    if (!settings.phaseId) return NextResponse.json({ error: 'لم يتم تحديد مرحلة التقييم بعد' }, { status: 404 });

    const team = await prisma.team.findFirst({
      where: { id: params.id, phaseId: settings.phaseId, status: 'approved', isDisabled: false },
      select: { id: true },
    });
    if (!team) return NextResponse.json({ error: 'الفريق غير موجود ضمن مرحلة التقييم' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const parsed = parseScores(body.scores);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const notesRaw = typeof body.notes === 'string' ? body.notes.trim() : '';
    if (notesRaw.length > NOTES_MAX) return NextResponse.json({ error: `الملاحظات يجب ألا تتجاوز ${NOTES_MAX} حرف` }, { status: 400 });
    const notes = notesRaw || null;

    await prisma.$transaction(async (tx) => {
      const rating = await tx.teamRating.upsert({
        where: { consultantId_teamId: { consultantId: me.id, teamId: team.id } },
        create: { consultantId: me.id, teamId: team.id, notes },
        update: { notes },
        select: { id: true },
      });
      for (const c of RATING_CRITERIA) {
        await tx.teamRatingScore.upsert({
          where: { ratingId_criterionKey: { ratingId: rating.id, criterionKey: c.key } },
          create: { ratingId: rating.id, criterionKey: c.key, value: parsed.scores[c.key] },
          update: { value: parsed.scores[c.key] },
        });
      }
    });

    const payload = await teamPayload(team.id, me.id, settings.phaseId);
    return NextResponse.json({
      success: true,
      message: 'تم حفظ التقييم',
      total: ratingTotal(parsed.scores),
      myRating: payload?.myRating ?? null,
      aggregate: payload?.aggregate ?? null,
    });
  } catch (error) {
    console.error('Error saving rating:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
