-- AI advisor: exam activity log, "Talk to your advisor" chat, per-student daily chat limit. Additive only.
-- Apply with: npx prisma db execute --file prisma/sql/2026-11-27-advisor-activity-chat.sql (back up first).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "advisorDailyLimit" INTEGER NOT NULL DEFAULT 40;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "advisorLimitRequestedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "AttemptActivity" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttemptActivity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AttemptActivity_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AttemptActivity_attemptId_createdAt_idx" ON "AttemptActivity"("attemptId", "createdAt");

CREATE TABLE IF NOT EXISTS "CoachMessage" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "reported" BOOLEAN NOT NULL DEFAULT false,
    "reportNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoachMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CoachMessage_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CoachMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CoachMessage_attemptId_createdAt_idx" ON "CoachMessage"("attemptId", "createdAt");
CREATE INDEX IF NOT EXISTS "CoachMessage_userId_createdAt_idx" ON "CoachMessage"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "CoachMessage_reported_idx" ON "CoachMessage"("reported");
