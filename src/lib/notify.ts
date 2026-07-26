import crypto from 'crypto';
import { prisma } from './prisma';
import {
  getEmailSettings,
  toSmtpConfig,
  sendEmail,
  chunkRecipients,
  type SmtpConfig,
} from './mailer';

/**
 * Template-driven notification dispatch.
 *
 * Every emission site calls dispatchNotification(templateKey, variables, …).
 * Text is rendered from the admin-editable NotificationTemplate row when one
 * exists, otherwise from the code defaults below — so the DB holds only
 * overrides and "reset to default" simply deletes the row.
 *
 * Dashboard inserts mirror the behaviour of the legacy helpers in
 * notifications.ts (admin fan-out with its "admin-1" fallback, team-null
 * guard) but pre-generate row IDs so email delivery status can be stamped
 * back onto the exact rows afterwards. The legacy helpers remain exported
 * and untouched.
 *
 * Email is best-effort and dark by default: nothing sends until the admin
 * enables it in EmailSettings, and a failure never affects the dashboard
 * notification or the business action.
 */

// ---------------------------------------------------------------------------
// Defaults registry — one entry per notification type
// ---------------------------------------------------------------------------

export interface TemplateDefaults {
  key: string;
  label: string; // Arabic display name for the editor
  category: 'admin' | 'participant' | 'mentor';
  variables: string[];
  type: 'success' | 'info' | 'warning' | 'error';
  dashboardTitle: string;
  dashboardMessage: string;
  emailSubject: string;
  emailBody: string;
  actionUrl?: string;
  /** true for templates that fan out via BCC — no per-recipient variables. */
  bulk?: boolean;
}

function def(
  d: Omit<TemplateDefaults, 'emailSubject' | 'emailBody'> &
    Partial<Pick<TemplateDefaults, 'emailSubject' | 'emailBody'>>
): TemplateDefaults {
  return {
    emailSubject: d.dashboardTitle,
    emailBody: d.dashboardMessage,
    ...d,
  };
}

