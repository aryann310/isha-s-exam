// AI coaching advice (Claude) built from a student's analytics and their recent wrong answers.
// Only performance data and question text are sent; no name, username or other personal details.
// Advice is stored per student and scope, and reused until the student finishes another test.
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { isAnswerCorrect, isAnswered, sectionKey } from "@/lib/exam-patterns";
import { parseQuestionOptions } from "@/lib/parse-markdown-questions";
import {
  accuracyOf,
  attemptRateOf,
  getStudentAnalytics,
  KIND_LABEL,
  strongestTopics,
  weakestTopics,
  type Bucket,
  type StudentAnalytics,
} from "@/server/student-analytics";

import { loadTestContext } from "@/server/test-advisor";
import { advisorKeyConfigured, anthropicClient } from "@/lib/anthropic";

export const ADVISOR_MODEL = "claude-haiku-5-5";

export interface Advice {
  headline: string;
  summary: string;
  strengths: string[];
  mistakes: Array<{ title: string; evidence: string; fix: string }>;
  nextTestPlan: Array<{ action: string; detail: string }>;
  practiceFocus: Array<{ area: string; why: string }>;
}

export interface StoredAdvice {
  advice: Advice;
  createdAt: Date;
  stale: boolean;
}

const ADVICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "strengths", "mistakes", "nextTestPlan", "practiceFocus"],
  properties: {
    headline: { type: "string", description: "One encouraging, specific sentence about where the student stands." },
    summary: { type: "string", description: "Two or three sentences: the overall picture and the single biggest lever." },
    strengths: { type: "array", items: { type: "string" }, description: "1-3 things the student does well, with numbers." },
    mistakes: {
      type: "array",
      description: "2-5 mistake patterns, most costly first.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "evidence", "fix"],
        properties: {
          title: { type: "string", description: "Short name of the pattern." },
          evidence: { type: "string", description: "What the data shows, with numbers or a specific question." },
          fix: { type: "string", description: "A concrete way to fix it." },
        },
      },
    },
    nextTestPlan: {
      type: "array",
      description: "3-5 steps for the very next test, in the order the student will use them.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "detail"],
        properties: { action: { type: "string" }, detail: { type: "string" } },
      },
    },
    practiceFocus: {
      type: "array",
      description: "2-4 areas to practise before the next test.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["area", "why"],
        properties: { area: { type: "string" }, why: { type: "string" } },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You are an experienced coach for Indian MBA entrance exams (CAT, NMAT, SNAP, CMAT and mixed "surprise" tests). You write a short coaching note for one student, based only on their own test data, which the platform gives you as JSON.

How to write it:
- Speak to the student as "you", warmly and directly. Plain, simple English: many students are not native speakers.
- Every claim must come from the data. Quote the numbers (accuracy, marks lost, attempts, time per question) and, where it helps, a specific question from the mistakes list. Never invent scores, cut-offs, percentiles or exam facts that are not in the data.
- Look for the patterns that cost the most marks: negative marking from guessing, errors on easy questions (carelessness), sections or topics with low accuracy, too few attempts, too slow a pace, and questions skipped in the test but solved later in the untimed phase (a time-management problem, not a knowledge gap).
- Use examBehaviourRecentTests when present: quick answers (and how many were right), right answers changed to wrong, leaving the test, idle stretches, and the last ten minutes. These show exam habits, not just knowledge gaps.
- When you explain a mistake from recentWrongAnswers, follow its official solution; never give a different answer or method.
- Give advice the student can act on in the next test: attempt targets, which section or question types to do first or skip on a first pass, time per question, when to guess and when not to (consider the negative marks).
- Keep each item to one or two sentences. If there is little data (for example one short test), say so briefly and keep the advice modest.`;

const clean = (s: string | null | undefined, max: number) => {
  const t = (s ?? "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "[figure]")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const r1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
const bucketJson = (b: Bucket) => ({
  name: b.key,
  questions: b.total,
  attempted: b.attempted,
  correct: b.correct,
  wrong: b.wrong,
  accuracyPct: r1(accuracyOf(b)),
  attemptRatePct: r1(attemptRateOf(b)),
  netMarks: b.marks,
  marksLostToWrong: b.lost,
});

/** Recent wrong answers (newest tests first, easy ones first) with the solution, for concrete advice. */
async function recentMistakes(a: StudentAnalytics, limit = 12) {
  const recent = [...a.tests].reverse().slice(0, 3);
  if (!recent.length) return [];
  const answers = await prisma.attemptAnswer.findMany({
    where: { attemptId: { in: recent.map((t) => t.attemptId) }, selectedAnswer: { not: null } },
    select: {
      attemptId: true,
      selectedAnswer: true,
      question: {
        select: { questionNumber: true, section: true, topic: true, difficulty: true, questionType: true, questionText: true, options: true, correctAnswer: true, explanation: true },
      },
    },
  });
  const rank = (d: string | null) => ({ easy: 0, medium: 1, hard: 2 })[(d ?? "").toLowerCase() as "easy"] ?? 1;
  const order = new Map(recent.map((t, i) => [t.attemptId, i]));
  return answers
    .filter((x) => isAnswered(x.selectedAnswer) && !isAnswerCorrect(x.question.questionType, x.question.correctAnswer, x.selectedAnswer))
    .sort((x, y) => (order.get(x.attemptId) ?? 0) - (order.get(y.attemptId) ?? 0) || rank(x.question.difficulty) - rank(y.question.difficulty))
    .slice(0, limit)
    .map((x) => {
      const q = x.question;
      const opts = q.questionType === "TITA" ? {} : parseQuestionOptions(q.options);
      const test = recent[order.get(x.attemptId) ?? 0];
      return {
        test: test.paperTitle,
        question: q.questionNumber,
        section: sectionKey(q.section),
        topic: q.topic || undefined,
        difficulty: q.difficulty || undefined,
        type: q.questionType,
        text: clean(q.questionText, 350),
        studentAnswer: opts[x.selectedAnswer ?? ""] ? `${x.selectedAnswer}: ${clean(opts[x.selectedAnswer ?? ""], 120)}` : x.selectedAnswer,
        correctAnswer: opts[q.correctAnswer] ? `${q.correctAnswer}: ${clean(opts[q.correctAnswer], 120)}` : q.correctAnswer,
        solution: clean(q.explanation, 300) || undefined,
      };
    });
}

export async function buildAdviceInput(a: StudentAnalytics, scopeLabel: string) {
  return {
    scope: scopeLabel,
    overall: {
      tests: a.tests.length,
      ...bucketJson(a.overall),
      averageScorePctOfMax: r1(a.overall.avgPercent),
      bestScorePctOfMax: r1(a.overall.bestPercent),
    },
    testsOldestFirst: a.tests.slice(-10).map((t) => ({
      date: t.date.toISOString().slice(0, 10),
      test: t.paperTitle,
      exam: t.examName,
      type: KIND_LABEL[t.kind],
      score: t.score,
      maxMarks: t.maxMarks,
      scorePctOfMax: r1(t.percent),
      attempted: `${t.attempted}/${t.total}`,
      accuracyPct: r1(t.accuracy),
      minutesUsed: t.timeTakenSec === null ? null : r1(t.timeTakenSec / 60),
      minutesAllowed: r1(t.durationSec / 60),
    })),
    bySection: a.sections.map(bucketJson),
    byDifficulty: a.difficulty.map(bucketJson),
    byQuestionType: a.types.map(bucketJson),
    weakestTopics: weakestTopics(a.topics).map(bucketJson),
    strongestTopics: strongestTopics(a.topics).map(bucketJson),
    untimedPhase: {
      note: "Questions the student skipped in a timed test, then answered afterwards with no time limit (not scored).",
      ...a.untimed,
    },
    examBehaviourRecentTests: await recentBehaviour(a),
    recentWrongAnswers: await recentMistakes(a),
  };
}

/** What the student did during their last few tests (from the activity log), oldest first. */
async function recentBehaviour(a: StudentAnalytics, n = 5) {
  const out = [];
  for (const t of a.tests.slice(-n)) {
    const ctx = await loadTestContext(t.attemptId, { statsOnly: true });
    if (ctx?.stats) out.push({ test: t.paperTitle, date: t.date.toISOString().slice(0, 10), ...ctx.stats });
  }
  return out.length
    ? out
    : "No activity recorded yet (activity tracking applies to tests taken from now on): time per question and clicks are not available.";
}

function parseAdvice(text: string): Advice {
  const v = JSON.parse(text) as Advice;
  if (!v || typeof v.headline !== "string" || !Array.isArray(v.mistakes) || !Array.isArray(v.nextTestPlan)) {
    throw new Error("The advice came back in an unexpected format.");
  }
  return {
    headline: v.headline,
    summary: v.summary ?? "",
    strengths: (v.strengths ?? []).filter((s) => typeof s === "string"),
    mistakes: v.mistakes.filter((m) => m && typeof m.title === "string"),
    nextTestPlan: v.nextTestPlan.filter((s) => s && typeof s.action === "string"),
    practiceFocus: (v.practiceFocus ?? []).filter((p) => p && typeof p.area === "string"),
  };
}

export function advisorConfigured(): boolean {
  return advisorKeyConfigured();
}

/** Saved advice for this scope, and whether new tests have been finished since it was written. */
export async function getStoredAdvice(userId: string, scope: string, basis: string): Promise<StoredAdvice | null> {
  const row = await prisma.advisory.findUnique({ where: { userId_scope: { userId, scope } } });
  if (!row) return null;
  try {
    return { advice: parseAdvice(row.content), createdAt: row.createdAt, stale: row.basis !== basis };
  } catch {
    return null;
  }
}

/** Writes new advice with Claude and stores it. Throws with a readable message on failure. */
export async function generateAdvice(userId: string, scope: string, scopeLabel: string): Promise<StoredAdvice> {
  if (!advisorConfigured()) throw new Error("The AI coach is not set up yet (the ANTHROPIC_API_KEY setting is missing).");
  const analytics = await getStudentAnalytics(userId, { exam: scope === "all" ? null : scope, kind: null });
  if (!analytics.tests.length) throw new Error("Finish at least one test first; the coach needs your results.");

  const input = await buildAdviceInput(analytics, scopeLabel);
  const client = anthropicClient();
  let message;
  try {
    // Claude Haiku 5.5 has no server-side refusal fallback; a refusal is handled below.
    message = await client.messages
      .stream({
        model: ADVISOR_MODEL,
        max_tokens: 16000,
        output_config: { effort: "high", format: { type: "json_schema", schema: ADVICE_SCHEMA } },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Here is the student's test data. Write their coaching note.\n\n${JSON.stringify(input)}`,
          },
        ],
      })
      .finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error("The AI coach's API key was rejected. Ask the admin to check it.");
    if (err instanceof Anthropic.RateLimitError) throw new Error("The AI coach is busy right now. Please try again in a minute.");
    if (err instanceof Anthropic.APIError) throw new Error("The AI coach could not be reached. Please try again later.");
    throw err;
  }
  if (message.stop_reason === "refusal") throw new Error("The AI coach could not write advice for this data.");
  const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const advice = parseAdvice(text);

  const data = {
    basis: analytics.basis,
    content: JSON.stringify(advice),
    model: message.model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    createdAt: new Date(),
  };
  await prisma.advisory.upsert({ where: { userId_scope: { userId, scope } }, create: { userId, scope, ...data }, update: data });
  return { advice, createdAt: data.createdAt, stale: false };
}
