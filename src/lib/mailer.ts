import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { prisma } from './prisma';
import { decryptSecret } from './crypto';

/**
 * SMTP delivery built on the admin-configured EmailSettings row.
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

/** BCC batch size for bulk fan-outs (300 recipients = 6 SMTP messages). */
export const BCC_BATCH_SIZE = 50;

export async function getEmailSettings(): Promise<EmailSettingsRow | null> {
  return prisma.emailSettings.findFirst();
}

/**
 * Settings row -> plaintext SMTP config, or null when incomplete/undecryptable.
 */
export function toSmtpConfig(row: EmailSettingsRow): SmtpConfig | null {
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

/**
 * Wrap already-escaped plain-text content in the fixed RTL HTML shell.
 * `dir`/alignment live on an inner div because Gmail strips <html>/<head>
 * attributes.
 */
export function renderEmailHtml(title: string, bodyText: string): string {
  const bodyHtml = escapeHtml(bodyText).replace(/\r?\n/g, '<br>');
  const titleHtml = escapeHtml(title);
  // Email clients require absolute image URLs.
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://visionthon.dyam.dev').replace(/\/+$/, '');

  return `<div dir="rtl" lang="ar" style="direction:rtl;text-align:right;font-family:Tahoma,Arial,sans-serif;background:#f4f6f8;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:#001742;background:linear-gradient(135deg,#001742 0%,#2F44DC 55%,#53AEF5 100%);padding:16px 24px"><img src="${baseUrl}/logo2.png" alt="مياهثون" style="height:36px;display:block;border:0"></div>
    <div style="padding:24px">
      <h2 style="margin:0 0 12px;font-size:16px;color:#001742">${titleHtml}</h2>
      <p style="margin:0;font-size:14px;line-height:1.9;color:#334155">${bodyHtml}</p>
    </div>
    <div style="padding:12px 24px;background:#F2F8FE;color:#5B7A9E;font-size:12px">هذه رسالة آلية من منصة مياهثون — يرجى عدم الرد عليها.</div>
  </div>
</div>`;
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export interface SendEmailParams {
  config: SmtpConfig;
  to?: string;
  bcc?: string[];
  subject: string;
  title: string;    // heading inside the HTML shell
  bodyText: string; // plain text; escaped + <br>-converted here
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { config, to, bcc, subject, title, bodyText } = params;
  const transport = buildTransport(config);

  try {
    const info = await transport.sendMail({
      from: config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail,
      ...(to ? { to } : { to: config.fromEmail }), // BCC-only sends address the sender
      ...(bcc && bcc.length > 0 ? { bcc } : {}),
      subject,
      html: renderEmailHtml(title, bodyText),
      text: bodyText,
    });
    return { ok: true, messageId: info.messageId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    transport.close();
  }
}

/** Split a recipient list into BCC batches. */
export function chunkRecipients(emails: string[], size: number = BCC_BATCH_SIZE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < emails.length; i += size) {
    chunks.push(emails.slice(i, i + size));
  }
  return chunks;
}
