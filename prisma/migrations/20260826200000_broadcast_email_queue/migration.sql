-- Persistent, resumable email queue for broadcasts (mdfiles/email-queue.md):
--   * Broadcast.status / totalRecipients — queue lifecycle + progress
--   * BroadcastRecipient — one row per email recipient, drained by
--     /api/cron/drain-email-queue and inline via waitUntil()
--
-- Applied automatically by vercel-build.sh (`prisma migrate deploy`).

-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE "Broadcast" ADD COLUMN IF NOT EXISTS "totalRecipients" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "BroadcastRecipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "notificationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "providerMessageId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BroadcastRecipient_broadcastId_email_key" ON "BroadcastRecipient"("broadcastId", "email");
CREATE INDEX IF NOT EXISTS "BroadcastRecipient_status_nextAttemptAt_createdAt_idx" ON "BroadcastRecipient"("status", "nextAttemptAt", "createdAt");
CREATE INDEX IF NOT EXISTS "BroadcastRecipient_broadcastId_status_idx" ON "BroadcastRecipient"("broadcastId", "status");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BroadcastRecipient_broadcastId_fkey'
  ) THEN
    ALTER TABLE "BroadcastRecipient"
      ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey"
      FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
