import { prisma } from './prisma';

/**
 * Consultant rating (تقييم المستشارين) — shared rules for the consultant
 * dashboard, /api/consultant/* and the admin screen. See
 * mdfiles/consultant-rating.md.
 *
 * Criteria and weights come from new_req/معايير التقييم - مياهثون 3.pdf.
 * Each consultant gives 1..5 per criterion; the criterion score is
 * value ÷ 5 × weight, so one consultant's total is 0..100. A team's total is
 * the AVERAGE of its consultants' totals (never a sum), so it stays ≤ 100 no
 * matter how many consultants rate it. The final share is
 * average × finalWeight ÷ 100 (35 % by default).
 */

export const RATING_SETTINGS_ID = 'ratingsettings-default-row-01';
export const RATING_MIN = 1;
export const RATING_MAX = 5;

export interface RatingCriterion {
  key: string;
  title: string;
  description: string;
  weight: number;
}

export const RATING_CRITERIA: RatingCriterion[] = [
  {
    key: 'problem',
    title: 'وضوح المشكلة وأثر الحل',
    description: 'مدى وضوح التحدي، وارتباطه باحتياجات قطاع المياه، والأثر المتوقع للحل',
    weight: 20,
  },
  {
    key: 'innovation',
    title: 'الابتكار والتميز',
    description: 'أصالة الفكرة، وتميزها عن الحلول الحالية، والقيمة المضافة',
    weight: 20,
  },
  {
    key: 'feasibility',
    title: 'قابلية التنفيذ والنموذج الأولي',
    description: 'الجدوى التقنية، وإمكانية تطوير نموذج أولي واختباره، ووضوح متطلبات التنفيذ',
    weight: 30,
  },
  {
    key: 'business',
    title: 'نموذج العمل التجاري وخطة التوسع',
    description: 'الجدوى الاقتصادية الأولية، والمستفيدون المستهدفون، وإمكانية التوسع والتطبيق',
    weight: 15,
  },
  {
    key: 'team',
    title: 'جاهزية الفريق',
    description: 'تكامل الخبرات، وتوزيع الأدوار، وقدرة الفريق على تنفيذ خطة تطوير النموذج الأولي',
    weight: 15,
  },
];

export const RATING_TOTAL_WEIGHT = RATING_CRITERIA.reduce((s, c) => s + c.weight, 0); // 100

export type Scores = Record<string, number>;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** value (1..5) ÷ 5 × weight */
export function criterionScore(value: number, weight: number): number {
  return (value / RATING_MAX) * weight;
}

/** One consultant's total for a team, 0..100. Missing criteria count as 0. */
export function ratingTotal(scores: Scores): number {
  return round2(RATING_CRITERIA.reduce((s, c) => s + criterionScore(scores[c.key] || 0, c.weight), 0));
}

/**
 * Validate a scores object from a client: every criterion present, integer
 * 1..5, nothing else. Returns the clean object or an error message.
 */
export function parseScores(raw: unknown): { scores: Scores } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'الدرجات مطلوبة' };
  const input = raw as Record<string, unknown>;
  const scores: Scores = {};
  for (const c of RATING_CRITERIA) {
    const v = Number(input[c.key]);
    if (!Number.isInteger(v) || v < RATING_MIN || v > RATING_MAX) {
      return { error: `درجة «${c.title}» يجب أن تكون رقماً صحيحاً من ${RATING_MIN} إلى ${RATING_MAX}` };
    }
    scores[c.key] = v;
  }
  return { scores };
}

export interface TeamAggregate {
  /** consultants who rated this team */
  count: number;
  /** average of the consultants' totals, 0..100 */
  avgTotal: number;
  /** average 1..5 value per criterion key (0 when nobody rated) */
  criterionAvg: Record<string, number>;
  /** average weighted score per criterion key */
  criterionAvgScore: Record<string, number>;
}

/**
 * Combine several consultants' ratings of ONE team. The total is an average,
 * so five consultants cannot push a team above 100.
 */
export function aggregateTeam(ratings: { scores: Scores }[]): TeamAggregate {
  const count = ratings.length;
  const criterionAvg: Record<string, number> = {};
  const criterionAvgScore: Record<string, number> = {};
  for (const c of RATING_CRITERIA) {
    const sum = ratings.reduce((s, r) => s + (r.scores[c.key] || 0), 0);
    const avg = count ? sum / count : 0;
    criterionAvg[c.key] = round2(avg);
    criterionAvgScore[c.key] = round2(criterionScore(avg, c.weight));
  }
  const avgTotal = count ? round2(ratings.reduce((s, r) => s + ratingTotal(r.scores), 0) / count) : 0;
  return { count, avgTotal, criterionAvg, criterionAvgScore };
}

