import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { UntimedPhase, type UntimedQuestion } from "@/components/exam/untimed-phase";
import { loadAttemptContext } from "@/server/attempts";
import { untimedPending } from "@/server/untimed";
import { getPattern, isAnswered, marksFor, parseQuestionTypeSafe, sectionKey } from "@/lib/exam-patterns";
import { parseQuestionOptions } from "@/lib/parse-markdown-questions";
import { themeForPaper } from "@/lib/exam-theme";

export const dynamic = "force-dynamic";

/** Untimed phase: the questions left unanswered in a finished mock, with no time limit. */
export default async function ContinuePage({ params }: { params: Promise<{ attemptId: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { attemptId } = await params;

  // Closes the test first if its time ran out while the candidate was away.
  const ctx = await loadAttemptContext(attemptId, session);
  if (!ctx) return notFound();
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, userId: session.userId as string },
    select: { id: true, mode: true, status: true, unattempted: true, untimedEndedAt: true },
  });
  if (!attempt) return notFound();
  if (attempt.status === "IN_PROGRESS") redirect(`/exam/${attemptId}`);
  if (!untimedPending(attempt)) redirect(`/results/${attemptId}`);

  const [questions, timed, untimed] = await Promise.all([
    prisma.question.findMany({ where: { paperId: ctx.paper.id }, orderBy: [{ questionNumber: "asc" }, { id: "asc" }] }),
    prisma.attemptAnswer.findMany({ where: { attemptId }, select: { questionId: true, selectedAnswer: true } }),
    prisma.untimedAnswer.findMany({ where: { attemptId }, select: { questionId: true, selectedAnswer: true } }),
  ]);
  const answeredInTest = new Set(timed.filter((a) => isAnswered(a.selectedAnswer)).map((a) => a.questionId));

  // Sections in the order the candidate took them, questions in paper order. No answers or solutions are sent.
  const order = ctx.timing.order;
  const rank = (s: string) => (order.indexOf(s) < 0 ? order.length : order.indexOf(s));
  const leftover: UntimedQuestion[] = questions
    .filter((q) => !answeredInTest.has(q.id))
    .map((q) => ({
      id: q.id,
      number: q.questionNumber,
      section: sectionKey(q.section),
      type: parseQuestionTypeSafe(q.questionType),
      text: q.questionText,
      options: q.questionType === "TITA" ? {} : parseQuestionOptions(q.options),
      marks: marksFor(ctx.paper, q.questionType, q.section),
    }))
    .sort((a, b) => rank(a.section) - rank(b.section) || a.number - b.number);

  const pattern = getPattern(ctx.paper.examPattern);
  return (
    <UntimedPhase
      attemptId={attemptId}
      theme={themeForPaper(ctx.paper)}
      paperTitle={ctx.paper.title}
      patternLabel={pattern.label}
      calculator={pattern.calculator}
      questions={leftover}
      initialAnswers={Object.fromEntries(untimed.map((a) => [a.questionId, a.selectedAnswer]))}
    />
  );
}
