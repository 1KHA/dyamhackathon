import type { Prisma } from '@prisma/client';
import { ELIGIBLE_PARTICIPANT_WHERE } from './account-status';

/**
 * Who the admin attendance page lists: approved, active participants only
 * (same rule as announcements — ELIGIBLE_PARTICIPANT_WHERE), optionally of one
 * group. A group is a phase (مرحلة الرياض / مرحلة رابغ …): a team member's
 * group is the TEAM's phase, an individual's their own.
 */
export function attendanceAudience(phaseId?: string | null): Prisma.ParticipantWhereInput {
  if (!phaseId) return ELIGIBLE_PARTICIPANT_WHERE;
  return {
    AND: [ELIGIBLE_PARTICIPANT_WHERE, { OR: [{ teamId: null, phaseId }, { team: { is: { phaseId } } }] }],
  };
}

/** Select fragment + label for the participant's group. */
export const GROUP_SELECT = {
  phase: { select: { name: true } },
  team: { select: { teamName: true, phase: { select: { name: true } } } },
} as const;

export function groupName(p: { phase?: { name: string } | null; team?: { phase?: { name: string } | null } | null }): string | null {
  return p.team ? p.team.phase?.name ?? null : p.phase?.name ?? null;
}
