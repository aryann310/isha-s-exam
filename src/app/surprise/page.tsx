import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Clock, ListChecks, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { getPattern } from "@/lib/exam-patterns";
import { SURPRISE_EXAM_SLUG, SURPRISE_PATTERN } from "@/lib/surprise";
import { formatOpening, isPaperClosed, isPaperUpcoming, notExpired, purgeExpiredPapers } from "@/server/paper-expiry";
import { Countdown } from "@/components/site/countdown";

export const dynamic = "force-dynamic";

/** The Surprise Test tab: short mixed papers, newest first, with this student's result for each. */
export default async function SurprisePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const isAdmin = session.role === "ADMIN";
  const userId = session.userId as string;
  const name = (session.username as string) || (session.name as string) || "Student";
  const pattern = getPattern(SURPRISE_PATTERN);
  await purgeExpiredPapers();

  const papers = await prisma.paper.findMany({
    where: {
      exam: { slug: SURPRISE_EXAM_SLUG, ...(isAdmin ? {} : { isActive: true }) },
      ...(isAdmin ? {} : { isActive: true }),
      ...notExpired(),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      totalQuestions: true,
      durationSeconds: true,
      isActive: true,
      createdAt: true,
      closedAt: true,
      opensAt: true,
      deleteAt: true,
      attempts: {
        where: { userId },
        orderBy: { startedAt: "desc" },
        select: { id: true, status: true, score: true, correct: true, incorrect: true, startedAt: true },
      },
    },
  });
  const maxMarks = (p: { totalQuestions: number }) => p.totalQuestions * pattern.marks.correct;
  // "New" goes on the newest paper that can still be taken.
  const newestId = papers.find((p) => p.isActive && !isPaperClosed(p))?.id;
  // The next scheduled paper (soonest opening), shown with a big countdown at the top.
  const upcoming = papers
    .filter((p) => p.isActive && isPaperUpcoming(p))
    .sort((a, b) => a.opensAt!.getTime() - b.opensAt!.getTime())[0];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <SiteHeader name={name} isAdmin={isAdmin} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-10 space-y-8" data-exam-theme="surprise">
        <section className="bg-exam-dark text-white rounded-2xl px-6 sm:px-8 py-8 overflow-hidden relative">
          <Sparkles className="absolute -right-4 -top-4 w-40 h-40 text-white/5" aria-hidden />
          <span className="inline-flex items-center gap-1.5 bg-white text-exam-dark text-xs font-bold uppercase tracking-wide px-2 py-1 rounded">
            <Sparkles className="w-3.5 h-3.5" aria-hidden /> Surprise Test
          </span>
          <h1 className="font-heading text-3xl sm:text-4xl font-semibold mt-4">Ready for a surprise?</h1>
          <p className="text-exam-on-dark mt-2 max-w-2xl leading-relaxed">
            Thirty questions you have not seen, mixed from every subject and every difficulty, in the style of CAT, CMAT,
            SNAP and NMAT. One hour on the clock. Your result and a worked solution for every question appear the moment you submit.
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <li className="flex items-center gap-2"><ListChecks className="w-4 h-4" aria-hidden /> 30 questions</li>
            <li className="flex items-center gap-2"><Clock className="w-4 h-4" aria-hidden /> 60 minutes</li>
            <li className="flex items-center gap-2">
              Marks <strong className="font-semibold">+{pattern.marks.correct}</strong> / <strong className="font-semibold">{pattern.marks.incorrect}</strong>
            </li>
          </ul>
          {upcoming?.opensAt && (
            <div className="mt-7 pt-6 border-t border-white/15">
              <p suppressHydrationWarning className="text-sm text-exam-on-dark">
                <strong className="text-white">{upcoming.title}</strong> opens on {formatOpening(upcoming.opensAt)}. It unlocks in
              </p>
              <div className="mt-3">
                <Countdown target={upcoming.opensAt.toISOString()} size="lg" />
              </div>
            </div>
          )}
        </section>

        {papers.length === 0 ? (
          <div className="text-gray-600 bg-white p-10 border border-gray-200 rounded-2xl text-center space-y-2">
            <Sparkles className="w-8 h-8 mx-auto text-exam-primary" aria-hidden />
            <p className="font-semibold text-gray-900">No surprise test yet.</p>
            <p className="text-sm text-gray-600">A new one will appear here without warning. Check back soon.</p>
          </div>
        ) : (
          <section aria-labelledby="surprise-papers" className="space-y-3">
            <h2 id="surprise-papers" className="font-heading text-2xl font-semibold text-gray-900">
              Surprise tests
            </h2>
            {papers.map((paper) => {
              const running = paper.attempts.find((a) => a.status === "IN_PROGRESS");
              const finished = paper.attempts.find((a) => a.status !== "IN_PROGRESS");
              const closed = isPaperClosed(paper);
              const notYet = isPaperUpcoming(paper);
              const isNew = paper.id === newestId && !finished;
              const primary = "inline-flex items-center justify-center bg-exam-primary hover:bg-exam-primary-hover text-white rounded-lg px-4 h-10 text-sm font-semibold";
              const secondary = "inline-flex items-center justify-center border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 rounded-lg px-4 h-10 text-sm font-semibold";
              return (
                <div
                  key={paper.id}
                  className={`bg-white border rounded-2xl px-5 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${
                    isNew ? "border-exam-primary border-2" : "border-gray-200"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-gray-900">{paper.title}</h3>
                      {isNew && <span className="text-xs font-bold uppercase tracking-wide bg-exam-primary text-white px-2 py-0.5 rounded">New</span>}
                      {finished && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide bg-st-answered text-white px-2 py-0.5 rounded">
                          <Check className="w-3 h-3" aria-hidden /> Done
                        </span>
                      )}
                      {closed && <span className="text-xs font-bold uppercase tracking-wide bg-gray-200 text-gray-800 px-2 py-0.5 rounded">Closed</span>}
                      {!paper.isActive && (
                        <span className="text-xs font-semibold bg-amber-100 text-amber-900 px-2 py-0.5 rounded">Hidden from students</span>
                      )}
                    </div>
                    <p suppressHydrationWarning className="text-sm text-gray-600 mt-1">
                      {paper.totalQuestions} questions · {Math.round(paper.durationSeconds / 60)} min · added{" "}
                      {new Date(paper.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
                    </p>
                    {finished && (
                      <p className="text-sm text-gray-900 mt-1">
                        Your score: <strong className="tabular-nums">{finished.score ?? 0}</strong>
                        <span className="text-gray-600"> / {maxMarks(paper)}</span>
                        <span className="text-gray-600">
                          {" "}· {finished.correct ?? 0} right, {finished.incorrect ?? 0} wrong
                        </span>
                      </p>
                    )}
                    {closed && (
                      <p className="text-sm text-gray-600 mt-1">
                        This test can no longer be taken; anyone can read its solutions.
                        {paper.deleteAt && (
                          <>
                            {" "}It disappears in <Countdown target={paper.deleteAt.toISOString()} />.
                          </>
                        )}
                      </p>
                    )}
                    {notYet && paper.opensAt && (
                      <p suppressHydrationWarning className="text-sm text-gray-900 mt-1">
                        Opens {formatOpening(paper.opensAt)} · in <Countdown target={paper.opensAt.toISOString()} />
                      </p>
                    )}
                    {!finished && !closed && paper.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{paper.description}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {running ? (
                      <Link href={`/exam/${running.id}`} className={primary}>
                        Resume test &rarr;
                      </Link>
                    ) : finished ? (
                      <>
                        <Link href={`/results/${finished.id}`} className={secondary}>
                          Result
                        </Link>
                        <Link href={`/solutions/${finished.id}`} className={primary}>
                          Solutions
                        </Link>
                      </>
                    ) : notYet ? (
                      <span
                        aria-disabled="true"
                        className="inline-flex items-center justify-center gap-1.5 bg-gray-100 text-gray-600 border border-gray-200 rounded-lg px-4 h-10 text-sm font-semibold cursor-not-allowed"
                      >
                        <Clock className="w-4 h-4" aria-hidden /> Not open yet
                      </span>
                    ) : closed ? (
                      <Link href={`/papers/${paper.id}/solutions`} className={primary}>
                        View solutions
                      </Link>
                    ) : (
                      <Link href={`/papers/${paper.id}/instructions`} className={primary}>
                        Start test &rarr;
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
