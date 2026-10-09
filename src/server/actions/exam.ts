"use server";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

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

  const param = decodeURIComponent(paperId).trim();
  const words = param.toLowerCase().split(/[\s-]+/).filter(Boolean);

  let paper = await prisma.paper.findFirst({
    where: {
      OR: [
        { id: param },
        { title: { contains: param, mode: "insensitive" } },
      ],
    },
  });

  if (!paper && words.length > 0) {
    const allPapers = await prisma.paper.findMany({
      include: { exam: true },
    });
    paper =
      allPapers.find((p) => {
        const fullText = `${p.title} ${p.exam.name} ${p.exam.slug}`.toLowerCase();
        return words.every((w) => fullText.includes(w));
      }) || null;
  }

  if (!paper) {
    throw new Error("Paper not found");
  }

  const attempt = await prisma.attempt.create({
    data: {
      userId: session.userId as string,
      paperId: paper.id,
      mode,
      status: "IN_PROGRESS",
      endsAt: mode === "MOCK" ? new Date(Date.now() + paper.durationSeconds * 1000) : null,
    },
  });

  redirect(`/exam/${attempt.id}`);
}
