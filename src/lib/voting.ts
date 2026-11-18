import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';

/**
 * Public voting (تصويت الجمهور) — shared rules for the public /vote page,
 * the /api/vote/* routes and the admin screen. See mdfiles/public-voting.md.
 *
 * Flow: visitor picks a team → enters first/last name + email → gets a
 * 6-digit code by email → enters the code → gets a short-lived vote token →
 * casts the vote. One vote per normalized email, enforced by the DB
 * (PublicVoter.email unique, PublicVote.voterId unique).
 */

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export const VOTE_SETTINGS_ID = 'votesettings-default-row-01';

/** Minutes a code stays valid. */
export const OTP_TTL_MINUTES = 10;
/** Wrong attempts before a code is burned. */
export const OTP_MAX_ATTEMPTS = 5;
/** Seconds between two codes to the same email. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
/** Codes per email per hour. */
export const OTP_MAX_PER_EMAIL_PER_HOUR = 5;
/** Codes per IP per hour (an IP can legitimately be a shared office/NAT). */
export const OTP_MAX_PER_IP_PER_HOUR = 40;
/** Minutes a verified-email vote token stays valid. */
export const VOTE_TOKEN_TTL_MINUTES = 15;

export const NAME_MAX_LENGTH = 60;

// ---------------------------------------------------------------------------
// Settings + window
// ---------------------------------------------------------------------------

export interface VoteSettingsRow {
  id: string;
  enabled: boolean;
  phaseId: string | null;
  votingStart: Date | null;
  votingEnd: Date | null;
  maxScore: number;
  updatedAt: Date;
}

/** Read the single VoteSettings row, creating the default if it is missing. */
export async function getVoteSettings(): Promise<VoteSettingsRow> {
  const row = await prisma.voteSettings.findFirst();
  if (row) return row;
  return prisma.voteSettings.create({ data: { id: VOTE_SETTINGS_ID } });
}

export type VotingState =
  | { open: true; endsAt: Date | null }
  | { open: false; reason: 'disabled' | 'no-phase' | 'not-started' | 'ended'; message: string; startsAt?: Date | null; endedAt?: Date | null };

/** Whether votes are accepted right now. Every public route checks this. */
export function votingState(
  settings: Pick<VoteSettingsRow, 'enabled' | 'phaseId' | 'votingStart' | 'votingEnd'>,
  now: Date = new Date()
): VotingState {
  if (!settings.enabled) {
    return { open: false, reason: 'disabled', message: 'التصويت غير متاح حالياً.' };
  }
  if (!settings.phaseId) {
    return { open: false, reason: 'no-phase', message: 'لم يتم تحديد مرحلة التصويت بعد.' };
  }
  if (settings.votingStart && now < settings.votingStart) {
    return { open: false, reason: 'not-started', message: 'لم يبدأ التصويت بعد.', startsAt: settings.votingStart };
  }
  if (settings.votingEnd && now >= settings.votingEnd) {
    return { open: false, reason: 'ended', message: 'انتهى وقت التصويت. شكراً لاهتمامكم.', endedAt: settings.votingEnd };
  }
  return { open: true, endsAt: settings.votingEnd };
}

// ---------------------------------------------------------------------------
// Teams on the ballot
// ---------------------------------------------------------------------------

export interface BallotTeam {
  id: string;
  teamName: string;
  leaderName: string;
  hackathonTrack: string | null;
  ideaDescription: string;
}

function displayName(p: { fullName: string | null; firstName: string | null; familyName: string | null }): string {
  const full = (p.fullName || '').trim();
  if (full) return full;
  return [p.firstName, p.familyName].filter(Boolean).join(' ').trim();
}

/**
 * Approved, enabled teams of the voting phase with their leader's name and
 * idea text. Public data only — no emails, phones or ids of people.
 */
