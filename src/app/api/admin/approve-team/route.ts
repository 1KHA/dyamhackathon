import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { dispatchNotification, type TemplateVariables } from '@/lib/notify'
import { requireAdmin } from '@/lib/notification-auth'
import { generatePassword, credentialVariables, participantDisplayName } from '@/lib/credentials'

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

    // Approve the team and issue login credentials to every member. Each
    // member's password is generated here, stored hashed, and delivered ONLY
    // to that member in their own acceptance email (per-recipient variables).
    // See mdfiles/acceptance-credentials-email.md.
    const issued: Array<{ participantId: string; email: string; password: string; name: string }> = []
    const perRecipient: Record<string, TemplateVariables> = {}

    await prisma.$transaction(async (tx) => {
      await tx.team.update({
        where: { id: teamId },
        data: { status: 'approved' }
      })

      for (const participant of team.participants) {
        const password = generatePassword()
        const hashedPassword = await bcrypt.hash(password, 10)
        await tx.participant.update({
          where: { id: participant.id },
          data: { passwordHash: hashedPassword }
        })
        const name = participantDisplayName(participant)
        issued.push({ participantId: participant.id, email: participant.email, password, name })
        perRecipient[participant.id] = credentialVariables({ email: participant.email, password, participantName: name })
        console.log(`🔐 Credentials issued for ${participant.email}`)
      }
    })

    // Notify each member with their own credentials
    try {
      await dispatchNotification({
        templateKey: 'teamApproval',
        variables: { teamName: team.teamName || 'فريقك' },
        perRecipient,
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
      message: 'Team approved and accounts created successfully',
      // Returned so the admin can hand credentials over manually if email is
      // disabled or a delivery fails (same as approve-participant's generatedPassword).
      credentials: issued.map(({ email, password, name }) => ({ email, password, name })),
    })
  } catch (error) {
    console.error('Error approving team:', error)
    return NextResponse.json(
      { error: 'Failed to approve team' },
      { status: 500 }
    )
  }
}