/** average(0..100) × finalWeight ÷ 100 — e.g. 80 → 28 of 35 */
export function finalShare(avgTotal: number, finalWeight: number): number {
  return round2((avgTotal * finalWeight) / 100);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface RatingSettingsRow {
  id: string;
  enabled: boolean;
  phaseId: string | null;
  finalWeight: number;
  updatedAt: Date;
}

export async function getRatingSettings(): Promise<RatingSettingsRow> {
  const row = await prisma.ratingSettings.findFirst();
  if (row) return row;
  return prisma.ratingSettings.create({ data: { id: RATING_SETTINGS_ID } });
}

// ---------------------------------------------------------------------------
// Teams of the rated phase
// ---------------------------------------------------------------------------

export function displayName(p: { fullName: string | null; firstName: string | null; familyName: string | null }): string {
  const full = (p.fullName || '').trim();
  if (full) return full;
  return [p.firstName, p.familyName].filter(Boolean).join(' ').trim();
}

export const RATED_TEAM_WHERE = (phaseId: string) => ({ phaseId, status: 'approved', isDisabled: false });

export interface RatedTeamSummary {
  id: string;
  teamName: string;
  leaderName: string;
  hackathonTrack: string | null;
  ideaName: string | null;
  ideaDescription: string;
  membersCount: number;
}

/** Approved, enabled teams of the rated phase — list view (no personal data). */
export async function getRatedTeams(phaseId: string): Promise<RatedTeamSummary[]> {
  const teams = await prisma.team.findMany({
    where: RATED_TEAM_WHERE(phaseId),
    select: {
      id: true,
      teamName: true,
      hackathonTrack: true,
      ideaName: true,
      ideaDescription: true,
      participants: { select: { isLeader: true, fullName: true, firstName: true, familyName: true } },
    },
  });
  const collator = new Intl.Collator('ar');
  return teams
    .map((t) => {
      const leader = t.participants.find((p) => p.isLeader);
      return {
        id: t.id,
        teamName: (t.teamName || '').trim() || 'فريق بدون اسم',
        leaderName: leader ? displayName(leader) : '',
        hackathonTrack: t.hackathonTrack,
        ideaName: t.ideaName,
        ideaDescription: (t.ideaDescription || '').trim(),
        membersCount: t.participants.length,
      };
    })
    .sort((a, b) => collator.compare(a.teamName, b.teamName));
}

/** Rows of TeamRating with scores → { teamId → [{consultantId, scores, ...}] } */
export function scoresFromRows(rows: { criterionKey: string; value: number }[]): Scores {
  const scores: Scores = {};
  for (const r of rows) scores[r.criterionKey] = r.value;
  return scores;
}

/** Everything about one team that a consultant may see (no contact/identity data). */
export async function getTeamForRating(teamId: string, phaseId: string) {
  const t = await prisma.team.findFirst({
    where: { id: teamId, ...RATED_TEAM_WHERE(phaseId) },
    select: {
      id: true,
      teamName: true,
      hackathonTrack: true,
      ideaName: true,
      ideaDescription: true,
      challenge: true,
      challengeReason: true,
      ideaSolution: true,
      ideaResults: true,
      ideaStage: true,
      hasParticipated: true,
      participationDetails: true,
      attachmentPath: true,
      attachmentsLink: true,
      createdAt: true,
      phase: { select: { name: true } },
      participants: {
        orderBy: [{ isLeader: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          isLeader: true,
          fullName: true,
          firstName: true,
          familyName: true,
          gender: true,
          city: true,
          residence: true,
          university: true,
          universityMajor: true,
          major: true,
          education: true,
          isUniversityStudent: true,
          professionalField: true,
          employmentStatus: true,
          submissions: {
            orderBy: { submittedAt: 'desc' },
            select: {
              id: true,
              fileName: true,
              filePath: true,
              submittedAt: true,
              reviewStatus: true,
              milestone: { select: { title: true } },
            },
          },
        },
      },
    },
  });
  if (!t) return null;

  const members = t.participants.map((p) => ({
    id: p.id,
    name: displayName(p),
    isLeader: p.isLeader,
    gender: p.gender,
    city: p.city || p.residence,
    university: p.university,
    major: p.universityMajor || p.major,
    education: p.education,
    isUniversityStudent: p.isUniversityStudent,
    professionalField: p.professionalField,
    employmentStatus: p.employmentStatus,
  }));
  const submissions = t.participants
    .flatMap((p) =>
      p.submissions.map((s) => ({
        id: s.id,
        milestoneTitle: s.milestone.title,
        fileName: s.fileName,
        filePath: s.filePath,
        submittedAt: s.submittedAt,
        reviewStatus: s.reviewStatus,
        submittedBy: displayName(p),
      }))
    )
    .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());

  return {
    id: t.id,
    teamName: (t.teamName || '').trim() || 'فريق بدون اسم',
    hackathonTrack: t.hackathonTrack,
    phaseName: t.phase?.name ?? null,
    ideaName: t.ideaName,
    ideaDescription: t.ideaDescription,
    challenge: t.challenge,
    challengeReason: t.challengeReason,
    ideaSolution: t.ideaSolution,
    ideaResults: t.ideaResults,
    ideaStage: t.ideaStage,
    hasParticipated: t.hasParticipated,
    participationDetails: t.participationDetails,
    attachmentPath: t.attachmentPath || t.attachmentsLink,
    createdAt: t.createdAt,
    members,
    submissions,
  };
}

/** All ratings of one team (every consultant), with scores. */
export async function getTeamRatings(teamId: string) {
  const rows = await prisma.teamRating.findMany({
    where: { teamId, consultant: { isDisabled: false } },
    select: {
      id: true,
      consultantId: true,
      notes: true,
      updatedAt: true,
      consultant: { select: { name: true } },
      scores: { select: { criterionKey: true, value: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    consultantId: r.consultantId,
    consultantName: r.consultant.name,
    notes: r.notes,
    updatedAt: r.updatedAt,
    scores: scoresFromRows(r.scores),
    total: ratingTotal(scoresFromRows(r.scores)),
  }));
}
