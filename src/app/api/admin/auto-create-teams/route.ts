import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PrismaClient } from '@prisma/client'
import { dispatchNotification } from '@/lib/notify'

// Ensure this route is dynamic
export const dynamic = 'force-dynamic';

interface TeamFormationRequest {
  teamName: string;
  hackathonTrack: string;
  ideaDescription: string;
  participantIds: string[];
  leaderId: string;
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { teamName, hackathonTrack, ideaDescription, participantIds, leaderId } = data as TeamFormationRequest;

    // Basic validation
    if (!teamName || !hackathonTrack || !participantIds || !leaderId) {
      return NextResponse.json({ error: 'Required fields are missing.' }, { status: 400 });
    }

    if (!participantIds.includes(leaderId)) {
      return NextResponse.json({ error: 'Leader must be one of the selected participants.' }, { status: 400 });
    }

    if (participantIds.length < 2 || participantIds.length > 5) {
      return NextResponse.json({ error: 'A team must have between 2 and 5 members.' }, { status: 400 });
    }

    // Check if all participants are available (not already in a team)
    const existingParticipants = await prisma.participant.findMany({
      where: {
        id: { in: participantIds },
        teamId: { not: null }
      }
    });

    if (existingParticipants.length > 0) {
      return NextResponse.json(
        { error: 'One or more participants are already in a team.' },
        { status: 400 }
      );
    }

    // Create team and update participants in a transaction
    const result = await prisma.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
      // Create team record
      const team = await tx.team.create({
        data: {
          teamName,
          status: 'approved', // Auto-created teams are approved by default
          hackathonTrack,
          ideaDescription,
          isTeamRegistration: true,
          // Keep deprecated fields for backward compatibility
          challenge: hackathonTrack,
          challengeReason: '',
          ideaName: teamName,
          ideaSolution: '',
          ideaResults: '',
          ideaStage: 'idea',
          hasParticipated: false,
        },
      });

      // Update all participants to be part of the team
      for (const participantId of participantIds) {
        await tx.participant.update({
          where: { id: participantId },
          data: {
            teamId: team.id,
            isLeader: participantId === leaderId
          }
        });
      }

      return { teamId: team.id, teamName };
    });

    // Create notification for admins about new team formation
    try {
      await dispatchNotification({
        templateKey: 'newTeamRegistration',
        variables: { teamName: result.teamName },
        audience: { kind: 'admins' },
        relatedEntityType: 'team',
        relatedEntityId: result.teamId,
      });
    } catch (notificationError) {
      console.error('Error creating notification:', notificationError);
      // Don't fail the team creation if notification fails
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Team created successfully',
        teamId: result.teamId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating team:', error);
    return NextResponse.json(
      { error: 'Failed to create team' },
      { status: 500 }
    );
  }
}
