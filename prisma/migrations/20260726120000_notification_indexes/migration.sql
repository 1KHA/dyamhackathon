-- Indexes for the Notification access path.
--
-- Every notification read filters on (recipientType, recipientId) and either
-- sorts by createdAt or counts unread rows, and the dropdown polls every 30s
-- per signed-in user. The table had no indexes at all before this.
--
-- NOTE: `vercel-build.sh` runs only `prisma generate && next build`, so a
-- deploy will NOT apply this migration. Apply it deliberately with
-- `npx prisma migrate deploy`, or by running the statements below directly.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_recipientType_recipientId_createdAt_idx" ON "Notification"("recipientType", "recipientId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_recipientType_recipientId_isRead_idx" ON "Notification"("recipientType", "recipientId", "isRead");
