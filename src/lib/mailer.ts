import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { prisma } from './prisma';
import { decryptSecret } from './crypto';
import { getAppBaseUrl } from './credentials';
import {
  isMandrillConfigured,
  sendViaMandrill,
  summarizeRejections,
  type RecipientFailure,
} from './mandrill';

export type { RecipientFailure } from './mandrill';

/**
 * Email delivery. Transport is chosen per call, not at boot:
 *   1. MAILCHIMP_API_KEY + MAIL_FROM set  -> Mandrill HTTPS API (see mandrill.ts)
 *   2. otherwise                          -> SMTP from the admin-configured EmailSettings row
 * The EmailSettings `enabled` master switch gates sending for both transports.
 *
 * All sends are best-effort: callers wrap in try/catch (the codebase-wide
 * convention that a notification failure never fails the business action).
 */

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string; // plaintext at this layer
  fromEmail: string;
  fromName: string;
}

export interface EmailSettingsRow {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string; // encrypted at rest
  fromEmail: string;
  fromName: string;
  adminInboxEmail: string;
  enabled: boolean;
}

/** Recipients per SMTP message for bulk fan-outs (300 recipients = 6 messages). */
export const BCC_BATCH_SIZE = 50;

/**
 * Recipients per Mandrill API call. Mandrill accepts up to 1,000 per call;
 * 500 leaves headroom and turns a 5,000-recipient broadcast into 10 HTTPS
 * round-trips instead of 100. See mdfiles/email-queue.md §Option 1.
 */
export const MANDRILL_BATCH_SIZE = 500;

/** Per-call recipient cap for whichever transport is active right now. */
export function getBatchSize(): number {
  return isMandrillConfigured() ? MANDRILL_BATCH_SIZE : BCC_BATCH_SIZE;
}

export async function getEmailSettings(): Promise<EmailSettingsRow | null> {
  return prisma.emailSettings.findFirst();
}

/**
 * Settings row -> plaintext SMTP config, or null when incomplete/undecryptable.
 */
export function toSmtpConfig(row: EmailSettingsRow): SmtpConfig | null {
  // Mandrill ignores the SMTP fields — never block sending on a blank host or
  // an undecryptable password when it is the active transport.
  if (isMandrillConfigured()) {
    return {
      host: row.host,
      port: row.port,
      secure: row.secure,
      username: row.username,
      password: '',
      fromEmail: process.env.MAIL_FROM as string,
      fromName: row.fromName || process.env.MAIL_FROM_NAME || '',
    };
  }

  if (!row.host || !row.fromEmail) return null;

  const password = decryptSecret(row.password);
  if (password === null) return null; // decrypt failure — admin must re-enter

  return {
    host: row.host,
    port: row.port,
    secure: row.secure,
    username: row.username,
    password,
    fromEmail: row.fromEmail,
    fromName: row.fromName,
  };
}

function buildTransport(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.username
      ? { auth: { user: config.username, pass: config.password } }
      : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Who an email is addressed to — selects the support-channels footer. */
export type EmailAudience = 'participant' | 'mentor' | 'admin';

export const SUPPORT_EMAIL = 'info@miyahthon.com';
export const PARTICIPANT_TELEGRAM_URL = 'https://t.me/+hJH7Jo0SB5U4NWI0';
export const MENTOR_WHATSAPP_NUMBER = '+966548400719';
const MENTOR_WHATSAPP_URL = 'https://wa.me/966548400719';

const FOOTER_LINK_STYLE = 'color:#2F44DC;text-decoration:none';

/**
 * Support-channels block for the HTML footer. Participants get email +
 * Telegram; mentors get email + WhatsApp; admins/unknown get nothing extra.
 */
function renderSupportChannelsHtml(audience?: EmailAudience): string {
  const mail = `<a href="mailto:${SUPPORT_EMAIL}" style="${FOOTER_LINK_STYLE}" dir="ltr">${SUPPORT_EMAIL}</a>`;
  if (audience === 'participant') {
    return (
      `<div style="margin-bottom:8px;color:#001742;font-weight:bold">قنوات التواصل</div>` +
      `<div>البريد: ${mail}</div>` +
      `<div>تيليجرام: <a href="${PARTICIPANT_TELEGRAM_URL}" style="${FOOTER_LINK_STYLE}" dir="ltr">${PARTICIPANT_TELEGRAM_URL}</a></div>`
    );
  }
  if (audience === 'mentor') {
    return (
      `<div style="margin-bottom:8px;color:#001742;font-weight:bold">للاستفسار يرجى التواصل عبر القنوات التالية:</div>` +
      `<div>البريد: ${mail}</div>` +
      `<div>الواتساب: <a href="${MENTOR_WHATSAPP_URL}" style="${FOOTER_LINK_STYLE}" dir="ltr">${MENTOR_WHATSAPP_NUMBER}</a></div>`
    );
  }
  return '';
}

/** Plain-text twin of the support-channels footer (for the text/plain part). */
export function renderSupportChannelsText(audience?: EmailAudience): string {
  if (audience === 'participant') {
    return `قنوات التواصل\nالبريد: ${SUPPORT_EMAIL}\nتيليجرام: ${PARTICIPANT_TELEGRAM_URL}`;
  }
  if (audience === 'mentor') {
    return `للاستفسار يرجى التواصل عبر القنوات التالية:\nالبريد: ${SUPPORT_EMAIL}\nالواتساب: ${MENTOR_WHATSAPP_NUMBER}`;
  }
  return '';
}

/**
 * Wrap already-escaped plain-text content in the fixed RTL HTML shell.
 * `dir`/alignment live on an inner div because Gmail strips <html>/<head>
 * attributes. `audience` picks the support-channels footer.
 */
export function renderEmailHtml(title: string, bodyText: string, audience?: EmailAudience): string {
  const bodyHtml = escapeHtml(bodyText).replace(/\r?\n/g, '<br>');
  const titleHtml = escapeHtml(title);
  // Email clients require absolute image URLs.
  const baseUrl = getAppBaseUrl();
  const support = renderSupportChannelsHtml(audience);
  const supportHtml = support
    ? `<div style="padding:16px 24px;border-top:1px solid #e2e8f0;color:#334155;font-size:13px;line-height:1.9">${support}</div>`
    : '';

  return `<div dir="rtl" lang="ar" style="direction:rtl;text-align:right;font-family:Tahoma,Arial,sans-serif;background:#f4f6f8;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:#001742;background:linear-gradient(135deg,#001742 0%,#2F44DC 55%,#53AEF5 100%);padding:16px 24px"><img src="${baseUrl}/logo2.png" alt="مياهثون" style="height:36px;display:block;border:0"></div>
    <div style="padding:24px">
      <h2 style="margin:0 0 12px;font-size:16px;color:#001742">${titleHtml}</h2>
      <p style="margin:0;font-size:14px;line-height:1.9;color:#334155">${bodyHtml}</p>
    </div>${supportHtml}
    <div style="padding:12px 24px;background:#F2F8FE;color:#5B7A9E;font-size:12px">هذه رسالة آلية من منصة مياهثون — يرجى عدم الرد عليها.</div>
  </div>
</div>`;
}

/**
 * Per-recipient outcome of one send. `ok` is "at least one recipient was
 * accepted"; callers that need counts read `accepted` / `rejected` instead of
 * the boolean, so a 3-of-4 batch is never reported as 0-of-4.
 * See mdfiles/email-per-recipient-accounting.md.
 */
export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  /** Summary — set on total failure AND on partial success. */
  error?: string;
  /** Requested recipients (to + bcc) the transport accepted. */
  accepted: string[];
  /** Requested recipients the transport rejected, with the reason. */
  rejected: RecipientFailure[];
}

