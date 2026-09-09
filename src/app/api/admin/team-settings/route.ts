import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { getTeamSettings, memberAddWindowState } from '@/lib/team-settings';
import { TEAM_MAX_MEMBERS } from '@/lib/constants';
import { isBookingMode, BOOKING_MODE_LABELS } from '@/lib/organizations';

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = () =>
  NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });

/** GET — current member-add window (admin). */
export async function GET() {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const settings = await getTeamSettings();
    return NextResponse.json({
      memberAddStart: settings.memberAddStart,
      memberAddEnd: settings.memberAddEnd,
      maxMembers: TEAM_MAX_MEMBERS,
      window: memberAddWindowState(settings),
      mentorBookingMode: settings.mentorBookingMode,
      bookingModeLabels: BOOKING_MODE_LABELS,
    });
  } catch (error) {
    console.error('Error reading team settings:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

/**
 * PUT — set the window. Body: { memberAddStart, memberAddEnd } — ISO strings
 * or null to clear either side.
 */
export async function PUT(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const body = await request.json();

    const parse = (v: unknown, label: string): Date | null | 'invalid' => {
      if (v === null || v === undefined || v === '') return null;
      const d = new Date(String(v));
      return isNaN(d.getTime()) ? 'invalid' : d;
    };

    const start = parse(body.memberAddStart, 'start');
    const end = parse(body.memberAddEnd, 'end');
    if (start === 'invalid' || end === 'invalid') {
      return NextResponse.json({ error: 'صيغة التاريخ غير صالحة' }, { status: 400 });
    }
    if (start && end && end <= start) {
      return NextResponse.json(
        { error: 'يجب أن يكون تاريخ النهاية بعد تاريخ البداية' },
        { status: 400 }
      );
    }

    if (body.mentorBookingMode !== undefined && !isBookingMode(body.mentorBookingMode)) {
      return NextResponse.json({ error: 'طريقة الحجز غير صالحة' }, { status: 400 });
    }

    const current = await getTeamSettings();
    // The window fields are only written when the client sent at least one of
    // them, so a booking-mode-only update never clears the window.
    const touchesWindow = body.memberAddStart !== undefined || body.memberAddEnd !== undefined;
    const updated = await prisma.teamSettings.update({
      where: { id: current.id },
      data: {
        ...(touchesWindow ? { memberAddStart: start, memberAddEnd: end } : {}),
        ...(body.mentorBookingMode !== undefined ? { mentorBookingMode: body.mentorBookingMode } : {}),
      },
    });

    return NextResponse.json({
      memberAddStart: updated.memberAddStart,
      memberAddEnd: updated.memberAddEnd,
      maxMembers: TEAM_MAX_MEMBERS,
      window: memberAddWindowState(updated),
      mentorBookingMode: updated.mentorBookingMode,
      bookingModeLabels: BOOKING_MODE_LABELS,
    });
  } catch (error) {
    console.error('Error updating team settings:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
