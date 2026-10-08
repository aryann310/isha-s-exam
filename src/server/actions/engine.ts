"use server";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function saveAnswerAction(attemptId: string, questionId: string, selectedAnswer: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId, userId: session.userId as string },
    include: { paper: true },
  });

  if (!attempt || attempt.status !== "IN_PROGRESS") {
    throw new Error("Invalid attempt");
  }

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { correctAnswer: true, explanation: true },
  });

  const isCorrect = question ? question.correctAnswer === selectedAnswer : false;

  await prisma.attemptAnswer.upsert({
    where: {
      attemptId_questionId: {
        attemptId,
        questionId,
      },
    },
    update: { selectedAnswer, isCorrect, answeredAt: new Date() },
    create: { attemptId, questionId, selectedAnswer, isCorrect },
  });

  if (question) {
    return {
      isCorrect,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
    };
  }

  return null;
}

export async function submitExamAction(attemptId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId, userId: session.userId as string },
    include: { 
      paper: { include: { questions: true } },
      answers: true,
    },
  });

  if (!attempt || attempt.status !== "IN_PROGRESS") {
    throw new Error("Invalid attempt");
  }

  const { paper, answers } = attempt;

  let correctCount = 0;
  let incorrectCount = 0;
  let unattemptedCount = paper.questions.length;

  for (const question of paper.questions) {
    const ans = answers.find(a => a.questionId === question.id);
    if (ans && ans.selectedAnswer) {
      unattemptedCount--;
      const isCorrect = ans.selectedAnswer === question.correctAnswer;
      if (isCorrect) {
        correctCount++;
      } else {
        incorrectCount++;
      }
      
      // Update answer correctness
      await prisma.attemptAnswer.update({
        where: { id: ans.id },
        data: { isCorrect },
      });
    }
  }

  const score = (correctCount * paper.correctMarks) + (incorrectCount * paper.incorrectMarks) + (unattemptedCount * paper.unattemptedMarks);
  const accuracy = (correctCount + incorrectCount) > 0 ? (correctCount / (correctCount + incorrectCount)) * 100 : 0;
  const timeTaken = Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000);

  await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      status: "SUBMITTED", // Could be AUTO_SUBMITTED based on time
      submittedAt: new Date(),
      score,
      correct: correctCount,
      incorrect: incorrectCount,
      unattempted: unattemptedCount,
      accuracy,
      timeTaken,
    },
  });

  return { success: true };
}