export interface SendEmailParams {
  config: SmtpConfig;
  to?: string;
  bcc?: string[];
  subject: string;
  title: string;    // heading inside the HTML shell
  bodyText: string; // plain text; escaped + <br>-converted here
  /** Selects the support-channels footer (participant / mentor). */
  audience?: EmailAudience;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { config, to, bcc, subject, title, bodyText, audience } = params;
  const supportText = renderSupportChannelsText(audience);
  const text = supportText ? `${bodyText}\n\n${supportText}` : bodyText;

  if (isMandrillConfigured()) {
    console.log(`📧 Email transport: mandrill (to=${to ?? 'sender'}, bcc=${bcc?.length ?? 0})`);
    const result = await sendViaMandrill({
      to,
      bcc,
      subject,
      html: renderEmailHtml(title, bodyText, audience),
      text,
      fromName: process.env.MAIL_FROM_NAME || config.fromName,
    });
    // `error` is also set on PARTIAL success (some recipients rejected) — log it either way.
    if (result.error) console.error(`[email] mandrill ${result.ok ? 'partial' : 'failed'}: ${result.error}`);
    return result;
  }

  const requested = [...(to ? [to] : []), ...(bcc ?? [])];
  const transport = buildTransport(config);

  try {
    const info = await transport.sendMail({
      from: config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail,
      ...(to ? { to } : { to: config.fromEmail }), // BCC-only sends address the sender
      ...(bcc && bcc.length > 0 ? { bcc } : {}),
      subject,
      html: renderEmailHtml(title, bodyText, audience),
      text,
    });

    // nodemailer reports the SMTP envelope verdict per address. The sender
    // self-copy (BCC-only sends) is deliberately excluded from accounting —
    // only the addresses the caller asked for count.
    const acceptedSet = new Set(info.accepted.map(addressOf));
    const rejectedSet = new Set(info.rejected.map(addressOf));
    const accepted: string[] = [];
    const rejected: RecipientFailure[] = [];
    for (const email of requested) {
      const key = email.toLowerCase();
      if (rejectedSet.has(key)) rejected.push({ email, reason: 'rejected by SMTP server', permanent: true });
      else if (acceptedSet.has(key)) accepted.push(email);
      else rejected.push({ email, reason: 'not accepted by SMTP server' });
    }

    return {
      ok: accepted.length > 0,
      messageId: info.messageId,
      error: rejected.length > 0 ? `SMTP ${summarizeRejections(rejected, requested.length)}` : undefined,
      accepted,
      rejected,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: reason,
      accepted: [],
      rejected: requested.map((email) => ({ email, reason })),
    };
  } finally {
    transport.close();
  }
}

/** nodemailer's accepted/rejected entries are strings or {address} objects. */
function addressOf(entry: string | { address: string }): string {
  return (typeof entry === 'string' ? entry : entry.address).toLowerCase();
}

/** Split a recipient list into per-call batches sized for the active transport. */
export function chunkRecipients(emails: string[], size: number = getBatchSize()): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < emails.length; i += size) {
    chunks.push(emails.slice(i, i + size));
  }
  return chunks;
}
