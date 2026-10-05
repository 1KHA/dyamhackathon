import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verify } from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { createSlotsForMentor } from '@/lib/slots';
import { getBookingMode, organizationActiveBookings } from '@/lib/organizations';

// Ensure this route is dynamic
export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * GET — the mentor's own slots. With `?scope=organization` the organization's
 * calendar is returned instead: a slot any member adds is automatically an
 * organization slot, and the organization has ONE slot per time window no
 * matter how many members offer it (same rule as organizationSlots). So every
 * window appears once — as the mentor's own slot (`shared: false`) when they
 * offer it, otherwise as one `shared: true` entry — with `hostMentors` = the
 * colleagues offering that exact window and `isBooked` = the organization has
 * a session in it.
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

    // Colleagues' slots are only shared when the admin allows booking through
    // organizations. In "individual" mode every mentor manages — and shows —
    // only their own times, even if they belong to an organization.
    const mode = await getBookingMode();
    if (mode === 'individual') {
      return NextResponse.json(availabilities.map((a) => ({ ...a, shared: false as const })));
    }

    const me = await prisma.mentor.findUnique({ where: { id: mentorId }, select: { organizationId: true } });
    if (!me?.organizationId) {
      return NextResponse.json(availabilities.map((a) => ({ ...a, shared: false as const })));
    }

    const [colleagueSlots, busy] = await Promise.all([
      prisma.mentorAvailability.findMany({
        where: {
          mentorId: { not: mentorId },
          mentor: { organizationId: me.organizationId, status: 'active', isDisabled: false },
        },
        include: { mentor: { select: { id: true, name: true } } },
        orderBy: { startTime: 'asc' },
      }),
      organizationActiveBookings(me.organizationId, new Date(0)),
    ]);

    const windowKey = (a: { startTime: Date; endTime: Date }) => `${a.startTime.getTime()}-${a.endTime.getTime()}`;
    const hostsByWindow = new Map<string, typeof colleagueSlots>();
    for (const c of colleagueSlots) {
      const g = hostsByWindow.get(windowKey(c));
      if (g) g.push(c);
      else hostsByWindow.set(windowKey(c), [c]);
    }
    // The organization is busy whenever any member has a session overlapping the window.
    const isBooked = (w: { startTime: Date; endTime: Date }) =>
      busy.some((b) => b.startTime < w.endTime && w.startTime < b.endTime);
    const ownWindows = new Set(availabilities.map(windowKey));

    const own = availabilities.map((a) => ({
      ...a,
      shared: false as const,
      hostMentors: (hostsByWindow.get(windowKey(a)) ?? []).map((c) => c.mentor),
      isBooked: isBooked(a),
    }));
    const colleaguesOnly = Array.from(hostsByWindow.entries())
      .filter(([key]) => !ownWindows.has(key))
      .map(([, group]) => {
        const { mentor, ...a } = group[0];
        return {
          ...a,
          shared: true as const,
          hostMentor: mentor,
          hostMentors: group.map((c) => c.mentor),
          isBooked: isBooked(a),
        };
      });

    return NextResponse.json(
      [...own, ...colleaguesOnly].sort((x, y) => x.startTime.getTime() - y.startTime.getTime())
    );
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

    // Any range (click-and-drag included) becomes 20-minute slots with a
    // 5-minute break after each; clashing windows are skipped. See src/lib/slots.ts.
    const result = await createSlotsForMentor(mentorId, startTime, endTime);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // First row at the top level keeps older callers working; `slots` has them all.
    return NextResponse.json(
      { ...(result.created[0] ?? {}), created: result.created.length, skipped: result.skipped, slots: result.created },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'JsonWebTokenError') {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    console.error('Error creating availability:', error);
    return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
  }
}
