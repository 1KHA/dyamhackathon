import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/notification-auth";

// GET /api/admin/milestones/[milestoneId]/submissions
// Fetches all submissions for a specific milestone
export async function GET(
  request: NextRequest,
  { params }: { params: { milestoneId: string } }
) {
  if (!requireAdmin(cookies().get("token")?.value)) {
    return NextResponse.json({ error: "غير مصرح. هذه الخدمة متاحة للمسؤولين فقط." }, { status: 401 });
  }
  try {
    const { milestoneId } = params;

    if (!milestoneId) {
      return NextResponse.json(
        { error: "معرف المرحلة مطلوب" },
        { status: 400 }
      );
    }

    // Check if the milestone exists
    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId }
    });

    if (!milestone) {
      return NextResponse.json(
        { error: "لم يتم العثور على المرحلة" },
        { status: 404 }
      );
    }

    // Fetch all submissions for this milestone with participant and team info
    const submissions = await prisma.milestoneSubmission.findMany({
      where: {
        milestoneId: milestoneId
      },
      include: {
        participant: {
          include: {
            team: true
          }
        }
      },
      orderBy: {
        submittedAt: 'desc'
      }
    });

    // Transform the data to match the expected format
    const formattedSubmissions = submissions.map(sub => ({
      id: sub.id,
      participantId: sub.participantId,
      milestoneId: sub.milestoneId,
      filePath: sub.filePath,
      fileName: sub.fileName,
      submittedAt: sub.submittedAt.toISOString(),
      reviewStatus: sub.reviewStatus,
      reviewComment: sub.reviewComment,
      reviewedAt: sub.reviewedAt ? sub.reviewedAt.toISOString() : null,
      participant: {
        id: sub.participant.id,
        firstName: sub.participant.firstName || '',
        secondName: sub.participant.secondName || '',
        familyName: sub.participant.familyName || '',
        email: sub.participant.email,
        teamId: sub.participant.teamId || '',
        team: {
          id: sub.participant.team?.id || '',
          teamName: sub.participant.team?.teamName || 'لا يوجد فريق'
        }
      }
    }));

    return NextResponse.json(formattedSubmissions);
  } catch (error) {
    console.error("Error fetching milestone submissions:", error);
    console.error("Error details:", error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب التسليمات" },
      { status: 500 }
    );
  }
}
