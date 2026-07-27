import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { dispatchNotification } from '@/lib/notify';
import { verifyToken, requireAdmin } from '@/lib/notification-auth';

export const dynamic = 'force-dynamic';

// Fields safe to send to the browser — excludes passwordHash. This list is
// shared by both the list and single-mentor lookup below.
const MENTOR_PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  specialty: true,
  phone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * GET is read by BOTH the admin mentors page and the participant mentors page
 * (participants browse mentors before booking), so it accepts any signed-in
 * user rather than admins only. It never returns passwordHash.
 */
export async function GET(request: NextRequest) {
  if (!verifyToken(cookies().get('token')?.value)) {
    return NextResponse.json({ message: 'غير مصرح' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  try {
    if (id) {
      const mentor = await prisma.mentor.findUnique({
        where: { id },
        select: MENTOR_PUBLIC_FIELDS,
      });

      if (!mentor) {
        return NextResponse.json({ message: 'Mentor not found' }, { status: 404 });
      }

      return NextResponse.json(mentor);
    } else {
      const mentors = await prisma.mentor.findMany({
        select: MENTOR_PUBLIC_FIELDS,
        orderBy: {
          createdAt: 'desc',
        },
      });
      return NextResponse.json(mentors);
    }
  } catch (error) {
    console.error('Error fetching mentors:', error);
    return NextResponse.json({ message: 'Failed to fetch mentors' }, { status: 500 });
  }
}

// POST/PUT/DELETE create, edit, and delete mentor accounts — admin only.
export async function POST(request: Request) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json({ message: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { name, email, specialty, phone, password } = body;

    if (!name || !email || !specialty || !phone || !password) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newMentor = await prisma.mentor.create({
      data: {
        name,
        email,
        specialty,
        phone,
        passwordHash,
      },
      select: MENTOR_PUBLIC_FIELDS,
    });

    // Notify admins that a new mentor was added
    try {
      await dispatchNotification({
        templateKey: 'newMentorRegistration',
        variables: { mentorName: newMentor.name },
        audience: { kind: 'admins' },
        relatedEntityType: 'mentor',
        relatedEntityId: newMentor.id,
      });
    } catch (notificationError) {
      console.error('Error creating mentor registration notification:', notificationError);
      // Don't fail the creation if notification fails
    }

    return NextResponse.json(newMentor, { status: 201 });
  } catch (error) {
    console.error('Error creating mentor:', error);
    // Check for unique constraint violation
    if ((error as any).code === 'P2002' && (error as any).meta?.target?.includes('email')) {
      return NextResponse.json({ message: 'Email already exists' }, { status: 409 });
    }
    return NextResponse.json({ message: 'Failed to create mentor' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json({ message: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { id, name, email, specialty, phone, status } = body;

    if (!id) {
      return NextResponse.json({ message: 'Mentor ID is required' }, { status: 400 });
    }

    // Read the current status first so approval can be detected as a transition
    // rather than firing on every unrelated edit
    const existingMentor = await prisma.mentor.findUnique({
      where: { id },
      select: { status: true },
    });

    const updatedMentor = await prisma.mentor.update({
      where: { id },
      data: {
        name,
        email,
        specialty,
        phone,
        status,
      },
      select: MENTOR_PUBLIC_FIELDS,
    });

    // Notify the mentor only when they have just been approved
    if (existingMentor && existingMentor.status !== 'active' && updatedMentor.status === 'active') {
      try {
        await dispatchNotification({
          templateKey: 'mentorProfileApproval',
          audience: { kind: 'mentor', id: updatedMentor.id },
          relatedEntityType: 'mentor',
          relatedEntityId: updatedMentor.id,
        });
      } catch (notificationError) {
        console.error('Error creating mentor approval notification:', notificationError);
        // Don't fail the update if notification fails
      }
    }

    return NextResponse.json(updatedMentor);
  } catch (error) {
    console.error('Error updating mentor:', error);
    if ((error as any).code === 'P2002' && (error as any).meta?.target?.includes('email')) {
      return NextResponse.json({ message: 'Email already exists' }, { status: 409 });
    }
    return NextResponse.json({ message: 'Failed to update mentor' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json({ message: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ message: 'Mentor ID is required' }, { status: 400 });
    }

    await prisma.mentor.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Mentor deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting mentor:', error);
    return NextResponse.json({ message: 'Failed to delete mentor' }, { status: 500 });
  }
}
