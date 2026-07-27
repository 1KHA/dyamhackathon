import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
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

    // Get team with participants
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { participants: true }
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

    // Update team status and create passwords for participants
    await prisma.$transaction(async (tx) => {
      // Update team status to approved
      await tx.team.update({
        where: { id: teamId },
        data: { status: 'approved' }
      })

      // Create passwords for all participants using email+123 format
      for (const participant of team.participants) {
        // Generate password using email prefix + "123"
        const emailPrefix = participant.email.split('@')[0]
        const password = `${emailPrefix}123`
        
        console.log(`🔐 Generating password for ${participant.email}:`);
        console.log(`   - Email prefix: "${emailPrefix}"`);
        console.log(`   - Password: "${password}"`);
        
        const hashedPassword = await bcrypt.hash(password, 10)

        // Update participant with password
        await tx.participant.update({
          where: { id: participant.id },
          data: { passwordHash: hashedPassword }
        })
        
        console.log(`✅ Password created for ${participant.email}`);
      }
    })

    // Create notification for team members about approval
    try {
      await dispatchNotification({
        templateKey: 'teamApproval',
        variables: { teamName: team.teamName || 'فريقك' },
        audience: { kind: 'team', teamId },
        relatedEntityType: 'team',
        relatedEntityId: teamId,
      });
    } catch (notificationError) {
      console.error('Error creating approval notification:', notificationError);
      // Don't fail the approval if notification fails
    }

    return NextResponse.json({
      success: true,
      message: 'Team approved and accounts created successfully'
    })
  } catch (error) {
    console.error('Error approving team:', error)
    return NextResponse.json(
      { error: 'Failed to approve team' },
      { status: 500 }
    )
  }
}
