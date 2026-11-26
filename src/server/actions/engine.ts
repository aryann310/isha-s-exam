"use server";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { SAVE_GRACE_SECONDS } from "@/lib/attempt-timing";
import { isAnswerCorrect, isAnswered, sectionKey } from "@/lib/exam-patterns";
import { finalizeAttempt, loadAttemptContext, openSection, questionInOpenSection, whileAttemptOpen } from "@/server/attempts";
import { attemptStatus, cleanResponse, fastSaveResponse, fastVisit } from "@/server/fast-save";

type Fail = { ok: false; error: string; finished?: boolean };

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

// ---------------------------------------------------------------------------
// Practice mode: answer is checked and the solution shown straight away.
// ---------------------------------------------------------------------------

export async function saveAnswerAction(attemptId: string, questionId: string, selectedAnswer: string) {
  const session = await requireSession();
  const ctx = await loadAttemptContext(attemptId, session);
  if (!ctx || ctx.attempt.status !== "IN_PROGRESS") throw new Error("Invalid attempt");
  if (ctx.attempt.mode !== "PRACTICE") throw new Error("Answers in a mock test are revealed only after submission");

  const question = await prisma.question.findFirst({
    where: { id: questionId, paperId: ctx.paper.id },
    select: { correctAnswer: true, explanation: true, questionType: true, options: true },
  });
  if (!question) throw new Error("Question not found");

  const answer = cleanResponse(question, selectedAnswer);
  if (!answer) throw new Error("Invalid answer");

  // The solution is shown after the first answer, so that first answer is final: a second call
  // (e.g. re-sent with the revealed key) returns the original result instead of overwriting it.
  let result: { selected: string; isCorrect: boolean } | null = null;
  const open = await whileAttemptOpen(attemptId, async (tx) => {
    const existing = await tx.attemptAnswer.findUnique({
      where: { attemptId_questionId: { attemptId, questionId } },
      select: { selectedAnswer: true },
    });
    if (existing && isAnswered(existing.selectedAnswer)) {
      const prev = String(existing.selectedAnswer);
      result = { selected: prev, isCorrect: isAnswerCorrect(question.questionType, question.correctAnswer, prev) };
      return;
    }
    const isCorrect = isAnswerCorrect(question.questionType, question.correctAnswer, answer);
    await tx.attemptAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      update: { selectedAnswer: answer, isCorrect, answeredAt: new Date() },
      create: { attemptId, questionId, selectedAnswer: answer, isCorrect },
    });
    result = { selected: answer, isCorrect };
  });
  if (!open || !result) throw new Error("Invalid attempt");
  const final = result as { selected: string; isCorrect: boolean };

  return { isCorrect: final.isCorrect, selectedAnswer: final.selected, correctAnswer: question.correctAnswer, explanation: question.explanation };
}

// ---------------------------------------------------------------------------
// Mock mode: exam-style responses. Nothing about correctness is returned.
// ---------------------------------------------------------------------------

export interface ResponseState {
  answer: string | null;
  markedForReview: boolean;
}

/**
 * Save & Next, Mark for Review & Next, and Clear Response all land here. `visitNext` is the question the
 * candidate moved to, marked as seen in the same request. Normally two database round trips (fast path);
 * section changes, the end of the test and refusals go through the full path below.
 */
export async function saveResponseAction(
  attemptId: string,
  questionId: string,
  response: ResponseState,
  visitNext?: string | null
): Promise<{ ok: true } | Fail> {
  const fast = await fastSaveResponse({ attemptId, questionId, answer: response.answer, markedForReview: response.markedForReview, visitId: visitNext });
  if (fast.kind === "saved") return { ok: true };
  if (fast.kind === "ended") return { ok: false, error: "This test has ended.", finished: true };
  if (fast.kind === "refused") return { ok: false, error: fast.error };
  const res = await saveResponseFull(attemptId, questionId, response);
  if (res.ok && visitNext) await visitFull(attemptId, visitNext).catch(() => undefined);
  return res;
}

