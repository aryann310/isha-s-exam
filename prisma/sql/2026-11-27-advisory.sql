-- AI coaching advice for students (one row per student and scope). Additive only.
-- Apply with: npx prisma db execute --file prisma/sql/2026-11-27-advisory.sql (back up first).
CREATE TABLE IF NOT EXISTS "Advisory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Advisory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Advisory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Advisory_userId_scope_key" ON "Advisory"("userId", "scope");
