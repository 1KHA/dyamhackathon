/**
 * Mailchimp Transactional (Mandrill) transport.
 *
 * Uses the HTTPS API, never SMTP — PaaS hosts (Vercel/Railway/Render) block
 * outbound SMTP ports, and HTTPS fails fast instead of hanging ~2 minutes.
 * Plain fetch instead of @mailchimp/mailchimp_transactional: the SDK resolves
 * (not rejects) on failure, which silently converts errors into "sent".
 * Operational guide: mdfiles/Mandrill_Implementation.md.
 *
 * Activation is env-driven — no code change to switch providers:
 *   MAILCHIMP_API_KEY  md-… key from Mandrill → Settings → API Keys
 *   MAIL_FROM          sender on the EXACT verified sending domain
 *   MAIL_FROM_NAME     optional display name (falls back to EmailSettings)
 * Both MAILCHIMP_API_KEY and MAIL_FROM must be set, otherwise the existing
 * SMTP path is used and nothing changes.
 */

const MANDRILL_SEND_URL = 'https://mandrillapp.com/api/1.0/messages/send.json';
const REQUEST_TIMEOUT_MS = 15_000;

export function isMandrillConfigured(): boolean {
  return Boolean(process.env.MAILCHIMP_API_KEY && process.env.MAIL_FROM);
}

export interface MandrillSendParams {
  to?: string;
  bcc?: string[];
  subject: string;
  html: string;
  text: string;
  fromName: string;
}

export interface MandrillSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

interface MandrillRecipientResult {
  email: string;
  status: string; // sent | queued | scheduled | rejected | invalid
  reject_reason?: string | null;
  _id?: string;
}

export async function sendViaMandrill(params: MandrillSendParams): Promise<MandrillSendResult> {
  const { to, bcc, subject, html, text, fromName } = params;
  const fromEmail = process.env.MAIL_FROM as string;

  // Mirror the SMTP path: BCC-only sends address the sender.
  const recipients: Array<{ email: string; type: 'to' | 'bcc' }> = [
    { email: to || fromEmail, type: 'to' },
    ...(bcc ?? []).map((email) => ({ email, type: 'bcc' as const })),
  ];

  try {
    const response = await fetch(MANDRILL_SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        key: process.env.MAILCHIMP_API_KEY,
        message: {
          from_email: fromEmail, // must match the verified sending domain exactly
          from_name: fromName,
          to: recipients,
          subject,
          html,
          text,
          auto_text: false,
          track_opens: false,
          track_clicks: false,
          preserve_recipients: false, // recipients never see each other
        },
      }),
    });

    const body: unknown = await response.json().catch(() => null);

    // API-level failure (bad key, 5xx) — Mandrill returns a JSON error object.
    if (!Array.isArray(body)) {
      const err = body as { status?: string; name?: string; message?: string } | null;
      const detail =
        err && err.status === 'error'
          ? `Mandrill ${err.name}: ${err.message}`
          : `Mandrill HTTP ${response.status}: ${JSON.stringify(body).slice(0, 200)}`;
      return { ok: false, error: detail };
    }

    // Per-recipient results — rejected/invalid must never look like success.
    const results = body as MandrillRecipientResult[];
    if (results.length === 0) {
      return { ok: false, error: 'Mandrill returned an empty result array' };
    }
    const failed = results.filter((r) => r.status === 'rejected' || r.status === 'invalid');
    if (failed.length > 0) {
      const first = failed[0];
      return {
        ok: false,
        error: `Mandrill ${first.status} (${failed.length}/${results.length}): ${first.reject_reason ?? 'invalid recipient'}`,
      };
    }

    return { ok: true, messageId: results[0]._id };
  } catch (error) {
    return {
      ok: false,
      error: `Mandrill request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
