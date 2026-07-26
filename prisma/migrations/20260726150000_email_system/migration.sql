-- Email notification system: settings, editable templates, send log, broadcasts,
-- plus an email delivery status column on Notification.
--
-- NOTE: `vercel-build.sh` runs only `prisma generate && next build`, so deploys
-- never apply migrations. Apply with `npx prisma migrate deploy` per environment.

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "emailStatus" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "EmailSettings" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL DEFAULT '',
    "port" INTEGER NOT NULL DEFAULT 587,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT NOT NULL DEFAULT '',
    "password" TEXT NOT NULL DEFAULT '',
    "fromEmail" TEXT NOT NULL DEFAULT '',
    "fromName" TEXT NOT NULL DEFAULT '',
    "adminInboxEmail" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "NotificationTemplate" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "dashboardTitle" TEXT NOT NULL,
    "dashboardMessage" TEXT NOT NULL,
    "emailSubject" TEXT NOT NULL,
    "emailBody" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "actionUrl" TEXT,
    "variables" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EmailLog" (
    "id" TEXT NOT NULL,
    "templateKey" TEXT,
    "broadcastId" TEXT,
    "toEmail" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 1,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Broadcast" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "emailSubject" TEXT,
    "channels" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "notificationCount" INTEGER NOT NULL DEFAULT 0,
    "emailSentCount" INTEGER NOT NULL DEFAULT 0,
    "emailFailedCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailLog_templateKey_createdAt_idx" ON "EmailLog"("templateKey", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailLog_broadcastId_idx" ON "EmailLog"("broadcastId");
CREATE INDEX IF NOT EXISTS "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");
CREATE INDEX IF NOT EXISTS "Broadcast_createdAt_idx" ON "Broadcast"("createdAt");

-- Seed the single disabled EmailSettings row so the settings API never hits
-- the row-absent case. cuid-shaped literal id; harmless if a row already exists.
INSERT INTO "EmailSettings" ("id", "updatedAt")
SELECT 'emailsettings-default-row-01', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "EmailSettings");
