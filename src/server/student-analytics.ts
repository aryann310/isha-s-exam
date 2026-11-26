// A student's performance across their finished tests: totals, score trend, and breakdowns by section,
// difficulty, question type and topic. Scored the same way as the result page (current answer key and marks).
import { prisma } from "@/lib/prisma";
import { isAnswerCorrect, isAnswered, marksFor, sectionKey } from "@/lib/exam-patterns";
import { isSurprisePaper } from "@/lib/surprise";

export type TestKind = "mock" | "practice" | "surprise";
export const TEST_KINDS: TestKind[] = ["mock", "practice", "surprise"];
export const KIND_LABEL: Record<TestKind, string> = { mock: "Mock test", practice: "Practice", surprise: "Surprise test" };

export interface AnalyticsFilter {
  /** Exam slug, or null for all exams. */
  exam: string | null;
  kind: TestKind | null;
}

export interface Bucket {
  key: string;
  total: number;
  attempted: number;
  correct: number;
  wrong: number;
  /** Net marks from these questions. */
  marks: number;
  /** Marks lost to wrong answers (a positive number). */
  lost: number;
}

export interface TestRow {
  attemptId: string;
  date: Date;
  paperTitle: string;
  examName: string;
  examSlug: string;
  kind: TestKind;
  score: number;
  maxMarks: number;
  percent: number | null;
  total: number;
  attempted: number;
  correct: number;
  wrong: number;
  accuracy: number | null;
  attemptRate: number;
  secondsPerAttempted: number | null;
  /** Time used and the paper's time, in seconds (null when not recorded). */
  timeTakenSec: number | null;
  durationSec: number;
}

export interface StudentAnalytics {
  exams: Array<{ slug: string; name: string }>;
  tests: TestRow[];
  overall: Bucket & { accuracy: number | null; attemptRate: number | null; avgPercent: number | null; bestPercent: number | null; secondsPerAttempted: number | null };
  sections: Bucket[];
  difficulty: Bucket[];
  types: Bucket[];
  topics: Bucket[];
  /** Questions skipped in a test and answered afterwards in the untimed phase. */
  untimed: { answered: number; correct: number; marksMissed: number };
  /** Identifies the tests covered (count + newest attempt), used to tell when saved advice is out of date. */
  basis: string;
}

const empty = (key: string): Bucket => ({ key, total: 0, attempted: 0, correct: 0, wrong: 0, marks: 0, lost: 0 });
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
const round = (n: number) => Math.round(n * 100) / 100;

export function kindOf(a: { mode: string; paper: { examPattern: string } }): TestKind {
  if (isSurprisePaper(a.paper)) return "surprise";
  return a.mode === "MOCK" ? "mock" : "practice";
}

