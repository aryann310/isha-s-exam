-- Advisor chat on the analytics tab: chat messages not tied to one test (attemptId null). Existing rows unchanged.
-- Apply with: npx prisma db execute --file prisma/sql/2026-11-27-advisor-general-chat.sql (back up first).
ALTER TABLE "CoachMessage" ALTER COLUMN "attemptId" DROP NOT NULL;
