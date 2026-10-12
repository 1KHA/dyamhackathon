-- Entry/exit scan log (check-in AND check-out, any number per day, per venue
-- or per event). A NEW table only — no existing table or row is changed.

-- CreateTable
CREATE TABLE IF NOT EXISTS "AttendanceScan" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "eventId" TEXT,
    "day" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "scannedBy" TEXT NOT NULL,
    "scannerRole" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AttendanceScan_participantId_day_idx" ON "AttendanceScan"("participantId", "day");
CREATE INDEX IF NOT EXISTS "AttendanceScan_eventId_day_idx" ON "AttendanceScan"("eventId", "day");
CREATE INDEX IF NOT EXISTS "AttendanceScan_day_idx" ON "AttendanceScan"("day");

-- AddForeignKey (deleting a participant deletes their scans)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AttendanceScan_participantId_fkey') THEN
    ALTER TABLE "AttendanceScan" ADD CONSTRAINT "AttendanceScan_participantId_fkey"
      FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
