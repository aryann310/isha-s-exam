"use server";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { createAttempt } from "@/server/attempts";
import { getPattern } from "@/lib/exam-patterns";
import { isPaperClosed } from "@/server/paper-expiry";

export async function startExamAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const paperId = formData.get("paperId") as string;
  const mode = formData.get("mode") as string; // PRACTICE or MOCK

  if (!paperId || (mode !== "PRACTICE" && mode !== "MOCK")) {
    throw new Error("Invalid parameters");
  }

  const isAdmin = session.role === "ADMIN";
  // Students can only start published papers; admins can preview drafts.
  const paper = await prisma.paper.findFirst({
    where: { id: paperId.trim(), ...(isAdmin ? {} : { isActive: true, exam: { isActive: true } }) },
  });
  if (!paper) {
    throw new Error("Paper not found");
  }
  // Some papers (Surprise Test, CAT RC sets) are only taken as a timed mock.
  if (mode === "PRACTICE" && getPattern(paper.examPattern).mockOnly) {
    redirect(`/papers/${paper.id}/instructions`);
  }

  // A paper without questions would leave the student on an empty screen until the timer ran out.
  const questionCount = await prisma.question.count({ where: { paperId: paper.id } });
  if (questionCount === 0) {
    redirect(`/papers/${paper.id}`);
  }

  if (mode === "MOCK" && formData.get("acceptInstructions") !== "on") {
    // Resume a running mock straight away rather than showing the instructions again.
    const running = await prisma.attempt.findFirst({
      where: { userId: session.userId as string, paperId: paper.id, status: "IN_PROGRESS", mode: "MOCK" },
      select: { id: true },
    });
    redirect(running ? `/exam/${running.id}` : `/papers/${paper.id}/instructions`);
  }

  const userId = session.userId as string;
  const sectionOrder = formData.getAll("sectionOrder").map(String).filter(Boolean);
  // One running attempt per student, paper and mode. The advisory lock makes a double click (two
  // requests at once) resume the same attempt instead of creating two.
  const attemptId = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${paper.id}:${mode}`}))`;
    const existing = await tx.attempt.findFirst({
      where: { userId, paperId: paper.id, status: "IN_PROGRESS", mode },
      select: { id: true },
    });
    if (existing) return existing.id;
    if (isPaperClosed(paper)) return null;
    const created = await createAttempt({ userId, paper, mode, sectionOrder: sectionOrder.length ? sectionOrder : null }, tx);
    return created.id;
  }, { timeout: 20_000, maxWait: 10_000 });

  // A closed paper takes no new attempts; its solutions are open instead.
  if (!attemptId) redirect(`/papers/${paper.id}/solutions`);
  redirect(`/exam/${attemptId}`);
}
