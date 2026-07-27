import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/lib/notify";
import { requireAdmin } from "@/lib/notification-auth";

// POST /api/admin/milestones/[milestoneId]/submissions/[submissionId]/review
// Updates the review status and comment for a submission
export async function POST(
  request: NextRequest,
  { params }: { params: { milestoneId: string; submissionId: string } }
) {
  if (!requireAdmin(cookies().get("token")?.value)) {
    return NextResponse.json({ error: "غير مصرح. هذه الخدمة متاحة للمسؤولين فقط." }, { status: 401 });
  }
  try {
    const { milestoneId, submissionId } = params;

    if (!milestoneId || !submissionId) {
      return NextResponse.json(
        { error: "معرف المرحلة ومعرف التسليم مطلوبان" },
        { status: 400 }
      );
    }

    // Get the review data from the request body
    const data = await request.json();
    const { reviewStatus, reviewComment } = data;

    if (!reviewStatus) {
      return NextResponse.json(
        { error: "حالة المراجعة مطلوبة" },
        { status: 400 }
      );
    }

    // Get submission details with participant, team, and milestone information
    const submissionDetails = await prisma.milestoneSubmission.findFirst({
      where: {
        id: submissionId,
        milestoneId: milestoneId,
      },
      include: {
        participant: {
          include: {
            team: true,
          },
        },
        milestone: true,
      },
    });

    if (!submissionDetails) {
      return NextResponse.json(
        { error: "لم يتم العثور على التسليم" },
        { status: 404 }
      );
    }

    // Update the submission with the review
    await prisma.milestoneSubmission.update({
      where: { id: submissionId },
      data: {
        reviewStatus: reviewStatus,
        reviewComment: reviewComment || null,
        reviewedAt: new Date(),
      },
    });

    // Create notifications for team members about the review result
    try {
      if (submissionDetails.participant.teamId) {
        await dispatchNotification({
          templateKey:
            reviewStatus === 'accepted' ? 'milestoneReviewAccepted' : 'milestoneReviewRejected',
          variables: { milestoneTitle: submissionDetails.milestone.title },
          audience: { kind: 'team', teamId: submissionDetails.participant.teamId },
          relatedEntityType: 'milestone_submission',
          relatedEntityId: submissionId,
        });
      }
    } catch (notificationError) {
      console.error('Error creating milestone review notifications:', notificationError);
      // Don't fail the review if notification fails
    }

    return NextResponse.json({
      success: true,
      message: "تم تحديث المراجعة بنجاح",
    });
  } catch (error) {
    console.error("Error updating submission review:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تحديث المراجعة" },
      { status: 500 }
    );
  }
}
