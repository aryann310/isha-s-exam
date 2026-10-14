"use server";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { parseMarkdownQuestions, parseQuestionOptions } from "@/lib/parse-markdown-questions";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch (err) {
    console.warn(`revalidatePath(${path}) ignored:`, err);
  }
}

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Unauthorized: Admin access required");
  }
  return session;
}

// Exams Management
export async function createExamAction(formData: FormData) {
  await requireAdmin();

  const name = (formData.get("name") as string)?.trim();
  if (!name) {
    throw new Error("Exam name is required");
  }

  let slug = (formData.get("slug") as string)?.trim().toLowerCase();
  if (!slug) {
    slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  } else {
    slug = slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  if (!slug) {
    throw new Error("Invalid exam slug");
  }

  const description = (formData.get("description") as string)?.trim() || null;
  const isActive = formData.get("isActive") === "false" ? false : true;

  const existing = await prisma.exam.findUnique({
    where: { slug },
  });
  if (existing) {
    throw new Error(`An exam with identifier "${slug}" already exists.`);
  }

  const exam = await prisma.exam.create({
    data: {
      name,
      slug,
      description,
      isActive,
    },
  });

  safeRevalidate("/admin");
  safeRevalidate("/admin/exams");
  safeRevalidate("/admin/papers");
  safeRevalidate("/exams");
  return { success: true, exam };
}

export async function updateExamAction(formData: FormData) {
  await requireAdmin();

  const examId = formData.get("examId") as string;
  if (!examId) {
    throw new Error("Exam ID is required");
  }

  const name = (formData.get("name") as string)?.trim();
  if (!name) {
    throw new Error("Exam name is required");
  }

  let slug = (formData.get("slug") as string)?.trim().toLowerCase();
  if (!slug) {
    slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  } else {
    slug = slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  const description = (formData.get("description") as string)?.trim() || null;
  const isActive = formData.get("isActive") !== null ? formData.get("isActive") === "true" : undefined;

  const existing = await prisma.exam.findFirst({
    where: {
      slug,
      id: { not: examId },
    },
  });
  if (existing) {
    throw new Error(`An exam with slug "${slug}" already exists.`);
  }

  const updated = await prisma.exam.update({
    where: { id: examId },
    data: {
      name,
      slug,
      description,
      ...(isActive !== undefined ? { isActive } : {}),
    },
  });

  safeRevalidate("/admin");
  safeRevalidate("/admin/exams");
  safeRevalidate("/admin/papers");
  safeRevalidate("/exams");
  safeRevalidate(`/exams/${slug}`);
  return { success: true, exam: updated };
}

export async function toggleExamStatusAction(examId: string, isActive: boolean) {
  await requireAdmin();

  const exam = await prisma.exam.update({
    where: { id: examId },
    data: { isActive },
  });

  safeRevalidate("/admin");
  safeRevalidate("/admin/exams");
  safeRevalidate("/admin/papers");
  safeRevalidate("/exams");
  safeRevalidate(`/exams/${exam.slug}`);
  return { success: true };
}

export async function deleteExamAction(examId: string) {
  await requireAdmin();

  await prisma.$transaction(async (tx) => {
    const papers = await tx.paper.findMany({
      where: { examId },
      select: { id: true },
    });
    const paperIds = papers.map((p) => p.id);

    if (paperIds.length > 0) {
      const attempts = await tx.attempt.findMany({
        where: { paperId: { in: paperIds } },
        select: { id: true },
      });
      const attemptIds = attempts.map((a) => a.id);

      if (attemptIds.length > 0) {
        await tx.attemptAnswer.deleteMany({
          where: { attemptId: { in: attemptIds } },
        });
        await tx.attempt.deleteMany({
          where: { id: { in: attemptIds } },
        });
      }

      await tx.question.deleteMany({
        where: { paperId: { in: paperIds } },
      });
      await tx.paper.deleteMany({
        where: { examId },
      });
    }

    await tx.exam.delete({
      where: { id: examId },
    });
  });

  safeRevalidate("/admin");
  safeRevalidate("/admin/exams");
  safeRevalidate("/admin/papers");
  safeRevalidate("/exams");
  return { success: true };
}

// Papers
export async function createPaperAction(formData: FormData) {
  await requireAdmin();

  const examId = (formData.get("examId") as string)?.trim();
  if (!examId) throw new Error("Target examination is required");

  const title = (formData.get("title") as string)?.trim();
  if (!title) throw new Error("Paper title is required");

  const year = parseInt(formData.get("year") as string, 10) || new Date().getFullYear();
  const shift = (formData.get("shift") as string)?.trim() || null;
  const durationMinutes = parseInt(formData.get("durationMinutes") as string, 10) || 60;

  const parsedCorrect = parseFloat(formData.get("correctMarks") as string);
  const parsedIncorrect = parseFloat(formData.get("incorrectMarks") as string);
  const parsedUnattempted = parseFloat(formData.get("unattemptedMarks") as string);

  const correctMarks = isNaN(parsedCorrect) ? 4 : parsedCorrect;
  const incorrectMarks = isNaN(parsedIncorrect) ? -1 : parsedIncorrect;
  const unattemptedMarks = isNaN(parsedUnattempted) ? 0 : parsedUnattempted;
  const description = (formData.get("description") as string)?.trim() || null;
  const isActive = formData.get("isActive") === "false" ? false : true;

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
      isActive,
    },
  });

  safeRevalidate("/admin");
  safeRevalidate("/admin/exams");
  safeRevalidate("/admin/papers");
  safeRevalidate("/exams");
}

