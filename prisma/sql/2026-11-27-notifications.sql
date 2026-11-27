-- Student notifications: automatic "new paper is out" messages and admin-written messages. Additive only.
-- Apply with: npx prisma db execute --file prisma/sql/2026-11-27-notifications.sql (back up first).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notificationsSeenAt" TIMESTAMP(3);
ALTER TABLE "Paper" ADD COLUMN IF NOT EXISTS "announcedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "paperId" TEXT,
    "audience" TEXT NOT NULL DEFAULT 'ALL',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Notification_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_paperId_key" ON "Notification"("paperId");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");

CREATE TABLE IF NOT EXISTS "NotificationRecipient" (
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("notificationId", "userId"),
    CONSTRAINT "NotificationRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotificationRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "NotificationRecipient_userId_idx" ON "NotificationRecipient"("userId");

-- Papers students can already see count as announced, so turning this on doesn't send a message for every
-- old paper. Hidden papers stay unannounced: publishing one later tells the students.
UPDATE "Paper" p SET "announcedAt" = CURRENT_TIMESTAMP
FROM "Exam" e
WHERE p."examId" = e."id" AND p."isActive" AND e."isActive" AND p."totalQuestions" > 0 AND p."announcedAt" IS NULL;
