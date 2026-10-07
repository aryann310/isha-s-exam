import { getSession } from "@/lib/auth/session";
import { PrismaClient } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { ExamEngine } from "@/components/exam/exam-engine";

const prisma = new PrismaClient();

export default async function ExamPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const resolvedParams = await params;

  const attempt = await prisma.attempt.findUnique({
    where: { id: resolvedParams.attemptId, userId: session.userId as string },
    include: {
      paper: true,
      answers: true,
    },
  });

  if (!attempt) return notFound();

  if (attempt.status !== "IN_PROGRESS") {
    redirect(`/results/${attempt.id}`);
  }

  // Fetch questions
  const rawQuestions = await prisma.question.findMany({
    where: { paperId: attempt.paperId },
    orderBy: { questionNumber: "asc" },
  });

  const questions = rawQuestions;

  return (
    <ExamEngine 
      attempt={attempt} 
      paper={attempt.paper} 
      questions={questions as any} 
      initialAnswers={attempt.answers}
    />
  );
}
