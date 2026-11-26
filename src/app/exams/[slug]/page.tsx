import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { hasSectionMarks } from "@/lib/exam-patterns";
import { themeForExam } from "@/lib/exam-theme";
import { paperProgress } from "@/server/untimed";
import { SiteHeader } from "@/components/site/site-header";
import { Check, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ExamPapersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const resolvedParams = await params;
  const isAdmin = session.role === "ADMIN";

  // ponytail: findFirst avoids Prisma compound unique constraint error with isActive
  const exam = await prisma.exam.findFirst({
    where: {
      slug: resolvedParams.slug,
      ...(isAdmin ? {} : { isActive: true }),
    },
    include: {
      papers: {
        where: isAdmin ? {} : { isActive: true },
        orderBy: [{ year: "desc" }, { title: "asc" }],
      },
    },
  });

  if (!exam) return notFound();
  const theme = themeForExam(exam);
  const name = (session.username as string) || (session.name as string) || "Student";

  // This student's progress per paper: DONE once a test (mock or practice) is finished, CONTINUE while a
  // finished mock still has unanswered questions waiting in the untimed phase.
  const myAttempts = await prisma.attempt.findMany({
    where: { userId: session.userId as string, paperId: { in: exam.papers.map((p) => p.id) } },
    select: { id: true, paperId: true, mode: true, status: true, unattempted: true, untimedEndedAt: true, submittedAt: true, startedAt: true },
  });
  const progress = new Map(exam.papers.map((p) => [p.id, paperProgress(myAttempts.filter((a) => a.paperId === p.id))]));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <SiteHeader name={name} isAdmin={isAdmin} back={{ href: "/exams", label: "All exams" }} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div data-exam-theme={theme} className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <span className="inline-block bg-exam-dark text-white font-exam font-bold text-2xl leading-none px-3 py-2 rounded-lg">
              {exam.name}
            </span>
            <h1 className="font-heading text-3xl font-semibold text-gray-900 mt-4">{exam.name} papers</h1>
            {exam.description && <p className="text-gray-600 mt-1">{exam.description}</p>}
          </div>

          {isAdmin && (
            <Link
              href={`/admin/papers?examId=${exam.id}`}
              className="bg-gray-900 text-white text-sm font-semibold px-4 h-10 inline-flex items-center rounded-lg hover:bg-gray-800 shrink-0"
            >
              + Add a paper to {exam.name}
            </Link>
          )}
        </div>

        {exam.papers.length === 0 ? (
          <div className="text-gray-600 bg-white p-10 border border-gray-200 rounded-2xl text-center space-y-3">
            <FileText className="w-8 h-8 mx-auto text-gray-400" aria-hidden />
            <p className="font-semibold text-gray-900">No papers published yet for {exam.name}.</p>
            <p className="text-sm text-gray-600 max-w-sm mx-auto">Papers and mock tests for this exam will appear here once published.</p>
            {isAdmin && (
              <Link
                href={`/admin/papers?examId=${exam.id}`}
                className="inline-flex bg-gray-900 text-white text-sm font-semibold px-4 h-10 items-center rounded-lg hover:bg-gray-800"
              >
                + Add the first paper
              </Link>
            )}
          </div>
        ) : (
          <div data-exam-theme={theme} className="space-y-3">
            {exam.papers.map((paper) => {
              const state = progress.get(paper.id);
              return (
              <div
                key={paper.id}
                className="bg-white border border-gray-200 rounded-2xl px-5 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-gray-300"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-gray-900">{paper.title}</h2>
                    {paper.shift && <span className="text-xs font-medium bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{paper.shift}</span>}
                    {state?.kind === "done" && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide bg-st-answered text-white px-2 py-0.5 rounded">
                        <Check className="w-3 h-3" aria-hidden /> Done
                      </span>
                    )}
                    {state?.kind === "continue" && (
                      <span className="text-xs font-bold uppercase tracking-wide bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                        {state.left} unanswered · continue
                      </span>
                    )}
                    {!paper.isActive && (
                      <span className="text-xs font-semibold bg-amber-100 text-amber-900 px-2 py-0.5 rounded">Hidden from students</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {paper.totalQuestions} questions · {Math.round(paper.durationSeconds / 60)} min · marks{" "}
                    <span className="font-semibold text-st-answered">+{paper.correctMarks}</span> /{" "}
                    <span className="font-semibold text-st-not-answered">{paper.incorrectMarks}</span>
                    {(hasSectionMarks(paper) || (paper.titaCorrectMarks != null && paper.titaCorrectMarks !== paper.correctMarks)) && (
                      <span> (some questions carry more marks; see the instructions)</span>
                    )}
                  </p>
                  {paper.description && <p className="text-sm text-gray-500 mt-1 line-clamp-1">{paper.description}</p>}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {state?.kind === "continue" && (
                    <Link
                      href={`/exam/${state.attemptId}/continue`}
                      className="inline-flex items-center justify-center bg-exam-primary hover:bg-exam-primary-hover text-white rounded-lg px-5 h-10 text-sm font-semibold"
                    >
                      Continue unanswered &rarr;
                    </Link>
                  )}
                  <Link
                    href={`/papers/${paper.id}`}
                    className={
                      state?.kind === "continue"
                        ? "inline-flex items-center justify-center border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 rounded-lg px-5 h-10 text-sm font-semibold"
                        : "inline-flex items-center justify-center bg-exam-primary hover:bg-exam-primary-hover text-white rounded-lg px-5 h-10 text-sm font-semibold"
                    }
                  >
                    {state ? "Take again" : "Open paper"} &rarr;
                  </Link>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
