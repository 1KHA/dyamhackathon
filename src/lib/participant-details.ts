import { prisma } from '@/lib/prisma';
import { riyadhToday } from '@/lib/badge-dates';
import { scannerNames, summarizeScans } from '@/lib/attendance-scans';

/**
 * Everything an organizer needs at the door about one participant: their own
 * details, their team and its members, the team's mentor bookings (upcoming
 * first) and today's venue entries/exits. National ID, date of birth, badge
 * code and password are never included.
 */

const displayName = (p: { fullName: string | null; firstName: string | null; secondName: string | null; familyName: string | null; email: string }) =>
  p.fullName || `${p.firstName ?? ''} ${p.secondName ?? ''} ${p.familyName ?? ''}`.trim() || p.email;

const PERSON = {
  id: true, email: true, fullName: true, firstName: true, secondName: true, familyName: true,
  phoneNumber: true, contactNumber: true, isLeader: true,
} as const;

export async function participantDetails(participantId: string) {
  const p = await prisma.participant.findUnique({
    where: { id: participantId },
    select: {
      ...PERSON,
      gender: true, city: true, nationality: true, residence: true, university: true, major: true,
      universityMajor: true, education: true, professionalField: true, employmentStatus: true,
      status: true, isDisabled: true,
      phase: { select: { name: true } },
      team: {
        select: {
          id: true, teamName: true, status: true, isDisabled: true, hackathonTrack: true, challenge: true, ideaName: true,
          phase: { select: { name: true } },
          participants: { select: PERSON, orderBy: [{ isLeader: 'desc' }, { createdAt: 'asc' }] },
        },
      },
    },
  });
  if (!p) return null;

  const memberIds = p.team ? p.team.participants.map((m) => m.id) : [p.id];
  const now = new Date();
  const [bookings, scans] = await Promise.all([
    prisma.mentorBooking.findMany({
      where: { participantId: { in: memberIds }, status: { not: 'cancelled' } },
      select: {
        id: true, status: true,
        organization: { select: { name: true } },
        participant: { select: { fullName: true, firstName: true, secondName: true, familyName: true, email: true } },
        availability: { select: { startTime: true, endTime: true, mentor: { select: { name: true, organization: { select: { name: true } } } } } },
      },
    }),
    prisma.attendanceScan.findMany({
      where: { participantId: p.id, eventId: null, day: riyadhToday() },
      orderBy: { createdAt: 'asc' },
      select: { direction: true, createdAt: true, scannedBy: true, scannerRole: true },
    }),
  ]);
  const names = await scannerNames(scans);

  const sessions = bookings
    .map((b) => ({
      id: b.id,
      startTime: b.availability.startTime,
      endTime: b.availability.endTime,
      mentorName: b.availability.mentor.name,
      mentorOrganization: b.availability.mentor.organization?.name ?? null,
      bookedThroughOrganization: b.organization?.name ?? null,
      bookedBy: displayName(b.participant),
      status: b.status,
      upcoming: b.availability.endTime > now,
    }))
    // upcoming (soonest first), then past (latest first)
    .sort((a, b) =>
      a.upcoming !== b.upcoming
        ? a.upcoming ? -1 : 1
        : a.upcoming
          ? a.startTime.getTime() - b.startTime.getTime()
          : b.startTime.getTime() - a.startTime.getTime()
    );

  const person = (m: { id: string; email: string; fullName: string | null; firstName: string | null; secondName: string | null; familyName: string | null; phoneNumber: string | null; contactNumber: string | null; isLeader: boolean }) => ({
    id: m.id,
    name: displayName(m),
    email: m.email,
    phone: m.phoneNumber || m.contactNumber || null,
    isLeader: m.isLeader,
  });

  return {
    participant: {
      ...person(p),
      gender: p.gender, city: p.city, nationality: p.nationality, residence: p.residence,
      university: p.university, major: p.major || p.universityMajor, education: p.education,
      professionalField: p.professionalField, employmentStatus: p.employmentStatus,
      status: p.status, isDisabled: p.isDisabled, phase: p.phase?.name ?? null,
    },
    team: p.team
      ? {
          id: p.team.id,
          name: p.team.teamName,
          status: p.team.status,
          isDisabled: p.team.isDisabled,
          track: p.team.hackathonTrack || p.team.challenge || null,
          ideaName: p.team.ideaName,
          phase: p.team.phase?.name ?? null,
          members: p.team.participants.map(person),
        }
      : null,
    bookings: sessions,
    venueToday: {
      date: riyadhToday(),
      summary: summarizeScans(scans, { now, isToday: true }),
      scans: scans.map((s) => ({ direction: s.direction, at: s.createdAt, byName: names.get(s.scannedBy) ?? '—' })),
    },
  };
}
