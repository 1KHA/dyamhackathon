-- Attendance tracking via QR badges:
--   * Participant.badgeCode — unique lazy-generated badge token
--   * AttendanceRecord — scan audit log (event mode) + general check-in store
--
-- NOTE: `vercel-build.sh` never applies migrations; run `npx prisma migrate deploy`
-- per environment.

-- AlterTable
ALTER TABLE "Participant" ADD COLUMN IF NOT EXISTS "badgeCode" TEXT;

-- CreateIndex (unique)
CREATE UNIQUE INDEX IF NOT EXISTS "Participant_badgeCode_key" ON "Participant"("badgeCode");

-- CreateTable
CREATE TABLE IF NOT EXISTS "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "eventId" TEXT,
    "checkinDate" TEXT,
    "scannedBy" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- Unique constraints (Postgres treats NULLs as distinct, so each only
-- constrains its own mode: event rows vs general-checkin rows)
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceRecord_participantId_eventId_key" ON "AttendanceRecord"("participantId", "eventId");
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceRecord_participantId_checkinDate_key" ON "AttendanceRecord"("participantId", "checkinDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AttendanceRecord_eventId_idx" ON "AttendanceRecord"("eventId");
CREATE INDEX IF NOT EXISTS "AttendanceRecord_checkinDate_idx" ON "AttendanceRecord"("checkinDate");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AttendanceRecord_participantId_fkey'
  ) THEN
    ALTER TABLE "AttendanceRecord"
      ADD CONSTRAINT "AttendanceRecord_participantId_fkey"
      FOREIGN KEY ("participantId") REFERENCES "Participant"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