export async function updatePaperAction(formData: FormData) {
  await requireAdmin();

  const paperId = formData.get("paperId") as string;
  if (!paperId) {
    throw new Error("Paper ID is required");
  }

  const examId = (formData.get("examId") as string) || undefined;
  const title = (formData.get("title") as string)?.trim();
  if (!title) {
    throw new Error("Paper title is required");
  }

  const year = parseInt(formData.get("year") as string, 10) || new Date().getFullYear();
  const shift = (formData.get("shift") as string)?.trim() || null;
  const durationMinutes = parseInt(formData.get("durationMinutes") as string, 10) || 60;
  const correctMarks = parseFloat(formData.get("correctMarks") as string);
  const incorrectMarks = parseFloat(formData.get("incorrectMarks") as string);
  const unattemptedMarks = parseFloat(formData.get("unattemptedMarks") as string);
  const description = (formData.get("description") as string)?.trim() || null;

  await prisma.paper.update({
    where: { id: paperId },
    data: {
      examId,
      title,
      year,
      shift,
      durationSeconds: durationMinutes * 60,
      correctMarks: isNaN(correctMarks) ? 4 : correctMarks,
      incorrectMarks: isNaN(incorrectMarks) ? -1 : incorrectMarks,
      unattemptedMarks: isNaN(unattemptedMarks) ? 0 : unattemptedMarks,
      description,
    },
  });

  safeRevalidate("/admin");
  safeRevalidate("/admin/papers");
  safeRevalidate("/exams");
  return { success: true };
}

