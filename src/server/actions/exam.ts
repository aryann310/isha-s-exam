"use server";

import { getSession } from "@/lib/auth/session";
import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";

const prisma = new PrismaClient();

export async function startExamAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const paperId = formData.get("paperId") as string;
  const mode = formData.get("mode") as string; // PRACTICE or MOCK

  if (!paperId || !["PRACTICE", "MOCK"].includes(mode)) {
    throw new Error("Invalid parameters");
  }

  // Check if there is already an active attempt
  const existingAttempt = await prisma.attempt.findFirst({
    where: {
      userId: session.userId as string,
      paperId,
      status: "IN_PROGRESS",
    },
  });

  if (existingAttempt) {
    // If practicing or mocking, just resume it
    redirect(`/exam/${existingAttempt.id}`);
  }

  const paper = await prisma.paper.findUnique({
    where: { id: paperId },
  });

  if (!paper) {
    throw new Error("Paper not found");
  }

  const attempt = await prisma.attempt.create({
    data: {
      userId: session.userId as string,
      paperId,
      mode,
      status: "IN_PROGRESS",
      endsAt: mode === "MOCK" ? new Date(Date.now() + paper.durationSeconds * 1000) : null,
    },
  });

  redirect(`/exam/${attempt.id}`);
}