/** The original, fully checked save: brings the clock up to date (section changes, auto-submit) first. */
async function saveResponseFull(
  attemptId: string,
  questionId: string,
  response: ResponseState
): Promise<{ ok: true } | Fail> {
  const session = await requireSession();
  const ctx = await loadAttemptContext(attemptId, session, { graceSeconds: SAVE_GRACE_SECONDS });
  if (!ctx) return { ok: false, error: "Attempt not found" };
  if (ctx.attempt.status !== "IN_PROGRESS") return { ok: false, error: "This test has ended.", finished: true };
  if (ctx.attempt.mode !== "MOCK") return { ok: false, error: "Not a mock attempt" };

  const question = await prisma.question.findFirst({
    where: { id: questionId, paperId: ctx.paper.id },
    select: { section: true, questionType: true, correctAnswer: true, options: true },
  });
  if (!question) return { ok: false, error: "Question not found" };
  if (!questionInOpenSection(ctx, question.section)) return { ok: false, error: "This section is closed." };

  const answer = cleanResponse(question, response.answer);
  if (answer === undefined) return { ok: false, error: "That answer is not valid for this question." };
  const linear = ctx.pattern.navigation === "linear";
  // One-way papers (NMAT): an answer is required to move on, and there is no marking for review.
  if (linear && !isAnswered(answer)) return { ok: false, error: "Choose an answer to continue." };
  const markedForReview = linear ? false : !!response.markedForReview;
  const isCorrect = isAnswered(answer) ? isAnswerCorrect(question.questionType, question.correctAnswer, answer) : null;

  let refusal: string | null = null;
  const saved = await whileAttemptOpen(attemptId, async (tx) => {
    if (linear) {
      // Only the next unanswered question (in exam order) may be answered, and only once.
      const open = openSection(ctx);
      const [all, answered] = await Promise.all([
        tx.question.findMany({ where: { paperId: ctx.paper.id }, select: { id: true, section: true, questionNumber: true }, orderBy: [{ questionNumber: "asc" }, { id: "asc" }] }),
        tx.attemptAnswer.findMany({ where: { attemptId }, select: { questionId: true, selectedAnswer: true } }),
      ]);
      const done = new Set(answered.filter((a) => isAnswered(a.selectedAnswer)).map((a) => a.questionId));
      const order = ctx.timing.order;
      const sequence = all
        .filter((q) => open === null || sectionKey(q.section) === open)
        .sort((a, b) => order.indexOf(sectionKey(a.section)) - order.indexOf(sectionKey(b.section)) || a.questionNumber - b.questionNumber);
      const next = sequence.find((q) => !done.has(q.id));
      // Happens only when the test is open in another tab or window: reloading shows the current question.
      if (done.has(questionId)) {
        refusal = "This question has already been answered and cannot be changed. Reload the page to continue.";
        return;
      }
      if (!next || next.id !== questionId) {
        refusal = "Questions must be answered in order. Reload the page to continue.";
        return;
      }
    }
    await tx.attemptAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      update: { selectedAnswer: answer, isCorrect, markedForReview, answeredAt: new Date() },
      create: { attemptId, questionId, selectedAnswer: answer, isCorrect, markedForReview },
    });
  });
  if (!saved) return { ok: false, error: "This test has ended.", finished: true };
  if (refusal) return { ok: false, error: refusal };
  return { ok: true };
}

/** Records that a question was opened, so the palette shows it as "Not Answered" instead of "Not Visited". */
export async function visitQuestionAction(attemptId: string, questionId: string): Promise<{ ok: boolean }> {
  const fast = await fastVisit(attemptId, questionId);
  if (fast.kind === "saved") return { ok: true };
  if (fast.kind !== "fallback") return { ok: false };
  return visitFull(attemptId, questionId);
}

/**
 * Keeps the database and server warm during a test and tells the page whether the attempt is still running.
 * The page calls it only after a few quiet minutes; normal saves keep things warm on their own.
 */
export async function keepAliveAction(attemptId: string): Promise<{ status: string | null }> {
  return { status: await attemptStatus(attemptId) };
}

