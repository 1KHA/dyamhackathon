/**
 * Account disabling — the single definition of "is this account disabled?".
 *
 * An admin can disable a participant directly, or disable a whole team. A
 * participant is **effectively disabled** when either is true:
 *
 *     effectiveDisabled = participant.isDisabled || participant.team.isDisabled
 *
 * Deriving it (rather than cascading a write onto every member) means
 * re-enabling a team instantly restores exactly the members who were not
 * individually disabled, with no bookkeeping.
 *
 * A disabled account:
 *   - cannot log in (src/app/api/login/route.ts)
 *   - cannot perform any participant action — every participant-facing API
 *     goes through requireActiveParticipant() below
 *   - receives NO transactional email or dashboard notification
 *     (src/lib/notify.ts filters them out of every audience)
 *
 * The one deliberate exception: an admin CAN still target disabled accounts
 * from the broadcast composer using the "الحسابات المعطلة" audience, so
 * rejection/"you did not qualify" notices can be sent. See
 * mdfiles/disable-accounts.md.
 */
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/** Prisma `where` fragment: participants who are NOT disabled (own flag or team's). */
export const ACTIVE_PARTICIPANT_WHERE: Prisma.ParticipantWhereInput = {
  isDisabled: false,
  OR: [{ teamId: null }, { team: { is: { isDisabled: false } } }],
};

/** Prisma `where` fragment: participants who ARE disabled (own flag or team's). */
export const DISABLED_PARTICIPANT_WHERE: Prisma.ParticipantWhereInput = {
  OR: [{ isDisabled: true }, { team: { is: { isDisabled: true } } }],
};

/** Shape needed to decide; `team` may be absent for individual participants. */
export interface DisableCheckable {
  isDisabled?: boolean | null;
  team?: { isDisabled?: boolean | null } | null;
}

/** True when the participant is disabled directly or through their team. */
export function isEffectivelyDisabled(participant: DisableCheckable | null | undefined): boolean {
  if (!participant) return false;
  return Boolean(participant.isDisabled) || Boolean(participant.team?.isDisabled);
}

/** Arabic message shown to a disabled account that tries to log in or act. */
export const DISABLED_ACCOUNT_MESSAGE =
  'تم تعطيل هذا الحساب من قبل إدارة الهاكاثون. للاستفسار يرجى التواصل مع المنظمين.';

/**
 * Look up a participant's effective disabled state by id.
 * Returns `false` when the participant does not exist — callers handle
 * "not found" separately; this function answers only "is it disabled".
 */
export async function isParticipantDisabled(participantId: string): Promise<boolean> {
  if (!participantId) return false;
  try {
    const row = await prisma.participant.findUnique({
      where: { id: participantId },
      select: { isDisabled: true, team: { select: { isDisabled: true } } },
    });
    return isEffectivelyDisabled(row);
  } catch {
    // Fail OPEN on an infrastructure error: a database blip must not lock
    // every participant out. Login still verifies credentials normally.
    return false;
  }
}

/** Partition ids into disabled / active — used by the bulk admin actions. */
export async function splitDisabledParticipants(ids: string[]): Promise<{
  disabled: string[];
  active: string[];
}> {
  if (ids.length === 0) return { disabled: [], active: [] };
  const rows = await prisma.participant.findMany({
    where: { id: { in: ids } },
    select: { id: true, isDisabled: true, team: { select: { isDisabled: true } } },
  });
  const disabled: string[] = [];
  const active: string[] = [];
  for (const r of rows) (isEffectivelyDisabled(r) ? disabled : active).push(r.id);
  return { disabled, active };
}

/**
 * Route guard: refuse the request when the participant is disabled.
 *
 * Returns a ready-to-return 403 `NextResponse`, or `null` when the account is
 * active and the handler should continue:
 *
 *     const blocked = await requireActiveParticipant(decoded.participantId);
 *     if (blocked) return blocked;
 *
 * Every participant-facing route decodes the JWT itself (there is no shared
 * auth middleware for /api/participant/*, and Next 14 middleware runs on Edge
 * where Prisma is unavailable), so this is called per route right after the
 * token is decoded.
 *
 * 403 rather than 401: the credentials are valid, the account is not.
 */
export async function requireActiveParticipant(
  participantId: string | undefined | null
): Promise<NextResponse | null> {
  if (!participantId) return null; // the route's own auth check handles this
  if (!(await isParticipantDisabled(participantId))) return null;
  return NextResponse.json({ error: DISABLED_ACCOUNT_MESSAGE, disabled: true }, { status: 403 });
}
