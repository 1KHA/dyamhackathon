import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { dispatchNotification } from '@/lib/notify'
import { requireAdmin } from '@/lib/notification-auth'

// Ensure this route is dynamic
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }
  try {
    const body = await request.json()
    const { teamId } = body

    if (!teamId) {
      return NextResponse.json(
        { error: 'Team ID is required' },
        { status: 400 }
      )
    }

    // Get team
    const team = await prisma.team.findUnique({
      where: { id: teamId }
    })

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      )
    }

    if (team.status !== 'pending') {
      return NextResponse.json(
        { error: 'Team is not in pending status' },
        { status: 400 }
      )
    }

    // Update team status to rejected
    await prisma.team.update({
      where: { id: teamId },
      data: { status: 'rejected' }
    })

    // Create notification for team members about rejection
    try {
      await dispatchNotification({
        templateKey: 'teamRejection',
        variables: { teamName: team.teamName || 'فريقك' },
        audience: { kind: 'team', teamId },
        relatedEntityType: 'team',
        relatedEntityId: teamId,
      });
    } catch (notificationError) {
      console.error('Error creating rejection notification:', notificationError);
      // Don't fail the rejection if notification fails
    }

    return NextResponse.json({
      success: true,
      message: 'Team rejected successfully'
    })
  } catch (error) {
    console.error('Error rejecting team:', error)
    return NextResponse.json(
      { error: 'Failed to reject team' },
      { status: 500 }
    )
  }
}
