"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { isAnswered } from "@/lib/exam-patterns";
import { cleanResponse } from "@/server/fast-save";
import { untimedPending } from "@/server/untimed";

type Outcome = { ok: true } | { ok: false; error: string; finished?: boolean };

async function ownAttempt(attemptId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return prisma.attempt.findFirst({
    where: { id: attemptId, userId: session.userId as string },
    select: { id: true, paperId: true, mode: true, status: true, unattempted: true, untimedEndedAt: true },
  });
}

/**
 * Saves (or clears, with `answer` null) an untimed-phase answer to a question left unanswered in the test.
 * Never touches the test's own answers or score.
 */
export async function saveUntimedAnswerAction(attemptId: string, questionId: string, answer: string | null): Promise<Outcome> {
  const attempt = await ownAttempt(attemptId);
  if (!attempt) return { ok: false, error: "Attempt not found" };
  if (!untimedPending(attempt)) return { ok: false, error: "This untimed phase has ended.", finished: true };

  const [question, timed] = await Promise.all([
    prisma.question.findFirst({ where: { id: questionId, paperId: attempt.paperId }, select: { questionType: true, options: true } }),
    prisma.attemptAnswer.findUnique({ where: { attemptId_questionId: { attemptId, questionId } }, select: { selectedAnswer: true } }),
  ]);
  if (!question) return { ok: false, error: "Question not found" };
  if (isAnswered(timed?.selectedAnswer)) return { ok: false, error: "This question was already answered in the test." };

  const clean = cleanResponse(question, answer);
  if (clean === undefined) return { ok: false, error: "That answer is not valid for this question." };

  // Written only while the phase is still open (it may have been finished in another tab).
  const rows = clean === null
    ? await prisma.$executeRaw`
        DELETE FROM "UntimedAnswer" u USING "Attempt" a
         WHERE u."attemptId" = a.id AND a.id = ${attemptId} AND u."questionId" = ${questionId} AND a."untimedEndedAt" IS NULL`
    : await prisma.$executeRaw`
        INSERT INTO "UntimedAnswer" (id, "attemptId", "questionId", "selectedAnswer", "answeredAt")
        SELECT ${randomUUID()}, a.id, ${questionId}, ${clean}, now() FROM "Attempt" a
         WHERE a.id = ${attemptId} AND a.status <> 'IN_PROGRESS' AND a."untimedEndedAt" IS NULL
        ON CONFLICT ("attemptId", "questionId") DO UPDATE
           SET "selectedAnswer" = EXCLUDED."selectedAnswer", "answeredAt" = EXCLUDED."answeredAt"`;
  if (clean !== null && rows === 0) return { ok: false, error: "This untimed phase has ended.", finished: true };
  return { ok: true };
}

/** Ends the untimed phase (finished, or skipped from the result page). Solutions open after this. */
export async function finishUntimedAction(attemptId: string): Promise<Outcome> {
  const attempt = await ownAttempt(attemptId);
  if (!attempt) return { ok: false, error: "Attempt not found" };
  if (attempt.status === "IN_PROGRESS") return { ok: false, error: "The test is still running." };
  await prisma.attempt.updateMany({
    where: { id: attemptId, untimedEndedAt: null, status: { not: "IN_PROGRESS" } },
    data: { untimedEndedAt: new Date() },
  });
  return { ok: true };
}

/** Form version for the result page's "skip" button: ends the phase and opens the solutions. */
export async function skipUntimedFormAction(formData: FormData) {
  const attemptId = String(formData.get("attemptId") ?? "");
  const res = await finishUntimedAction(attemptId);
  redirect(res.ok ? `/solutions/${attemptId}` : `/results/${attemptId}`);
}
