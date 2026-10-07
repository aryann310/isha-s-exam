import { getSession } from "@/lib/auth/session";
import { PrismaClient } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { SolutionClient } from "@/components/exam/solution-client";

const prisma = new PrismaClient();

export default async function SolutionsPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const resolvedParams = await params;

  const attempt = await prisma.attempt.findUnique({
    where: { id: resolvedParams.attemptId, userId: session.userId as string },
    include: {
      paper: {
        include: {
          exam: true,
          questions: { orderBy: { questionNumber: "asc" } },
        },
      },
      answers: true,
    },
  });

  if (!attempt || attempt.status === "IN_PROGRESS") return notFound();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link href={`/results/${attempt.id}`} className="text-sm font-medium text-gray-500 hover:text-black">
            &larr; Back to Results
          </Link>
          <h1 className="text-xl font-bold tracking-tight">{attempt.paper.title} — COMPLETE SOLUTIONS</h1>
        </div>
      </header>
      
      <main className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-8">
        <SolutionClient questions={attempt.paper.questions} answers={attempt.answers} />
      </main>
    </div>
  );
}
