import { getSession, deleteSession } from "@/lib/auth/session";
import { PrismaClient } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";

const prisma = new PrismaClient();

export default async function ExamsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [exams, myAttempts] = await Promise.all([
    prisma.exam.findMany({
      where: { isActive: true },
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

      <main className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="text-center mb-10">
          <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">
            Private Examination System
          </p>
          <h2 className="text-3xl font-black text-gray-950">Select your examination</h2>
        </div>

        {exams.length === 0 ? (
          <div className="text-center text-gray-500 mt-12 bg-white p-8 rounded-2xl border border-gray-200">
            No examinations available right now.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto mb-16">
            {exams.map((exam) => (
              <Link
                key={exam.id}
                href={`/exams/${exam.slug}`}
                className="group block bg-white border border-gray-200 rounded-2xl p-10 text-center hover:border-gray-950 hover:shadow-lg transition-all"
              >
                <div className="w-14 h-14 bg-gray-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-6 font-black text-xl group-hover:scale-110 transition-transform">
                  {exam.name.slice(0, 1)}
                </div>
                <h3 className="text-2xl font-black text-gray-950 tracking-tight">
                  {exam.name}
                </h3>
                <p className="text-gray-500 mt-2 text-sm font-medium">
                  Previous Year Question Papers
                </p>
                <div className="mt-6 inline-flex items-center text-xs font-bold text-gray-900 group-hover:translate-x-1 transition-transform">
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
                        {att.paper.exam.name}
                      </span>
                      <span className="text-sm font-bold text-gray-900">{att.paper.title}</span>
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
