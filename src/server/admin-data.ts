// Read models for the admin panel: overview, analytics, results and the live proctor.
// Not a "use server" module — call it from server components or from actions that check the admin session.
// Scores are re-used exactly as stored at submission; percentages use each paper's maximum marks
// (every question answered correctly), and question-level stats are re-checked against the current answer key.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeTiming } from "@/lib/attempt-timing";
import { getPattern, isAnswerCorrect, isAnswered, marksFor, resolvePaperSections, sectionKey, type PaperMarks } from "@/lib/exam-patterns";
import { finalizeAttempt } from "@/server/attempts";
import { ADMIN_TIME_ZONE, dayKey, formatShortDay } from "@/lib/admin-format";
import { themeForPaper, type ExamTheme } from "@/lib/exam-theme";

export const COMPLETED = ["SUBMITTED", "AUTO_SUBMITTED"];
/** A practice session counts as live only while the student has done something recently. */
export const PRACTICE_ACTIVE_MINUTES = 30;

const paperMarksSelect = {
  id: true,
  correctMarks: true,
  incorrectMarks: true,
  unattemptedMarks: true,
  titaCorrectMarks: true,
  titaIncorrectMarks: true,
  sectionConfig: true,
} as const;

/** Highest possible score per paper and its question count. */
export async function paperTotals(paperIds?: string[]): Promise<Map<string, { maxMarks: number; questions: number }>> {
  const where = paperIds ? { id: { in: paperIds } } : undefined;
  const [papers, counts] = await Promise.all([
    prisma.paper.findMany({ where, select: paperMarksSelect }),
    prisma.question.groupBy({
      // Section too: some papers give a section its own marks.
      by: ["paperId", "questionType", "section"],
      where: paperIds ? { paperId: { in: paperIds } } : undefined,
      _count: { _all: true },
    }),
  ]);
  const marks = new Map<string, PaperMarks>(papers.map((p) => [p.id, p]));
  const out = new Map<string, { maxMarks: number; questions: number }>();
  for (const c of counts) {
    const p = marks.get(c.paperId);
    if (!p) continue;
    const cur = out.get(c.paperId) ?? { maxMarks: 0, questions: 0 };
    cur.maxMarks += c._count._all * marksFor(p, c.questionType, c.section).correct;
    cur.questions += c._count._all;
    out.set(c.paperId, cur);
  }
  return out;
}

export function percentOf(score: number | null, maxMarks: number | undefined): number | null {
  if (score === null || !maxMarks || maxMarks <= 0) return null;
  return (score / maxMarks) * 100;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Live sessions: running mocks still inside their time, plus practice sessions with recent activity. */
export async function countLive(now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - PRACTICE_ACTIVE_MINUTES * 60_000);
  const [mock, practice] = await Promise.all([
    prisma.attempt.count({ where: { status: "IN_PROGRESS", mode: "MOCK", OR: [{ endsAt: null }, { endsAt: { gt: now } }] } }),
    prisma.attempt.count({
      where: { status: "IN_PROGRESS", mode: "PRACTICE", OR: [{ startedAt: { gte: since } }, { answers: { some: { answeredAt: { gte: since } } } }] },
    }),
  ]);
  return mock + practice;
}

