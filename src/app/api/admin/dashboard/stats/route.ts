import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getNotifications } from "@/lib/notifications";
import { verifyToken } from "@/lib/notification-auth";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Admins only — this endpoint exposes platform-wide statistics
    const token = cookies().get('token')?.value;
    const claims = verifyToken(token);

    if (!claims || claims.role !== 'admin') {
      return NextResponse.json(
        { error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' },
        { status: 401 }
      );
    }

    // The admin login route signs the id as `id`, not `adminId`
    const adminId = claims.adminId || claims.id;

    if (!adminId) {
      return NextResponse.json(
        { error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' },
        { status: 401 }
      );
    }

    // Get total participants count
    const totalParticipants = await prisma.participant.count();

    // Get total teams count
    const totalTeams = await prisma.team.count();

    // Get individual participants count (those without a team)
    const individualParticipants = await prisma.participant.count({
      where: {
        teamId: null
      }
    });

    // Get total mentors count
    const totalMentors = await prisma.mentor.count();

    // Get events statistics
    const totalEvents = await prisma.event.count();
    
    const completedEvents = await prisma.event.count({
      where: {
        status: "completed"
      }
    });
    
    const upcomingEvents = await prisma.event.count({
      where: {
        status: "upcoming"
      }
    });

    // Get event registrations count
    const totalEventRegistrations = await prisma.eventRegistration.count();

    // Get submissions statistics
    const totalSubmissions = await prisma.milestoneSubmission.count();
    
    const pendingSubmissions = await prisma.milestoneSubmission.count({
      where: {
        reviewStatus: "pending"
      }
    });
    
    const acceptedSubmissions = await prisma.milestoneSubmission.count({
      where: {
        reviewStatus: "accepted"
      }
    });

    // Get mentor bookings statistics
    const totalMentorBookings = await prisma.mentorBooking.count();
    
    const completedMentorBookings = await prisma.mentorBooking.count({
      where: {
        status: "completed"
      }
    });

    // Get team distribution by track
    const teamsByTrack = await prisma.team.groupBy({
      by: ['hackathonTrack'],
      _count: {
        id: true
      }
    });

    // Format team distribution for chart
    const teamDistribution = teamsByTrack.map(track => ({
      name: track.hackathonTrack || 'غير محدد',
      count: track._count.id
    }));

    // Get milestone completion statistics
    const milestones = await prisma.milestone.findMany({
      select: {
        id: true,
        title: true,
        submissionCount: true
      }
    });

    // Get recent notifications — scoped to the signed-in admin, so the activity
    // feed cannot surface participants' or mentors' notifications
    const { notifications: recentNotifications } = await getNotifications(
      'admin',
      adminId,
      { limit: 5 }
    );

    // Get upcoming events
    const upcomingEventsList = await prisma.event.findMany({
      where: {
        status: "upcoming",
        startDate: {
          gte: new Date()
        }
      },
      orderBy: {
        startDate: 'asc'
      },
      take: 5
    });

    // Get recent submissions with team and participant info
    const recentSubmissions = await prisma.milestoneSubmission.findMany({
      take: 5,
      orderBy: {
        submittedAt: 'desc'
      },
      include: {
        participant: {
          include: {
            team: true
          }
        },
        milestone: true
      }
    });

    // Format recent submissions for display
    const formattedSubmissions = recentSubmissions.map(submission => ({
      id: submission.id,
      milestoneTitle: submission.milestone.title,
      teamName: submission.participant.team?.teamName || 'مشاركة فردية',
      participantName: submission.participant.fullName || `${submission.participant.firstName || ''} ${submission.participant.familyName || ''}`,
      submittedAt: submission.submittedAt,
      reviewStatus: submission.reviewStatus
    }));

    // Return all statistics
    return NextResponse.json({
      totalParticipants,
      totalTeams,
      individualParticipants,
      totalMentors,
      totalEvents,
      completedEvents,
      upcomingEvents,
      totalEventRegistrations,
      totalSubmissions,
      pendingSubmissions,
      acceptedSubmissions,
      totalMentorBookings,
      completedMentorBookings,
      teamDistribution,
      milestones,
      recentNotifications,
      upcomingEventsList,
      recentSubmissions: formattedSubmissions
    });
  } catch (error) {
    console.error("Error fetching dashboard statistics:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard statistics" },
      { status: 500 }
    );
  }
}
