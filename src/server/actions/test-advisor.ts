"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { friendlyError, generateReview, getStoredReview, loadTestContext, type TestReview } from "@/server/test-advisor";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

// One review at a time per test on this server (double clicks, two tabs).
const reviewing = new Set<string>();

/** Writes the advisor's review of a finished test (once; later calls return the saved review). */
export async function generateReviewAction(attemptId: string): Promise<Result<{ review: TestReview; createdAt: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  const ctx = await loadTestContext(attemptId);
  if (!ctx || (ctx.userId !== session.userId && session.role !== "ADMIN")) return { ok: false, error: "Test not found." };
  if (!ctx.unlocked) return { ok: false, error: "Finish or skip the untimed phase first; the advisor opens with the solutions." };

  const existing = await getStoredReview(ctx.userId, attemptId);
  if (existing) return { ok: true, review: existing.review, createdAt: existing.createdAt.toISOString() };
  if (reviewing.has(attemptId)) return { ok: false, error: "Your review is already being written. Please wait a moment." };
  reviewing.add(attemptId);
  try {
    const fresh = await generateReview(ctx);
    return { ok: true, review: fresh.review, createdAt: fresh.createdAt.toISOString() };
  } catch (err) {
    console.error("advisor review failed", err);
    return { ok: false, error: friendlyError(err) };
  } finally {
    reviewing.delete(attemptId);
  }
}

/** A student flags one of the advisor's answers as wrong or unhelpful, for an admin to check. */
export async function reportAdvisorMessageAction(messageId: string, note: string): Promise<Result<object>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  const res = await prisma.coachMessage.updateMany({
    where: { id: messageId, userId: session.userId as string, role: "assistant" },
    data: { reported: true, reportNote: note.trim().slice(0, 500) || null, reviewedAt: null },
  });
  return res.count ? { ok: true } : { ok: false, error: "Message not found." };
}

/** The student asks the admin for more advisor messages per day. */
export async function requestMoreAdvisorMessagesAction(): Promise<Result<object>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  await prisma.user.update({ where: { id: session.userId as string }, data: { advisorLimitRequestedAt: new Date() } });
  return { ok: true };
}

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Unauthorized: Admin access required");
  return session;
}

/** Admin: set a student's daily advisor message limit (and clear their request). */
export async function setAdvisorLimitAction(userId: string, limit: number): Promise<Result<object>> {
  await requireAdmin();
  const n = Math.round(Number(limit));
  if (!Number.isFinite(n) || n < 0 || n > 1000) return { ok: false, error: "Choose a limit between 0 and 1000." };
  await prisma.user.update({ where: { id: userId }, data: { advisorDailyLimit: n, advisorLimitRequestedAt: null } });
  revalidatePath("/admin/users");
  revalidatePath("/admin/advisor");
  return { ok: true };
}

/** Admin: mark a reported advisor answer as checked. */
export async function resolveAdvisorReportAction(messageId: string): Promise<Result<object>> {
  await requireAdmin();
  await prisma.coachMessage.update({ where: { id: messageId }, data: { reviewedAt: new Date() } });
  revalidatePath("/admin/advisor");
  return { ok: true };
}