/** Started and completed attempts per Indian-time day for the last `days` days (oldest first). */
async function dailyActivity(days: number, now: Date) {
  const since = new Date(now.getTime() - days * 86_400_000);
  const rows = await prisma.$queryRaw<{ day: string; started: number; completed: number }[]>`
    SELECT to_char(("startedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${ADMIN_TIME_ZONE}, 'YYYY-MM-DD') AS day,
           count(*)::int AS started,
           count(*) FILTER (WHERE "status" <> 'IN_PROGRESS')::int AS completed
    FROM "Attempt"
    WHERE "startedAt" >= ${since}
      AND "userId" IN (SELECT "id" FROM "User" WHERE "role" = 'STUDENT')
    GROUP BY 1`;
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: { key: string; label: string; started: number; completed: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    const key = dayKey(d);
    const r = byDay.get(key);
    out.push({ key, label: formatShortDay(d), started: Number(r?.started ?? 0), completed: Number(r?.completed ?? 0) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function getOverview() {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86_400_000);
  const d14 = new Date(now.getTime() - 14 * 86_400_000);
  const d30 = new Date(now.getTime() - 30 * 86_400_000);

  // Everything in one parallel batch; the paper tables are small, so totals and titles are loaded whole.
  const [countRows, live, daily, completedMocks, recent, totals, paperTitles] = await Promise.all([
    // All the headline counts in one round trip. Attempt counts cover student accounts only, so the
    // admin's own test runs don't inflate them.
    prisma.$queryRaw<Record<string, number>[]>`
      WITH sa AS (SELECT a.* FROM "Attempt" a JOIN "User" u ON u."id" = a."userId" WHERE u."role" = 'STUDENT')
      SELECT
        (SELECT count(*) FROM "User" WHERE "role" = 'STUDENT')::int AS "students",
        (SELECT count(*) FROM "User" WHERE "role" = 'STUDENT' AND "isActive")::int AS "activeStudents",
        (SELECT count(*) FROM "Paper")::int AS "papers",
        (SELECT count(*) FROM "Paper" p JOIN "Exam" e ON e."id" = p."examId" WHERE p."isActive" AND e."isActive")::int AS "publishedPapers",
        (SELECT count(*) FROM "Question")::int AS "questions",
        (SELECT count(*) FROM "Exam")::int AS "exams",
        (SELECT count(*) FROM sa)::int AS "attempts",
        (SELECT count(*) FROM sa WHERE "status" IN ('SUBMITTED', 'AUTO_SUBMITTED'))::int AS "completed",
        (SELECT count(*) FROM sa WHERE "startedAt" >= ${d7})::int AS "started7",
        (SELECT count(*) FROM sa WHERE "startedAt" >= ${d14} AND "startedAt" < ${d7})::int AS "startedPrev7",
        (SELECT count(DISTINCT "userId") FROM sa WHERE "startedAt" >= ${d30})::int AS "activeStudents30"`,
    countLive(now),
    dailyActivity(30, now),
    prisma.attempt.findMany({
      where: { status: { in: COMPLETED }, mode: "MOCK", user: { role: "STUDENT" } },
      select: { paperId: true, score: true, accuracy: true, timeTaken: true },
    }),
    prisma.attempt.findMany({
      where: { user: { role: "STUDENT" } },
      take: 8,
      orderBy: { startedAt: "desc" },
      select: {
        id: true, mode: true, status: true, score: true, accuracy: true, startedAt: true, paperId: true,
        user: { select: { name: true, email: true } },
        paper: { select: { title: true, examPattern: true, exam: { select: { name: true } } } },
      },
    }),
    paperTotals(),
    prisma.paper.findMany({ select: { id: true, title: true, isActive: true, examPattern: true, exam: { select: { id: true, name: true, slug: true, isActive: true } } } }),
  ]);

  const c = Object.fromEntries(Object.entries(countRows[0] ?? {}).map(([k, v]) => [k, Number(v ?? 0)]));
  const { students, activeStudents, papers, publishedPapers, questions, exams, attempts, completed, started7, startedPrev7, activeStudents30 } = c;
  const pcts = completedMocks.map((a) => percentOf(a.score, totals.get(a.paperId)?.maxMarks)).filter((x): x is number => x !== null);
  const accs = completedMocks.map((a) => a.accuracy).filter((x): x is number => x !== null);

  // Most-taken papers (completed mocks).
  const byPaper = new Map<string, { count: number; pcts: number[] }>();
  for (const a of completedMocks) {
    const e = byPaper.get(a.paperId) ?? { count: 0, pcts: [] };
    e.count++;
    const p = percentOf(a.score, totals.get(a.paperId)?.maxMarks);
    if (p !== null) e.pcts.push(p);
    byPaper.set(a.paperId, e);
  }
  const topIds = [...byPaper.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 5);
  const paperById = new Map(paperTitles.map((p) => [p.id, p]));

  // Per exam: papers (published / all) and completed student mocks, for the exam tiles.
  const examMap = new Map<string, { id: string; name: string; slug: string; theme: ExamTheme; papers: number; published: number; mocks: number }>();
  for (const p of paperTitles) {
    const e = examMap.get(p.exam.id) ?? { id: p.exam.id, name: p.exam.name, slug: p.exam.slug, theme: themeForPaper(p, p.exam.name), papers: 0, published: 0, mocks: 0 };
    e.papers++;
    if (p.isActive && p.exam.isActive) e.published++;
    examMap.set(p.exam.id, e);
  }
  for (const a of completedMocks) {
    const p = paperById.get(a.paperId);
    const e = p && examMap.get(p.exam.id);
    if (e) e.mocks++;
  }

  return {
    counts: { students, activeStudents, papers, publishedPapers, questions, exams, attempts, completed, live, activeStudents30 },
    trend: { started7, startedPrev7 },
    mocks: { count: completedMocks.length, avgPercent: mean(pcts), avgAccuracy: mean(accs), avgTime: mean(completedMocks.map((a) => a.timeTaken).filter((x): x is number => x !== null)) },
    daily,
    exams: [...examMap.values()].sort((a, b) => b.published - a.published || a.name.localeCompare(b.name)),
    topPapers: topIds.map(([id, e]) => {
      const p = paperById.get(id);
      return { id, title: p?.title ?? "Deleted paper", examName: p?.exam.name ?? "", theme: p ? themeForPaper(p, p.exam.name) : ("main" as ExamTheme), attempts: e.count, avgPercent: mean(e.pcts) };
    }),
    recent: recent.map((a) => ({ ...a, theme: themeForPaper(a.paper, a.paper.exam.name), percent: percentOf(a.score, totals.get(a.paperId)?.maxMarks) })),
  };
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface AnalyticsFilter {
  paperId?: string;
  mode?: "MOCK" | "PRACTICE" | "ALL";
  days?: number; // 0 = all time
}

export async function getAnalytics(filter: AnalyticsFilter) {
  const now = new Date();
  const mode = filter.mode ?? "MOCK";
  const base: Prisma.AttemptWhereInput = {
    // Student accounts only: an admin trying out a paper is not student performance.
    user: { role: "STUDENT" },
    ...(mode !== "ALL" ? { mode } : {}),
    ...(filter.days ? { startedAt: { gte: new Date(now.getTime() - filter.days * 86_400_000) } } : {}),
  };

  const [completed, startedByPaper, paperList, totals] = await Promise.all([
    prisma.attempt.findMany({
      where: { ...base, status: { in: COMPLETED } },
      select: { id: true, userId: true, paperId: true, score: true, accuracy: true, timeTaken: true, submittedAt: true, startedAt: true, correct: true, incorrect: true, unattempted: true },
      orderBy: { submittedAt: "desc" },
    }),
    prisma.attempt.groupBy({ by: ["paperId"], where: base, _count: { _all: true } }),
    prisma.paper.findMany({
      select: { id: true, title: true, year: true, isActive: true, exam: { select: { name: true } } },
      orderBy: [{ year: "desc" }, { title: "asc" }],
    }),
    paperTotals(),
  ]);

  const paperInfo = new Map(paperList.map((p) => [p.id, p]));
  const startedCount = new Map(startedByPaper.map((s) => [s.paperId, s._count._all]));
  const pct = (a: { score: number | null; paperId: string }) => percentOf(a.score, totals.get(a.paperId)?.maxMarks);

  // Per paper
  const groups = new Map<string, typeof completed>();
  for (const a of completed) groups.set(a.paperId, [...(groups.get(a.paperId) ?? []), a]);
  const papers = [...new Set([...groups.keys(), ...startedCount.keys()])]
    .map((id) => {
      const list = groups.get(id) ?? [];
      const ps = list.map(pct).filter((x): x is number => x !== null);
      return {
        id,
        title: paperInfo.get(id)?.title ?? "Deleted paper",
        exam: paperInfo.get(id)?.exam.name ?? "",
        published: paperInfo.get(id)?.isActive ?? false,
        maxMarks: totals.get(id)?.maxMarks ?? 0,
        started: startedCount.get(id) ?? list.length,
        completed: list.length,
        students: new Set(list.map((a) => a.userId)).size,
        avgScore: mean(list.map((a) => a.score).filter((x): x is number => x !== null)),
        avgPercent: mean(ps),
        bestPercent: ps.length ? Math.max(...ps) : null,
        avgAccuracy: mean(list.map((a) => a.accuracy).filter((x): x is number => x !== null)),
        avgTime: mean(list.map((a) => a.timeTaken).filter((x): x is number => x !== null)),
      };
    })
    .sort((a, b) => b.completed - a.completed || b.started - a.started);

  // Per student
  const userIds = [...new Set(completed.map((a) => a.userId))];
  const users = new Map(
    (await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u])
  );
  const students = userIds
    .map((uid) => {
      const list = completed.filter((a) => a.userId === uid);
      const ps = list.map(pct).filter((x): x is number => x !== null);
      return {
        id: uid,
        name: users.get(uid)?.name ?? "Deleted user",
        email: users.get(uid)?.email ?? "",
        attempts: list.length,
        papers: new Set(list.map((a) => a.paperId)).size,
        avgPercent: mean(ps),
        bestPercent: ps.length ? Math.max(...ps) : null,
        avgAccuracy: mean(list.map((a) => a.accuracy).filter((x): x is number => x !== null)),
        lastActive: list.reduce<Date | null>((m, a) => {
          const t = a.submittedAt ?? a.startedAt;
          return !m || t > m ? t : m;
        }, null),
      };
    })
    .sort((a, b) => (b.avgPercent ?? -Infinity) - (a.avgPercent ?? -Infinity));

  const allPcts = completed.map(pct).filter((x): x is number => x !== null);
  const summary = {
    completed: completed.length,
    started: [...startedCount.values()].reduce((a, b) => a + b, 0),
    students: userIds.length,
    avgPercent: mean(allPcts),
    avgAccuracy: mean(completed.map((a) => a.accuracy).filter((x): x is number => x !== null)),
    avgTime: mean(completed.map((a) => a.timeTaken).filter((x): x is number => x !== null)),
  };

  const paperOptions = paperList.map((p) => ({ id: p.id, label: p.title, exam: p.exam.name }));
  const detail = filter.paperId ? await paperDetail(filter.paperId, completed.filter((a) => a.paperId === filter.paperId), totals.get(filter.paperId)?.maxMarks ?? 0, users) : null;

  return { mode, summary, papers, students, paperOptions, detail };
}

async function paperDetail(
  paperId: string,
  attempts: { id: string; userId: string; score: number | null; accuracy: number | null; timeTaken: number | null; submittedAt: Date | null; startedAt: Date }[],
  maxMarks: number,
  knownUsers: Map<string, { id: string; name: string; email: string }>
) {
  const paper = await prisma.paper.findUnique({
    where: { id: paperId },
    select: { ...paperMarksSelect, title: true, examPattern: true, sectionConfig: true, durationSeconds: true, exam: { select: { name: true } } },
  });
  if (!paper) return null;
  const [questions, answers] = await Promise.all([
    prisma.question.findMany({
      where: { paperId },
      select: { id: true, questionNumber: true, section: true, questionType: true, correctAnswer: true, topic: true },
      orderBy: [{ questionNumber: "asc" }, { id: "asc" }],
    }),
    attempts.length
      ? prisma.attemptAnswer.findMany({ where: { attemptId: { in: attempts.map((a) => a.id) } }, select: { attemptId: true, questionId: true, selectedAnswer: true } })
      : Promise.resolve([]),
  ]);

  const n = attempts.length;
  const qStats = new Map(questions.map((q) => [q.id, { attempted: 0, correct: 0, wrong: new Map<string, number>() }]));
  const qById = new Map(questions.map((q) => [q.id, q]));
  for (const a of answers) {
    const s = qStats.get(a.questionId);
    const q = qById.get(a.questionId);
    if (!s || !q || !isAnswered(a.selectedAnswer)) continue;
    s.attempted++;
    if (isAnswerCorrect(q.questionType, q.correctAnswer, a.selectedAnswer)) s.correct++;
    else {
      const key = String(a.selectedAnswer).trim().toUpperCase();
      s.wrong.set(key, (s.wrong.get(key) ?? 0) + 1);
    }
  }

  const questionRows = questions.map((q) => {
    const s = qStats.get(q.id)!;
    const topWrong = [...s.wrong.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      id: q.id,
      number: q.questionNumber,
      section: sectionKey(q.section),
      type: q.questionType,
      answer: q.correctAnswer,
      attemptRate: n ? (s.attempted / n) * 100 : null,
      accuracy: s.attempted ? (s.correct / s.attempted) * 100 : null,
      correctRate: n ? (s.correct / n) * 100 : null,
      topWrong: topWrong ? { answer: topWrong[0], count: topWrong[1] } : null,
    };
  });

  // Sections in exam order.
  const sections = resolvePaperSections(paper, questions).map((sec) => {
    const qs = questions.filter((q) => sectionKey(q.section) === sec.name);
    let attempted = 0;
    let correct = 0;
    let marks = 0;
    for (const q of qs) {
      const s = qStats.get(q.id)!;
      const m = marksFor(paper, q.questionType, q.section);
      attempted += s.attempted;
      correct += s.correct;
      marks += s.correct * m.correct + (s.attempted - s.correct) * m.incorrect;
    }
    const max = qs.reduce((t, q) => t + marksFor(paper, q.questionType, q.section).correct, 0);
    return {
      name: sec.name,
      questions: qs.length,
      attemptRate: n && qs.length ? (attempted / (n * qs.length)) * 100 : null,
      accuracy: attempted ? (correct / attempted) * 100 : null,
      avgMarks: n ? marks / n : null,
      maxMarks: max,
    };
  });

  // Score distribution in 10% bands; anything below zero goes in its own band.
  const bands = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}–${i * 10 + 10}%`, value: 0 }));
  let negative = 0;
  for (const a of attempts) {
    const p = percentOf(a.score, maxMarks);
    if (p === null) continue;
    if (p < 0) negative++;
    else bands[Math.min(9, Math.floor(p / 10))].value++;
  }

  // Best attempt per student.
  const missing = [...new Set(attempts.map((a) => a.userId))].filter((id) => !knownUsers.has(id));
  if (missing.length) {
    for (const u of await prisma.user.findMany({ where: { id: { in: missing } }, select: { id: true, name: true, email: true } })) knownUsers.set(u.id, u);
  }
  const best = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) {
    const cur = best.get(a.userId);
    if (!cur || (a.score ?? -Infinity) > (cur.score ?? -Infinity)) best.set(a.userId, a);
  }
  const leaderboard = [...best.values()]
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || (a.timeTaken ?? 0) - (b.timeTaken ?? 0))
    .map((a) => ({
      attemptId: a.id,
      name: knownUsers.get(a.userId)?.name ?? "Deleted user",
      score: a.score,
      percent: percentOf(a.score, maxMarks),
      accuracy: a.accuracy,
      timeTaken: a.timeTaken,
      date: a.submittedAt ?? a.startedAt,
    }));

  return {
    paper: { id: paper.id, title: paper.title, exam: paper.exam.name, maxMarks, questions: questions.length },
    attempts: n,
    sections,
    questions: questionRows,
    distribution: [...(negative ? [{ label: "Below 0", value: negative }] : []), ...bands],
    leaderboard,
  };
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface ResultsFilter {
  q?: string;
  paperId?: string;
  status?: "COMPLETED" | "IN_PROGRESS" | "ALL";
  mode?: "MOCK" | "PRACTICE" | "ALL";
  page?: number;
}
export const RESULTS_PAGE_SIZE = 25;

export async function getResults(f: ResultsFilter) {
  const where: Prisma.AttemptWhereInput = {
    ...(f.paperId ? { paperId: f.paperId } : {}),
    ...(f.mode && f.mode !== "ALL" ? { mode: f.mode } : {}),
    ...(f.status === "COMPLETED" ? { status: { in: COMPLETED } } : f.status === "IN_PROGRESS" ? { status: "IN_PROGRESS" } : {}),
    ...(f.q
      ? {
          user: {
            OR: [
              { name: { contains: f.q, mode: "insensitive" } },
              { email: { contains: f.q, mode: "insensitive" } },
              { username: { contains: f.q, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };
  const page = Math.max(1, f.page ?? 1);
  const [total, rows, paperOptions, totals] = await Promise.all([
    prisma.attempt.count({ where }),
    prisma.attempt.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * RESULTS_PAGE_SIZE,
      take: RESULTS_PAGE_SIZE,
      select: {
        id: true, mode: true, status: true, score: true, correct: true, incorrect: true, unattempted: true, accuracy: true,
        timeTaken: true, startedAt: true, submittedAt: true, paperId: true,
        user: { select: { name: true, email: true } },
        paper: { select: { title: true, exam: { select: { name: true } } } },
      },
    }),
    prisma.paper.findMany({ select: { id: true, title: true }, orderBy: [{ year: "desc" }, { title: "asc" }] }),
    paperTotals(),
  ]);
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / RESULTS_PAGE_SIZE)),
    rows: rows.map((r) => ({ ...r, maxMarks: totals.get(r.paperId)?.maxMarks ?? null, percent: percentOf(r.score, totals.get(r.paperId)?.maxMarks) })),
    paperOptions,
  };
}

// ---------------------------------------------------------------------------
// Live proctor
// ---------------------------------------------------------------------------

export interface LiveSession {
  id: string;
  mode: string;
  student: { name: string; handle: string };
  paper: { id: string; title: string; exam: string };
  startedAt: string;
  lastActivity: string;
  totalQuestions: number;
  visited: number;
  answered: number;
  marked: number;
  correct: number;
  incorrect: number;
  provisionalScore: number;
  maxMarks: number;
  sectional: boolean;
  section: { name: string; index: number; count: number; answered: number; questions: number } | null;
  sectionDeadline: string | null;
  overallDeadline: string | null;
}

export interface LiveSnapshot {
  serverNow: string;
  live: LiveSession[];
  idlePractice: LiveSession[];
  recent: {
    id: string;
    student: string;
    paper: string;
    mode: string;
    status: string;
    score: number | null;
    percent: number | null;
    accuracy: number | null;
    timeTaken: number | null;
    submittedAt: string | null;
  }[];
  autoClosed: number;
}

function recentCompleted(now: Date) {
  return prisma.attempt.findMany({
    where: { status: { in: COMPLETED }, submittedAt: { gte: new Date(now.getTime() - 86_400_000) } },
    orderBy: { submittedAt: "desc" },
    take: 20,
    select: {
      id: true, mode: true, status: true, score: true, accuracy: true, timeTaken: true, submittedAt: true, paperId: true,
      user: { select: { name: true } },
      paper: { select: { title: true } },
    },
  });
}

export async function getLiveSnapshot(): Promise<LiveSnapshot> {
  const now = new Date();
  const [running, recentFirst, totals] = await Promise.all([
    prisma.attempt.findMany({
      where: { status: "IN_PROGRESS" },
      orderBy: { startedAt: "desc" },
      include: {
        user: { select: { name: true, username: true, email: true } },
        paper: { select: { ...paperMarksSelect, title: true, examPattern: true, sectionConfig: true, durationSeconds: true, exam: { select: { name: true } } } },
      },
    }),
    recentCompleted(now),
    paperTotals(),
  ]);

  const paperIds = [...new Set(running.map((a) => a.paperId))];
  const [questions, answers] = await Promise.all([
    paperIds.length
      ? prisma.question.findMany({ where: { paperId: { in: paperIds } }, select: { id: true, paperId: true, section: true, questionNumber: true, questionType: true, correctAnswer: true } })
      : Promise.resolve([]),
    running.length
      ? prisma.attemptAnswer.findMany({
          where: { attemptId: { in: running.map((a) => a.id) } },
          select: { attemptId: true, questionId: true, selectedAnswer: true, markedForReview: true, answeredAt: true },
        })
      : Promise.resolve([]),
  ]);
  const qByPaper = new Map<string, typeof questions>();
  for (const q of questions) qByPaper.set(q.paperId, [...(qByPaper.get(q.paperId) ?? []), q]);
  const aByAttempt = new Map<string, typeof answers>();
  for (const a of answers) aByAttempt.set(a.attemptId, [...(aByAttempt.get(a.attemptId) ?? []), a]);

  const live: LiveSession[] = [];
  const idlePractice: LiveSession[] = [];
  let autoClosed = 0;
  const practiceCutoff = now.getTime() - PRACTICE_ACTIVE_MINUTES * 60_000;

  for (const att of running) {
    const { paper, user } = att;
    const qs = qByPaper.get(paper.id) ?? [];
    const sections = resolvePaperSections(paper, qs);
    const { state } = computeTiming(att, sections, getPattern(paper.examPattern), now);

    // Time is over but the student never came back: close it the same way the exam screen would.
    if (att.mode === "MOCK" && state.finished) {
      await finalizeAttempt(att.id, "AUTO_SUBMITTED", state.overallDeadline);
      autoClosed++;
      continue;
    }

    const qMap = new Map(qs.map((q) => [q.id, q]));
    const ans = aByAttempt.get(att.id) ?? [];
    let answered = 0, marked = 0, correct = 0, incorrect = 0, score = 0;
    let lastActivity = att.startedAt;
    const openSection = state.sectional ? state.order[state.currentSection] : null;
    let sectionAnswered = 0;
    for (const a of ans) {
      if (a.answeredAt > lastActivity) lastActivity = a.answeredAt;
      if (a.markedForReview) marked++;
      const q = qMap.get(a.questionId);
      if (!q || !isAnswered(a.selectedAnswer)) continue;
      answered++;
      if (openSection && sectionKey(q.section) === openSection) sectionAnswered++;
      const m = marksFor(paper, q.questionType, q.section);
      if (isAnswerCorrect(q.questionType, q.correctAnswer, a.selectedAnswer)) {
        correct++;
        score += m.correct;
      } else {
        incorrect++;
        score += m.incorrect;
      }
    }
    const maxMarks = qs.reduce((t, q) => t + marksFor(paper, q.questionType, q.section).correct, 0);

    const session: LiveSession = {
      id: att.id,
      mode: att.mode,
      student: { name: user.name, handle: user.username || user.email },
      paper: { id: paper.id, title: paper.title, exam: paper.exam.name },
      startedAt: att.startedAt.toISOString(),
      lastActivity: lastActivity.toISOString(),
      totalQuestions: qs.length,
      visited: ans.length,
      answered,
      marked,
      correct,
      incorrect,
      provisionalScore: Math.round(score * 100) / 100,
      maxMarks,
      sectional: state.sectional,
      section: openSection
        ? {
            name: openSection,
            index: state.currentSection,
            count: state.order.length,
            answered: sectionAnswered,
            questions: qs.filter((q) => sectionKey(q.section) === openSection).length,
          }
        : null,
      sectionDeadline: state.sectionDeadline?.toISOString() ?? null,
      overallDeadline: state.overallDeadline?.toISOString() ?? null,
    };
    if (att.mode === "PRACTICE" && lastActivity.getTime() < practiceCutoff) idlePractice.push(session);
    else live.push(session);
  }

  // Tests closed just now belong in the finished list too.
  const recentRows = autoClosed ? await recentCompleted(now) : recentFirst;

  return {
    serverNow: now.toISOString(),
    live,
    idlePractice,
    recent: recentRows.map((r) => ({
      id: r.id,
      student: r.user.name,
      paper: r.paper.title,
      mode: r.mode,
      status: r.status,
      score: r.score,
      percent: percentOf(r.score, totals.get(r.paperId)?.maxMarks),
      accuracy: r.accuracy,
      timeTaken: r.timeTaken,
      submittedAt: r.submittedAt?.toISOString() ?? null,
    })),
    autoClosed,
  };
}

/** Everything the inspector needs for one attempt: questions (no explanations), responses and the clock. */
export async function getInspectData(attemptId: string) {
  const att = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      user: { select: { name: true, username: true, email: true } },
      paper: { select: { ...paperMarksSelect, title: true, examPattern: true, sectionConfig: true, durationSeconds: true, exam: { select: { name: true } } } },
      answers: { select: { questionId: true, selectedAnswer: true, markedForReview: true, answeredAt: true } },
    },
  });
  if (!att) return null;
  const questions = await prisma.question.findMany({
    where: { paperId: att.paperId },
    select: { id: true, questionNumber: true, section: true, questionType: true, questionText: true, options: true, correctAnswer: true },
    orderBy: [{ questionNumber: "asc" }, { id: "asc" }],
  });
  const sections = resolvePaperSections(att.paper, questions);
  const { state } = computeTiming(att, sections, getPattern(att.paper.examPattern), new Date());
  const byQ = new Map(att.answers.map((a) => [a.questionId, a]));
  return {
    id: att.id,
    status: att.status,
    mode: att.mode,
    student: { name: att.user.name, handle: att.user.username || att.user.email },
    paper: { title: att.paper.title, exam: att.paper.exam.name },
    sectionOrder: state.order,
    openSection: att.status === "IN_PROGRESS" && state.sectional ? state.order[state.currentSection] ?? null : null,
    questions: questions.map((q) => {
      const a = byQ.get(q.id);
      const answered = isAnswered(a?.selectedAnswer);
      return {
        id: q.id,
        number: q.questionNumber,
        section: sectionKey(q.section),
        type: q.questionType,
        text: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        visited: !!a,
        selected: answered ? String(a!.selectedAnswer) : null,
        marked: !!a?.markedForReview,
        correct: answered ? isAnswerCorrect(q.questionType, q.correctAnswer, a!.selectedAnswer) : null,
        answeredAt: a?.answeredAt.toISOString() ?? null,
      };
    }),
  };
}