async function visitFull(attemptId: string, questionId: string): Promise<{ ok: boolean }> {
  const session = await requireSession();
  const ctx = await loadAttemptContext(attemptId, session);
  if (!ctx || ctx.attempt.status !== "IN_PROGRESS") return { ok: false };
  const question = await prisma.question.findFirst({ where: { id: questionId, paperId: ctx.paper.id }, select: { section: true } });
  if (!question || !questionInOpenSection(ctx, question.section)) return { ok: false };
  await prisma.attemptAnswer.createMany({ data: [{ attemptId, questionId, selectedAnswer: null }], skipDuplicates: true });
  return { ok: true };
}

/**
 * Closes the open section of a sectional mock and opens the next one (or ends the test after the last).
 * Allowed early only when the pattern permits it; otherwise only once the section's time is up.
 */
export async function submitSectionAction(
  attemptId: string,
  fromSection: number
): Promise<{ ok: true; finished: boolean } | Fail> {
  const session = await requireSession();
  const ctx = await loadAttemptContext(attemptId, session);
  if (!ctx) return { ok: false, error: "Attempt not found" };
  if (ctx.attempt.status !== "IN_PROGRESS") return { ok: true, finished: true };
  if (!ctx.timing.sectional) return { ok: false, error: "This test has no timed sections." };
  // The clock already moved the candidate past that section: nothing to do.
  if (ctx.timing.currentSection !== fromSection) return { ok: true, finished: false };

  // loadAttemptContext already moved on if the time was up; if we are still here, this is an early submit.
  const timeUp = ctx.timing.sectionDeadline !== null && ctx.timing.sectionDeadline.getTime() - Date.now() <= SAVE_GRACE_SECONDS * 1000;
  if (!ctx.pattern.canSubmitSectionEarly && !timeUp) {
    return { ok: false, error: "You can move to the next section only when this section's time is over." };
  }

  const next = ctx.timing.currentSection + 1;
  if (next >= ctx.timing.order.length) {
    await finalizeAttempt(attemptId, "SUBMITTED");
    return { ok: true, finished: true };
  }

  const now = new Date();
  let remaining = 0;
  for (let i = next; i < ctx.timing.order.length; i++) {
    remaining += (ctx.sections.find((s) => s.name === ctx.timing.order[i])?.durationSeconds ?? 0) * 1000;
  }
  // Guard against double clicks: only advance from the section we just looked at.
  await prisma.attempt.updateMany({
    where: { id: attemptId, status: "IN_PROGRESS", currentSection: ctx.attempt.currentSection },
    data: { currentSection: next, sectionStartedAt: now, sectionExtraSeconds: 0, endsAt: new Date(now.getTime() + remaining) },
  });
  return { ok: true, finished: false };
}

/** Ends the whole test. Practice: any time. Mock: per the pattern's rules, or when time is up. */
export async function submitExamAction(attemptId: string): Promise<{ ok: true } | Fail> {
  const session = await requireSession();
  const ctx = await loadAttemptContext(attemptId, session);
  if (!ctx) return { ok: false, error: "Attempt not found" };
  if (ctx.attempt.status !== "IN_PROGRESS") return { ok: true };

  if (ctx.attempt.mode === "MOCK") {
    if (ctx.timing.sectional) {
      const onLast = ctx.timing.currentSection >= ctx.timing.order.length - 1;
      const timeUp = !!ctx.timing.sectionDeadline && ctx.timing.sectionDeadline.getTime() - Date.now() <= SAVE_GRACE_SECONDS * 1000;
      if (!onLast || (!ctx.pattern.canSubmitSectionEarly && !timeUp)) {
        return { ok: false, error: "The test ends after the last section's time is over." };
      }
    } else if (!ctx.pattern.canSubmitEarly) {
      const timeUp = !!ctx.timing.overallDeadline && ctx.timing.overallDeadline.getTime() - Date.now() <= SAVE_GRACE_SECONDS * 1000;
      if (!timeUp) return { ok: false, error: "This test can only be submitted when the time is over." };
    }
  }

  await finalizeAttempt(attemptId, "SUBMITTED");
  return { ok: true };
}
