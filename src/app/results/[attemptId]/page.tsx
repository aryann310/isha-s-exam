import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

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
    { total: number; correct: number; incorrect: number; unattempted: number }
  > = {};

  // ponytail: O(N) map instead of O(N^2) find
  const ansByQ = Object.fromEntries(attempt.answers.map(a => [a.questionId, a]));

  attempt.paper.questions.forEach((q) => {
    const sec = q.section || "General";
    if (!sectionStats[sec]) {
      sectionStats[sec] = { total: 0, correct: 0, incorrect: 0, unattempted: 0 };
    }
    sectionStats[sec].total++;

    const ans = ansByQ[q.id];
    if (!ans || !ans.selectedAnswer) {
      sectionStats[sec].unattempted++;
    } else if (ans.isCorrect) {
      sectionStats[sec].correct++;
    } else {
      sectionStats[sec].incorrect++;
    }
  });

  const sectionsList = Object.entries(sectionStats);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-xs">
        <div className="flex items-center gap-3">
          <span className="bg-gray-950 text-white text-xs font-black px-2 py-0.5 rounded">
            {attempt.paper?.exam?.name || "Exam"}
          </span>
          <h1 className="text-lg font-bold tracking-tight text-gray-900">EXAMINATION RESULT</h1>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/exams" className="text-sm font-semibold text-gray-700 hover:text-black">
            &larr; Choose Exam
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 md:p-12 shadow-xs text-center">
          <p className="text-xs uppercase tracking-widest font-black text-gray-400 mb-1">
            {attempt.paper?.exam?.name || "Exam"} • {attempt.mode} TEST
          </p>
          <h2 className="text-3xl font-black text-gray-950 mb-8">{attempt.paper?.title || "Paper"}</h2>

          {/* Primary Score Counter */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 mb-8">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              Final Examination Score
            </p>
            <div className="flex justify-center items-baseline gap-2 mb-2">
              <span className="text-6xl font-black text-gray-950 tracking-tight">
                {attempt.score}
              </span>
              <span className="text-xl font-bold text-gray-400">
                pts
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Total Questions: {attempt.paper.totalQuestions} • Duration: {Math.round(attempt.paper.durationSeconds / 60)} mins
            </p>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
              <p className="text-xs font-semibold text-gray-500 mb-1">Accuracy</p>
              <p className="text-2xl font-black text-blue-600">{Math.round(attempt.accuracy || 0)}%</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
              <p className="text-xs font-semibold text-gray-500 mb-1">Time Taken</p>
              <p className="text-2xl font-black text-gray-900 font-mono">
                {formatTime(attempt.timeTaken || 0)}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
              <p className="text-xs font-semibold text-gray-500 mb-1">Attempted</p>
              <p className="text-2xl font-black text-gray-900">
                {(attempt.correct || 0) + (attempt.incorrect || 0)}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
              <p className="text-xs font-semibold text-gray-500 mb-1">Status</p>
              <p className="text-xs font-black uppercase text-emerald-700 bg-emerald-50 px-2 py-1.5 rounded-lg border border-emerald-200 mt-1 inline-block">
                {attempt.status}
              </p>
            </div>
          </div>

          {/* Summary Breakdown Row */}
          <div className="grid grid-cols-3 divide-x divide-gray-200 border-t border-b border-gray-200 py-6 mb-10 bg-gray-50 rounded-xl">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Correct</p>
              <p className="text-3xl font-black text-emerald-600">{attempt.correct}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Incorrect</p>
              <p className="text-3xl font-black text-rose-600">{attempt.incorrect}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Unattempted</p>
              <p className="text-3xl font-black text-gray-400">{attempt.unattempted}</p>
            </div>
          </div>

          {/* SECTION PERFORMANCE (Requirement 21) */}
          {sectionsList.length > 0 && (
            <div className="text-left mb-10 border border-gray-200 rounded-2xl p-6 bg-white">
              <h3 className="text-sm font-black uppercase tracking-wider text-gray-900 mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                <span>📊</span> Section-Wise Performance
              </h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {sectionsList.map(([secName, stat]) => {
                  const attemptedInSec = stat.correct + stat.incorrect;
                  const secAcc = attemptedInSec > 0 ? Math.round((stat.correct / attemptedInSec) * 100) : 0;
                  return (
                    <div
                      key={secName}
                      className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col justify-between"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-gray-900 text-sm">{secName}</span>
                        <span className="text-xs font-black bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                          {secAcc}% Acc
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-gray-600">
                        <span>
                          <strong className="text-emerald-700">{stat.correct}</strong> / {stat.total} correct
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {stat.incorrect} incorrect • {stat.unattempted} skipped
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Navigation Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={`/solutions/${attempt.id}`}
              className="bg-gray-950 text-white font-bold px-8 py-3.5 rounded-xl hover:bg-gray-800 transition-colors shadow-md text-sm"
            >
              VIEW COMPLETE SOLUTIONS &rarr;
            </Link>
            <Link
              href={`/papers/${attempt.paperId}`}
              className="bg-white text-gray-900 border-2 border-gray-900 font-bold px-8 py-3.5 rounded-xl hover:bg-gray-50 transition-colors text-sm"
            >
              RETAKE PAPER
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
