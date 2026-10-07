import { getSession, deleteSession } from "@/lib/auth/session";
import { PrismaClient } from "@prisma/client";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";

const prisma = new PrismaClient();

export default async function ExamPapersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const resolvedParams = await params;

  const exam = await prisma.exam.findUnique({
    where: { slug: resolvedParams.slug, isActive: true },
    include: {
      papers: {
        where: { isActive: true },
        orderBy: { year: "desc" },
      },
    },
  });

  if (!exam) return notFound();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/exams" className="text-sm font-medium text-gray-500 hover:text-black">
            &larr; Back
          </Link>
          <h1 className="text-xl font-bold tracking-tight">{exam.name}</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">Logged in</span>
          <form
            action={async () => {
              "use server";
              await deleteSession();
              redirect("/login");
            }}
          >
            <button className="text-sm font-medium text-gray-700 hover:text-black">
              Logout
            </button>
          </form>
        </div>
      </header>
      
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="mb-10">
          <h2 className="text-3xl font-bold text-gray-900">{exam.name} Previous Year Papers</h2>
        </div>

        {exam.papers.length === 0 ? (
          <div className="text-gray-500 bg-white p-8 border border-gray-200 rounded-lg text-center">
            No papers available for this exam yet.
          </div>
        ) : (
          <div className="space-y-4">
            {exam.papers.map((paper) => (
              <div
                key={paper.id}
                className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-gray-900 transition-colors"
              >
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{paper.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {paper.totalQuestions} Questions • {paper.durationSeconds / 60} Minutes
                    {paper.shift && ` • ${paper.shift}`}
                  </p>
                </div>
                <Link
                  href={`/papers/${paper.id}`}
                  className="inline-flex items-center justify-center bg-gray-900 text-white rounded-md px-6 py-2.5 text-sm font-medium hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 shrink-0"
                >
                  VIEW PAPER
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
