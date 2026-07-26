import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { getEmailSettings, toSmtpConfig, chunkRecipients } from '@/lib/mailer';
import { sendRawEmail } from '@/lib/notify';

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = () =>
  NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });

type Channel = 'dashboard' | 'email';

interface SelectedUser {
  type: 'participant' | 'mentor' | 'admin';
  id: string;
}

interface AudienceInput {
  type: 'all-participants' | 'all-mentors' | 'all-admins' | 'selected';
  selected?: SelectedUser[];
}

interface ResolvedRecipient {
  recipientType: 'participant' | 'mentor' | 'admin';
  recipientId: string;
  email: string | null; // admins resolve to the shared inbox at send time
}

async function resolveAudience(audience: AudienceInput): Promise<ResolvedRecipient[]> {
  if (audience.type === 'all-participants') {
    const rows = await prisma.participant.findMany({ select: { id: true, email: true } });
    return rows.map((r) => ({ recipientType: 'participant', recipientId: r.id, email: r.email }));
  }

  if (audience.type === 'all-mentors') {
    const rows = await prisma.mentor.findMany({ select: { id: true, email: true } });
    return rows.map((r) => ({ recipientType: 'mentor', recipientId: r.id, email: r.email }));
  }

  if (audience.type === 'all-admins') {
    const rows = await prisma.admin.findMany({ select: { id: true } });
    return rows.map((r) => ({ recipientType: 'admin', recipientId: r.id, email: null }));
  }

  // selected users — look each id up in its own table
  const selected = audience.selected ?? [];
  const out: ResolvedRecipient[] = [];

  const participantIds = selected.filter((s) => s.type === 'participant').map((s) => s.id);
  const mentorIds = selected.filter((s) => s.type === 'mentor').map((s) => s.id);
  const adminIds = selected.filter((s) => s.type === 'admin').map((s) => s.id);

  if (participantIds.length > 0) {
    const rows = await prisma.participant.findMany({
      where: { id: { in: participantIds } },
      select: { id: true, email: true },
    });
    out.push(...rows.map((r) => ({ recipientType: 'participant' as const, recipientId: r.id, email: r.email })));
  }
  if (mentorIds.length > 0) {
    const rows = await prisma.mentor.findMany({
      where: { id: { in: mentorIds } },
      select: { id: true, email: true },
    });
    out.push(...rows.map((r) => ({ recipientType: 'mentor' as const, recipientId: r.id, email: r.email })));
  }
  if (adminIds.length > 0) {
    const rows = await prisma.admin.findMany({
      where: { id: { in: adminIds } },
      select: { id: true },
    });
    out.push(...rows.map((r) => ({ recipientType: 'admin' as const, recipientId: r.id, email: null })));
  }

  return out;
}

/**
 * POST — send a broadcast over the selected channels to the selected audience.
 */
