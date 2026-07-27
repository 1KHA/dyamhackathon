import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/notification-auth";

// GET /api/admin/milestones/[milestoneId]
// Fetches a specific milestone by ID
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

    // Fetch the milestone
    const milestone = await prisma.$queryRaw`
      SELECT * FROM "Milestone" WHERE id = ${milestoneId}
    `;

    if (!milestone || (Array.isArray(milestone) && milestone.length === 0)) {
      return NextResponse.json(
        { error: "لم يتم العثور على المرحلة" },
        { status: 404 }
      );
    }

    // If milestone is an array with one item, return the first item
    const milestoneData = Array.isArray(milestone) ? milestone[0] : milestone;

    // Parse the requirements string to an array
    if (milestoneData.requirements) {
      try {
        milestoneData.requirements = JSON.parse(milestoneData.requirements);
      } catch (e) {
        // If parsing fails, keep it as a string
        console.error("Error parsing requirements:", e);
      }
    }

    return NextResponse.json(milestoneData);
  } catch (error) {
    console.error("Error fetching milestone:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب المرحلة" },
      { status: 500 }
    );
  }
}
