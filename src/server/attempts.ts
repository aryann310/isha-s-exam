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
  type PaperMarks,
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
    await finalizeAttempt(attempt.id, "AUTO_SUBMITTED", state.overallDeadline);
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
}, tx?: Tx) {
  const state = await freshAttemptState(params);
  return (tx ?? prisma).attempt.create({
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

/** Totals for one attempt, scored against the paper's current key and marks. */
export interface ScoreTotals {
  score: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  /** Right answers as a share of answered questions; null when nothing was answered. */
  accuracy: number | null;
  /** Per answered question: is it right? (for AttemptAnswer.isCorrect) */
  verdicts: Map<string, boolean>;
}

type ScorablePaper = PaperMarks & { questions: { id: string; questionType: string; correctAnswer: string }[] };

/** The single scoring rule used for submission and for re-scoring. Answered-and-marked responses count. */
export function scoreResponses(paper: ScorablePaper, answers: { questionId: string; selectedAnswer: string | null }[]): ScoreTotals {
  const byId = new Map(paper.questions.map((q) => [q.id, q]));
  const verdicts = new Map<string, boolean>();
  let correct = 0;
  let incorrect = 0;
  let score = 0;
  for (const ans of answers) {
    const q = byId.get(ans.questionId);
    if (!q || !isAnswered(ans.selectedAnswer)) continue;
    const marks = marksFor(paper, q.questionType);
    const ok = isAnswerCorrect(q.questionType, q.correctAnswer, ans.selectedAnswer);
    verdicts.set(q.id, ok);
    if (ok) {
      correct++;
      score += marks.correct;
    } else {
      incorrect++;
      score += marks.incorrect;
    }
  }
  const unattempted = Math.max(0, paper.questions.length - correct - incorrect);
  score += unattempted * paper.unattemptedMarks;
  return {
    score: Math.round(score * 100) / 100,
    correct,
    incorrect,
    unattempted,
    accuracy: correct + incorrect > 0 ? (correct / (correct + incorrect)) * 100 : null,
    verdicts,
  };
}

const scorablePaperInclude = {
  paper: { include: { questions: { select: { id: true, questionType: true, correctAnswer: true } } } },
  answers: true,
} as const;

/**
 * Scores an attempt from the current answer key and closes it.
 * `endedAt` is when the test actually ended (its deadline) when it is closed after time ran out, so the
 * recorded submission time and time taken don't include the hours the student was away.
 * The attempt row is locked while it is scored, so an answer saved at the same moment (e.g. from a second
 * tab) is either included in the score or refused — never stored but left out of the total.
 */
export async function finalizeAttempt(attemptId: string, status: "SUBMITTED" | "AUTO_SUBMITTED", endedAt?: Date | null) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Attempt" WHERE "id" = ${attemptId} FOR UPDATE`;
    const attempt = await tx.attempt.findUnique({ where: { id: attemptId }, include: scorablePaperInclude });
    if (!attempt || attempt.status !== "IN_PROGRESS") return;

    const totals = scoreResponses(attempt.paper, attempt.answers);
    const now = new Date();
    // A practice session closed for the student (it has no time limit, so it may have sat open for days)
    // ends at their last answer or visit, not when someone finally closed it.
    let end = endedAt ?? null;
    if (!end && status === "AUTO_SUBMITTED" && attempt.mode === "PRACTICE") {
      end = attempt.answers.reduce<Date>((last, a) => (a.answeredAt > last ? a.answeredAt : last), attempt.startedAt);
    }
    const submittedAt = end && end.getTime() < now.getTime() && end.getTime() >= attempt.startedAt.getTime() ? end : now;
    const timeTaken = Math.max(0, Math.floor((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000));

    await tx.attempt.update({
      where: { id: attemptId },
      data: {
        status,
        submittedAt,
        score: totals.score,
        correct: totals.correct,
        incorrect: totals.incorrect,
        unattempted: totals.unattempted,
        accuracy: totals.accuracy,
        timeTaken,
      },
    });
    await syncVerdicts(tx, attemptId, attempt.answers, totals.verdicts);
  }, { timeout: 20_000, maxWait: 10_000 });
  return prisma.attempt.findUnique({ where: { id: attemptId } });
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Keeps AttemptAnswer.isCorrect in line with the current key (null for unanswered). */
async function syncVerdicts(tx: Tx, attemptId: string, answers: { questionId: string; isCorrect: boolean | null }[], verdicts: Map<string, boolean>) {
  const right: string[] = [];
  const wrong: string[] = [];
  const none: string[] = [];
  for (const a of answers) {
    const v = verdicts.has(a.questionId) ? verdicts.get(a.questionId)! : null;
    if (v === a.isCorrect) continue;
    (v === true ? right : v === false ? wrong : none).push(a.questionId);
  }
  if (right.length) await tx.attemptAnswer.updateMany({ where: { attemptId, questionId: { in: right } }, data: { isCorrect: true } });
  if (wrong.length) await tx.attemptAnswer.updateMany({ where: { attemptId, questionId: { in: wrong } }, data: { isCorrect: false } });
  if (none.length) await tx.attemptAnswer.updateMany({ where: { attemptId, questionId: { in: none } }, data: { isCorrect: null } });
}

/**
 * Re-scores every completed attempt of a paper against its current key, marks and questions.
 * Call after anything that changes how a paper scores (answer key, question type, marks, adding or
 * deleting questions), so stored results, analytics and the results page always agree.
 * Returns how many attempts changed.
 */
export async function rescorePaper(paperId: string): Promise<number> {
  const ids = await prisma.attempt.findMany({
    where: { paperId, status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] } },
    select: { id: true },
  });
  let changed = 0;
  for (const { id } of ids) {
    await prisma.$transaction(async (tx) => {
      const a = await tx.attempt.findUnique({ where: { id }, include: scorablePaperInclude });
      if (!a) return;
      const t = scoreResponses(a.paper, a.answers);
      const same =
        a.score === t.score && a.correct === t.correct && a.incorrect === t.incorrect && a.unattempted === t.unattempted &&
        (a.accuracy === null ? t.accuracy === null : t.accuracy !== null && Math.abs(a.accuracy - t.accuracy) < 1e-9);
      if (!same) {
        changed++;
        await tx.attempt.update({
          where: { id },
          data: { score: t.score, correct: t.correct, incorrect: t.incorrect, unattempted: t.unattempted, accuracy: t.accuracy },
        });
      }
      await syncVerdicts(tx, id, a.answers, t.verdicts);
    }, { timeout: 20_000, maxWait: 10_000 });
  }
  return changed;
}

/**
 * Runs `fn` while holding a lock on the attempt row, but only if the attempt is still in progress.
 * Saves use this so they can't land after (or during) scoring. Returns false when the attempt has ended.
 */
export async function whileAttemptOpen(attemptId: string, fn: (tx: Tx) => Promise<void>): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "Attempt" WHERE "id" = ${attemptId} FOR UPDATE`;
    if (rows[0]?.status !== "IN_PROGRESS") return false;
    await fn(tx);
    return true;
  }, { timeout: 15_000, maxWait: 10_000 });
}
