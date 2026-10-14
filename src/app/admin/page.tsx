import { getSession, deleteSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const [usersCount, examsCount, papersCount, questionsCount, attemptsCount, liveAttemptsCount] = await Promise.all([
    prisma.user.count({ where: { role: "STUDENT" } }),
    prisma.exam.count(),
    prisma.paper.count(),
    prisma.question.count(),
    prisma.attempt.count(),
    prisma.attempt.count({ where: { status: "IN_PROGRESS" } }),
  ]);

  const recentAttempts = await prisma.attempt.findMany({
    take: 8,
    orderBy: { startedAt: "desc" },
    include: {
      user: { select: { name: true, email: true } },
      paper: { select: { title: true, exam: { select: { name: true } } } },
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-gray-950 text-white px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="text-lg font-black tracking-wider flex items-center gap-2">
            <span className="bg-white text-gray-950 px-2 py-0.5 rounded font-black text-sm">ADMIN</span>
            EXAM PORTAL
          </Link>
          <nav className="hidden md:flex items-center gap-4 text-sm font-medium text-gray-300">
            <Link href="/admin" className="text-white font-bold border-b-2 border-white pb-1">
              Overview
            </Link>
            <Link href="/admin/live" className="text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              Live Proctor 🔴
            </Link>
            <Link href="/admin/exams" className="hover:text-white transition-colors">
              Exams
            </Link>
            <Link href="/admin/papers" className="hover:text-white transition-colors">
              Papers
            </Link>
            <Link href="/admin/questions" className="hover:text-white transition-colors">
              Questions
            </Link>
            <Link href="/admin/import" className="hover:text-white transition-colors">
              Bulk Import
            </Link>
            <Link href="/admin/results" className="hover:text-white transition-colors">
              Student Results
            </Link>
            <Link href="/admin/users" className="hover:text-white transition-colors">
              Users
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold text-gray-400">
            👤 {(session.username as string) || (session.name as string) || "Admin"}
          </span>
          <Link
            href="/exams"
            className="text-xs font-semibold bg-gray-800 text-gray-200 px-3 py-1.5 rounded hover:bg-gray-700 transition-colors"
          >
            Student View &rarr;
          </Link>
          <form
            action={async () => {
              "use server";
              await deleteSession();
              redirect("/login");
            }}
          >
            <button className="text-xs font-bold text-rose-400 hover:text-rose-300">
              Logout
            </button>
          </form>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Overview & Metrics</h2>
            <p className="text-sm text-gray-500 mt-1">
              System health and real-time examination statistics.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/admin/live"
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
            >
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              Live Proctor Hub {liveAttemptsCount > 0 ? `(${liveAttemptsCount})` : ""}
            </Link>
            <Link
              href="/admin/exams"
              className="bg-gray-950 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
            >
              + Create Exam
            </Link>
            <Link
              href="/admin/papers"
              className="bg-white border border-gray-300 text-gray-900 text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors shadow-xs"
            >
              + Create Paper
            </Link>
            <Link
              href="/admin/import"
              className="bg-white border border-gray-300 text-gray-900 text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Bulk Question Import
            </Link>
            <Link
              href="/admin/users"
              className="bg-white border border-gray-300 text-gray-900 text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Add Student
            </Link>
          </div>
        </div>

        {/* Live Active Alert Banner */}
        {liveAttemptsCount > 0 && (
          <div className="mb-8 bg-rose-50 border-2 border-rose-300 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="w-3.5 h-3.5 rounded-full bg-rose-600 animate-ping shrink-0" />
              <div>
                <p className="text-sm font-black text-rose-950">
                  🔴 LIVE NOW: {liveAttemptsCount} student session{liveAttemptsCount > 1 ? "s" : ""} currently in progress
                </p>
                <p className="text-xs text-rose-700">
                  Monitor live answers in real time, view question selections, adjust timer, or force submit.
                </p>
              </div>
            </div>
            <Link
              href="/admin/live"
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors shrink-0 shadow-xs"
            >
              Open Live Proctor Hub &rarr;
            </Link>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Exams</p>
            <p className="text-3xl font-black text-gray-900">{examsCount}</p>
            <Link href="/admin/exams" className="text-[11px] text-blue-600 hover:underline mt-2 inline-block">
              Manage exams &rarr;
            </Link>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Active Papers</p>
            <p className="text-3xl font-black text-gray-900">{papersCount}</p>
            <Link href="/admin/papers" className="text-[11px] text-blue-600 hover:underline mt-2 inline-block">
              Manage papers &rarr;
            </Link>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Questions</p>
            <p className="text-3xl font-black text-gray-900">{questionsCount}</p>
            <Link href="/admin/questions" className="text-[11px] text-blue-600 hover:underline mt-2 inline-block">
              Question bank &rarr;
            </Link>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Students</p>
            <p className="text-3xl font-black text-gray-900">{usersCount}</p>
            <Link href="/admin/users" className="text-[11px] text-blue-600 hover:underline mt-2 inline-block">
              Authorized users &rarr;
            </Link>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs col-span-2 lg:col-span-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Attempts</p>
            <p className="text-3xl font-black text-gray-900">{attemptsCount}</p>
            <Link href="/admin/results" className="text-[11px] text-blue-600 hover:underline mt-2 inline-block">
              View score log &rarr;
            </Link>
          </div>
        </div>

        {/* Quick Access Action Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-10">
          <div className="bg-gray-950 text-white p-5 rounded-xl border border-gray-800 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                  Live Proctor Hub 🔴
                </h3>
                {liveAttemptsCount > 0 && (
                  <span className="bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                    {liveAttemptsCount} Live
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Watch student screens live, inspect answers, launch exams remotely, and force close.
              </p>
            </div>
            <Link
              href="/admin/live"
              className="text-xs font-bold text-gray-950 bg-white hover:bg-gray-100 px-3 py-2 rounded-lg text-center transition-colors shadow-xs"
            >
              Open Proctor Hub &rarr;
            </Link>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-gray-900 text-sm mb-1">Exam Management</h3>
              <p className="text-xs text-gray-500 mb-4">
                Create new exams (CMAT, SNAP, CAT, XAT, NMAT) and configure categories for papers.
              </p>
            </div>
            <Link
              href="/admin/exams"
              className="text-xs font-bold text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg text-center transition-colors"
            >
              Open Exams &rarr;
            </Link>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-gray-900 text-sm mb-1">Paper Management</h3>
              <p className="text-xs text-gray-500 mb-4">
                Create new question papers, set duration, marking rules, and toggle published status.
              </p>
            </div>
            <Link
              href="/admin/papers"
              className="text-xs font-bold text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg text-center transition-colors"
            >
              Open Papers &rarr;
            </Link>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-gray-900 text-sm mb-1">Bulk Question Import</h3>
              <p className="text-xs text-gray-500 mb-4">
                Ingest existing PYQ question banks directly from JSON or CSV format with validation.
              </p>
            </div>
            <Link
              href="/admin/import"
              className="text-xs font-bold text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg text-center transition-colors"
            >
              Open Importer &rarr;
            </Link>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-gray-900 text-sm mb-1">Authorized Members</h3>
              <p className="text-xs text-gray-500 mb-4">
                Add authorized student email addresses and passwords to grant private access to mock tests.
              </p>
            </div>
            <Link
              href="/admin/users"
              className="text-xs font-bold text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg text-center transition-colors"
            >
              Manage Students &rarr;
            </Link>
          </div>
        </div>

        {/* Recent Attempts Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
            <div>
              <h3 className="font-bold text-gray-900 text-sm">Recent Examination Attempts</h3>
              <p className="text-xs text-gray-500">Live student activity and submissions</p>
            </div>
            <Link href="/admin/results" className="text-xs font-bold text-blue-600 hover:underline">
              View all results &rarr;
            </Link>
          </div>

          {recentAttempts.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No examination attempts recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100 text-gray-700 uppercase font-bold border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3">Student</th>
                    <th className="px-6 py-3">Paper</th>
                    <th className="px-6 py-3">Mode</th>
                    <th className="px-6 py-3">Score</th>
                    <th className="px-6 py-3">Accuracy</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {recentAttempts.map((att) => (
                    <tr key={att.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3.5 font-semibold text-gray-900">
                        {att.user.name}
                        <span className="block text-[11px] text-gray-400 font-normal">
                          {att.user.email}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 font-medium text-gray-800">
                        {att.paper.title}
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            att.mode === "MOCK"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {att.mode}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 font-bold text-gray-900">
                        {att.status === "SUBMITTED" || att.status === "AUTO_SUBMITTED"
                          ? `${att.score} pts`
                          : "—"}
                      </td>
                      <td className="px-6 py-3.5 font-semibold text-gray-700">
                        {att.status === "SUBMITTED" || att.status === "AUTO_SUBMITTED"
                          ? `${Math.round(att.accuracy || 0)}%`
                          : "—"}
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            att.status === "IN_PROGRESS"
                              ? "bg-amber-100 text-amber-800 animate-pulse"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {att.status}
                        </span>
                      </td>
                      <td suppressHydrationWarning className="px-6 py-3.5 text-gray-500">
                        {new Date(att.startedAt).toLocaleDateString("en-US")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
