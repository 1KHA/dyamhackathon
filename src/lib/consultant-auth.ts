import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/notification-auth';

export interface ConsultantSession {
  id: string;
  username: string;
  name: string;
}

/**
 * Consultant (مستشار التقييم) gate for /api/consultant/* routes. Reads the
 * database on every call so disabling a consultant takes effect immediately,
 * not when their (sliding) session token expires.
 */
export async function requireConsultant(token: string | undefined): Promise<ConsultantSession | null> {
  const claims = verifyToken(token);
  if (!claims || claims.role !== 'consultant' || !claims.id) return null;
  const consultant = await prisma.consultant.findUnique({
    where: { id: claims.id },
    select: { id: true, username: true, name: true, isDisabled: true },
  });
  if (!consultant || consultant.isDisabled) return null;
  return { id: consultant.id, username: consultant.username, name: consultant.name };
}

export const CONSULTANT_USERNAME_RE = /^[a-zA-Z0-9._-]{3,40}$/;

// no 0/O/1/l/I — easy to read aloud and type on a phone
const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
/** Random initial/reset password for a consultant account (12 chars). */
export function generateConsultantPassword(length = 12): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('');
}
