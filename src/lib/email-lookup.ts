import { prisma } from '@/lib/prisma';
import { normalizeEmail } from '@/lib/import-schema';

export { normalizeEmail };

/**
 * Account lookup by email that ignores letter case and surrounding spaces.
 *
 * Older registration paths stored emails exactly as typed, so the database
 * holds values like "  Name@Mail.com " that an exact `findUnique` never
 * matches — the browser's email field strips the spaces and phones capitalise
 * the first letter. These helpers find such rows. A few people registered twice
 * with addresses that differ only in case/spaces, so callers get every match
 * and must decide what to do with more than one.
 */

/** Ids of participants whose stored email equals `input`, ignoring case and surrounding spaces. */
export async function participantIdsByEmail(input: string): Promise<string[]> {
  const norm = normalizeEmail(input);
  if (!norm) return [];
  const rows = await prisma.participant.findMany({
    where: { email: { contains: norm, mode: 'insensitive' } },
    select: { id: true, email: true },
  });
  return rows.filter((r) => normalizeEmail(r.email) === norm).map((r) => r.id);
}

/** Ids of mentors whose stored email equals `input`, ignoring case and surrounding spaces. */
export async function mentorIdsByEmail(input: string): Promise<string[]> {
  const norm = normalizeEmail(input);
  if (!norm) return [];
  const rows = await prisma.mentor.findMany({
    where: { email: { contains: norm, mode: 'insensitive' } },
    select: { id: true, email: true },
  });
  return rows.filter((r) => normalizeEmail(r.email) === norm).map((r) => r.id);
}
