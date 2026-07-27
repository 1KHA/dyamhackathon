import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { PARTICIPANT_PUBLIC_FIELDS } from '@/lib/participant-fields';
import jwt from "jsonwebtoken";

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
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

    // Get the request body
    const body = await request.json();
    const { teamId, participantId, makeLeader = false } = body;

    if (!teamId) {
      return NextResponse.json({ error: "Team ID is required" }, { status: 400 });
    }

    if (!participantId) {
      return NextResponse.json({ error: "Participant ID is required" }, { status: 400 });
    }

    // Check if the team exists
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { participants: { select: PARTICIPANT_PUBLIC_FIELDS } },
    });

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Check if the participant exists
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
    });

    if (!participant) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }

    // Check if the participant is already in a team
    if (participant.teamId) {
      return NextResponse.json({ error: "Participant is already in a team" }, { status: 400 });
    }

    // If making this participant a leader, update the current leader
    if (makeLeader) {
      // Find the current leader
      const currentLeader = team.participants.find((p: { id: string; isLeader: boolean }) => p.isLeader);
      
      if (currentLeader) {
        // Remove leader status from current leader
        await prisma.participant.update({
          where: { id: currentLeader.id },
          data: { isLeader: false },
        });
      }
    }

    // Add the participant to the team
    const updatedParticipant = await prisma.participant.update({
      where: { id: participantId },
      data: {
        teamId: teamId,
        isLeader: makeLeader
      },
      select: PARTICIPANT_PUBLIC_FIELDS,
    });

    // Get the updated team data
    const updatedTeam = await prisma.team.findUnique({
      where: { id: teamId },
      include: { participants: { select: PARTICIPANT_PUBLIC_FIELDS } },
    });

    return NextResponse.json({
      message: "Member added successfully",
      participant: updatedParticipant,
      team: updatedTeam,
    });
  } catch (error) {
    console.error("Error adding team member:", error);
    return NextResponse.json({ error: "Failed to add team member" }, { status: 500 });
  }
}