export const TEMPLATE_DEFAULTS: Record<string, TemplateDefaults> = Object.fromEntries(
  [
    // ---- admin-facing -----------------------------------------------------
    def({
      key: 'newTeamRegistration',
      label: 'تسجيل فريق جديد (للمشرفين)',
      category: 'admin',
      variables: ['teamName'],
      type: 'info',
      dashboardTitle: 'طلب تسجيل فريق جديد',
      dashboardMessage: 'تم تسجيل فريق جديد: {{teamName}} ويحتاج للمراجعة',
      actionUrl: '/admin-hackton-dashboard/teams',
    }),
    def({
      key: 'newMilestoneSubmission',
      label: 'تسليم مشروع جديد (للمشرفين)',
      category: 'admin',
      variables: ['teamName', 'milestoneTitle'],
      type: 'info',
      dashboardTitle: 'تسليم مشروع جديد',
      dashboardMessage: 'تم تسليم مشروع من فريق {{teamName}} للمرحلة {{milestoneTitle}}',
      actionUrl: '/admin-hackton-dashboard/submissions',
    }),
    def({
      key: 'eventCapacityWarning',
      label: 'تحذير سعة الفعالية (للمشرفين)',
      category: 'admin',
      variables: ['eventTitle'],
      type: 'warning',
      dashboardTitle: 'تحذير سعة الفعالية',
      dashboardMessage: 'الفعالية {{eventTitle}} وصلت إلى 80% من السعة',
      actionUrl: '/admin-hackton-dashboard/events',
    }),
    def({
      key: 'newEventRegistration',
      label: 'تسجيل جديد في فعالية (للمشرفين)',
      category: 'admin',
      variables: ['participantName', 'eventTitle'],
      type: 'info',
      dashboardTitle: 'تسجيل جديد في الفعالية',
      dashboardMessage: 'تم تسجيل {{participantName}} في فعالية {{eventTitle}}',
    }),
    def({
      key: 'newMentorRegistration',
      label: 'إضافة مرشد جديد (للمشرفين)',
      category: 'admin',
      variables: ['mentorName'],
      type: 'info',
      dashboardTitle: 'مرشد جديد تمت إضافته',
      dashboardMessage: 'تم إضافة مرشد جديد: {{mentorName}} بواسطة المشرف',
      actionUrl: '/admin-hackton-dashboard/mentors',
    }),
    def({
      key: 'participantCreated',
      label: 'إضافة مشارك جديد (للمشرفين)',
      category: 'admin',
      variables: ['participantName'],
      type: 'info',
      dashboardTitle: 'مشارك جديد تمت إضافته',
      dashboardMessage: 'تم إضافة مشارك جديد: {{participantName}} بواسطة المشرف',
      actionUrl: '/admin-hackton-dashboard/participants',
    }),

    // ---- participant-facing ------------------------------------------------
    def({
      key: 'teamApproval',
      label: 'قبول الفريق',
      category: 'participant',
      variables: ['teamName'],
      type: 'success',
      dashboardTitle: 'تم قبول فريقك!',
      dashboardMessage: 'تهانينا! تم قبول فريق {{teamName}} في الهاكثون',
      actionUrl: '/participant-dashboard',
    }),
    def({
      key: 'teamRejection',
      label: 'رفض الفريق',
      category: 'participant',
      variables: ['teamName'],
      type: 'error',
      dashboardTitle: 'لم يتم قبول فريقك',
      dashboardMessage: 'نأسف، لم يتم قبول فريق {{teamName}}. يرجى مراجعة المتطلبات',
    }),
    def({
      key: 'participantApproval',
      label: 'قبول المشارك',
      category: 'participant',
      variables: [],
      type: 'success',
      dashboardTitle: 'تم قبول طلبك!',
      dashboardMessage: 'تم قبول طلب مشاركتك في الهاكاثون. يمكنك الآن تسجيل الدخول إلى حسابك.',
      actionUrl: '/participant-dashboard',
    }),
    def({
      key: 'participantRejection',
      label: 'رفض المشارك',
      category: 'participant',
      variables: [],
      type: 'error',
      dashboardTitle: 'تم رفض طلبك',
      dashboardMessage:
        'نأسف لإبلاغك أنه تم رفض طلب مشاركتك في الهاكاثون. يمكنك التواصل معنا للمزيد من المعلومات.',
    }),
    def({
      key: 'eventRegistrationConfirmation',
      label: 'تأكيد التسجيل في فعالية',
      category: 'participant',
      variables: ['eventTitle'],
      type: 'success',
      dashboardTitle: 'تأكيد التسجيل في الفعالية',
      dashboardMessage: 'تم تسجيلك بنجاح في فعالية {{eventTitle}}',
      actionUrl: '/participant-dashboard/events',
    }),
    def({
      key: 'eventReminder24h',
      label: 'تذكير بفعالية غداً (غير مفعّل — لا يوجد مجدول)',
      category: 'participant',
      variables: ['eventTitle', 'time'],
      type: 'info',
      dashboardTitle: 'تذكير: فعالية غداً',
      dashboardMessage: 'فعالية {{eventTitle}} ستبدأ غداً في {{time}}',
    }),
    def({
      key: 'eventReminder1h',
      label: 'تذكير بفعالية خلال ساعة (غير مفعّل — لا يوجد مجدول)',
      category: 'participant',
      variables: ['eventTitle', 'location'],
      type: 'warning',
      dashboardTitle: 'تذكير: فعالية خلال ساعة',
      dashboardMessage: 'فعالية {{eventTitle}} ستبدأ خلال ساعة في {{location}}',
    }),
    def({
      key: 'newMilestoneAvailable',
      label: 'مرحلة جديدة متاحة (لكل المشاركين)',
      category: 'participant',
      variables: ['milestoneTitle'],
      type: 'info',
      dashboardTitle: 'مرحلة جديدة متاحة',
      dashboardMessage: 'مرحلة جديدة {{milestoneTitle}} متاحة للتسليم',
      actionUrl: '/participant-dashboard/milestones',
      bulk: true,
    }),
    def({
      key: 'milestoneDeadlineReminder',
      label: 'تذكير بموعد التسليم (غير مفعّل — لا يوجد مجدول)',
      category: 'participant',
      variables: ['milestoneTitle', 'timeLeft'],
      type: 'warning',
      dashboardTitle: 'تذكير: موعد تسليم المرحلة',
      dashboardMessage: 'موعد تسليم {{milestoneTitle}} خلال {{timeLeft}}',
    }),
    def({
      key: 'milestoneReviewAccepted',
      label: 'قبول تسليم المرحلة',
      category: 'participant',
      variables: ['milestoneTitle'],
      type: 'success',
      dashboardTitle: 'نتيجة مراجعة المشروع',
      dashboardMessage: 'تم قبول مشروعك للمرحلة {{milestoneTitle}}',
      actionUrl: '/participant-dashboard/milestones',
    }),
    def({
      key: 'milestoneReviewRejected',
      label: 'رفض تسليم المرحلة',
      category: 'participant',
      variables: ['milestoneTitle'],
      type: 'error',
      dashboardTitle: 'نتيجة مراجعة المشروع',
      dashboardMessage: 'تم رفض مشروعك للمرحلة {{milestoneTitle}}',
      actionUrl: '/participant-dashboard/milestones',
    }),
    def({
      key: 'bookingConfirmation',
      label: 'تأكيد حجز جلسة إرشاد',
      category: 'participant',
      variables: ['mentorName', 'dateTime'],
      type: 'success',
      dashboardTitle: 'تأكيد حجز الجلسة',
      dashboardMessage: 'تم تأكيد حجز جلستك مع {{mentorName}} في {{dateTime}}',
      actionUrl: '/participant-dashboard/mentors',
    }),
    def({
      key: 'attendanceRecorded',
      label: 'تأكيد تسجيل الحضور',
      category: 'participant',
      variables: ['eventTitle'],
      type: 'success',
      dashboardTitle: 'تم تسجيل حضورك',
      dashboardMessage: 'تم تسجيل حضورك بنجاح في: {{eventTitle}}',
    }),
    def({
      key: 'teamJoinRequest',
      label: 'طلب انضمام لفريق (لقائد الفريق)',
      category: 'participant',
      variables: ['participantName', 'teamName'],
      type: 'info',
      dashboardTitle: 'طلب انضمام جديد للفريق',
      dashboardMessage: '{{participantName}} يريد الانضمام لفريق {{teamName}}',
      actionUrl: '/participant-dashboard/join-requests',
    }),
    def({
      key: 'joinRequestAccepted',
      label: 'قبول طلب الانضمام',
      category: 'participant',
      variables: ['teamName'],
      type: 'success',
      dashboardTitle: 'تم قبول طلب الانضمام!',
      dashboardMessage: 'تهانينا! تم قبولك في فريق {{teamName}}',
      actionUrl: '/participant-dashboard/team',
    }),
    def({
      key: 'joinRequestRejected',
      label: 'رفض طلب الانضمام',
      category: 'participant',
      variables: ['teamName'],
      type: 'info',
      dashboardTitle: 'لم يتم قبول طلب الانضمام',
      dashboardMessage: 'لم يتم قبولك في فريق {{teamName}}',
    }),
    def({
      key: 'joinRequestCancelled',
      label: 'إلغاء طلب الانضمام',
      category: 'participant',
      variables: ['teamName'],
      type: 'info',
      dashboardTitle: 'تم إلغاء طلب الانضمام',
      dashboardMessage: 'تم إلغاء طلب انضمامك لفريق {{teamName}} بسبب انضمامك لفريق آخر',
    }),

    // ---- mentor-facing -----------------------------------------------------
    def({
      key: 'newBookingRequest',
      label: 'طلب حجز جلسة (للمرشد)',
      category: 'mentor',
      variables: ['participantName', 'dateTime'],
      type: 'info',
      dashboardTitle: 'طلب حجز جلسة جديد',
      dashboardMessage: 'طلب {{participantName}} حجز جلسة معك في {{dateTime}}',
      actionUrl: '/mentor-dashboard/sessions',
    }),
    def({
      key: 'bookingCancellation',
      label: 'إلغاء حجز جلسة (للمرشد)',
      category: 'mentor',
      variables: ['participantName', 'dateTime'],
      type: 'warning',
      dashboardTitle: 'إلغاء حجز جلسة',
      dashboardMessage: 'تم إلغاء الجلسة مع {{participantName}} المقررة في {{dateTime}}',
      actionUrl: '/mentor-dashboard/sessions',
    }),
    def({
      key: 'mentorProfileApproval',
      label: 'قبول المرشد',
      category: 'mentor',
      variables: [],
      type: 'success',
      dashboardTitle: 'تم قبول طلبك كمرشد',
      dashboardMessage: 'تهانينا! تم قبولك كمرشد في منصة الهاكثون',
      actionUrl: '/mentor-dashboard',
    }),
  ].map((d) => [d.key, d])
);

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export type TemplateVariables = Record<string, string>;

