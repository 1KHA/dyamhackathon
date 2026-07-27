import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/notification-auth';

/**
 * This route lives under /api/admin/ but in practice is called by the
 * PARTICIPANT team page — a team leader editing a member's details
 * (src/app/participant-dashboard/team/page.tsx). It has no admin-only
 * counterpart UI, so it cannot be gated with requireAdmin() without breaking
 * that feature.
 *
 * Authorized callers: an admin, OR the team leader of the participant being
 * edited. Anyone else — including an unauthenticated caller — is rejected.
 *
 * The field blocklist mirrors /api/participant/update-profile: sensitive
 * fields (status, teamId, isLeader, passwordHash, ...) can never be set
 * through this endpoint, closing a mass-assignment hole that previously let
 * the raw request body flow straight into the Prisma update.
 */
export async function POST(req: Request) {
  try {
    const claims = verifyToken(cookies().get('token')?.value);
    if (!claims) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const body = await req.json();
    const { id, ...rawUpdate } = body;

    if (!id) {
      return NextResponse.json({ error: 'Participant ID is required' }, { status: 400 });
    }

    if (claims.role !== 'admin') {
      // must be the team leader of the participant being edited
      const callerId = claims.participantId || claims.id;
      const caller = callerId
        ? await prisma.participant.findUnique({
            where: { id: callerId },
            select: { isLeader: true, teamId: true },
          })
        : null;

      if (!caller || !caller.isLeader || !caller.teamId) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 });
      }

      const target = await prisma.participant.findUnique({
        where: { id },
        select: { teamId: true },
      });

      if (!target || target.teamId !== caller.teamId) {
        return NextResponse.json({ error: 'المشارك ليس في فريقك' }, { status: 403 });
      }
    }

    // Remove fields that shouldn't be updated through this endpoint —
    // matches the blocklist in /api/participant/update-profile
    const {
      passwordHash,
      status,
      teamId,
      isLeader,
      createdAt,
      updatedAt,
      team,
      role,
      fullName, // computed field, never persisted directly
      ...dataToUpdate
    } = rawUpdate;

    const updatedParticipant = await prisma.participant.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json(updatedParticipant);
  } catch (error) {
    console.error('Error updating participant:', error);
    return NextResponse.json({ error: 'Failed to update participant' }, { status: 500 });
  }
}
// Also allow PATCH requests for compatibility, though we'll use POST
export async function PATCH(req: Request) {
  return POST(req);
}
