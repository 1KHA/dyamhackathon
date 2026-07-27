import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/notification-auth'

// Ensure this route is dynamic
export const dynamic = 'force-dynamic';

// Every Participant scalar field EXCEPT passwordHash. Kept exhaustive (rather
// than a hand-picked subset) because the admin teams page reads nearly every
// field off team.participants[].
const PARTICIPANT_PUBLIC_FIELDS = {
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

export async function GET(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }
  try {
    // Get query parameters
    const url = new URL(request.url);
    const searchTerm = url.searchParams.get('search');
    
    let teams;
    
    if (searchTerm) {
      // Enhanced search across team and participant fields
      teams = await prisma.team.findMany({
        where: {
          OR: [
            // Search in team fields
            { teamName: { contains: searchTerm } },
            { ideaName: { contains: searchTerm } },
            { hackathonTrack: { contains: searchTerm } },
            { ideaDescription: { contains: searchTerm } },
            // Search in participants (team members)
            {
              participants: {
                some: {
                  OR: [
                    // Search by email
                    { email: { contains: searchTerm.toLowerCase() } },
                    // Search by fullName
                    { fullName: { contains: searchTerm } },
                    // Search by legacy name fields
                    { firstName: { contains: searchTerm } },
                    { secondName: { contains: searchTerm } },
                    { familyName: { contains: searchTerm } },
                    // Search by contact number
                    { contactNumber: { contains: searchTerm } },
                    { phoneNumber: { contains: searchTerm } },
                  ]
                }
              }
            }
          ]
        },
        include: {
          participants: { select: PARTICIPANT_PUBLIC_FIELDS }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
    } else {
      // No search term, return all teams
      teams = await prisma.team.findMany({
        include: {
          participants: { select: PARTICIPANT_PUBLIC_FIELDS }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
    }

    return NextResponse.json(teams)
  } catch (error) {
    console.error('Error fetching teams:', error)
    return NextResponse.json(
      { error: 'Failed to fetch teams' },
      { status: 500 }
    )
  }
}
