const { PrismaClient } = require('@prisma/client');
const assert = require('assert');

const prisma = new PrismaClient();

async function checkCascadeDelete() {
  console.log('--- Checking Cascade Delete Under SQLite Foreign Keys ---');
  const exam = await prisma.exam.findFirst();
  assert(exam, 'Exam must exist');
  const user = await prisma.user.findFirst();
  assert(user, 'User must exist');

  // 1. Create a dummy paper
  const paper = await prisma.paper.create({
    data: {
      examId: exam.id,
      title: 'Temporary Deletion Test Paper',
      year: 2026,
      durationSeconds: 1800,
      totalQuestions: 1,
    },
  });

  // 2. Create a question
  const question = await prisma.question.create({
    data: {
      paperId: paper.id,
      questionNumber: 1,
      questionText: 'Is this a test question?',
      options: JSON.stringify({ A: 'Yes', B: 'No' }),
      correctAnswer: 'A',
    },
  });

  // 3. Create an attempt
  const attempt = await prisma.attempt.create({
    data: {
      userId: user.id,
      paperId: paper.id,
      mode: 'MOCK',
      status: 'SUBMITTED',
    },
  });

  // 4. Create an attempt answer
  const answer = await prisma.attemptAnswer.create({
    data: {
      attemptId: attempt.id,
      questionId: question.id,
      selectedAnswer: 'A',
      isCorrect: true,
    },
  });

  console.log(`Created test paper (${paper.id}) with question, attempt, and answer.`);

  // 5. Test cascading delete (mirrors deletePaperAction)
  await prisma.$transaction(async (tx) => {
    const attempts = await tx.attempt.findMany({ where: { paperId: paper.id }, select: { id: true } });
    const attemptIds = attempts.map((a) => a.id);
    if (attemptIds.length > 0) {
      await tx.attemptAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
      await tx.attempt.deleteMany({ where: { id: { in: attemptIds } } });
    }
    await tx.question.deleteMany({ where: { paperId: paper.id } });
    await tx.paper.delete({ where: { id: paper.id } });
  });

  // 6. Assert all records are gone
  const paperCheck = await prisma.paper.findUnique({ where: { id: paper.id } });
  const questionCheck = await prisma.question.findUnique({ where: { id: question.id } });
  const attemptCheck = await prisma.attempt.findUnique({ where: { id: attempt.id } });
  const answerCheck = await prisma.attemptAnswer.findUnique({
    where: { attemptId_questionId: { attemptId: attempt.id, questionId: question.id } },
  });

  assert.strictEqual(paperCheck, null, 'Paper should be deleted');
  assert.strictEqual(questionCheck, null, 'Question should be deleted');
  assert.strictEqual(attemptCheck, null, 'Attempt should be deleted');
  assert.strictEqual(answerCheck, null, 'AttemptAnswer should be deleted');

  console.log('✓ Cascade deletion verified cleanly! No foreign key constraint violations.');
}

checkCascadeDelete()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('FAILED:', e);
    prisma.$disconnect();
    process.exit(1);
  });
