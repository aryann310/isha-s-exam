// Untimed phase: after a mock test ends (submitted or auto-submitted) with questions left unanswered, the
// candidate may go on and answer those, with no time limit. The test score stays as it was; these answers are
// stored apart (UntimedAnswer) and shown separately. Solutions open once the phase is finished or skipped.
import { isAnswerCorrect, marksFor } from "@/lib/exam-patterns";

interface AttemptLike {
  mode: string;
  status: string;
  unattempted: number | null;
  untimedEndedAt: Date | null;
}

/** The test is over, questions were left, and the candidate has not finished the untimed phase yet. */
export function untimedPending(a: AttemptLike): boolean {
  return a.mode === "MOCK" && a.status !== "IN_PROGRESS" && !a.untimedEndedAt && (a.unattempted ?? 0) > 0;
}

/** Paper-list state for one student and paper, from their attempts (any order). */
export function paperProgress(attempts: Array<AttemptLike & { id: string; submittedAt: Date | null; startedAt: Date }>):
  | { kind: "continue"; attemptId: string; left: number }
  | { kind: "done" }
  | null {
  const finished = attempts
    .filter((a) => a.status !== "IN_PROGRESS")
    .sort((x, y) => (y.submittedAt ?? y.startedAt).getTime() - (x.submittedAt ?? x.startedAt).getTime());
  const latest = finished[0];
  if (!latest) return null;
  if (untimedPending(latest)) return { kind: "continue", attemptId: latest.id, left: latest.unattempted ?? 0 };
  return { kind: "done" };
}

/** Summary of the untimed answers, marked as the test would have (not added to the score). */
export function untimedSummary(
  paper: Parameters<typeof marksFor>[0],
  questions: Array<{ id: string; questionType: string; correctAnswer: string; section: string | null }>,
  answers: Array<{ questionId: string; selectedAnswer: string }>
) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  let correct = 0;
  let incorrect = 0;
  let marks = 0;
  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q) continue;
    const m = marksFor(paper, q.questionType, q.section);
    if (isAnswerCorrect(q.questionType, q.correctAnswer, a.selectedAnswer)) {
      correct++;
      marks += m.correct;
    } else {
      incorrect++;
      marks += m.incorrect;
    }
  }
  return { answered: correct + incorrect, correct, incorrect, marks: Math.round(marks * 100) / 100 };
}