/** Replace {{name}} placeholders. Unknown placeholders stay literal. */
export function renderTemplate(text: string, variables: TemplateVariables): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : match
  );
}

export interface EffectiveTemplate extends TemplateDefaults {
  emailEnabled: boolean;
  isCustomized: boolean;
}

/** DB override merged over code defaults. */
export async function getEffectiveTemplate(key: string): Promise<EffectiveTemplate | null> {
  const defaults = TEMPLATE_DEFAULTS[key];
  if (!defaults) return null;

  try {
    const row = await prisma.notificationTemplate.findUnique({ where: { key } });
    if (!row) return { ...defaults, emailEnabled: true, isCustomized: false };

    return {
      ...defaults,
      dashboardTitle: row.dashboardTitle,
      dashboardMessage: row.dashboardMessage,
      emailSubject: row.emailSubject,
      emailBody: row.emailBody,
      emailEnabled: row.emailEnabled,
      actionUrl: row.actionUrl ?? defaults.actionUrl,
      isCustomized: true,
    };
  } catch (error) {
    console.error(`Error loading template override for ${key}:`, error);
    return { ...defaults, emailEnabled: true, isCustomized: false };
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export type Audience =
  | { kind: 'participant'; id: string }
  | { kind: 'mentor'; id: string }
  | { kind: 'admins' }
  | { kind: 'team'; teamId: string }
  | { kind: 'allParticipants' };

export interface DispatchParams {
  templateKey: string;
  variables?: TemplateVariables;
  audience: Audience;
  relatedEntityType?: string;
  relatedEntityId?: string;
  /** Overrides the template's actionUrl for this dispatch only. */
  actionUrl?: string;
}

interface PlannedRecipient {
  notificationId: string;
  recipientType: 'admin' | 'participant' | 'mentor';
  recipientId: string;
  email: string | null; // null => no email deliverable for this row
}

/** Wall-clock budget for email sending inside a request (Vercel cap is 30s). */
const EMAIL_TIME_BUDGET_MS = 20_000;

export async function dispatchNotification(params: DispatchParams): Promise<void> {
  const { templateKey, variables = {}, audience, relatedEntityType, relatedEntityId } = params;

  const template = await getEffectiveTemplate(templateKey);
  if (!template) {
    console.error(`dispatchNotification: unknown template key "${templateKey}"`);
    return;
  }

  const title = renderTemplate(template.dashboardTitle, variables);
  const message = renderTemplate(template.dashboardMessage, variables);
  const actionUrl = params.actionUrl ?? template.actionUrl;

  // ---- resolve recipients (dashboard rows + email addresses) --------------
  const recipients: PlannedRecipient[] = [];

  if (audience.kind === 'participant' || audience.kind === 'mentor') {
    let email: string | null = null;
    try {
      const row =
        audience.kind === 'participant'
          ? await prisma.participant.findUnique({ where: { id: audience.id }, select: { email: true } })
          : await prisma.mentor.findUnique({ where: { id: audience.id }, select: { email: true } });
      email = row?.email ?? null;
    } catch {
      email = null;
    }
    recipients.push({
      notificationId: crypto.randomUUID(),
      recipientType: audience.kind,
      recipientId: audience.id,
      email,
    });
  } else if (audience.kind === 'admins') {
    // Mirrors notifyAllAdmins (notifications.ts): fall back to "admin-1" when
    // the table is empty. Admin email goes to the shared inbox, resolved later.
    try {
      const admins = await prisma.admin.findMany({ select: { id: true } });
      const adminIds = admins.length > 0 ? admins.map((a) => a.id) : ['admin-1'];
      for (const id of adminIds) {
        recipients.push({
          notificationId: crypto.randomUUID(),
          recipientType: 'admin',
          recipientId: id,
          email: null,
        });
      }
    } catch (error) {
      console.error('dispatchNotification: failed to list admins:', error);
      recipients.push({
        notificationId: crypto.randomUUID(),
        recipientType: 'admin',
        recipientId: 'admin-1',
        email: null,
      });
    }
  } else if (audience.kind === 'team') {
    // Mirrors notifyTeamMembers: silently no-op when the team is missing.
    const team = await prisma.team.findUnique({
      where: { id: audience.teamId },
      include: { participants: { select: { id: true, email: true } } },
    });
    if (!team) return;
    for (const p of team.participants) {
      recipients.push({
        notificationId: crypto.randomUUID(),
        recipientType: 'participant',
        recipientId: p.id,
        email: p.email,
      });
    }
  } else {
    // allParticipants — bulk fan-out (milestone creation)
    const participants = await prisma.participant.findMany({ select: { id: true, email: true } });
    for (const p of participants) {
      recipients.push({
        notificationId: crypto.randomUUID(),
        recipientType: 'participant',
        recipientId: p.id,
        email: p.email,
      });
    }
  }

  if (recipients.length === 0) return;

  // ---- dashboard rows ------------------------------------------------------
  await prisma.notification.createMany({
    data: recipients.map((r) => ({
      id: r.notificationId,
      title,
      message,
      type: template.type,
      recipientType: r.recipientType,
      recipientId: r.recipientId,
      relatedEntityType,
      relatedEntityId,
      actionUrl,
    })),
  });

  // ---- email (best-effort; never throws out of this function) -------------
  try {
    await sendTemplateEmails(template, variables, recipients, audience.kind);
  } catch (error) {
    console.error(`Error sending emails for ${templateKey}:`, error);
  }
}

async function sendTemplateEmails(
  template: EffectiveTemplate,
  variables: TemplateVariables,
  recipients: PlannedRecipient[],
  audienceKind: Audience['kind']
): Promise<void> {
  if (!template.emailEnabled) return;

  const settings = await getEmailSettings();
  if (!settings || !settings.enabled) return;

  const config = toSmtpConfig(settings);
  if (!config) return; // incomplete settings or undecryptable password

  const subject = renderTemplate(template.emailSubject, variables);
  const bodyText = renderTemplate(template.emailBody, variables);
  const startedAt = Date.now();

  const stamp = async (ids: string[], status: 'sent' | 'failed') => {
    if (ids.length === 0) return;
    await prisma.notification.updateMany({
      where: { id: { in: ids } },
      data: { emailStatus: status },
    });
  };

  const log = async (entry: {
    toEmail: string;
    recipientCount: number;
    status: 'sent' | 'failed';
    error?: string;
    messageId?: string;
  }) => {
    await prisma.emailLog.create({
      data: {
        templateKey: template.key,
        subject,
        toEmail: entry.toEmail,
        recipientCount: entry.recipientCount,
        status: entry.status,
        error: entry.error,
        messageId: entry.messageId,
      },
    });
  };

  if (audienceKind === 'admins') {
    // ONE email to the shared inbox; all admin rows get that email's status.
    // Blank inbox => skip silently, rows stay emailStatus=null (no red badges
    // on a fresh install).
    const inbox = settings.adminInboxEmail.trim();
    if (!inbox) return;

    const result = await sendEmail({ config, to: inbox, subject, title: subject, bodyText });
    await stamp(recipients.map((r) => r.notificationId), result.ok ? 'sent' : 'failed');
    await log({
      toEmail: inbox,
      recipientCount: 1,
      status: result.ok ? 'sent' : 'failed',
      error: result.error,
      messageId: result.messageId,
    });
    return;
  }

  const emailable = recipients.filter((r) => r.email);

  if (emailable.length === 0) return;

  if (emailable.length === 1) {
    const r = emailable[0];
    const result = await sendEmail({ config, to: r.email!, subject, title: subject, bodyText });
    await stamp([r.notificationId], result.ok ? 'sent' : 'failed');
    await log({
      toEmail: r.email!,
      recipientCount: 1,
      status: result.ok ? 'sent' : 'failed',
      error: result.error,
      messageId: result.messageId,
    });
    return;
  }

  // Multi-recipient: BCC batches. Same content for everyone (BCC constraint —
  // bulk templates must not use per-recipient variables).
  const batches = chunkRecipients(emailable.map((r) => r.email!));
  let cursor = 0;

  for (const batch of batches) {
    const batchRecipients = emailable.slice(cursor, cursor + batch.length);
    cursor += batch.length;

    if (Date.now() - startedAt > EMAIL_TIME_BUDGET_MS) {
      await log({
        toEmail: `${emailable.length - cursor + batch.length} مستلم متبقٍ`,
        recipientCount: emailable.length - cursor + batch.length,
        status: 'failed',
        error: 'timeout: email time budget exceeded, remaining batches skipped',
      });
      break;
    }

    const result = await sendEmail({ config, bcc: batch, subject, title: subject, bodyText });
    await stamp(batchRecipients.map((r) => r.notificationId), result.ok ? 'sent' : 'failed');
    await log({
      toEmail: `${batch.length} مستلم`,
      recipientCount: batch.length,
      status: result.ok ? 'sent' : 'failed',
      error: result.error,
      messageId: result.messageId,
    });
  }
}

/**
 * Send one already-rendered email outside the template system (broadcasts).
 * Returns counts for the caller to persist.
 */
export async function sendRawEmail(params: {
  config: SmtpConfig;
  to?: string;
  bcc?: string[];
  subject: string;
  bodyText: string;
  broadcastId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const result = await sendEmail({
    config: params.config,
    to: params.to,
    bcc: params.bcc,
    subject: params.subject,
    title: params.subject,
    bodyText: params.bodyText,
  });

  await prisma.emailLog.create({
    data: {
      broadcastId: params.broadcastId,
      subject: params.subject,
      toEmail: params.to ?? `${params.bcc?.length ?? 0} مستلم`,
      recipientCount: params.to ? 1 : params.bcc?.length ?? 0,
      status: result.ok ? 'sent' : 'failed',
      error: result.error,
      messageId: result.messageId,
    },
  });

  return { ok: result.ok, error: result.error };
}
