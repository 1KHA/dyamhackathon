import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verify } from 'jsonwebtoken';
import { cookies } from 'next/headers';

// Ensure this route is dynamic
export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * GET — the mentor's own slots. With `?scope=organization` the slots of the
 * mentor's organization colleagues are appended too (flagged `shared: true`,
 * with `hostMentor`), since a slot any member adds is automatically an
 * organization slot that every member can be invited to.
 */
export async function GET(request: Request) {
  console.log('GET /api/mentor/availability');
  const scope = new URL(request.url).searchParams.get('scope');
  const cookieStore = cookies();
  const token = cookieStore.get('token')?.value;
  console.log('Auth token from cookie:', token);
  console.log('JWT_SECRET used:', process.env.JWT_SECRET ? 'Environment variable set' : 'Using default secret');


  if (!token) {
    console.log('No token found, returning 401');
    return NextResponse.json({ error: 'Unauthorized: No token provided' }, { status: 401 });
  }

  if (!JWT_SECRET) {
    console.error('JWT_SECRET is not set');
    return NextResponse.json({ error: 'Internal Server Error: JWT secret not configured' }, { status: 500 });
  }

  try {
    const decoded = verify(token, JWT_SECRET) as { id: string };
    console.log('Token decoded successfully:', decoded);
    const mentorId = decoded.id;

    const availabilities = await prisma.mentorAvailability.findMany({
      where: { mentorId },
      orderBy: { startTime: 'asc' },
    });

    if (scope !== 'organization') {
      return NextResponse.json(availabilities);
    }

    const me = await prisma.mentor.findUnique({ where: { id: mentorId }, select: { organizationId: true } });
    const shared = me?.organizationId
      ? await prisma.mentorAvailability.findMany({
          where: {
            mentorId: { not: mentorId },
            mentor: { organizationId: me.organizationId, status: 'active', isDisabled: false },
          },
          include: {
            mentor: { select: { id: true, name: true } },
            bookings: { where: { status: { not: 'cancelled' } }, select: { id: true } },
          },
          orderBy: { startTime: 'asc' },
        })
      : [];

    return NextResponse.json([
      ...availabilities.map((a) => ({ ...a, shared: false as const })),
      ...shared.map(({ mentor, bookings, ...a }) => ({
        ...a,
        shared: true as const,
        hostMentor: mentor,
        isBooked: bookings.length > 0,
      })),
    ]);
  } catch (error) {
    console.error('Error verifying token:', error);
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}

export async function POST(request: Request) {
  const cookieStore = cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!JWT_SECRET) {
    console.error('JWT_SECRET is not set');
    return NextResponse.json({ error: 'Internal Server Error: JWT secret not configured' }, { status: 500 });
  }

  try {
    const decoded = verify(token, JWT_SECRET) as { id: string };
    const mentorId = decoded.id;

    const { startTime, endTime } = await request.json();

    if (!startTime || !endTime) {
      return NextResponse.json({ error: 'Start time and end time are required' }, { status: 400 });
    }

    const newAvailability = await prisma.mentorAvailability.create({
      data: {
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        mentorId,
      },
    });

    return NextResponse.json(newAvailability, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === 'JsonWebTokenError') {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    console.error('Error creating availability:', error);
    return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
  }
}
