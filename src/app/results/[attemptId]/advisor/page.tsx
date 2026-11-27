import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/site/site-header";
import { ReviewPanel } from "@/components/advisor/review-panel";
import { AdvisorChat } from "@/components/advisor/advisor-chat";
import { loadAttemptContext } from "@/server/attempts";
import { advisorConfigured, chatAllowance, getStoredReview, loadTestContext } from "@/server/test-advisor";

export const dynamic = "force-dynamic";
// The review can take up to a minute to write.
export const maxDuration = 120;

const SUGGESTIONS = [
  "Which mistakes cost me the most marks?",
  "Explain my first wrong answer step by step.",
  "Where did I waste time in this test?",
  "Which answers look like guesses?",
  "What should I do differently in my next test?",
];

export default async function AdvisorPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { attemptId } = await params;
  const isAdmin = session.role === "ADMIN";

  // Closes the test first if its time ran out while the candidate was away.
  await loadAttemptContext(attemptId, session);
  const ctx = await loadTestContext(attemptId);
  if (!ctx) {
    const running = await prisma.attempt.findFirst({ where: { id: attemptId, userId: session.userId as string }, select: { id: true } });
    if (running) redirect(`/exam/${attemptId}`);
    return notFound();
  }
  const own = ctx.userId === session.userId;
  if (!own && !isAdmin) return notFound();

  const name = (session.username as string) || (session.name as string) || "Student";
  const header = <SiteHeader name={name} isAdmin={isAdmin} back={{ href: `/results/${attemptId}`, label: "Back to result" }} />;

  if (!ctx.unlocked && !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {header}
        <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10">
          <div className="bg-white border border-gray-200 rounded-2xl p-8 space-y-3">
            <h1 className="font-heading text-2xl font-semibold text-gray-900">Your advisor opens after the untimed phase</h1>
            <p className="text-gray-700">Finish your unanswered questions (or skip them) first. Then your advisor can go through every answer with you.</p>
            <Link href={`/results/${attemptId}`} className="inline-flex bg-gray-900 text-white font-semibold px-5 h-10 items-center rounded-lg">
              Back to result
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const [stored, messages, allowance, student] = await Promise.all([
    getStoredReview(ctx.userId, attemptId),
    prisma.coachMessage.findMany({ where: { attemptId }, orderBy: { createdAt: "asc" }, select: { id: true, role: true, content: true, reported: true } }),
    own ? chatAllowance(ctx.userId) : Promise.resolve(null),
    own ? Promise.resolve(null) : prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true, username: true } }),
  ]);
  const configured = advisorConfigured();
  const last = messages[messages.length - 1];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {header}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-10 space-y-6">
        <div>
          <p className="text-sm text-gray-600">
            {ctx.examName} · {ctx.paperTitle}
            {student ? ` · ${student.name || student.username}` : ""}
          </p>
          <h1 className="font-heading text-3xl sm:text-4xl font-semibold text-gray-900">Your advisor</h1>
          {!ctx.hasActivity && (
            <p className="text-sm text-gray-600 mt-2">
              This test was taken before activity tracking started, so the advisor can see your answers but not your time per question or clicks.
            </p>
          )}
        </div>

        <ReviewPanel
          attemptId={attemptId}
          configured={configured}
          canGenerate={own || isAdmin}
          initial={stored ? { review: stored.review, createdAt: stored.createdAt.toISOString() } : null}
        />

        <AdvisorChat
          key={last?.id ?? "empty"}
          attemptId={attemptId}
          messages={messages.map((m) => ({ id: m.id, role: m.role === "assistant" ? "assistant" : "user", content: m.content, reported: m.reported }))}
          configured={configured}
          readOnly={!own}
          allowance={allowance ? { limit: allowance.limit, left: allowance.left, requested: !!allowance.requestedAt } : null}
          suggestions={SUGGESTIONS}
        />
      </main>
    </div>
  );
}
