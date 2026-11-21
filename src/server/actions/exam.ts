"use server";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { createAttempt } from "@/server/attempts";

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

  // Resume an attempt that is already running instead of starting a second one.
  const existingAttempt = await prisma.attempt.findFirst({
    where: { userId: session.userId as string, paperId: paper.id, status: "IN_PROGRESS" },
  });
  if (existingAttempt) {
    redirect(`/exam/${existingAttempt.id}`);
  }

  if (mode === "MOCK" && formData.get("acceptInstructions") !== "on") {
    redirect(`/papers/${paper.id}/instructions`);
  }

  const sectionOrder = formData.getAll("sectionOrder").map(String).filter(Boolean);
  const attempt = await createAttempt({
    userId: session.userId as string,
    paper,
    mode,
    sectionOrder: sectionOrder.length ? sectionOrder : null,
  });

  redirect(`/exam/${attempt.id}`);
}
