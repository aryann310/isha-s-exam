import { getSession, deleteSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [exams, myAttempts] = await Promise.all([
    prisma.exam.findMany({
      where: { isActive: true },
      include: {
        papers: {
          where: { isActive: true },
          select: { id: true },
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-xs">
        <h1 className="text-xl font-black tracking-tight text-gray-950">MOCK TEST PORTAL</h1>
        <div className="flex items-center gap-4">
          {session.role === "ADMIN" && (
            <Link
              href="/admin"
              className="text-xs font-bold bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              Admin Dashboard &rarr;
            </Link>
          )}
          <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full">
            👤 {(session.username as string) || (session.name as string) || (session.email as string)}
          </span>
          <form
            action={async () => {
              "use server";
              await deleteSession();
              redirect("/login");
            }}
          >
            <button className="text-xs font-bold text-gray-700 hover:text-black">
              Logout
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-6 md:p-12">
        <div className="text-center mb-10">
          <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">
            Private Examination System
          </p>
          <h2 className="text-3xl font-black text-gray-950">Select your examination</h2>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Choose an exam to access official previous year question papers and full-length timed mock tests.
          </p>
        </div>

        {exams.length === 0 ? (
          <div className="text-center text-gray-500 mt-12 bg-white p-8 rounded-2xl border border-gray-200">
            <p className="font-bold text-gray-800">No examinations available right now.</p>
            {session.role === "ADMIN" && (
              <Link
                href="/admin/exams"
                className="mt-3 inline-block text-xs font-bold text-blue-600 hover:underline"
              >
                + Create your first Exam in Admin &rarr;
              </Link>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto mb-16">
            {exams.map((exam) => (
              <Link
                key={exam.id}
                href={`/exams/${exam.slug}`}
                className="group block bg-white border border-gray-200 rounded-2xl p-8 text-center hover:border-gray-950 hover:shadow-lg transition-all"
              >
                <div className="w-14 h-14 bg-gray-950 text-white rounded-2xl flex items-center justify-center mx-auto mb-5 font-black text-xl group-hover:scale-110 transition-transform shadow-xs">
                  {exam.name.slice(0, 2).toUpperCase()}
                </div>
                <h3 className="text-2xl font-black text-gray-950 tracking-tight">
                  {exam.name}
                </h3>
                <p className="text-gray-500 mt-2 text-xs font-medium line-clamp-2 min-h-8">
                  {exam.description || "Previous Year Question Papers & Mock Tests"}
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-[11px] font-bold text-gray-700">
                  <span>
                    {exam.papers.length} {exam.papers.length === 1 ? "Paper" : "Papers"} Available
                  </span>
                </div>
                <div className="mt-5 flex items-center justify-center text-xs font-bold text-gray-900 group-hover:translate-x-1 transition-transform">
                  View Papers &rarr;
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Previous Attempts Section (Requirement 44) */}
        {myAttempts.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-xs">
            <div className="flex justify-between items-center mb-6 pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-black text-gray-950">MY RECENT ATTEMPTS</h3>
                <p className="text-xs text-gray-500">Your examination history and past scores</p>
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              {myAttempts.map((att) => (
                <div
                  key={att.id}
                  className="py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black bg-gray-900 text-white px-2 py-0.5 rounded">
                        {att.paper?.exam?.name || "Exam"}
                      </span>
                      <span className="text-sm font-bold text-gray-900">{att.paper?.title || "Paper"}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          att.mode === "MOCK" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {att.mode}
                      </span>
                    </div>
                    <p suppressHydrationWarning className="text-xs text-gray-500 mt-1">
                      {new Date(att.startedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {att.status === "SUBMITTED" || att.status === "AUTO_SUBMITTED"
                        ? ` • Accuracy: ${Math.round(att.accuracy || 0)}%`
                        : " • In Progress"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    {att.status === "SUBMITTED" || att.status === "AUTO_SUBMITTED" ? (
                      <>
                        <div className="text-right">
                          <span className="text-lg font-black text-gray-950">{att.score}</span>
                          <span className="text-xs text-gray-400"> pts</span>
                        </div>
                        <div className="flex gap-2">
                          <Link
                            href={`/results/${att.id}`}
                            className="text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-900 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Result
                          </Link>
                          <Link
                            href={`/solutions/${att.id}`}
                            className="text-xs font-bold bg-gray-900 hover:bg-gray-800 text-white px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Solutions
                          </Link>
                        </div>
                      </>
                    ) : (
                      <Link
                        href={`/exam/${att.id}`}
                        className="text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg transition-colors"
                      >
                        Resume Exam &rarr;
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
