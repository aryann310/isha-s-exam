import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site/site-header";
import { ExamBadge } from "@/components/site/exam-badge";
import { themeForExam, themeForPaper } from "@/lib/exam-theme";
import { SURPRISE_EXAM_SLUG } from "@/lib/surprise";
import { Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const isAdmin = session.role === "ADMIN";

  const [allExams, myAttempts] = await Promise.all([
    prisma.exam.findMany({
      where: { isActive: true },
      include: {
        papers: {
          where: { isActive: true },
          select: { id: true, examPattern: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.attempt.findMany({
      where: { userId: session.userId as string },
      orderBy: { startedAt: "desc" },
      take: 6,
      include: {
        paper: {
          include: { exam: true },
        },
      },
    }),
  ]);
  // Students only see exams that have at least one published paper.
  // The Surprise Test has its own tab, so it is left out of the exam grid.
  const surprise = allExams.find((e) => e.slug === SURPRISE_EXAM_SLUG);
  const exams = (isAdmin ? allExams : allExams.filter((e) => e.papers.length > 0)).filter((e) => e.slug !== SURPRISE_EXAM_SLUG);
  const name = (session.username as string) || (session.name as string) || "Student";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <SiteHeader name={name} isAdmin={isAdmin} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-10 space-y-10">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-semibold text-gray-900">Choose an exam</h1>
          <p className="text-gray-600 mt-2 max-w-xl leading-relaxed">
            Mock tests follow each exam&apos;s real rules and timing. Practice shows the answer after every question.
          </p>
        </div>

        {surprise && surprise.papers.length > 0 && (
          <Link
            href="/surprise"
            data-exam-theme="surprise"
            className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-exam-dark text-white rounded-2xl px-6 py-5 hover:shadow-md transition-shadow"
          >
            <span className="flex items-start gap-4">
              <Sparkles className="w-8 h-8 shrink-0 mt-0.5" aria-hidden />
              <span>
                <span className="block font-semibold text-lg">Surprise Test</span>
                <span className="block text-sm text-exam-on-dark mt-0.5">
                  30 mixed questions from CAT, CMAT, SNAP and NMAT · 60 minutes · solutions right after you submit
                </span>
              </span>
            </span>
            <span className="shrink-0 inline-flex items-center justify-center bg-white text-exam-dark font-semibold text-sm px-4 h-10 rounded-lg group-hover:bg-exam-tint">
              Take the surprise test &rarr;
            </span>
          </Link>
        )}

        {exams.length === 0 ? (
          <div className="text-center text-gray-600 bg-white p-8 rounded-2xl border border-gray-200">
            <p className="font-semibold text-gray-900">No exams are available right now.</p>
            {isAdmin && (
              <Link href="/admin/exams" className="mt-3 inline-block text-sm font-semibold text-gray-900 underline underline-offset-4">
                Create your first exam in Admin
              </Link>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {exams.map((exam) => (
              <Link
                key={exam.id}
                href={`/exams/${exam.slug}`}
                data-exam-theme={themeForExam(exam)}
                className="group flex flex-col bg-white border border-gray-200 rounded-2xl overflow-hidden hover:border-exam-primary hover:shadow-md transition-all"
              >
                <span className="bg-exam-dark text-white font-exam font-bold text-3xl px-5 py-6 leading-none">{exam.name}</span>
                <span className="flex flex-col gap-1.5 px-5 py-4 flex-1">
                  <span className="text-sm font-semibold text-gray-900">
                    {exam.papers.length} {exam.papers.length === 1 ? "paper" : "papers"}
                  </span>
                  <span className="text-sm text-gray-600 line-clamp-2">
                    {exam.description || "Previous year papers and full-length mock tests."}
                  </span>
                  <span className="mt-auto pt-3 text-sm font-semibold text-exam-primary group-hover:underline underline-offset-4">
                    View papers &rarr;
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}

        {myAttempts.length > 0 && (
          <section aria-labelledby="recent" className="space-y-4">
            <div>
              <h2 id="recent" className="font-heading text-2xl font-semibold text-gray-900">
                Your recent tests
              </h2>
              <p className="text-sm text-gray-600 mt-1">Results and solutions for the tests you have taken.</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-200">
              {myAttempts.map((att) => {
                const done = att.status === "SUBMITTED" || att.status === "AUTO_SUBMITTED";
                return (
                  <div key={att.id} className="px-5 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <ExamBadge theme={att.paper ? themeForPaper(att.paper, att.paper.exam?.name) : "main"}>
                          {att.paper?.exam?.name || "Exam"}
                        </ExamBadge>
                        <span className="font-semibold text-gray-900">{att.paper?.title || "Paper"}</span>
                        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                          {att.mode === "MOCK" ? "Mock test" : "Practice"}
                        </span>
                      </div>
                      <p suppressHydrationWarning className="text-sm text-gray-600 mt-1">
                        {new Date(att.startedAt).toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "Asia/Kolkata",
                        })}
                        {done ? ` · Accuracy ${Math.round(att.accuracy || 0)}%` : " · In progress"}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                      {done ? (
                        <>
                          <div className="text-right">
                            <span className="text-lg font-bold text-gray-900 tabular-nums">{att.score}</span>
                            <span className="text-sm text-gray-600"> marks</span>
                          </div>
                          <div className="flex gap-2">
                            <Link
                              href={`/results/${att.id}`}
                              className="text-sm font-semibold border border-gray-300 hover:bg-gray-100 text-gray-900 px-3.5 h-9 inline-flex items-center rounded-lg"
                            >
                              Result
                            </Link>
                            <Link
                              href={`/solutions/${att.id}`}
                              className="text-sm font-semibold bg-gray-900 hover:bg-gray-800 text-white px-3.5 h-9 inline-flex items-center rounded-lg"
                            >
                              Solutions
                            </Link>
                          </div>
                        </>
                      ) : (
                        <Link
                          href={`/exam/${att.id}`}
                          className="text-sm font-semibold bg-gray-900 hover:bg-gray-800 text-white px-4 h-10 inline-flex items-center rounded-lg"
                        >
                          Resume test &rarr;
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
