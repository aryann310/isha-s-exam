import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { SolutionClient } from "@/components/exam/solution-client";
import { themeForPaper } from "@/lib/exam-theme";
import { getPattern } from "@/lib/exam-patterns";
import { isPaperExpired, isPaperClosed, timeLeft } from "@/server/paper-expiry";
import { SiteHeader } from "@/components/site/site-header";
import { ExamBadge } from "@/components/site/exam-badge";

export const dynamic = "force-dynamic";

/** Solutions of a closed paper, open to every student whether or not they took it. */
export default async function PaperSolutionsPage({ params }: { params: Promise<{ paperId: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { paperId } = await params;
  const isAdmin = session.role === "ADMIN";
  const userId = session.userId as string;

  const paper = await prisma.paper.findFirst({
    where: { id: paperId, ...(isAdmin ? {} : { isActive: true, exam: { isActive: true } }) },
    include: { exam: true, questions: { orderBy: [{ questionNumber: "asc" }, { id: "asc" }] } },
  });
  if (!paper) return notFound();
  if (!isAdmin && isPaperExpired(paper)) return notFound();

  const mine = await prisma.attempt.findMany({
    where: { userId, paperId: paper.id },
    orderBy: { startedAt: "desc" },
    select: { id: true, status: true },
  });
  // A test still running is finished first; a student who took it sees their own answers marked.
  const running = mine.find((a) => a.status === "IN_PROGRESS");
  if (running) redirect(`/exam/${running.id}`);
  const finished = mine[0];
  if (finished) redirect(`/solutions/${finished.id}`);
  // Open papers keep their answers secret until the test is taken.
  if (!isPaperClosed(paper) && !isAdmin) redirect(`/papers/${paper.id}`);

  const name = (session.username as string) || (session.name as string) || "Student";
  const theme = themeForPaper(paper, paper.exam.name);
  const surprise = paper.examPattern === "SURPRISE";
  const back = surprise ? { href: "/surprise", label: "Surprise Test" } : { href: `/exams/${paper.exam.slug}`, label: `${paper.exam.name} papers` };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <SiteHeader name={name} isAdmin={isAdmin} back={back} />
      <main data-exam-theme={theme} className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <ExamBadge theme={theme}>{getPattern(paper.examPattern).label}</ExamBadge>
          <span className="text-sm text-gray-600">Solutions</span>
        </div>
        <h1 className="font-heading text-3xl font-semibold text-gray-900">{paper.title}</h1>
        <p className="text-sm text-gray-600 mt-2 mb-6">
          This test is closed, so it can no longer be taken. Every question is shown with its answer and a worked solution.
          {paper.deleteAt ? ` It will be removed in ${timeLeft(paper.deleteAt)}.` : ""}
        </p>
        <SolutionClient questions={paper.questions} answers={[]} viewOnly />
      </main>
    </div>
  );
}
