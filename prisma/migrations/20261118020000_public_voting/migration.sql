-- Public voting (التصويت الجماهيري): NEW tables only — no existing table or
-- row is changed. See mdfiles/public-voting.md.
--
-- Idempotent (IF NOT EXISTS / ON CONFLICT) like the other recent migrations,
-- so a restore from an older dump can replay it safely.

-- Single settings row (mirrors TeamSettings / EmailSettings)
CREATE TABLE IF NOT EXISTS "VoteSettings" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "phaseId" TEXT,
    "votingStart" TIMESTAMP(3),
    "votingEnd" TIMESTAMP(3),
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoteSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "VoteSettings" ("id", "enabled", "updatedAt")
VALUES ('votesettings-default-row-01', false, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Verified voters (one row per normalized email)
CREATE TABLE IF NOT EXISTS "PublicVoter" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicVoter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PublicVoter_email_key" ON "PublicVoter"("email");

-- Votes (exactly one per voter)
CREATE TABLE IF NOT EXISTS "PublicVote" (
    "id" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicVote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PublicVote_voterId_key" ON "PublicVote"("voterId");
CREATE INDEX IF NOT EXISTS "PublicVote_teamId_idx" ON "PublicVote"("teamId");
CREATE INDEX IF NOT EXISTS "PublicVote_createdAt_idx" ON "PublicVote"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PublicVote_voterId_fkey') THEN
    ALTER TABLE "PublicVote" ADD CONSTRAINT "PublicVote_voterId_fkey"
      FOREIGN KEY ("voterId") REFERENCES "PublicVoter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PublicVote_teamId_fkey') THEN
    ALTER TABLE "PublicVote" ADD CONSTRAINT "PublicVote_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Email one-time codes (hashed)
CREATE TABLE IF NOT EXISTS "VoteOtp" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoteOtp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VoteOtp_email_createdAt_idx" ON "VoteOtp"("email", "createdAt");
CREATE INDEX IF NOT EXISTS "VoteOtp_ipHash_createdAt_idx" ON "VoteOtp"("ipHash", "createdAt");
