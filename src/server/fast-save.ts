// Fast path for saving mock-test responses: two database round trips per save instead of a dozen.
// Not a "use server" module: the server actions in src/server/actions/engine.ts call it.
//
// 1. One read: the signed-in user, the attempt, its paper, the paper's section layout and the question.
// 2. One write: a single statement that locks the attempt row (FOR SHARE) and upserts the answer only while
//    the attempt is still in progress, in the same section, and (for one-way papers like NMAT) only for the
//    next unanswered question. Because the lock conflicts with finalizeAttempt's FOR UPDATE, an answer is either
//    saved before scoring or refused - never stored but left out of the score.
//
// Anything unusual (a section whose time just ran out, the test ending, a refusal that needs an exact message)
// returns "fallback" so the caller runs the original, fully checked path.
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/auth/session";
import { computeTiming, SAVE_GRACE_SECONDS } from "@/lib/attempt-timing";
import { getPattern, isAnswerCorrect, isAnswered, resolvePaperSections, sectionKey } from "@/lib/exam-patterns";
import { availableOptionKeys, parseQuestionOptions } from "@/lib/parse-markdown-questions";

export type FastResult =
  | { kind: "saved" }
  | { kind: "ended" }
  | { kind: "refused"; error: string }
  | { kind: "fallback" };

/** The response in stored form: null for "no answer", undefined when it is not a valid answer to this question. */
export function cleanResponse(question: { questionType: string; options: string }, answer: string | null): string | null | undefined {
  if (answer === null) return null;
  const a = String(answer).trim();
  if (!a) return null;
  if (question.questionType === "TITA") return a.length <= 40 && /^[0-9a-zA-Z.,\-/: ]+$/.test(a) ? a : undefined;
  const k = a.toUpperCase();
  // Only letters the question actually offers (A-D, plus E on five-option papers).
  return (availableOptionKeys(parseQuestionOptions(question.options)) as string[]).includes(k) ? k : undefined;
}

/** Signed-in user id from the session cookie (signature only; the read query checks the account is active). */
async function sessionUserId(): Promise<string | null> {
  const token = (await cookies()).get("session")?.value;
  const payload = await decrypt(token);
  return payload && typeof payload.userId === "string" ? payload.userId : null;
}

interface ReadRow {
  userActive: boolean;
  userRole: string;
  id: string;
  userId: string;
  paperId: string;
  mode: string;
  status: string;
  startedAt: Date;
  endsAt: Date | null;
  sectionOrder: string | null;
  currentSection: number;
  sectionStartedAt: Date | null;
  sectionExtraSeconds: number;
  examPattern: string;
  sectionConfig: string | null;
  durationSeconds: number;
  sections: Array<{ section: string; questionNumber: number }> | null;
  qId: string | null;
  qSection: string | null;
  qType: string | null;
  qCorrect: string | null;
  qOptions: string | null;
  qNumber: number | null;
}

type Loaded =
  | { kind: "ok"; row: ReadRow & { qId: string }; open: string | null; linear: boolean; currentSection: number }
  | { kind: "ended" }
  | { kind: "fallback" };

