"use server";

import { getSession } from "@/lib/auth/session";
import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { parseMarkdownQuestions } from "@/lib/parse-markdown-questions";

const prisma = new PrismaClient();

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Unauthorized: Admin access required");
  }
  return session;
}

// Papers
export async function createPaperAction(formData: FormData) {
  await requireAdmin();

  const examId = formData.get("examId") as string;
  const title = formData.get("title") as string;
  const year = parseInt(formData.get("year") as string, 10);
  const shift = (formData.get("shift") as string) || null;
  const durationMinutes = parseInt(formData.get("durationMinutes") as string, 10) || 60;
  const correctMarks = parseFloat(formData.get("correctMarks") as string) || 4;
  const incorrectMarks = parseFloat(formData.get("incorrectMarks") as string) || -1;
  const unattemptedMarks = parseFloat(formData.get("unattemptedMarks") as string) || 0;
  const description = (formData.get("description") as string) || null;

  await prisma.paper.create({
    data: {
      examId,
      title,
      year,
      shift,
      durationSeconds: durationMinutes * 60,
      totalQuestions: 0,
      correctMarks,
      incorrectMarks,
      unattemptedMarks,
      description,
      isActive: true,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/exams");
}

export async function togglePaperStatusAction(paperId: string, isActive: boolean) {
  await requireAdmin();
  await prisma.paper.update({
    where: { id: paperId },
    data: { isActive },
  });
  revalidatePath("/admin");
  revalidatePath("/exams");
  return { success: true };
}

export async function deletePaperAction(paperId: string) {
  await requireAdmin();
  // ponytail: transaction ensures clean cascade even if DB foreign key constraints vary
  await prisma.$transaction(async (tx) => {
    const attempts = await tx.attempt.findMany({ where: { paperId }, select: { id: true } });
    const attemptIds = attempts.map((a) => a.id);
    if (attemptIds.length > 0) {
      await tx.attemptAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
      await tx.attempt.deleteMany({ where: { id: { in: attemptIds } } });
    }
    await tx.question.deleteMany({ where: { paperId } });
    await tx.paper.delete({ where: { id: paperId } });
  });
  revalidatePath("/admin");
  revalidatePath("/exams");
}

// Questions
export async function createQuestionAction(formData: FormData) {
  await requireAdmin();

  const paperId = formData.get("paperId") as string;
  const questionNumber = parseInt(formData.get("questionNumber") as string, 10);
  const questionText = formData.get("questionText") as string;
  const section = (formData.get("section") as string) || null;
  const topic = (formData.get("topic") as string) || null;
  const difficulty = (formData.get("difficulty") as string) || "Medium";
  const correctAnswer = formData.get("correctAnswer") as string;
  const explanation = (formData.get("explanation") as string) || null;

  const optionA = formData.get("optionA") as string;
  const optionB = formData.get("optionB") as string;
  const optionC = formData.get("optionC") as string;
  const optionD = formData.get("optionD") as string;

  const optionsObj: Record<string, string> = {
    A: optionA,
    B: optionB,
    C: optionC,
    D: optionD,
  };

  await prisma.question.create({
    data: {
      paperId,
      questionNumber,
      questionText,
      options: JSON.stringify(optionsObj),
      correctAnswer,
      explanation,
      section,
      topic,
      difficulty,
    },
  });

  // Update total questions count in paper
  const count = await prisma.question.count({ where: { paperId } });
  await prisma.paper.update({
    where: { id: paperId },
    data: { totalQuestions: count },
  });

  revalidatePath("/admin");
}

export async function updateQuestionAction(formData: FormData) {
  await requireAdmin();

  const id = formData.get("id") as string;
  const questionNumber = parseInt(formData.get("questionNumber") as string, 10);
  const questionText = formData.get("questionText") as string;
  const section = (formData.get("section") as string) || null;
  const topic = (formData.get("topic") as string) || null;
  const difficulty = (formData.get("difficulty") as string) || "Medium";
  const correctAnswer = formData.get("correctAnswer") as string;
  const explanation = (formData.get("explanation") as string) || null;

  const optionA = formData.get("optionA") as string;
  const optionB = formData.get("optionB") as string;
  const optionC = formData.get("optionC") as string;
  const optionD = formData.get("optionD") as string;

  const optionsObj: Record<string, string> = {
    A: optionA,
    B: optionB,
    C: optionC,
    D: optionD,
  };

  await prisma.question.update({
    where: { id },
    data: {
      questionNumber,
      questionText,
      options: JSON.stringify(optionsObj),
      correctAnswer,
      explanation,
      section,
      topic,
      difficulty,
    },
  });

  revalidatePath("/admin");
}

export async function deleteQuestionAction(questionId: string) {
  await requireAdmin();

  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });

  if (!question) return;

  const paperId = question.paperId;
  await prisma.$transaction(async (tx) => {
    await tx.attemptAnswer.deleteMany({ where: { questionId } });
    await tx.question.delete({ where: { id: questionId } });
    const count = await tx.question.count({ where: { paperId } });
    await tx.paper.update({
      where: { id: paperId },
      data: { totalQuestions: count },
    });
  });

  revalidatePath("/admin");
}

// Bulk Question Import (JSON and CSV formats supported)
export async function bulkImportQuestionsAction(
  paperId: string,
  rawData: string,
  format: "json" | "csv" | "markdown"
) {
  await requireAdmin();

  let importedCount = 0;

  if (format === "markdown") {
    const questionsList = parseMarkdownQuestions(rawData);
    if (questionsList.length === 0) {
      throw new Error("No valid questions found in the Markdown content. Ensure questions follow the template.");
    }

    for (const q of questionsList) {
      await prisma.question.create({
        data: {
          paperId,
          questionNumber: q.questionNumber,
          questionText: q.questionText,
          options: JSON.stringify(q.options),
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          section: q.section,
          topic: q.topic,
          difficulty: q.difficulty,
        },
      });
      importedCount++;
    }
  } else if (format === "json") {
    let parsed: any;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      throw new Error("Invalid JSON format");
    }

    const questionsList = Array.isArray(parsed) ? parsed : parsed.questions;
    if (!Array.isArray(questionsList)) {
      throw new Error("Expected an array of questions or an object with a 'questions' array.");
    }

    for (let i = 0; i < questionsList.length; i++) {
      const q = questionsList[i];
      const qNum = q.questionNumber || q.question_number || (i + 1);
      const text = q.questionText || q.question || "";
      const opts = typeof q.options === "object" ? JSON.stringify(q.options) : q.options || "{}";
      const correct = q.correctAnswer || q.correct_answer || "A";
      const explanation = q.explanation || "";
      const section = q.section || null;
      const topic = q.topic || null;
      const difficulty = q.difficulty || "Medium";

      await prisma.question.create({
        data: {
          paperId,
          questionNumber: qNum,
          questionText: text,
          options: opts,
          correctAnswer: correct,
          explanation,
          section,
          topic,
          difficulty,
        },
      });
      importedCount++;
    }
  } else if (format === "csv") {
    // Parse CSV lines
    const lines = rawData.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length <= 1) throw new Error("CSV has no data rows");

    const parseCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const header = parseCsvLine(lines[0]).map(h => h.toLowerCase());
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length < 5) continue;

      const getCol = (name: string, fallbackIndex: number) => {
        const idx = header.indexOf(name);
        return idx !== -1 ? cols[idx] : cols[fallbackIndex] || "";
      };

      const qNum = parseInt(getCol("question_number", 0), 10) || i;
      const section = getCol("section", 1) || null;
      const topic = getCol("topic", 2) || null;
      const questionText = getCol("question", 3);
      const optionA = getCol("option_a", 4);
      const optionB = getCol("option_b", 5);
      const optionC = getCol("option_c", 6);
      const optionD = getCol("option_d", 7);
      const correctAnswer = getCol("correct_answer", 8) || "A";
      const explanation = getCol("explanation", 9) || "";
      const difficulty = getCol("difficulty", 10) || "Medium";

      const optionsObj = {
        A: optionA,
        B: optionB,
        C: optionC,
        D: optionD,
      };

      await prisma.question.create({
        data: {
          paperId,
          questionNumber: qNum,
          questionText,
          options: JSON.stringify(optionsObj),
          correctAnswer,
          explanation,
          section,
          topic,
          difficulty,
        },
      });
      importedCount++;
    }
  }

  // Update total questions count in paper
  const count = await prisma.question.count({ where: { paperId } });
  await prisma.paper.update({
    where: { id: paperId },
    data: { totalQuestions: count },
  });

  revalidatePath("/admin");
  return { success: true, count: importedCount };
}

// User Management
export async function createStudentAction(formData: FormData) {
  await requireAdmin();

  const name = formData.get("name") as string;
  const email = (formData.get("email") as string).toLowerCase().trim();
  const password = formData.get("password") as string;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error("User with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: "STUDENT",
    },
  });

  revalidatePath("/admin");
}

export async function deleteStudentAction(userId: string) {
  await requireAdmin();
  await prisma.$transaction(async (tx) => {
    const attempts = await tx.attempt.findMany({ where: { userId }, select: { id: true } });
    const attemptIds = attempts.map((a) => a.id);
    if (attemptIds.length > 0) {
      await tx.attemptAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
      await tx.attempt.deleteMany({ where: { id: { in: attemptIds } } });
    }
    await tx.user.delete({ where: { id: userId } });
  });
  revalidatePath("/admin");
}
