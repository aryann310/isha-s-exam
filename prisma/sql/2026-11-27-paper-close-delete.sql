-- Papers can be closed (no new attempts; solutions open to every student) and deleted automatically
-- at a set time (src/server/paper-expiry.ts). Additive and nullable: existing papers are unaffected.
ALTER TABLE "Paper" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);
ALTER TABLE "Paper" ADD COLUMN IF NOT EXISTS "deleteAt" TIMESTAMP(3);
