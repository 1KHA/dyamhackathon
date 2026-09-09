-- Organizations: group mentors so participants can book the entity itself
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organization_name_key" ON "Organization"("name");

ALTER TABLE "Mentor" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Mentor" ADD CONSTRAINT "Mentor_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MentorBooking" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "MentorBooking" ADD CONSTRAINT "MentorBooking_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- individual (default, current behaviour) | organization | both
ALTER TABLE "TeamSettings" ADD COLUMN "mentorBookingMode" TEXT NOT NULL DEFAULT 'individual';
