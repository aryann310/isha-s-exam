"use server";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { createAttempt, finalizeAttempt, freshAttemptState } from "@/server/attempts";
import { PATTERN_IDS, isAnswerCorrect, parseSectionConfig } from "@/lib/exam-patterns";
import { parseQuestionOptions, questionFingerprint } from "@/lib/parse-markdown-questions";
import {
  ImportInputError,
  normalizeImport,
  toPreview,
  validateQuestions,
  type ImportFormat,
  type ImportMode,
  type ImportResult,
  type NormalizedQuestion,
} from "@/lib/question-import";

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

/** Pattern-related paper fields from a paper form. Unknown patterns fall back to CUSTOM. */
function readPatternFields(formData: FormData) {
  const raw = (formData.get("examPattern") as string) || "CUSTOM";
  const examPattern = (PATTERN_IDS as string[]).includes(raw) ? raw : "CUSTOM";
  const titaCorrectRaw = (formData.get("titaCorrectMarks") as string | null)?.trim() ?? "";
  const titaCorrect = parseFloat(titaCorrectRaw);
  const titaIncorrect = parseFloat((formData.get("titaIncorrectMarks") as string) ?? "");
  const config = parseSectionConfig((formData.get("sectionConfig") as string) || null);
  return {
    examPattern,
    titaCorrectMarks: titaCorrectRaw === "" || isNaN(titaCorrect) ? null : titaCorrect,
    titaIncorrectMarks: isNaN(titaIncorrect) ? 0 : titaIncorrect,
    sectionConfig: config ? JSON.stringify(config) : null,
  };
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
      ...readPatternFields(formData),
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
      ...readPatternFields(formData),
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

/** Returns an error message, or null when the number and answer are usable. */
async function checkQuestionInput(
  paperId: string,
  questionNumber: number,
  correctAnswer: string,
  excludeId: string | null,
  questionType: string = "MCQ"
): Promise<string | null> {
  if (!Number.isInteger(questionNumber) || questionNumber < 1) return "Question number must be a positive whole number.";
  if (questionType === "TITA") {
    if (!correctAnswer.trim() || correctAnswer.length > 60) return "Enter the correct typed answer (up to 60 characters).";
  } else if (!["A", "B", "C", "D"].includes(correctAnswer)) {
    return "Correct answer must be A, B, C or D.";
  }
  const clash = await prisma.question.findFirst({
    where: { paperId, questionNumber, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { id: true },
  });
  return clash ? `This paper already has a question #${questionNumber}. Pick a different number.` : null;
}

export async function createQuestionAction(formData: FormData) {
  await requireAdmin();

  const paperId = formData.get("paperId") as string;
  const questionNumber = parseInt(formData.get("questionNumber") as string, 10);
  const questionText = formData.get("questionText") as string;
  const section = (formData.get("section") as string) || null;
  const topic = (formData.get("topic") as string) || null;
  const difficulty = (formData.get("difficulty") as string) || "Medium";
  const correctAnswer = ((formData.get("correctAnswer") as string) ?? "").trim();
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

  const questionType = formData.get("questionType") === "TITA" ? "TITA" : "MCQ";
  const invalid = await checkQuestionInput(paperId, questionNumber, correctAnswer, null, questionType);
  if (invalid) return { success: false, error: invalid };

  await prisma.question.create({
    data: {
      paperId,
      questionNumber,
      questionText,
      options: JSON.stringify(optionsObj),
      correctAnswer,
      questionType,
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
  const correctAnswer = ((formData.get("correctAnswer") as string) ?? "").trim();
  const explanation = (formData.get("explanation") as string) || null;

  const optionA = formData.get("optionA") as string;
  const optionB = formData.get("optionB") as string;
  const optionC = formData.get("optionC") as string;
  const optionD = formData.get("optionD") as string;

  const existing = await prisma.question.findUnique({ where: { id } });
  if (!existing) return { success: false, error: "Question not found." };
  const questionType = formData.get("questionType") === "TITA" ? "TITA" : "MCQ";
  const invalid = await checkQuestionInput(existing.paperId, questionNumber, correctAnswer, id, questionType);
  if (invalid) return { success: false, error: invalid };
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
      questionType,
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

// Bulk Question Import (Markdown, JSON, CSV).
// Defaults to a dry run: nothing is written until the admin confirms the preview.
export async function bulkImportQuestionsAction(
  paperId: string,
  rawData: string,
  format: ImportFormat,
  opts: { mode?: ImportMode; dryRun?: boolean } = {}
): Promise<ImportResult> {
  await requireAdmin();

  const mode: ImportMode = opts.mode === "replace" ? "replace" : "append";
  const dryRun = opts.dryRun !== false;
  const result: ImportResult = { success: false, dryRun, count: 0, created: 0, updated: 0, deleted: 0, issues: [], preview: [] };

  const paper = await prisma.paper.findUnique({ where: { id: paperId }, select: { id: true, title: true } });
  if (!paper) return { ...result, error: "Target paper not found." };

  let questions: NormalizedQuestion[];
  try {
    questions = normalizeImport(rawData, format);
  } catch (err) {
    if (err instanceof ImportInputError) return { ...result, error: err.message };
    throw err;
  }
  if (questions.length === 0) {
    return { ...result, error: "No questions found. Check that the content follows the template." };
  }

  result.count = questions.length;
  result.preview = questions.map(toPreview);
  result.issues = validateQuestions(questions);

  const existing = await prisma.question.findMany({
    where: { paperId },
    select: { id: true, questionNumber: true, questionText: true, correctAnswer: true },
    orderBy: [{ questionNumber: "asc" }, { id: "asc" }],
  });

  if (mode === "append") {
    const existingNumbers = new Set(existing.map((q) => q.questionNumber));
    const existingStems = new Map(existing.map((q) => [questionFingerprint(q.questionText), q.questionNumber]));
    for (const q of questions) {
      if (existingNumbers.has(q.questionNumber)) {
        result.issues.push({
          questionNumber: q.questionNumber,
          level: "error",
          message: `"${paper.title}" already has a question ${q.questionNumber}. Use Replace mode to overwrite the paper, or renumber.`,
        });
      }
      const stem = questionFingerprint(q.questionText);
      const dupOf = stem.length >= 25 ? existingStems.get(stem) : undefined;
      if (dupOf !== undefined) {
        result.issues.push({
          questionNumber: q.questionNumber,
          level: "error",
          message: `The same question already exists in "${paper.title}" as Q${dupOf}`,
        });
      }
    }
  }

  // Catch "imported into the wrong paper": most of the questions already live in another paper.
  const stems = new Set(questions.map((q) => questionFingerprint(q.questionText)).filter((s) => s.length >= 25));
  if (stems.size >= 5) {
    const others = await prisma.question.findMany({
      where: { paperId: { not: paperId } },
      select: { questionText: true, paper: { select: { title: true } } },
    });
    const hits = new Map<string, number>();
    for (const o of others) {
      if (stems.has(questionFingerprint(o.questionText))) hits.set(o.paper.title, (hits.get(o.paper.title) ?? 0) + 1);
    }
    for (const [title, n] of hits) {
      if (n >= stems.size / 2) {
        result.issues.push({
          questionNumber: null,
          level: "warning",
          message: `${n} of these ${stems.size} questions already exist in paper "${title}". Make sure "${paper.title}" is the paper you meant.`,
        });
      }
    }
  }

  if (result.issues.some((i) => i.level === "error")) {
    return { ...result, error: "Nothing was imported. Fix the errors listed below and try again." };
  }

  // Plan the write.
  const incomingNumbers = new Set(questions.map((q) => q.questionNumber));
  const byNumber = new Map<number, typeof existing>();
  for (const e of existing) byNumber.set(e.questionNumber, [...(byNumber.get(e.questionNumber) ?? []), e]);

  const toCreate: NormalizedQuestion[] = [];
  const toUpdate: Array<{ id: string; q: NormalizedQuestion; answerChanged: boolean }> = [];
  const toDelete: string[] = [];

  if (mode === "append") {
    toCreate.push(...questions);
  } else {
    for (const q of questions) {
      const matches = byNumber.get(q.questionNumber) ?? [];
      if (matches.length === 0) {
        toCreate.push(q);
      } else {
        // Reuse the existing row so students' saved answers stay attached to it.
        toUpdate.push({ id: matches[0].id, q, answerChanged: matches[0].correctAnswer !== q.correctAnswer || q.questionType === "TITA" });
        toDelete.push(...matches.slice(1).map((m) => m.id));
      }
    }
    for (const e of existing) {
      if (!incomingNumbers.has(e.questionNumber)) toDelete.push(e.id);
    }
  }

  result.created = toCreate.length;
  result.updated = toUpdate.length;
  result.deleted = toDelete.length;

  if (dryRun) return { ...result, success: true };

  const toData = (q: NormalizedQuestion) => ({
    questionNumber: q.questionNumber,
    questionText: q.questionText,
    options: JSON.stringify(q.options),
    correctAnswer: q.correctAnswer,
    questionType: q.questionType,
    explanation: q.explanation || null,
    section: q.section,
    topic: q.topic,
    difficulty: q.difficulty,
  });

  // All or nothing: a failure part-way leaves the paper exactly as it was.
  await prisma.$transaction(
    async (tx) => {
      if (toDelete.length) {
        await tx.attemptAnswer.deleteMany({ where: { questionId: { in: toDelete } } });
        await tx.question.deleteMany({ where: { id: { in: toDelete } } });
      }
      for (const { id, q, answerChanged } of toUpdate) {
        await tx.question.update({ where: { id }, data: toData(q) });
        if (answerChanged) {
          // Keep saved answers' correctness in line with the new answer key.
          const saved = await tx.attemptAnswer.findMany({ where: { questionId: id, NOT: { selectedAnswer: null } } });
          for (const a of saved) {
            const isCorrect = isAnswerCorrect(q.questionType, q.correctAnswer, a.selectedAnswer);
            if (a.isCorrect !== isCorrect) await tx.attemptAnswer.update({ where: { id: a.id }, data: { isCorrect } });
          }
        }
      }
      if (toCreate.length) {
        await tx.question.createMany({ data: toCreate.map((q) => ({ paperId, ...toData(q) })) });
      }
      const total = await tx.question.count({ where: { paperId } });
      await tx.paper.update({ where: { id: paperId }, data: { totalQuestions: total } });
    },
    { maxWait: 15_000, timeout: 120_000 }
  );

  safeRevalidate("/admin");
  safeRevalidate("/admin/questions");
  safeRevalidate("/admin/papers");
  safeRevalidate(`/papers/${paperId}`);
  return { ...result, success: true };
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

  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId }, select: { id: true } });
  if (!attempt) throw new Error("Attempt not found");

  await finalizeAttempt(attemptId, "AUTO_SUBMITTED");

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

  const existing = await prisma.attempt.findFirst({
    where: { userId, paperId, status: "IN_PROGRESS" },
  });

  if (existing) {
    return { success: true, attemptId: existing.id, isExisting: true };
  }

  // A custom duration only applies to papers with one overall timer; sectional papers keep their section times.
  const attempt = await createAttempt({
    userId,
    paper,
    mode,
    customDurationSeconds: customDurationMinutes ? customDurationMinutes * 60 : null,
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

  const extraMs = additionalMinutes * 60 * 1000;
  const currentEndsAt = attempt.endsAt ? new Date(attempt.endsAt).getTime() : Date.now();
  const newEndsAt = new Date(Math.max(currentEndsAt, Date.now()) + extraMs);

  // Sectional exams: the extra time goes to the section the student is in now.
  await prisma.attempt.update({
    where: { id: attemptId },
    data: attempt.sectionOrder
      ? { endsAt: newEndsAt, sectionExtraSeconds: attempt.sectionExtraSeconds + additionalMinutes * 60 }
      : { endsAt: newEndsAt },
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

  let previousOrder: string[] | null = null;
  try {
    previousOrder = attempt.sectionOrder ? JSON.parse(attempt.sectionOrder) : null;
  } catch {
    previousOrder = null;
  }
  const state = await freshAttemptState({ paper: attempt.paper, mode: attempt.mode, sectionOrder: previousOrder });

  await prisma.$transaction(async (tx) => {
    await tx.attemptAnswer.deleteMany({ where: { attemptId } });
    await tx.attempt.update({
      where: { id: attemptId },
      data: {
        ...state,
        status: "IN_PROGRESS",
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
          questions: { orderBy: [{ questionNumber: "asc" }, { id: "asc" }] },
        },
      },
      answers: true,
    },
  });

  if (!attempt) throw new Error("Attempt not found");

  return attempt;
}
