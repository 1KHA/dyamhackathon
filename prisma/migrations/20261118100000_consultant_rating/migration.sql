-- Consultant rating (تقييم المستشارين): NEW tables only — no existing table or
-- row is changed. See mdfiles/consultant-rating.md.
--
-- Idempotent (IF NOT EXISTS / ON CONFLICT) like the other recent migrations,
-- so a restore from an older dump can replay it safely.

-- Evaluator accounts
CREATE TABLE IF NOT EXISTS "Consultant" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Consultant_username_key" ON "Consultant"("username");

-- Single settings row (mirrors VoteSettings). The rated phase defaults to
-- «المرحلة النهائية جدة» when such a phase exists; the admin can change it.
CREATE TABLE IF NOT EXISTS "RatingSettings" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "phaseId" TEXT,
    "finalWeight" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatingSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "RatingSettings" ("id", "enabled", "phaseId", "finalWeight", "updatedAt")
SELECT 'ratingsettings-default-row-01', true,
       (SELECT "id" FROM "Phase" WHERE "name" = 'المرحلة النهائية جدة' ORDER BY "order" DESC LIMIT 1),
       35, CURRENT_TIMESTAMP
ON CONFLICT ("id") DO NOTHING;

-- One rating per (consultant, team)
CREATE TABLE IF NOT EXISTS "TeamRating" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamRating_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TeamRating_consultantId_teamId_key" ON "TeamRating"("consultantId", "teamId");
CREATE INDEX IF NOT EXISTS "TeamRating_teamId_idx" ON "TeamRating"("teamId");

-- Criterion values (1..5)
CREATE TABLE IF NOT EXISTS "TeamRatingScore" (
    "id" TEXT NOT NULL,
    "ratingId" TEXT NOT NULL,
    "criterionKey" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "TeamRatingScore_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TeamRatingScore_ratingId_criterionKey_key" ON "TeamRatingScore"("ratingId", "criterionKey");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamRating_consultantId_fkey') THEN
    ALTER TABLE "TeamRating" ADD CONSTRAINT "TeamRating_consultantId_fkey"
      FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamRating_teamId_fkey') THEN
    ALTER TABLE "TeamRating" ADD CONSTRAINT "TeamRating_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamRatingScore_ratingId_fkey') THEN
    ALTER TABLE "TeamRatingScore" ADD CONSTRAINT "TeamRatingScore_ratingId_fkey"
      FOREIGN KEY ("ratingId") REFERENCES "TeamRating"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
