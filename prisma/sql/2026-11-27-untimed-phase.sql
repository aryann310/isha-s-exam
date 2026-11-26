-- Untimed phase after a mock (answer the questions left unanswered, no time limit; score unchanged).
-- Apply with: npx prisma db execute --file prisma/sql/2026-11-27-untimed-phase.sql (back up first).
BEGIN;

ALTER TABLE "Attempt" ADD COLUMN IF NOT EXISTS "untimedEndedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "UntimedAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedAnswer" TEXT NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UntimedAnswer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UntimedAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UntimedAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "UntimedAnswer_attemptId_questionId_key" ON "UntimedAnswer"("attemptId", "questionId");
CREATE INDEX IF NOT EXISTS "UntimedAnswer_questionId_idx" ON "UntimedAnswer"("questionId");

-- Tests finished before this feature already had their solutions open: treat their untimed phase as done.
UPDATE "Attempt" SET "untimedEndedAt" = COALESCE("submittedAt", now())
 WHERE status <> 'IN_PROGRESS' AND "untimedEndedAt" IS NULL;

COMMIT;
