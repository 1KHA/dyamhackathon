/**
 * Re-activation credentials.
 *
 * When an admin re-enables participants or teams, every affected APPROVED
 * participant gets a fresh password and a "حسابك مفعّل من جديد" email with
 * their login details (same per-recipient credential pattern as acceptance).
 * Emails go through the persistent queue under a Broadcast job so hundreds of
 * members never send inline; the drainers/cron deliver them.
 *
 * Eligibility: status = approved (a pending applicant has no account to log
 * into), not individually disabled, and — for team members — the team itself
 * enabled. Pending/rejected people are re-enabled silently, as before.
 */
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { createNotificationRows, renderRecipientEmail } from './notify';
import { enqueueBroadcastRecipients, type QueueRecipientInput } from './email-queue';
import { generatePassword, credentialVariables, participantDisplayName } from './credentials';

export interface ReactivationResult {
  /** Participants who received a new password + queued email. */
  credentialsIssued: number;
  /** Broadcast job holding the queued emails (null when nobody was eligible). */
  emailJobId: string | null;
}

export async function issueReactivationCredentials(
  adminId: string,
  scope: { participantIds: string[]; teamIds: string[] }
): Promise<ReactivationResult> {
  const where = {
    status: 'approved',
    isDisabled: false,
    OR: [
      ...(scope.participantIds.length > 0 ? [{ id: { in: scope.participantIds } }] : []),
      ...(scope.teamIds.length > 0 ? [{ teamId: { in: scope.teamIds }, team: { isDisabled: false } }] : []),
    ],
  };
  if (where.OR.length === 0) return { credentialsIssued: 0, emailJobId: null };

  const people = await prisma.participant.findMany({
    where,
    select: { id: true, email: true, fullName: true, firstName: true, secondName: true, familyName: true, teamId: true, team: { select: { teamName: true } } },
  });
  if (people.length === 0) return { credentialsIssued: 0, emailJobId: null };

  const job = await prisma.broadcast.create({
    data: {
      title: 'إعادة تفعيل حسابات — بيانات دخول جديدة',
      body: 'بريد بيانات الدخول بعد إعادة التفعيل — محتوى فردي لكل مستلم (يُرسل عبر قائمة الانتظار)',
      channels: JSON.stringify(['dashboard', 'email']),
      audience: JSON.stringify({ type: 'reactivation', requested: people.length }),
      createdBy: adminId,
      status: 'queued',
    },
    select: { id: true },
  });

  const rows: QueueRecipientInput[] = [];
  let issued = 0;
  for (const p of people) {
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);
    // Guard on the same eligibility so a concurrent disable cannot race us.
    const res = await prisma.participant.updateMany({ where: { id: p.id, isDisabled: false, status: 'approved' }, data: { passwordHash } });
    if (res.count === 0) continue;
    issued++;
    const planned = await createNotificationRows({
      templateKey: 'accountReactivated',
      variables: { teamName: p.team?.teamName || '' },
      perRecipient: { [p.id]: credentialVariables({ email: p.email, password, participantName: participantDisplayName(p) }) },
      audience: { kind: 'participant', id: p.id },
      relatedEntityType: 'participant',
      relatedEntityId: p.id,
    });
    if (!planned) continue;
    for (const r of planned.recipients) {
      if (!r.email) continue;
      const rendered = renderRecipientEmail(planned.template, r);
      if (!rendered) continue;
      rows.push({ recipientType: r.recipientType, recipientId: r.recipientId, email: r.email, notificationId: r.notificationId, subject: rendered.subject, body: rendered.body });
    }
  }
  const queued = await enqueueBroadcastRecipients(job.id, rows);
  if (queued === 0) await prisma.broadcast.update({ where: { id: job.id }, data: { status: 'completed' } });
  return { credentialsIssued: issued, emailJobId: job.id };
}