export async function togglePaperStatusAction(paperId: string, isActive: boolean) {
  await requireAdmin();
  await prisma.paper.update({
    where: { id: paperId },
    data: { isActive },
  });
  safeRevalidate("/admin");
  safeRevalidate("/exams");
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
  safeRevalidate("/admin");
  safeRevalidate("/exams");
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

  safeRevalidate("/admin");
  safeRevalidate("/admin/questions");
  safeRevalidate("/admin/papers");
  return { success: true };
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

  const existing = await prisma.question.findUnique({ where: { id } });
  const existingOpts = existing ? parseQuestionOptions(existing.options) : { A: "", B: "", C: "", D: "" };

  const hasNewOptions = [optionA, optionB, optionC, optionD].some(
    (opt) => opt !== undefined && opt !== null && opt.trim() !== ""
  );

  const optionsObj: Record<string, string> = hasNewOptions
    ? {
        A: optionA !== undefined && optionA.trim() !== "" ? optionA : existingOpts.A,
        B: optionB !== undefined && optionB.trim() !== "" ? optionB : existingOpts.B,
        C: optionC !== undefined && optionC.trim() !== "" ? optionC : existingOpts.C,
        D: optionD !== undefined && optionD.trim() !== "" ? optionD : existingOpts.D,
      }
    : existingOpts;

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

  safeRevalidate("/admin");
  safeRevalidate("/admin/questions");
  safeRevalidate("/admin/papers");
  if (existing?.paperId) {
    safeRevalidate(`/papers/${existing.paperId}`);
  }
  return { success: true };
}

export async function deleteQuestionAction(questionId: string) {
  await requireAdmin();

  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });

  if (!question) return { success: false };

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

  safeRevalidate("/admin");
  safeRevalidate("/admin/questions");
  safeRevalidate("/admin/papers");
  return { success: true };
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      throw new Error("Invalid JSON format");
    }

    interface QuestionImportItem {
      questionNumber?: number;
      question_number?: number;
      questionText?: string;
      question?: string;
      options?: Record<string, unknown> | unknown[] | string;
      optionA?: string;
      option_a?: string;
      a?: string;
      optionB?: string;
      option_b?: string;
      b?: string;
      optionC?: string;
      option_c?: string;
      c?: string;
      optionD?: string;
      option_d?: string;
      d?: string;
      correctAnswer?: string;
      correct_answer?: string;
      explanation?: string;
      section?: string | null;
      topic?: string | null;
      difficulty?: string;
    }

    const questionsList: QuestionImportItem[] | null = Array.isArray(parsed)
      ? (parsed as QuestionImportItem[])
      : parsed && typeof parsed === "object" && "questions" in parsed && Array.isArray((parsed as { questions: unknown }).questions)
      ? ((parsed as { questions: unknown }).questions as QuestionImportItem[])
      : null;

    if (!questionsList) {
      throw new Error("Expected an array of questions or an object with a 'questions' array.");
    }

    for (let i = 0; i < questionsList.length; i++) {
      const q = questionsList[i];
      const qNum = q.questionNumber || q.question_number || (i + 1);
      const text = q.questionText || q.question || "";
      const optionsObj = parseQuestionOptions(q.options ?? {
        A: q.optionA ?? q.option_a ?? q.a ?? "",
        B: q.optionB ?? q.option_b ?? q.b ?? "",
        C: q.optionC ?? q.option_c ?? q.c ?? "",
        D: q.optionD ?? q.option_d ?? q.d ?? "",
      });
      const opts = JSON.stringify(optionsObj);
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

  safeRevalidate("/admin");
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

  safeRevalidate("/admin");
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
  safeRevalidate("/admin");
}

// Live Proctoring & Master Control Actions
export async function adminForceSubmitExamAction(attemptId: string) {
  await requireAdmin();

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { paper: true, answers: true },
  });

  if (!attempt) throw new Error("Attempt not found");

  const totalQuestions = await prisma.question.count({ where: { paperId: attempt.paperId } });
  let correctCount = 0;
  let incorrectCount = 0;

  for (const ans of attempt.answers) {
    if (ans.selectedAnswer) {
      if (ans.isCorrect) correctCount++;
      else incorrectCount++;
    }
  }

  const unattemptedCount = Math.max(0, totalQuestions - (correctCount + incorrectCount));
  const score = (correctCount * attempt.paper.correctMarks) + (incorrectCount * attempt.paper.incorrectMarks) + (unattemptedCount * attempt.paper.unattemptedMarks);
  const accuracy = (correctCount + incorrectCount) > 0 ? (correctCount / (correctCount + incorrectCount)) * 100 : 0;
  const timeTaken = Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000);

  await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      status: "AUTO_SUBMITTED",
      submittedAt: new Date(),
      score,
      correct: correctCount,
      incorrect: incorrectCount,
      unattempted: unattemptedCount,
      accuracy,
      timeTaken,
    },
  });

  safeRevalidate("/admin");
  safeRevalidate("/admin/live");
  safeRevalidate("/admin/results");
  return { success: true };
}

