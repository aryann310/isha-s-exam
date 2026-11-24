import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { ExamEngine } from "@/components/exam/exam-engine";
import { MockExamEngine, type MockQuestion, type MockSection } from "@/components/exam/mock-exam-engine";
import { paletteStatus, type PaletteStatus } from "@/components/exam/palette-symbol";
import { loadAttemptContext } from "@/server/attempts";
import { getPattern, marksFor, patternInstructions, parseQuestionTypeSafe, sectionKey } from "@/lib/exam-patterns";
import { parseQuestionOptions } from "@/lib/parse-markdown-questions";

export const dynamic = "force-dynamic";

export default async function ExamPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { attemptId } = await params;

  const ctx = await loadAttemptContext(attemptId, session);
  if (!ctx) return notFound();
  if (ctx.attempt.status !== "IN_PROGRESS") redirect(`/results/${attemptId}`);

  const [questions, answers] = await Promise.all([
    prisma.question.findMany({ where: { paperId: ctx.paper.id }, orderBy: [{ questionNumber: "asc" }, { id: "asc" }] }),
    prisma.attemptAnswer.findMany({ where: { attemptId } }),
  ]);

  // ---------------- Practice: instant feedback (answers only for questions already answered) ----------------
  if (ctx.attempt.mode !== "MOCK") {
    const safe = questions.map((q) => {
      const answered = answers.find((a) => a.questionId === q.id && a.selectedAnswer);
      return { ...q, correctAnswer: answered ? q.correctAnswer : "", explanation: answered ? q.explanation : "" };
    });
    return <ExamEngine attempt={ctx.attempt} paper={ctx.paper} questions={safe} initialAnswers={answers} />;
  }

  // ---------------- Mock: exam replica ----------------
  const { timing, pattern } = ctx;
  const answerByQ = new Map(answers.map((a) => [a.questionId, a]));
  const response = (qid: string) => {
    const a = answerByQ.get(qid);
    return { visited: !!a, answer: a?.selectedAnswer ?? null, markedForReview: a?.markedForReview ?? false };
  };

  const openName = timing.sectional ? timing.order[timing.currentSection] : null;
  const sections: MockSection[] = timing.order.map((name, index) => {
    const inSection = questions.filter((q) => sectionKey(q.section) === name);
    const summary: Record<PaletteStatus, number> = { notVisited: 0, notAnswered: 0, answered: 0, marked: 0, answeredMarked: 0 };
    for (const q of inSection) summary[paletteStatus(response(q.id))]++;
    return {
      name,
      index,
      state: !timing.sectional ? "open" : index < timing.currentSection ? "done" : index === timing.currentSection ? "current" : "upcoming",
      durationSeconds: ctx.sections.find((s) => s.name === name)?.durationSeconds ?? null,
      total: inSection.length,
      summary,
    };
  });

  const orderIndex = new Map(timing.order.map((n, i) => [n, i]));
  const visible: MockQuestion[] = questions
    .filter((q) => openName === null || sectionKey(q.section) === openName)
    .sort((a, b) => (orderIndex.get(sectionKey(a.section)) ?? 0) - (orderIndex.get(sectionKey(b.section)) ?? 0) || a.questionNumber - b.questionNumber)
    .map((q) => ({
      id: q.id,
      number: q.questionNumber,
      section: sectionKey(q.section),
      type: parseQuestionTypeSafe(q.questionType),
      text: q.questionText,
      options: q.questionType === "TITA" ? {} : parseQuestionOptions(q.options),
      marks: marksFor(ctx.paper, q.questionType, q.section),
    }));

  const initialResponses = Object.fromEntries(visible.map((q) => [q.id, response(q.id)]));
  const deadline = timing.sectional ? timing.sectionDeadline : timing.overallDeadline;
  const isLastSection = !timing.sectional || timing.currentSection >= timing.order.length - 1;
  const p = ctx.paper;

  return (
    <MockExamEngine
      key={`${attemptId}:${timing.currentSection}`}
      attemptId={attemptId}
      paperTitle={p.title}
      patternLabel={getPattern(p.examPattern).label}
      candidateName={(session.name as string) || (session.username as string) || "Candidate"}
      sectional={timing.sectional}
      currentSectionIndex={timing.currentSection}
      isLastSection={isLastSection}
      canSubmitSectionEarly={pattern.canSubmitSectionEarly}
      canSubmitEarly={pattern.canSubmitEarly}
      linear={pattern.navigation === "linear"}
      calculator={pattern.calculator}
      instructions={patternInstructions(pattern)}
      sections={sections}
      questions={visible}
      initialResponses={initialResponses}
      deadline={deadline ? deadline.toISOString() : null}
      serverNow={new Date().toISOString()}
    />
  );
}