export async function getBallotTeams(phaseId: string): Promise<BallotTeam[]> {
  const teams = await prisma.team.findMany({
    where: { phaseId, status: 'approved', isDisabled: false },
    select: {
      id: true,
      teamName: true,
      hackathonTrack: true,
      ideaDescription: true,
      participants: {
        where: { isLeader: true },
        select: { fullName: true, firstName: true, familyName: true },
        take: 1,
      },
    },
  });
  const collator = new Intl.Collator('ar');
  return teams
    .map((t) => ({
      id: t.id,
      teamName: (t.teamName || '').trim() || 'فريق بدون اسم',
      leaderName: t.participants[0] ? displayName(t.participants[0]) : '',
      hackathonTrack: t.hackathonTrack,
      ideaDescription: (t.ideaDescription || '').trim(),
    }))
    .sort((a, b) => collator.compare(a.teamName, b.teamName));
}

// ---------------------------------------------------------------------------
// Input normalization / validation
// ---------------------------------------------------------------------------

export function normalizeEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

/** Trim + collapse spaces; '' when not a usable name. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const v = raw.replace(/\s+/g, ' ').trim();
  if (!v || v.length > NAME_MAX_LENGTH) return '';
  // no digits or symbols — letters of any script, spaces, apostrophes, hyphens, dots
  if (/[0-9\u0660-\u0669!@#$%^&*()_+=\[\]{};:"\\|<>\/?~`]/.test(v)) return '';
  return v;
}

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return crypto.createHash('sha256').update(`${ip}|${JWT_SECRET}`).digest('hex');
}

export function clientIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim() || null;
  return headers.get('x-real-ip');
}

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------

export function generateOtpCode(): string {
  // 6 digits, cryptographically random, leading zeros allowed
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtp(email: string, code: string): string {
  return crypto.createHmac('sha256', JWT_SECRET).update(`${email}|${code}`).digest('hex');
}

export function otpMatches(email: string, code: string, storedHash: string): boolean {
  const a = Buffer.from(hashOtp(email, code));
  const b = Buffer.from(storedHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Vote token (issued after a correct code, consumed by /api/vote/cast)
// ---------------------------------------------------------------------------

export interface VoteTokenClaims {
  purpose: 'public-vote';
  otpId: string;
  email: string;
}

export function signVoteToken(claims: Omit<VoteTokenClaims, 'purpose'>): string {
  return jwt.sign({ purpose: 'public-vote', ...claims }, JWT_SECRET, {
    expiresIn: `${VOTE_TOKEN_TTL_MINUTES}m`,
  });
}

export function verifyVoteToken(token: unknown): VoteTokenClaims | null {
  if (typeof token !== 'string' || !token) return null;
  try {
    const claims = jwt.verify(token, JWT_SECRET) as Partial<VoteTokenClaims>;
    if (claims.purpose !== 'public-vote' || !claims.otpId || !claims.email) return null;
    return { purpose: 'public-vote', otpId: claims.otpId, email: claims.email };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Results — the 5% rule (new_req/طريقة حساب 5% للتصويت.png)
//   درجة التصويت = (أصوات الفريق ÷ أعلى عدد أصوات) × 5
// The team with the most votes gets the full maxScore; everyone else gets
// their share of it. Ties at the top all get the full score.
// ---------------------------------------------------------------------------

export interface TeamResult {
  teamId: string;
  votes: number;
  /** share of ALL votes cast, 0..100 */
  percentOfTotal: number;
  /** votes ÷ topVotes × maxScore, rounded to 2 decimals */
  score: number;
  rank: number;
}

export function computeResults(votesByTeam: Record<string, number>, maxScore: number): {
  totalVotes: number;
  topVotes: number;
  results: TeamResult[];
} {
  const entries = Object.entries(votesByTeam);
  const totalVotes = entries.reduce((s, [, v]) => s + v, 0);
  const topVotes = entries.reduce((m, [, v]) => Math.max(m, v), 0);
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  let rank = 0;
  let prev = -1;
  const results = sorted.map(([teamId, votes], i) => {
    if (votes !== prev) {
      rank = i + 1; // competition ranking: equal votes share a rank
      prev = votes;
    }
    return {
      teamId,
      votes,
      percentOfTotal: totalVotes > 0 ? round2((votes / totalVotes) * 100) : 0,
      score: topVotes > 0 ? round2((votes / topVotes) * maxScore) : 0,
      rank,
    };
  });
  return { totalVotes, topVotes, results };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