export async function POST(request: NextRequest) {
  const adminId = requireAdmin(cookies().get('token')?.value);
  if (!adminId) return UNAUTHORIZED();

  try {
    const body = await request.json();
    const title = String(body.title || '').trim();
    const message = String(body.body || '').trim();
    const emailSubject = String(body.emailSubject || title).trim();
    const channels: Channel[] = Array.isArray(body.channels) ? body.channels : [];
    const audience: AudienceInput = body.audience;

    if (!title || !message) {
      return NextResponse.json({ error: 'العنوان والنص مطلوبان' }, { status: 400 });
    }
    if (channels.length === 0 || !channels.every((c) => c === 'dashboard' || c === 'email')) {
      return NextResponse.json({ error: 'يرجى اختيار قناة إرسال واحدة على الأقل' }, { status: 400 });
    }
    if (!audience || !['all-participants', 'all-mentors', 'all-admins', 'selected'].includes(audience.type)) {
      return NextResponse.json({ error: 'جمهور الإرسال غير صالح' }, { status: 400 });
    }
    if (audience.type === 'selected' && (!audience.selected || audience.selected.length === 0)) {
      return NextResponse.json({ error: 'يرجى اختيار مستلم واحد على الأقل' }, { status: 400 });
    }

    const recipients = await resolveAudience(audience);
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'لا يوجد مستلمون مطابقون' }, { status: 400 });
    }

    const broadcast = await prisma.broadcast.create({
      data: {
        title,
        body: message,
        emailSubject: channels.includes('email') ? emailSubject : null,
        channels: JSON.stringify(channels),
        audience: JSON.stringify(audience),
        createdBy: adminId,
      },
    });

    let notificationCount = 0;
    let emailSentCount = 0;
    let emailFailedCount = 0;

    // ---- dashboard channel -------------------------------------------------
    const notificationIds = new Map<string, string>(); // recipientId -> notification id
    if (channels.includes('dashboard')) {
      const data = recipients.map((r) => {
        const id = crypto.randomUUID();
        notificationIds.set(`${r.recipientType}:${r.recipientId}`, id);
        return {
          id,
          title,
          message,
          type: 'info',
          recipientType: r.recipientType,
          recipientId: r.recipientId,
          relatedEntityType: 'broadcast',
          relatedEntityId: broadcast.id,
        };
      });
      await prisma.notification.createMany({ data });
      notificationCount = data.length;
    }

    // ---- email channel -----------------------------------------------------
    if (channels.includes('email')) {
      const settings = await getEmailSettings();
      const config = settings && settings.enabled ? toSmtpConfig(settings) : null;

      if (!config) {
        // Email requested but not configured/enabled — report it, don't fail
        emailFailedCount = recipients.length;
        await prisma.emailLog.create({
          data: {
            broadcastId: broadcast.id,
            toEmail: `${recipients.length} مستلم`,
            recipientCount: recipients.length,
            subject: emailSubject,
            status: 'failed',
            error: 'email disabled or SMTP settings incomplete',
          },
        });
      } else {
        const stamp = async (keys: string[], status: 'sent' | 'failed') => {
          const ids = keys.map((k) => notificationIds.get(k)).filter(Boolean) as string[];
          if (ids.length > 0) {
            await prisma.notification.updateMany({
              where: { id: { in: ids } },
              data: { emailStatus: status },
            });
          }
        };

        // admins -> ONE shared-inbox email covering all admin recipients
        const adminRecipients = recipients.filter((r) => r.recipientType === 'admin');
        if (adminRecipients.length > 0) {
          const inbox = settings!.adminInboxEmail.trim();
          if (inbox) {
            const result = await sendRawEmail({
              config, to: inbox, subject: emailSubject, bodyText: message, broadcastId: broadcast.id,
            });
            if (result.ok) emailSentCount += 1;
            else emailFailedCount += 1;
            await stamp(
              adminRecipients.map((r) => `admin:${r.recipientId}`),
              result.ok ? 'sent' : 'failed'
            );
          }
        }

        // participants + mentors -> direct / BCC batches
        const direct = recipients.filter((r) => r.recipientType !== 'admin' && r.email);
        if (direct.length === 1) {
          const r = direct[0];
          const result = await sendRawEmail({
            config, to: r.email!, subject: emailSubject, bodyText: message, broadcastId: broadcast.id,
          });
          if (result.ok) emailSentCount += 1;
          else emailFailedCount += 1;
          await stamp([`${r.recipientType}:${r.recipientId}`], result.ok ? 'sent' : 'failed');
        } else if (direct.length > 1) {
          const batches = chunkRecipients(direct.map((r) => r.email!));
          let cursor = 0;
          const startedAt = Date.now();
          for (const batch of batches) {
            const slice = direct.slice(cursor, cursor + batch.length);
            cursor += batch.length;

            if (Date.now() - startedAt > 20_000) {
              emailFailedCount += direct.length - cursor + batch.length;
              await prisma.emailLog.create({
                data: {
                  broadcastId: broadcast.id,
                  toEmail: `${direct.length - cursor + batch.length} مستلم متبقٍ`,
                  recipientCount: direct.length - cursor + batch.length,
                  subject: emailSubject,
                  status: 'failed',
                  error: 'timeout: email time budget exceeded',
                },
              });
              break;
            }

            const result = await sendRawEmail({
              config, bcc: batch, subject: emailSubject, bodyText: message, broadcastId: broadcast.id,
            });
            if (result.ok) emailSentCount += batch.length;
            else emailFailedCount += batch.length;
            await stamp(
              slice.map((r) => `${r.recipientType}:${r.recipientId}`),
              result.ok ? 'sent' : 'failed'
            );
          }
        }
      }
    }

    const updated = await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: { notificationCount, emailSentCount, emailFailedCount },
    });

    return NextResponse.json({ success: true, broadcast: updated });
  } catch (error) {
    console.error('Error sending broadcast:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

/**
 * GET — broadcast history, newest first.
 */
export async function GET() {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();

  try {
    const broadcasts = await prisma.broadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ broadcasts });
  } catch (error) {
    console.error('Error listing broadcasts:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
