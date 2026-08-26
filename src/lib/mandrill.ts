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
 *
 * Results are PER RECIPIENT. Mandrill answers with one status per address, so
 * a bulk send where 3 of 4 addresses are accepted is reported as exactly that
 * — never collapsed into a single all-or-nothing boolean.
 * See mdfiles/email-per-recipient-accounting.md.
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

export interface RecipientFailure {
  email: string;
  reason: string;
}

export interface MandrillSendResult {
  /** True when at least one recipient was accepted by Mandrill. */
  ok: boolean;
  /** Mandrill `_id` of the first accepted recipient. */
  messageId?: string;
  /** Summary of what went wrong — set on total failure AND on partial success. */
  error?: string;
  /** Recipient addresses Mandrill accepted (sent / queued / scheduled). */
  accepted: string[];
  /** Recipient addresses Mandrill rejected, with its reason. */
  rejected: RecipientFailure[];
}

interface MandrillRecipientResult {
  email: string;
  status: string; // sent | queued | scheduled | rejected | invalid
  reject_reason?: string | null;
  _id?: string;
}

/** Every address we asked Mandrill to deliver to, in request order. */
function requestedRecipients(to: string | undefined, bcc: string[] | undefined): string[] {
  return [...(to ? [to] : []), ...(bcc ?? [])];
}

/** Total failure: every requested recipient is marked rejected with `reason`. */
function allRejected(recipients: string[], reason: string): MandrillSendResult {
  return {
    ok: false,
    error: reason,
    accepted: [],
    rejected: recipients.map((email) => ({ email, reason })),
  };
}

export function summarizeRejections(rejected: RecipientFailure[], total: number): string {
  const detail = rejected
    .slice(0, 5)
    .map((r) => `${r.email}: ${r.reason}`)
    .join('; ');
  const more = rejected.length > 5 ? ` (+${rejected.length - 5} more)` : '';
  return `rejected ${rejected.length}/${total} — ${detail}${more}`;
}

export async function sendViaMandrill(params: MandrillSendParams): Promise<MandrillSendResult> {
  const { to, bcc, subject, html, text, fromName } = params;
  const fromEmail = process.env.MAIL_FROM as string;
  const requested = requestedRecipients(to, bcc);

  if (requested.length === 0) {
    return allRejected([], 'no recipients');
  }

  // Every address is a plain `to` entry. With preserve_recipients=false
  // Mandrill delivers a separate copy per address and each copy shows only
  // its own recipient, so BCC privacy is preserved WITHOUT a self-addressed
  // "to" copy to MAIL_FROM. (The old self-copy hard-bounced on a no-reply
  // mailbox, landed on the Rejection Blacklist, and then poisoned every
  // batch — see the accounting doc.)
  const recipients = requested.map((email) => ({ email, type: 'to' as const }));

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
      return allRejected(requested, detail);
    }

    const results = body as MandrillRecipientResult[];
    if (results.length === 0) {
      return allRejected(requested, 'Mandrill returned an empty result array');
    }

    // Per-recipient verdicts. Match case-insensitively; an address Mandrill
    // did not echo back at all is treated as rejected rather than assumed sent.
    const byEmail = new Map<string, MandrillRecipientResult>();
    for (const r of results) byEmail.set(r.email.toLowerCase(), r);

    const accepted: string[] = [];
    const rejected: RecipientFailure[] = [];
    let messageId: string | undefined;

    for (const email of requested) {
      const r = byEmail.get(email.toLowerCase());
      if (!r) {
        rejected.push({ email, reason: 'missing from Mandrill response' });
      } else if (r.status === 'rejected' || r.status === 'invalid') {
        rejected.push({ email, reason: `${r.status}: ${r.reject_reason ?? 'invalid recipient'}` });
      } else {
        accepted.push(email);
        if (!messageId && r._id) messageId = r._id;
      }
    }

    return {
      ok: accepted.length > 0,
      messageId,
      error: rejected.length > 0 ? `Mandrill ${summarizeRejections(rejected, requested.length)}` : undefined,
      accepted,
      rejected,
    };
  } catch (error) {
    return allRejected(
      requested,
      `Mandrill request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
