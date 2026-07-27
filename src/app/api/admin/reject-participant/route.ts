import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { PARTICIPANT_PUBLIC_FIELDS } from '@/lib/participant-fields';
import { dispatchNotification } from '@/lib/notify'
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
        { error: 'This participant is part of a team. Use team rejection instead.' },
        { status: 400 }
      )
    }

    // Update participant status to rejected
    const updatedParticipant = await prisma.participant.update({
      where: { id: participantId },
      data: {
        status: 'rejected'
      },
      select: PARTICIPANT_PUBLIC_FIELDS
    })

    // Create notification for the participant
    await dispatchNotification({
      templateKey: 'participantRejection',
      audience: { kind: 'participant', id: participantId },
      relatedEntityType: 'participant',
      relatedEntityId: participantId,
    })

    return NextResponse.json({
      message: 'Participant rejected successfully',
      participant: updatedParticipant
    })

  } catch (error) {
    console.error('Error rejecting participant:', error)
    return NextResponse.json(
      { error: 'Failed to reject participant' },
      { status: 500 }
    )
  }
}
