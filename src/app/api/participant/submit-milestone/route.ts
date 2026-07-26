import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { dispatchNotification } from '@/lib/notify';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

interface JwtPayload {
  participantId: string;
  email: string;
  role: string;
  teamId?: string;
  isLeader?: boolean;
}


export async function POST(request: NextRequest) {
  try {
    // Get JSON body with file metadata (file already uploaded to Supabase)
    const body = await request.json();
    const { milestoneId, filePath, fileName } = body;

    // Validate inputs
    if (!milestoneId) {
      return NextResponse.json(
        { error: "معرف المرحلة مطلوب" },
        { status: 400 }
      );
    }

    if (!filePath || !fileName) {
      return NextResponse.json(
        { error: "معلومات الملف مطلوبة" },
        { status: 400 }
      );
    }

    // Get the participant ID from the JWT token
    const cookieStore = cookies();
    const tokenCookie = cookieStore.get('token'); // Changed from 'auth-token' to 'token' to match login route

    if (!tokenCookie) {
      console.log('No token cookie found in request');
      return NextResponse.json(
        { error: "يرجى تسجيل الدخول للتسليم" },
        { status: 401 }
      );
    }

    const token = tokenCookie.value;
    let decoded: JwtPayload;

    try {
      decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      console.log('Decoded token:', decoded);
    } catch (err) {
      console.error('Token verification failed:', err);
      return NextResponse.json(
        { error: "جلسة غير صالحة، يرجى تسجيل الدخول مرة أخرى" },
        { status: 401 }
      );
    }

    // Get participantId directly from the decoded token
    const participantId = decoded.participantId;

    // Get the participant with team information
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: { team: true },
    });
    
    if (!participant) {
      return NextResponse.json(
        { error: "لم يتم العثور على المشارك" },
        { status: 404 }
      );
    }

    // Check if the participant is a team leader
    if (!participant.isLeader) {
      console.log(`Participant ${participantId} is not a team leader. isLeader=${participant.isLeader}`);
      return NextResponse.json(
        { error: "فقط قائد الفريق يمكنه تسليم المشاريع" },
        { status: 403 }
      );
    }

    // Check if the milestone exists
    const milestone = await prisma.$queryRaw`
      SELECT * FROM "Milestone" WHERE id = ${milestoneId}
    `;
    if (!milestone || (Array.isArray(milestone) && milestone.length === 0)) {
      return NextResponse.json(
        { error: "لم يتم العثور على المرحلة" },
        { status: 404 }
      );
    }

    // Check if the participant has already submitted for this milestone
    const existingSubmission = await prisma.$queryRaw`
      SELECT * FROM "MilestoneSubmission" 
      WHERE "participantId" = ${participant.id} AND "milestoneId" = ${milestoneId}
    `;
    
    if (existingSubmission && Array.isArray(existingSubmission) && existingSubmission.length > 0) {
      return NextResponse.json(
        { error: "لقد قمت بتسليم هذا المشروع بالفعل ولا يمكنك التسليم مرة أخرى" },
        { status: 400 }
      );
    }

    // Create a new milestone submission in the database
    // File is already uploaded to Supabase, we just store the metadata
    const submission = await prisma.$executeRaw`
      INSERT INTO "MilestoneSubmission" (id, "participantId", "milestoneId", "filePath", "fileName", "submittedAt")
      VALUES (${crypto.randomUUID()}, ${participant.id}, ${milestoneId}, ${filePath}, ${fileName}, ${new Date().toISOString()}::timestamp)
    `;

    // Update the milestone submission count
    await prisma.$executeRaw`
      UPDATE "Milestone"
      SET "submissionCount" = "submissionCount" + 1
      WHERE id = ${milestoneId}
    `;

    // Create notification for admins about new milestone submission
    try {
      const milestoneData = Array.isArray(milestone) ? milestone[0] : milestone;
      await dispatchNotification({
        templateKey: 'newMilestoneSubmission',
        variables: {
          teamName: participant.team?.teamName || 'فريق غير محدد',
          milestoneTitle: milestoneData?.title || 'مرحلة غير محددة',
        },
        audience: { kind: 'admins' },
        relatedEntityType: 'milestone',
        relatedEntityId: milestoneId,
      });
    } catch (notificationError) {
      console.error('Error creating milestone submission notification:', notificationError);
      // Don't fail the submission if notification fails
    }

    return NextResponse.json({
      success: true,
      message: "تم تسليم المشروع بنجاح",
      submission,
    });
  } catch (error) {
    console.error("Error submitting milestone:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تسليم المشروع" },
      { status: 500 }
    );
  }
}
