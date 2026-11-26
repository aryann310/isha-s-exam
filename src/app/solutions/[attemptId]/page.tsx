import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { SolutionClient } from "@/components/exam/solution-client";
import { loadAttemptContext } from "@/server/attempts";
import { themeForPaper } from "@/lib/exam-theme";
import { SiteHeader } from "@/components/site/site-header";
import { ExamBadge } from "@/components/site/exam-badge";

export const dynamic = "force-dynamic";

export default async function SolutionsPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const resolvedParams = await params;
  const isAdmin = session.role === "ADMIN";

  // Brings the clock up to date first: a test whose time ran out while the student was away is
  // scored and closed here, so its solutions can be shown.
  const ctx = await loadAttemptContext(resolvedParams.attemptId, session);
  if (!ctx) return notFound();
  if (ctx.attempt.status === "IN_PROGRESS" && !isAdmin) redirect(`/exam/${resolvedParams.attemptId}`);

  const attempt = await prisma.attempt.findFirst({
    where: isAdmin
      ? { id: resolvedParams.attemptId }
      : { id: resolvedParams.attemptId, userId: session.userId as string },
    include: {
      paper: {
        include: {
          exam: true,
          questions: { orderBy: [{ questionNumber: "asc" }, { id: "asc" }] },
        },
      },
      answers: true,
    },
  });

  if (!attempt || (attempt.status === "IN_PROGRESS" && !isAdmin)) return notFound();

  const name = (session.username as string) || (session.name as string) || "Student";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <SiteHeader
        name={name}
        isAdmin={isAdmin}
        back={isAdmin ? { href: "/admin/live", label: "Live proctor" } : { href: `/results/${attempt.id}`, label: "Your result" }}
      />

      <main data-exam-theme={themeForPaper(attempt.paper, attempt.paper.exam?.name)} className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <ExamBadge theme={themeForPaper(attempt.paper, attempt.paper.exam?.name)}>{attempt.paper.exam?.name || "Exam"}</ExamBadge>
          <span className="text-sm text-gray-600">Solutions</span>
        </div>
        <h1 className="font-heading text-3xl font-semibold text-gray-900 mb-6">{attempt.paper?.title || "Exam"}</h1>
        <SolutionClient questions={attempt.paper.questions} answers={attempt.answers} />
      </main>
    </div>
  );
}
