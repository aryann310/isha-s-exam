// Server-side attempt logic shared by pages and server actions. Not a "use server" module:
// nothing here is callable from the browser directly.
import { prisma } from "@/lib/prisma";
import { computeTiming, type TimingState } from "@/lib/attempt-timing";
import {
  getPattern,
  isAnswerCorrect,
  isAnswered,
  marksFor,
  resolvePaperSections,
  sectionKey,
  type ExamPattern,
  type PaperSection,
} from "@/lib/exam-patterns";
import type { Attempt, Paper } from "@prisma/client";

export interface AttemptContext {
  attempt: Attempt;
  paper: Paper;
  pattern: ExamPattern;
  sections: PaperSection[];
  timing: TimingState;
}

const questionSectionSelect = { section: true, questionNumber: true } as const;

/** Loads an attempt the user may access, brings its clock up to date and auto-submits it when time is over. */
export async function loadAttemptContext(
  attemptId: string,
  session: Record<string, unknown>,
  opts: { graceSeconds?: number } = {}
): Promise<AttemptContext | null> {
  const isAdmin = session.role === "ADMIN";
  const attempt = await prisma.attempt.findFirst({
    where: isAdmin ? { id: attemptId } : { id: attemptId, userId: session.userId as string },
    include: { paper: true },
  });
  if (!attempt) return null;

  const { paper, ...rest } = attempt;
  const pattern = getPattern(paper.examPattern);
  const questions = await prisma.question.findMany({ where: { paperId: paper.id }, select: questionSectionSelect });
  const sections = resolvePaperSections(paper, questions);

  const now = new Date(Date.now() - (opts.graceSeconds ?? 0) * 1000);
  const { state, changed } = computeTiming(rest, sections, pattern, now);
  const ctx: AttemptContext = { attempt: rest as Attempt, paper, pattern, sections, timing: state };

  if (attempt.status !== "IN_PROGRESS") return ctx;

  if (state.finished) {
    await finalizeAttempt(attempt.id, "AUTO_SUBMITTED");
    ctx.attempt = { ...ctx.attempt, status: "AUTO_SUBMITTED" };
    return ctx;
  }
  if (changed) {
    ctx.attempt = await prisma.attempt.update({
      where: { id: attempt.id },
      data: {
        currentSection: state.currentSection,
        sectionStartedAt: state.sectionStartedAt,
        sectionExtraSeconds: state.sectionExtraSeconds,
        endsAt: state.overallDeadline,
      },
    });
  }
  return ctx;
}

/** Name of the section currently open in a sectional mock, or null when every section is open. */
export function openSection(ctx: AttemptContext): string | null {
  return ctx.timing.sectional ? ctx.timing.order[ctx.timing.currentSection] ?? null : null;
}

export function questionInOpenSection(ctx: AttemptContext, questionSection: string | null): boolean {
  const open = openSection(ctx);
  return open === null || sectionKey(questionSection) === open;
}

/**
 * Creates an attempt with its clock and section state initialised from the paper's pattern.
 * `sectionOrder` is only honoured when the pattern lets the candidate choose it.
 */
export async function createAttempt(params: {
  userId: string;
  paper: Paper;
  mode: "PRACTICE" | "MOCK";
  sectionOrder?: string[] | null;
  customDurationSeconds?: number | null;
}) {
  const state = await freshAttemptState(params);
  return prisma.attempt.create({
    data: { userId: params.userId, paperId: params.paper.id, mode: params.mode, status: "IN_PROGRESS", ...state },
  });
}

/** Clock and section fields for an attempt that starts now. Also used to reset an attempt. */
export async function freshAttemptState(params: {
  paper: Paper;
  mode: string;
  sectionOrder?: string[] | null;
  customDurationSeconds?: number | null;
}) {
  const { paper, mode } = params;
  const pattern = getPattern(paper.examPattern);
  const questions = await prisma.question.findMany({ where: { paperId: paper.id }, select: questionSectionSelect });
  const sections = resolvePaperSections(paper, questions);
  const now = new Date();

  const sectional = mode === "MOCK" && pattern.timing === "sectional" && sections.length > 0;
  let order = sections.map((s) => s.name);
  if (sectional && pattern.sectionOrder === "candidate" && params.sectionOrder?.length) {
    const chosen = params.sectionOrder.filter((n) => order.includes(n));
    if (chosen.length === order.length && new Set(chosen).size === chosen.length) order = chosen;
  }

  let endsAt: Date | null = null;
  if (mode === "MOCK") {
    const total = sectional
      ? sections.reduce((t, s) => t + (s.durationSeconds ?? 0), 0)
      : params.customDurationSeconds || paper.durationSeconds || pattern.totalMinutes * 60;
    endsAt = new Date(now.getTime() + total * 1000);
  }

  return {
    startedAt: now,
    endsAt,
    sectionOrder: sectional ? JSON.stringify(order) : null,
    currentSection: 0,
    sectionStartedAt: sectional ? now : null,
    sectionExtraSeconds: 0,
  };
}

/** Scores an attempt from the current answer key and closes it. Answered-and-marked responses count. */
export async function finalizeAttempt(attemptId: string, status: "SUBMITTED" | "AUTO_SUBMITTED") {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { paper: { include: { questions: { select: { id: true, questionType: true, correctAnswer: true } } } }, answers: true },
  });
  if (!attempt || attempt.status !== "IN_PROGRESS") return attempt;

  const { paper } = attempt;
  const byId = new Map(paper.questions.map((q) => [q.id, q]));
  let correct = 0;
  let incorrect = 0;
  let score = 0;
  for (const ans of attempt.answers) {
    const q = byId.get(ans.questionId);
    if (!q || !isAnswered(ans.selectedAnswer)) continue;
    const marks = marksFor(paper, q.questionType);
    if (isAnswerCorrect(q.questionType, q.correctAnswer, ans.selectedAnswer)) {
      correct++;
      score += marks.correct;
    } else {
      incorrect++;
      score += marks.incorrect;
    }
  }
  const unattempted = Math.max(0, paper.questions.length - correct - incorrect);
  score += unattempted * paper.unattemptedMarks;

  const submittedAt = new Date();
  const timeTaken = Math.max(0, Math.floor((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000));

  // Only close it if nobody else did in the meantime.
  await prisma.attempt.updateMany({
    where: { id: attemptId, status: "IN_PROGRESS" },
    data: {
      status,
      submittedAt,
      score: Math.round(score * 100) / 100,
      correct,
      incorrect,
      unattempted,
      accuracy: correct + incorrect > 0 ? (correct / (correct + incorrect)) * 100 : 0,
      timeTaken,
    },
  });
  return prisma.attempt.findUnique({ where: { id: attemptId } });
}
