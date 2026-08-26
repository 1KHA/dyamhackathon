import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { waitUntil } from '@vercel/functions';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { requeueFailed, drainEmailQueue } from '@/lib/email-queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const INLINE_DRAIN_BUDGET_MS = 240_000;

/**
 * POST — "retry failed": flip a broadcast's failed recipient rows back to
 * pending and start draining. Permanent provider rejections (hard-bounce,
 * invalid) will fail again immediately — that is the honest answer; transport
 * failures (provider was down) go through.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }

  try {
    const broadcast = await prisma.broadcast.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!broadcast) return NextResponse.json({ error: 'الرسالة غير موجودة' }, { status: 404 });

    const requeued = await requeueFailed(broadcast.id);
    if (requeued > 0) {
      waitUntil(
        drainEmailQueue({ budgetMs: INLINE_DRAIN_BUDGET_MS }).catch((err) =>
          console.error('[broadcast/retry] inline drain failed:', err)
        )
      );
    }
    return NextResponse.json({ success: true, requeued });
  } catch (error) {
    console.error('Error retrying broadcast:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
