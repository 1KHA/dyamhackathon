import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { verifyToken, requireAdmin } from '@/lib/notification-auth';

/**
 * GET is read by BOTH the admin mentors page and the participant mentors page
 * (participants view a mentor's open slots before booking), so it accepts any
 * signed-in user rather than admins only. The data here (start/end times) is
 * not sensitive.
 */
export async function GET(
  request: Request,
  { params }: { params: { mentorId: string } }
) {
  if (!verifyToken(cookies().get('token')?.value)) {
    return NextResponse.json({ message: 'غير مصرح' }, { status: 401 });
  }
  try {
    const { mentorId } = params;

    const availabilities = await prisma.mentorAvailability.findMany({
      where: { mentorId },
      orderBy: { startTime: 'asc' },
    });

    return NextResponse.json(availabilities);
  } catch (error) {
    console.error('Error fetching availability:', error);
    return NextResponse.json({ message: 'An error occurred while fetching availability.' }, { status: 500 });
  }
}

// POST/DELETE manage a mentor's slots from the admin panel — admin only.
export async function POST(
  request: Request,
  { params }: { params: { mentorId: string } }
) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json({ message: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }
  try {
    const { mentorId } = params;
    const { start, end } = await request.json();

    if (!start || !end) {
      return NextResponse.json({ message: 'Start and end times are required.' }, { status: 400 });
    }

    const newAvailability = await prisma.mentorAvailability.create({
      data: {
        mentorId,
        startTime: new Date(start),
        endTime: new Date(end),
      },
    });

    return NextResponse.json(newAvailability, { status: 201 });
  } catch (error) {
    console.error('Error creating availability:', error);
    return NextResponse.json({ message: 'An error occurred while creating availability.' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { mentorId: string } }
) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json({ message: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }
  try {
    // Note: The mentorId from params is not strictly needed if availabilityId is globally unique,
    // but it's good practice for authorization or ensuring consistency.
    const { mentorId } = params;
    const { availabilityId } = await request.json();

    if (!availabilityId) {
      return NextResponse.json({ message: 'Availability ID is required.' }, { status: 400 });
    }

    // Optional: Verify the availability belongs to the mentor before deleting
    const availability = await prisma.mentorAvailability.findUnique({
      where: { id: availabilityId },
    });

    if (!availability || availability.mentorId !== mentorId) {
      return NextResponse.json({ message: 'Availability not found or does not belong to this mentor.' }, { status: 404 });
    }

    await prisma.mentorAvailability.delete({
      where: { id: availabilityId },
    });

    return NextResponse.json({ message: 'Availability deleted successfully.' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting availability:', error);
    return NextResponse.json({ message: 'An error occurred while deleting availability.' }, { status: 500 });
  }
}
