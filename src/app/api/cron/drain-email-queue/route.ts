import { NextRequest, NextResponse } from 'next/server';
import { drainEmailQueue } from '@/lib/email-queue';

/**
 * GET — Vercel Cron entry point (vercel.json → crons, every minute).
 * Drains the BroadcastRecipient queue: rows the inline drainer did not finish,
 * retries whose backoff has elapsed, and stale claims from a dead function.
 * See mdfiles/email-queue.md.
 */
export const dynamic = 'force-dynamic';
// Pro allows 300s; overrides the 30s default in vercel.json for this route only.
export const maxDuration = 300;
/** Leaves headroom under maxDuration for the last batch + DB writes. */
const CRON_DRAIN_BUDGET_MS = 240_000;

export async function GET(request: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Fail closed: with
  // no secret configured, nothing may trigger a drain over HTTP.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  try {
    const result = await drainEmailQueue({ budgetMs: CRON_DRAIN_BUDGET_MS });
    if (result.claimed > 0) console.log('[cron] drain-email-queue', JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error('[cron] drain-email-queue failed:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