/** Round trip 1: everything needed to validate a save, in one query. */
async function load(userId: string, attemptId: string, questionId: string): Promise<Loaded> {
  const rows = await prisma.$queryRaw<ReadRow[]>`
    SELECT u."isActive" AS "userActive", u.role AS "userRole",
           a.id, a."userId", a."paperId", a.mode, a.status, a."startedAt", a."endsAt", a."sectionOrder",
           a."currentSection", a."sectionStartedAt", a."sectionExtraSeconds",
           p."examPattern", p."sectionConfig", p."durationSeconds",
           (SELECT json_agg(json_build_object('section', s.sec, 'questionNumber', s.mn))
              FROM (SELECT COALESCE(NULLIF(btrim(section), ''), 'General') AS sec, MIN("questionNumber") AS mn
                      FROM "Question" WHERE "paperId" = a."paperId" GROUP BY 1) s) AS sections,
           q.id AS "qId", q.section AS "qSection", q."questionType" AS "qType", q."correctAnswer" AS "qCorrect",
           q.options AS "qOptions", q."questionNumber" AS "qNumber"
      FROM "User" u
      JOIN "Attempt" a ON a.id = ${attemptId} AND (a."userId" = u.id OR u.role = 'ADMIN')
      JOIN "Paper" p ON p.id = a."paperId"
      LEFT JOIN "Question" q ON q.id = ${questionId} AND q."paperId" = a."paperId"
     WHERE u.id = ${userId}`;
  const row = rows[0];
  if (!row) return { kind: "fallback" };
  if (!row.userActive) throw new Error("Unauthorized");
  if (row.status !== "IN_PROGRESS") return { kind: "ended" };
  if (row.mode !== "MOCK" || !row.qId) return { kind: "fallback" };

  const pattern = getPattern(row.examPattern);
  const sections = resolvePaperSections(
    { examPattern: row.examPattern, sectionConfig: row.sectionConfig, durationSeconds: row.durationSeconds },
    row.sections ?? []
  );
  const { state, changed } = computeTiming(row, sections, pattern, new Date(Date.now() - SAVE_GRACE_SECONDS * 1000));
  // A section change or the end of the test has to be written first: let the full path handle it.
  if (changed || state.finished) return { kind: "fallback" };
  const open = state.sectional ? state.order[state.currentSection] ?? null : null;
  return { kind: "ok", row: row as ReadRow & { qId: string }, open, linear: pattern.navigation === "linear", currentSection: row.currentSection };
}

/**
 * Saves a mock-test response (and optionally marks the next question as seen) in two round trips.
 * `visitId` is the question the candidate moves to next, so the palette shows it as seen without a second request.
 */