export async function adminStartExamForStudentAction(
  userId: string,
  paperId: string,
  mode: "PRACTICE" | "MOCK",
  customDurationMinutes?: number
) {
  await requireAdmin();

  const [user, paper] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.paper.findUnique({ where: { id: paperId } }),
  ]);

  if (!user) throw new Error("Student not found");
  if (!paper) throw new Error("Paper not found");

  const durationSec = (customDurationMinutes ? customDurationMinutes * 60 : paper.durationSeconds) || 3600;

  const existing = await prisma.attempt.findFirst({
    where: { userId, paperId, status: "IN_PROGRESS" },
  });

  if (existing) {
    return { success: true, attemptId: existing.id, isExisting: true };
  }

  const attempt = await prisma.attempt.create({
    data: {
      userId,
      paperId,
      mode,
      status: "IN_PROGRESS",
      startedAt: new Date(),
      endsAt: mode === "MOCK" ? new Date(Date.now() + durationSec * 1000) : null,
    },
  });

  safeRevalidate("/admin");
  safeRevalidate("/admin/live");
  safeRevalidate("/admin/results");
  safeRevalidate("/exams");
  return { success: true, attemptId: attempt.id };
}

export async function adminExtendExamTimeAction(attemptId: string, additionalMinutes: number) {
  await requireAdmin();

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
  });

  if (!attempt || attempt.status !== "IN_PROGRESS") {
    throw new Error("Attempt is not currently in progress");
  }

  const currentEndsAt = attempt.endsAt ? new Date(attempt.endsAt).getTime() : Date.now();
  const baseTime = Math.max(currentEndsAt, Date.now());
  const newEndsAt = new Date(baseTime + additionalMinutes * 60 * 1000);

  await prisma.attempt.update({
    where: { id: attemptId },
    data: { endsAt: newEndsAt },
  });

  safeRevalidate("/admin/live");
  return { success: true, newEndsAt };
}

export async function adminResetAttemptAction(attemptId: string) {
  await requireAdmin();

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { paper: true },
  });

  if (!attempt) throw new Error("Attempt not found");

  await prisma.$transaction(async (tx) => {
    await tx.attemptAnswer.deleteMany({ where: { attemptId } });
    await tx.attempt.update({
      where: { id: attemptId },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
        endsAt: attempt.mode === "MOCK" ? new Date(Date.now() + attempt.paper.durationSeconds * 1000) : null,
        submittedAt: null,
        score: null,
        correct: null,
        incorrect: null,
        unattempted: null,
        accuracy: null,
        timeTaken: null,
      },
    });
  });

  safeRevalidate("/admin");
  safeRevalidate("/admin/live");
  safeRevalidate("/admin/results");
  safeRevalidate("/exams");
  return { success: true };
}

export async function adminDeleteAttemptAction(attemptId: string) {
  await requireAdmin();

  await prisma.$transaction(async (tx) => {
    await tx.attemptAnswer.deleteMany({ where: { attemptId } });
    await tx.attempt.delete({ where: { id: attemptId } });
  });

  safeRevalidate("/admin");
  safeRevalidate("/admin/live");
  safeRevalidate("/admin/results");
  return { success: true };
}

export async function adminGetLiveAttemptDetailsAction(attemptId: string) {
  await requireAdmin();

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      user: { select: { id: true, name: true, username: true, email: true } },
      paper: {
        include: {
          exam: true,
          questions: { orderBy: { questionNumber: "asc" } },
        },
      },
      answers: true,
    },
  });

  if (!attempt) throw new Error("Attempt not found");

  return attempt;
}
