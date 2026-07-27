import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/notification-auth'

export async function POST(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }
  try {
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
        { error: 'This participant is part of a team. Cannot delete team members individually.' },
        { status: 400 }
      )
    }

    // Delete all related join requests first
    await prisma.teamJoinRequest.deleteMany({
      where: { participantId: participantId }
    })

    // Delete the participant
    await prisma.participant.delete({
      where: { id: participantId }
    })

    return NextResponse.json({
      message: 'Participant deleted successfully'
    })

  } catch (error) {
    console.error('Error deleting participant:', error)
    return NextResponse.json(
      { error: 'Failed to delete participant' },
      { status: 500 }
    )
  }
}