export async function fastSaveResponse(params: {
  attemptId: string;
  questionId: string;
  answer: string | null;
  markedForReview: boolean;
  visitId?: string | null;
}): Promise<FastResult> {
  const userId = await sessionUserId();
  if (!userId) throw new Error("Unauthorized");
  const loaded = await load(userId, params.attemptId, params.questionId);
  if (loaded.kind !== "ok") return loaded;
  const { row, open, linear } = loaded;

  if (open !== null && sectionKey(row.qSection) !== open) return { kind: "refused", error: "This section is closed." };
  const answer = cleanResponse({ questionType: row.qType ?? "MCQ", options: row.qOptions ?? "{}" }, params.answer);
  if (answer === undefined) return { kind: "refused", error: "That answer is not valid for this question." };
  if (linear && !isAnswered(answer)) return { kind: "refused", error: "Choose an answer to continue." };
  const markedForReview = linear ? false : !!params.markedForReview;
  const isCorrect = isAnswered(answer) ? isAnswerCorrect(row.qType ?? "MCQ", row.qCorrect ?? "", answer) : null;

  // One-way papers: every earlier question of the open section must already be answered, and an answer is final.
  const orderGuard = linear
    ? Prisma.sql`AND NOT EXISTS (
        SELECT 1 FROM "Question" q LEFT JOIN "AttemptAnswer" x ON x."questionId" = q.id AND x."attemptId" = a.id
         WHERE q."paperId" = ${row.paperId}
           AND COALESCE(NULLIF(btrim(q.section), ''), 'General') = ${open ?? sectionKey(row.qSection)}
           AND q."questionNumber" < ${row.qNumber ?? 0}::int
           AND (x."selectedAnswer" IS NULL OR btrim(x."selectedAnswer") = ''))`
    : Prisma.empty;
  const finalGuard = linear
    ? Prisma.sql`WHERE "AttemptAnswer"."selectedAnswer" IS NULL OR btrim("AttemptAnswer"."selectedAnswer") = ''`
    : Prisma.empty;
  const visitSection = open === null ? Prisma.empty : Prisma.sql`AND COALESCE(NULLIF(btrim(vq.section), ''), 'General') = ${open}`;
  const visitId = params.visitId && params.visitId !== params.questionId ? params.visitId : null;

  // Round trip 2: one statement, one implicit transaction.
  const result = await prisma.$queryRaw<{ open: number; saved: number }[]>`
    WITH ok AS (
      SELECT a.id FROM "Attempt" a
       WHERE a.id = ${row.id} AND a.status = 'IN_PROGRESS' AND a."currentSection" = ${loaded.currentSection}::int
       ${orderGuard}
       FOR SHARE OF a
    ), saved AS (
      INSERT INTO "AttemptAnswer" (id, "attemptId", "questionId", "selectedAnswer", "isCorrect", "markedForReview", "answeredAt")
      SELECT ${randomUUID()}::text, ok.id, ${row.qId}::text, ${answer}::text, ${isCorrect}::boolean, ${markedForReview}::boolean, now() FROM ok
      ON CONFLICT ("attemptId", "questionId") DO UPDATE
         SET "selectedAnswer" = EXCLUDED."selectedAnswer", "isCorrect" = EXCLUDED."isCorrect",
             "markedForReview" = EXCLUDED."markedForReview", "answeredAt" = EXCLUDED."answeredAt"
       ${finalGuard}
      RETURNING 1
    ), visited AS (
      INSERT INTO "AttemptAnswer" (id, "attemptId", "questionId", "selectedAnswer", "markedForReview", "answeredAt")
      SELECT ${randomUUID()}::text, ok.id, vq.id, NULL::text, false, now()
        FROM ok JOIN "Question" vq ON vq.id = ${visitId}::text AND vq."paperId" = ${row.paperId} ${visitSection}
      ON CONFLICT ("attemptId", "questionId") DO NOTHING
      RETURNING 1
    )
    SELECT (SELECT count(*)::int FROM ok) AS open, (SELECT count(*)::int FROM saved) AS saved`;
  const r = result[0];
  if (!r || r.open === 0) return { kind: "fallback" }; // ended, moved on, or out of order: the full path explains
  if (r.saved === 0) return { kind: "refused", error: "This question has already been answered and cannot be changed. Reload the page to continue." };
  return { kind: "saved" };
}

/** Marks a question as seen (palette "Not Answered" instead of "Not Visited") in two round trips. */
export async function fastVisit(attemptId: string, questionId: string): Promise<FastResult> {
  const userId = await sessionUserId();
  if (!userId) throw new Error("Unauthorized");
  const loaded = await load(userId, attemptId, questionId);
  if (loaded.kind !== "ok") return loaded;
  const { row, open } = loaded;
  if (open !== null && sectionKey(row.qSection) !== open) return { kind: "refused", error: "This section is closed." };
  await prisma.$executeRaw`
    INSERT INTO "AttemptAnswer" (id, "attemptId", "questionId", "selectedAnswer", "markedForReview", "answeredAt")
    SELECT ${randomUUID()}::text, a.id, ${row.qId}::text, NULL::text, false, now() FROM "Attempt" a
     WHERE a.id = ${row.id} AND a.status = 'IN_PROGRESS'
    ON CONFLICT ("attemptId", "questionId") DO NOTHING`;
  return { kind: "saved" };
}

/**
 * Keeps the database and the server warm while a test is open (the free database sleeps after a few idle
 * minutes, and waking it adds a second or two to the next click). One small query. Returns the attempt status.
 */
export async function attemptStatus(attemptId: string): Promise<string | null> {
  const userId = await sessionUserId();
  if (!userId) return null;
  const rows = await prisma.$queryRaw<{ status: string }[]>`
    SELECT a.status FROM "Attempt" a JOIN "User" u ON u.id = ${userId} AND u."isActive"
     WHERE a.id = ${attemptId} AND (a."userId" = u.id OR u.role = 'ADMIN')`;
  return rows[0]?.status ?? null;
}
