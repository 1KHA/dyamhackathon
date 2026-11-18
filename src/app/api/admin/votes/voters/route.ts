import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/votes/voters?teamId=&q=&limit=&offset= — who voted for what.
 * Newest first. `q` matches name or email (case-insensitive).
 */
export async function GET(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  try {
    const sp = request.nextUrl.searchParams;
    const teamId = sp.get('teamId') || undefined;
    const q = (sp.get('q') || '').trim();
    const limit = Math.min(Math.max(Number(sp.get('limit')) || 500, 1), 5000);
    const offset = Math.max(Number(sp.get('offset')) || 0, 0);

    const where = {
      ...(teamId ? { teamId } : {}),
      ...(q
        ? {
            voter: {
              OR: [
                { email: { contains: q, mode: 'insensitive' as const } },
                { firstName: { contains: q, mode: 'insensitive' as const } },
                { lastName: { contains: q, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.publicVote.count({ where }),
      prisma.publicVote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          createdAt: true,
          team: { select: { id: true, teamName: true } },
          voter: { select: { email: true, firstName: true, lastName: true, verifiedAt: true } },
        },
      }),
    ]);

    return NextResponse.json({
      total,
      offset,
      limit,
      votes: rows.map((r) => ({
        id: r.id,
        votedAt: r.createdAt,
        teamId: r.team.id,
        teamName: (r.team.teamName || '').trim(),
        email: r.voter.email,
        firstName: r.voter.firstName,
        lastName: r.voter.lastName,
        verifiedAt: r.voter.verifiedAt,
      })),
    });
  } catch (error) {
    console.error('Error listing voters:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
