-- Scheduled release time for a paper: listed with a countdown, startable from this time.
-- Additive and nullable: existing papers are unaffected.
ALTER TABLE "Paper" ADD COLUMN IF NOT EXISTS "opensAt" TIMESTAMP(3);
