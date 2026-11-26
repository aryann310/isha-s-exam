import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { isAnswerCorrect, isAnswered, marksFor, resolvePaperSections, sectionKey } from "@/lib/exam-patterns";
import { loadAttemptContext } from "@/server/attempts";
import { untimedPending, untimedSummary } from "@/server/untimed";
import { skipUntimedFormAction } from "@/server/actions/untimed";
import { themeForPaper } from "@/lib/exam-theme";
import { SiteHeader } from "@/components/site/site-header";
import { ExamBadge } from "@/components/site/exam-badge";
import { isSurprisePaper } from "@/lib/surprise";

export const dynamic = "force-dynamic";

export default async function ResultPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const resolvedParams = await params;
  const isAdmin = session.role === "ADMIN";

  // Closes the attempt first if its time ran out while the candidate was away.
  await loadAttemptContext(resolvedParams.attemptId, session);

  const attempt = await prisma.attempt.findFirst({
    where: isAdmin
      ? { id: resolvedParams.attemptId }
      : { id: resolvedParams.attemptId, userId: session.userId as string },
    include: {
      paper: {
        include: {
          exam: true,
          questions: true,
        },
      },
      answers: true,
      untimedAnswers: { select: { questionId: true, selectedAnswer: true } },
    },
  });

  if (!attempt || (attempt.status === "IN_PROGRESS" && !isAdmin)) return notFound();

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Section-wise analysis
  const sectionStats: Record<
    string,
    { total: number; correct: number; incorrect: number; unattempted: number; score: number }
  > = {};
  // Sections in exam order, so the table reads like the paper.
  for (const s of resolvePaperSections(attempt.paper, attempt.paper.questions)) {
    sectionStats[s.name] = { total: 0, correct: 0, incorrect: 0, unattempted: 0, score: 0 };
  }

  // ponytail: O(N) map instead of O(N^2) find
  const ansByQ = Object.fromEntries(attempt.answers.map(a => [a.questionId, a]));

  attempt.paper.questions.forEach((q) => {
    const sec = sectionKey(q.section);
    if (!sectionStats[sec]) {
      sectionStats[sec] = { total: 0, correct: 0, incorrect: 0, unattempted: 0, score: 0 };
    }
    sectionStats[sec].total++;

    const ans = ansByQ[q.id];
    const marks = marksFor(attempt.paper, q.questionType, q.section);
    if (!ans || !isAnswered(ans.selectedAnswer)) {
      sectionStats[sec].unattempted++;
      sectionStats[sec].score += attempt.paper.unattemptedMarks;
    } else if (isAnswerCorrect(q.questionType, q.correctAnswer, ans.selectedAnswer)) {
      sectionStats[sec].correct++;
      sectionStats[sec].score += marks.correct;
    } else {
      sectionStats[sec].incorrect++;
      sectionStats[sec].score += marks.incorrect;
    }
  });

  const sectionsList = Object.entries(sectionStats).filter(([, stat]) => stat.total > 0);

  // Untimed phase: questions left in the test can still be answered (score unchanged); solutions wait for it.
  const pending = untimedPending(attempt);
  const ownAttempt = attempt.userId === session.userId;
  const extra = untimedSummary(attempt.paper, attempt.paper.questions, attempt.untimedAnswers);

  const theme = themeForPaper(attempt.paper, attempt.paper.exam?.name);
  const name = (session.username as string) || (session.name as string) || "Student";
  const statusText =
    attempt.status === "AUTO_SUBMITTED" ? "Submitted when time ran out" : attempt.status === "SUBMITTED" ? "Submitted" : "In progress";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <SiteHeader name={name} isAdmin={isAdmin} back={isSurprisePaper(attempt.paper) ? { href: "/surprise", label: "Surprise Test" } : { href: "/exams", label: "All exams" }} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-10 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <ExamBadge theme={theme}>{attempt.paper?.exam?.name || "Exam"}</ExamBadge>
          <span className="text-sm text-gray-600">
            {attempt.mode === "MOCK" ? "Mock test" : "Practice"} · {statusText}
          </span>
        </div>
        <h1 className="font-heading text-3xl sm:text-4xl font-semibold text-gray-900 -mt-2">{attempt.paper?.title || "Paper"}</h1>

        {/* Score */}
        <section aria-label="Score" className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-gray-600">Your score</p>
              <p className="mt-1">
                <span className="text-6xl font-bold text-gray-900 tabular-nums tracking-tight">{attempt.score}</span>
                <span className="text-lg font-medium text-gray-600"> marks</span>
              </p>
              <p className="text-sm text-gray-600 mt-2">
                {attempt.paper.totalQuestions} questions · {Math.round(attempt.paper.durationSeconds / 60)} min paper
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-6 sm:gap-10 text-center">
              <div>
                <dt className="text-sm text-gray-600">Correct</dt>
                <dd className="text-3xl font-bold text-st-answered tabular-nums">{attempt.correct}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-600">Wrong</dt>
                <dd className="text-3xl font-bold text-st-not-answered tabular-nums">{attempt.incorrect}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-600">Skipped</dt>
                <dd className="text-3xl font-bold text-gray-500 tabular-nums">{attempt.unattempted}</dd>
              </div>
            </dl>
          </div>

          <dl className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-gray-200">
            <div>
              <dt className="text-sm text-gray-600">Accuracy</dt>
              <dd className="text-xl font-semibold text-gray-900 tabular-nums">{Math.round(attempt.accuracy || 0)}%</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Time taken</dt>
              <dd className="text-xl font-semibold text-gray-900 tabular-nums">{formatTime(attempt.timeTaken || 0)}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Attempted</dt>
              <dd className="text-xl font-semibold text-gray-900 tabular-nums">{(attempt.correct || 0) + (attempt.incorrect || 0)}</dd>
            </div>
          </dl>
        </section>

        {pending && ownAttempt && (
          <section aria-labelledby="untimed-next" data-exam-theme={theme} className="bg-white border-2 border-exam-primary rounded-2xl p-6 sm:p-8">
            <h2 id="untimed-next" className="font-heading text-2xl font-semibold text-gray-900">
              {attempt.unattempted} question{attempt.unattempted === 1 ? "" : "s"} left unanswered
            </h2>
            <p className="text-gray-600 mt-1 mb-5">
              Continue them now with no time limit. Your score above stays as it is. Solutions open when you finish.
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <Link
                href={`/exam/${attempt.id}/continue`}
                className="inline-flex items-center justify-center bg-exam-primary hover:bg-exam-primary-hover text-white font-semibold px-6 h-11 rounded-lg"
              >
                Continue unanswered questions &rarr;
              </Link>
              <form action={skipUntimedFormAction}>
                <input type="hidden" name="attemptId" value={attempt.id} />
                <button type="submit" className="w-full sm:w-auto text-sm font-semibold text-gray-700 underline underline-offset-2 px-2 h-11">
                  Skip and show solutions
                </button>
              </form>
            </div>
          </section>
        )}

        {/* Section performance */}
        {sectionsList.length > 0 && (
          <section aria-labelledby="by-section" className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8">
            <h2 id="by-section" className="font-heading text-2xl font-semibold text-gray-900 mb-4">
              By section
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-left text-gray-600 border-b border-gray-200">
                    <th className="py-2 pr-4 font-medium">Section</th>
                    <th className="py-2 px-3 font-medium text-right">Marks</th>
                    <th className="py-2 px-3 font-medium text-right">Correct</th>
                    <th className="py-2 px-3 font-medium text-right">Wrong</th>
                    <th className="py-2 px-3 font-medium text-right">Skipped</th>
                    <th className="py-2 pl-3 font-medium text-right">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionsList.map(([secName, stat]) => {
                    const attemptedInSec = stat.correct + stat.incorrect;
                    const secAcc = attemptedInSec > 0 ? Math.round((stat.correct / attemptedInSec) * 100) : 0;
                    return (
                      <tr key={secName} className="border-b border-gray-100 last:border-0">
                        <td className="py-3 pr-4 font-semibold text-gray-900">{secName}</td>
                        <td className="py-3 px-3 text-right font-semibold tabular-nums">{Math.round(stat.score * 100) / 100}</td>
                        <td className="py-3 px-3 text-right tabular-nums text-st-answered">
                          {stat.correct} <span className="text-gray-500">/ {stat.total}</span>
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums">{stat.incorrect}</td>
                        <td className="py-3 px-3 text-right tabular-nums">{stat.unattempted}</td>
                        <td className="py-3 pl-3 text-right tabular-nums">{secAcc}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Untimed phase results: shown apart, never part of the score above */}
        {extra.answered > 0 && (
          <section aria-labelledby="untimed-result" className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8">
            <h2 id="untimed-result" className="font-heading text-2xl font-semibold text-gray-900">
              Untimed phase{pending ? " (in progress)" : ""}
            </h2>
            <p className="text-sm text-gray-600 mt-1 mb-5">Questions you answered after the test, with no time limit. Not included in your score.</p>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <dt className="text-sm text-gray-600">Answered</dt>
                <dd className="text-xl font-semibold text-gray-900 tabular-nums">
                  {extra.answered} <span className="text-gray-500 text-base">/ {attempt.unattempted ?? extra.answered}</span>
                </dd>
              </div>
              {pending ? (
                <div className="col-span-1 sm:col-span-3 text-sm text-gray-600 self-center">Correct answers and marks show when you finish.</div>
              ) : (
                <>
                  <div>
                    <dt className="text-sm text-gray-600">Correct</dt>
                    <dd className="text-xl font-semibold text-st-answered tabular-nums">{extra.correct}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600">Wrong</dt>
                    <dd className="text-xl font-semibold text-st-not-answered tabular-nums">{extra.incorrect}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600">Would have added</dt>
                    <dd className="text-xl font-semibold text-gray-900 tabular-nums">
                      {extra.marks > 0 ? "+" : ""}
                      {extra.marks} marks
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </section>
        )}

        <div data-exam-theme={theme} className="flex flex-col sm:flex-row gap-3">
          {(!pending || isAdmin) && (
            <Link
              href={`/solutions/${attempt.id}`}
              className="inline-flex items-center justify-center bg-exam-primary hover:bg-exam-primary-hover text-white font-semibold px-6 h-11 rounded-lg"
            >
              See all solutions &rarr;
            </Link>
          )}
          <Link
            href={isSurprisePaper(attempt.paper) ? "/surprise" : `/papers/${attempt.paperId}`}
            className="inline-flex items-center justify-center bg-white text-gray-900 border border-gray-300 hover:bg-gray-100 font-semibold px-6 h-11 rounded-lg"
          >
            {isSurprisePaper(attempt.paper) ? "Back to Surprise Test" : "Take this paper again"}
          </Link>
        </div>
      </main>
    </div>
  );
}
