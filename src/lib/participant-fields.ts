/**
 * Every Participant scalar field EXCEPT passwordHash.
 *
 * Use this `select` wherever a Participant row (or a Team's nested
 * `participants`) reaches an API response. `include: { participants: true }`
 * or a bare `prisma.participant.update(...)` with no select both return the
 * full row — hash included — so this is the shared alternative rather than
 * each route hand-maintaining its own copy (three routes drifted out of sync
 * on this exact point before it was extracted here).
 */
export const PARTICIPANT_PUBLIC_FIELDS = {
  id: true,
  fullName: true,
  contactNumber: true,
  gender: true,
  isUniversityStudent: true,
  universityMajor: true,
  professionalField: true,
  city: true,
  canAttendHackathon: true,
  email: true,
  badgeCode: true,
  university: true,
  isLeader: true,
  status: true,
  teamId: true,
  createdAt: true,
  updatedAt: true,
  firstName: true,
  secondName: true,
  familyName: true,
  nationalId: true,
  dob: true,
  phoneNumber: true,
  education: true,
  major: true,
  employmentStatus: true,
  nationality: true,
  residence: true,
  canAttend: true,
} as const;
