import { getSession, deleteSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";

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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                EXAMINATION PAPERS
              </span>
            </div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">
              {exam.name}
            </h2>
            {exam.description && (
              <p className="text-sm text-gray-500 mt-1">
                {exam.description}
              </p>
            )}
          </div>

          {session.role === "ADMIN" && (
            <Link
              href={`/admin/papers?examId=${exam.id}`}
              className="bg-gray-950 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors shadow-xs shrink-0"
            >
              + Publish Paper to {exam.name}
            </Link>
          )}
        </div>

        {exam.papers.length === 0 ? (
          <div className="text-gray-500 bg-white p-10 border border-gray-200 rounded-2xl text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto text-xl">
              📄
            </div>
            <p className="font-bold text-gray-800 text-base">
              No papers published yet for {exam.name}.
            </p>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              Official previous year question papers and mock tests for this examination will appear here once published.
            </p>
            {session.role === "ADMIN" && (
              <div className="pt-2">
                <Link
                  href={`/admin/papers?examId=${exam.id}`}
                  className="inline-block bg-gray-950 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors shadow-xs"
                >
                  + Publish First Paper for {exam.name} &rarr;
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {exam.papers.map((paper) => (
              <div
                key={paper.id}
                className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-gray-950 hover:shadow-xs transition-all"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black uppercase bg-gray-950 text-white px-2 py-0.5 rounded">
                      {paper.year}
                    </span>
                    {paper.shift && (
                      <span className="text-[10px] font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                        {paper.shift}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 tracking-tight">
                    {paper.title}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {paper.totalQuestions} Questions • {Math.round(paper.durationSeconds / 60)} Minutes • Marking:{" "}
                    <span className="font-bold text-emerald-600">+{paper.correctMarks}</span> /{" "}
                    <span className="font-bold text-rose-600">{paper.incorrectMarks}</span>
                  </p>
                  {paper.description && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-1">
                      {paper.description}
                    </p>
                  )}
                </div>
                <Link
                  href={`/papers/${paper.id}`}
                  className="inline-flex items-center justify-center bg-gray-950 text-white rounded-xl px-6 py-2.5 text-xs font-bold hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-950 shrink-0 shadow-xs group"
                >
                  START TEST &rarr;
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