function normDifficulty(d: string | null): string | null {
  const t = (d ?? "").trim().toLowerCase();
  if (!t) return null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export async function getStudentAnalytics(userId: string, filter: AnalyticsFilter): Promise<StudentAnalytics> {
  const all = await prisma.attempt.findMany({
    where: { userId, status: { not: "IN_PROGRESS" } },
    orderBy: { startedAt: "asc" },
    select: {
      id: true,
      mode: true,
      startedAt: true,
      submittedAt: true,
      timeTaken: true,
      paperId: true,
      paper: {
        select: {
          title: true,
          examPattern: true,
          durationSeconds: true,
          correctMarks: true,
          incorrectMarks: true,
          unattemptedMarks: true,
          titaCorrectMarks: true,
          titaIncorrectMarks: true,
          sectionConfig: true,
          exam: { select: { name: true, slug: true } },
        },
      },
      answers: { select: { questionId: true, selectedAnswer: true } },
      untimedAnswers: { select: { questionId: true, selectedAnswer: true } },
    },
  });

  const exams = [...new Map(all.map((a) => [a.paper.exam.slug, { slug: a.paper.exam.slug, name: a.paper.exam.name }])).values()];
  const attempts = all.filter((a) => (!filter.exam || a.paper.exam.slug === filter.exam) && (!filter.kind || kindOf(a) === filter.kind));

  const questions = await prisma.question.findMany({
    where: { paperId: { in: [...new Set(attempts.map((a) => a.paperId))] } },
    select: { id: true, paperId: true, section: true, topic: true, difficulty: true, questionType: true, correctAnswer: true },
  });
  const byPaper = new Map<string, typeof questions>();
  for (const q of questions) byPaper.set(q.paperId, [...(byPaper.get(q.paperId) ?? []), q]);

  const multiExam = new Set(attempts.map((a) => a.paper.exam.slug)).size > 1;
  const overall = empty("all");
  const sections = new Map<string, Bucket>();
  const difficulty = new Map<string, Bucket>();
  const types = new Map<string, Bucket>();
  const topics = new Map<string, Bucket>();
  const untimed = { answered: 0, correct: 0, marksMissed: 0 };
  const tests: TestRow[] = [];
  let timedSeconds = 0;
  let timedAttempted = 0;

  const add = (map: Map<string, Bucket>, key: string, f: (b: Bucket) => void) => {
    const b = map.get(key) ?? empty(key);
    f(b);
    map.set(key, b);
  };

  for (const a of attempts) {
    const answerBy = new Map(a.answers.map((x) => [x.questionId, x.selectedAnswer]));
    const untimedBy = new Map(a.untimedAnswers.map((x) => [x.questionId, x.selectedAnswer]));
    const row = { total: 0, attempted: 0, correct: 0, wrong: 0, score: 0, maxMarks: 0 };

    for (const q of byPaper.get(a.paperId) ?? []) {
      const m = marksFor(a.paper, q.questionType, q.section);
      const sel = answerBy.get(q.id);
      const attempted = isAnswered(sel);
      const right = attempted && isAnswerCorrect(q.questionType, q.correctAnswer, sel);
      const marks = !attempted ? a.paper.unattemptedMarks : right ? m.correct : m.incorrect;
      const lost = attempted && !right ? Math.abs(m.incorrect) : 0;
      row.total++;
      row.maxMarks += m.correct;
      row.score += marks;
      if (attempted) row.attempted++;
      if (right) row.correct++;
      if (attempted && !right) row.wrong++;

      const tally = (b: Bucket) => {
        b.total++;
        if (attempted) b.attempted++;
        if (right) b.correct++;
        if (attempted && !right) b.wrong++;
        b.marks += marks;
        b.lost += lost;
      };
      tally(overall);
      const sec = sectionKey(q.section);
      add(sections, multiExam ? `${a.paper.exam.name} · ${sec}` : sec, tally);
      const d = normDifficulty(q.difficulty);
      if (d) add(difficulty, d, tally);
      add(types, q.questionType === "TITA" ? "Typed answer (TITA)" : "Multiple choice", tally);
      const t = (q.topic ?? "").trim();
      if (t) add(topics, t, tally);

      const later = untimedBy.get(q.id);
      if (!attempted && later) {
        untimed.answered++;
        if (isAnswerCorrect(q.questionType, q.correctAnswer, later)) {
          untimed.correct++;
          untimed.marksMissed += m.correct;
        }
      }
    }

    const kind = kindOf(a);
    const secs = a.timeTaken && row.attempted > 0 ? a.timeTaken / row.attempted : null;
    if (secs !== null) {
      timedSeconds += a.timeTaken ?? 0;
      timedAttempted += row.attempted;
    }
    tests.push({
      attemptId: a.id,
      date: a.submittedAt ?? a.startedAt,
      paperTitle: a.paper.title,
      examName: a.paper.exam.name,
      examSlug: a.paper.exam.slug,
      kind,
      score: round(row.score),
      maxMarks: round(row.maxMarks),
      percent: pct(row.score, row.maxMarks),
      total: row.total,
      attempted: row.attempted,
      correct: row.correct,
      wrong: row.wrong,
      accuracy: pct(row.correct, row.attempted),
      attemptRate: pct(row.attempted, row.total) ?? 0,
      secondsPerAttempted: secs,
      timeTakenSec: a.timeTaken ?? null,
      durationSec: a.paper.durationSeconds,
    });
  }

  const percents = tests.map((t) => t.percent).filter((p): p is number => p !== null);
  const sortBuckets = (m: Map<string, Bucket>) => [...m.values()].map((b) => ({ ...b, marks: round(b.marks), lost: round(b.lost) }));
  const newest = attempts[attempts.length - 1];

  return {
    exams,
    tests,
    overall: {
      ...overall,
      marks: round(overall.marks),
      lost: round(overall.lost),
      accuracy: pct(overall.correct, overall.attempted),
      attemptRate: pct(overall.attempted, overall.total),
      avgPercent: percents.length ? percents.reduce((x, y) => x + y, 0) / percents.length : null,
      bestPercent: percents.length ? Math.max(...percents) : null,
      secondsPerAttempted: timedAttempted > 0 ? timedSeconds / timedAttempted : null,
    },
    sections: sortBuckets(sections),
    difficulty: sortBuckets(difficulty).sort((x, y) => ["Easy", "Medium", "Hard"].indexOf(x.key) - ["Easy", "Medium", "Hard"].indexOf(y.key)),
    types: sortBuckets(types),
    topics: sortBuckets(topics),
    untimed: { ...untimed, marksMissed: round(untimed.marksMissed) },
    basis: `${attempts.length}:${newest?.id ?? "none"}`,
  };
}

/** Accuracy of a bucket in percent (null when nothing was attempted). */
export const accuracyOf = (b: Bucket) => pct(b.correct, b.attempted);
/** Share of questions attempted, in percent. */
export const attemptRateOf = (b: Bucket) => pct(b.attempted, b.total) ?? 0;

/** Topics attempted at least `min` times with accuracy under 60%, weakest first. */
export function weakestTopics(topics: Bucket[], min = 3, n = 5) {
  return topics
    .filter((t) => t.attempted >= min && (accuracyOf(t) ?? 0) < 60)
    .sort((a, b) => (accuracyOf(a) ?? 0) - (accuracyOf(b) ?? 0) || b.lost - a.lost)
    .slice(0, n);
}
/** Topics attempted at least `min` times with accuracy of 60% or more, strongest first. */
export function strongestTopics(topics: Bucket[], min = 3, n = 5) {
  return topics
    .filter((t) => t.attempted >= min && (accuracyOf(t) ?? 0) >= 60)
    .sort((a, b) => (accuracyOf(b) ?? 0) - (accuracyOf(a) ?? 0) || b.correct - a.correct)
    .slice(0, n);
}
