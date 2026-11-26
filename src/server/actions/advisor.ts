"use server";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { generateAdvice, getStoredAdvice, type Advice } from "@/server/advisor";
import { getStudentAnalytics } from "@/server/student-analytics";

type Result = { ok: true; advice: Advice; createdAt: string } | { ok: false; error: string };

// One generation at a time per student and scope on this server (double clicks, two tabs).
const running = new Set<string>();

/**
 * Writes (or refreshes) the AI coaching note for a scope: "all" or an exam slug. Students get their own;
 * admins may pass a student's id. Advice that already covers every finished test is returned as it is.
 */
export async function generateAdviceAction(scope: string, studentId?: string | null): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  const isAdmin = session.role === "ADMIN";
  const userId = isAdmin && studentId ? studentId : (session.userId as string);

  const analytics = await getStudentAnalytics(userId, { exam: null, kind: null });
  const exam = analytics.exams.find((e) => e.slug === scope);
  if (scope !== "all" && !exam) return { ok: false, error: "No finished tests for this exam yet." };
  if (isAdmin && studentId && !(await prisma.user.findUnique({ where: { id: studentId }, select: { id: true } }))) {
    return { ok: false, error: "Student not found." };
  }

  const scoped = scope === "all" ? analytics : await getStudentAnalytics(userId, { exam: scope, kind: null });
  const existing = await getStoredAdvice(userId, scope, scoped.basis);
  if (existing && !existing.stale) return { ok: true, advice: existing.advice, createdAt: existing.createdAt.toISOString() };

  const key = `${userId}:${scope}`;
  if (running.has(key)) return { ok: false, error: "Your advice is already being written. Please wait a moment." };
  running.add(key);
  try {
    const fresh = await generateAdvice(userId, scope, exam ? `${exam.name} tests` : "All tests");
    return { ok: true, advice: fresh.advice, createdAt: fresh.createdAt.toISOString() };
  } catch (err) {
    console.error("advisor failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Could not write advice. Please try again." };
  } finally {
    running.delete(key);
  }
}
