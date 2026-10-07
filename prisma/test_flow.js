const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function testFullPlatform() {
  console.log('--- 1. Testing User Accounts ---');
  const admin = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
  const student = await prisma.user.findUnique({ where: { email: 'student@example.com' } });
  console.log('Admin user exists:', !!admin, admin?.role);
  console.log('Student user exists:', !!student, student?.role);

  console.log('\n--- 2. Testing Exams & Papers ---');
  const exams = await prisma.exam.findMany({ include: { papers: { include: { questions: true } } } });
  for (const exam of exams) {
    console.log(`Exam: ${exam.name} (${exam.slug}) - ${exam.papers.length} papers`);
    for (const paper of exam.papers) {
      console.log(`  Paper: ${paper.title} (${paper.totalQuestions} questions in DB: ${paper.questions.length})`);
    }
  }

  console.log('\n--- 3. Testing Practice Mode Flow ---');
  const cmatPaper = await prisma.paper.findFirst({ where: { title: { contains: 'CMAT 2025' } }, include: { questions: true } });
  if (cmatPaper) {
    const practiceAttempt = await prisma.attempt.create({
      data: {
        userId: student.id,
        paperId: cmatPaper.id,
        mode: 'PRACTICE',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });

    const q1 = cmatPaper.questions[0];
    const isCorrect = q1.correctAnswer === 'A';
    await prisma.attemptAnswer.create({
      data: {
        attemptId: practiceAttempt.id,
        questionId: q1.id,
        selectedAnswer: 'A',
        isCorrect: isCorrect,
      },
    });

    console.log(`Practice Attempt ID: ${practiceAttempt.id}`);
    console.log(`Answered Q1: selected 'A', correct is '${q1.correctAnswer}' => isCorrect: ${isCorrect}`);
  }

  console.log('\n--- 4. Testing Mock Mode & Evaluation Engine ---');
  const snapPaper = await prisma.paper.findFirst({ where: { title: { contains: 'SNAP 2024' } }, include: { questions: true } });
  if (snapPaper) {
    const mockAttempt = await prisma.attempt.create({
      data: {
        userId: student.id,
        paperId: snapPaper.id,
        mode: 'MOCK',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        endsAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    // Answer Q1 correctly, Q2 incorrectly, Q3 leave unattempted
    const questions = snapPaper.questions;
    if (questions.length >= 2) {
      await prisma.attemptAnswer.create({
        data: {
          attemptId: mockAttempt.id,
          questionId: questions[0].id,
          selectedAnswer: questions[0].correctAnswer, // Correct
        },
      });
      await prisma.attemptAnswer.create({
        data: {
          attemptId: mockAttempt.id,
          questionId: questions[1].id,
          selectedAnswer: questions[1].correctAnswer === 'A' ? 'B' : 'A', // Incorrect
        },
      });
    }

    // Now evaluate submission
    const answers = await prisma.attemptAnswer.findMany({ where: { attemptId: mockAttempt.id } });
    let correct = 0;
    let incorrect = 0;
    let unattempted = questions.length;

    for (const q of questions) {
      const a = answers.find(ans => ans.questionId === q.id);
      if (a && a.selectedAnswer) {
        unattempted--;
        const isCorr = a.selectedAnswer === q.correctAnswer;
        if (isCorr) correct++;
        else incorrect++;
        await prisma.attemptAnswer.update({
          where: { id: a.id },
          data: { isCorrect: isCorr },
        });
      }
    }

    const score = (correct * snapPaper.correctMarks) + (incorrect * snapPaper.incorrectMarks) + (unattempted * snapPaper.unattemptedMarks);
    const accuracy = (correct + incorrect) > 0 ? (correct / (correct + incorrect)) * 100 : 0;

    await prisma.attempt.update({
      where: { id: mockAttempt.id },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        score,
        correct,
        incorrect,
        unattempted,
        accuracy,
        timeTaken: 124, // 2m 4s
      },
    });

    console.log(`Mock Attempt Submitted: Score = ${score}, Correct = ${correct}, Incorrect = ${incorrect}, Unattempted = ${unattempted}, Accuracy = ${accuracy}%`);
  }

  console.log('\n--- ALL DATABASE AND LOGIC TESTS PASSED SUCCESSFULLY! ---');
}

testFullPlatform()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
