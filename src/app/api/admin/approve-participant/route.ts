import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { PARTICIPANT_PUBLIC_FIELDS } from '@/lib/participant-fields';
import { dispatchNotification } from '@/lib/notify'
import { generatePassword, credentialVariables, participantDisplayName } from '@/lib/credentials'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Get the auth token from cookies
    const cookieStore = cookies();
    const token = cookieStore.get("token")?.value || cookieStore.get("auth-token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized: No token provided" }, { status: 401 });
    }

    // Verify the token and check if it's an admin
    let decodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { id?: string, adminId?: string, role?: string };
    } catch (error) {
      return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
    }

    // Check if it's an admin token (could be in adminId or role field)
    if (!decodedToken || (!decodedToken.adminId && decodedToken.role !== 'admin')) {
      return NextResponse.json({ error: "Unauthorized: Admin access required" }, { status: 401 });
    }
    const { participantId } = await request.json()

    if (!participantId) {
      return NextResponse.json(
        { error: 'Participant ID is required' },
        { status: 400 }
      )
    }

    // Find the participant
    const participant = await prisma.participant.findUnique({
      where: { id: participantId }
    })

    if (!participant) {
      return NextResponse.json(
        { error: 'Participant not found' },
        { status: 404 }
      )
    }

    // Check if participant is individual (no team)
    if (participant.teamId) {
      return NextResponse.json(
        { error: 'This participant is part of a team. Use team approval instead.' },
        { status: 400 }
      )
    }

    // Generate password if not exists
    let passwordHash = participant.passwordHash
    let generatedPassword = null

    if (!passwordHash) {
      // Random password, delivered to the participant in the acceptance email
      // (see mdfiles/acceptance-credentials-email.md)
      generatedPassword = generatePassword()
      passwordHash = await bcrypt.hash(generatedPassword, 10)
    }

    // Update participant status to approved and set password
    const updatedParticipant = await prisma.participant.update({
      where: { id: participantId },
      data: {
        status: 'approved',
        passwordHash: passwordHash
      },
      select: PARTICIPANT_PUBLIC_FIELDS
    })

    // Notify the participant with their login credentials (their own email only)
    await dispatchNotification({
      templateKey: 'participantApproval',
      perRecipient: {
        [participantId]: credentialVariables({
          email: participant.email,
          password: generatedPassword, // null => "unchanged" text when they already had one
          participantName: participantDisplayName(participant),
        }),
      },
      audience: { kind: 'participant', id: participantId },
      relatedEntityType: 'participant',
      relatedEntityId: participantId,
    })

    return NextResponse.json({
      message: 'Participant approved successfully',
      participant: updatedParticipant,
      generatedPassword: generatedPassword
    })

  } catch (error) {
    console.error('Error approving participant:', error)
    return NextResponse.json(
      { error: 'Failed to approve participant' },
      { status: 500 }
    )
  }
}
