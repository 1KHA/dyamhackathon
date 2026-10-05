-- Admin can hide a mentor or an organization from participants (not listed,
-- not bookable). Two new columns defaulting to false — no existing row changes
-- behaviour until an admin flips one.
ALTER TABLE "Mentor" ADD COLUMN IF NOT EXISTS "hiddenFromParticipants" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "hiddenFromParticipants" BOOLEAN NOT NULL DEFAULT false;
