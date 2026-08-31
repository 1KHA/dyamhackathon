/**
 * The hackathon challenge tracks — the single source of truth.
 *
 * Used by the public registration form (`/register-team`, stored on
 * `Team.hackathonTrack`) and the admin "create team" form
 * (`/admin-hackton-dashboard/teams/create`, stored on `Team.challenge`), so
 * the two lists cannot drift apart.
 *
 * The stored value IS the Arabic label. Every screen that shows a challenge
 * renders the stored string verbatim — the participant team page, the teams
 * list, and the admin Excel export — so a slug would surface to users as
 * raw text like "smart-infrastructure" (which is exactly what the admin form
 * used to save). Keep value === label.
 *
 * Changing a label here does NOT rewrite teams already stored with the old
 * text; migrate those rows explicitly if a label ever changes.
 */
export const CHALLENGES = [
  'إنتاج المياه واستدامة الموارد المائية',
  'البنية التحتية للمياه',
  'إعادة الاستخدام والاقتصاد الدائري',
  'الاستدامة وتجربة المستفيد وجودة الحياة',
  'التقنيات الرقمية والذكاء الاصطناعي',
] as const;

export type Challenge = (typeof CHALLENGES)[number];
