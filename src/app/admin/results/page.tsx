import { getSession } from "@/lib/auth/session";
import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";
import Link from "next/link";

const prisma = new PrismaClient();

export default async function AdminResultsPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const attempts = await prisma.attempt.findMany({
    orderBy: { startedAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
      paper: { select: { id: true, title: true, totalQuestions: true, exam: { select: { name: true } } } },
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="bg-gray-950 text-white px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="text-lg font-black tracking-wider flex items-center gap-2">
            <span className="bg-white text-gray-950 px-2 py-0.5 rounded font-black text-sm">ADMIN</span>
            EXAM PORTAL
          </Link>
          <nav className="hidden md:flex items-center gap-4 text-sm font-medium text-gray-300">
            <Link href="/admin" className="hover:text-white transition-colors">
              Overview
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
            <Link href="/admin/results" className="text-white font-bold border-b-2 border-white pb-1">
              Student Results
            </Link>
            <Link href="/admin/users" className="hover:text-white transition-colors">
              Users
            </Link>
          </nav>
        </div>
        <Link href="/admin" className="text-xs text-gray-400 hover:text-white">
          &larr; Back to Dashboard
        </Link>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-10">
        <div className="mb-8">
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Student Examination Results</h2>
          <p className="text-sm text-gray-500 mt-1">
            Complete audit trail of all student mock and practice test submissions.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
          {attempts.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">
              No examination attempts found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100 text-gray-700 uppercase font-bold border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3.5">Student</th>
                    <th className="px-6 py-3.5">Exam / Paper</th>
                    <th className="px-6 py-3.5">Mode</th>
                    <th className="px-6 py-3.5">Score</th>
                    <th className="px-6 py-3.5">Breakdown (C / I / U)</th>
                    <th className="px-6 py-3.5">Accuracy</th>
                    <th className="px-6 py-3.5">Time Taken</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Date</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {attempts.map((att) => (
                    <tr key={att.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-900">
                        {att.user.name}
                        <span className="block text-[11px] text-gray-400 font-normal">
                          {att.user.email}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-800">
                        <span className="bg-gray-900 text-white text-[9px] font-black px-1.5 py-0.5 rounded mr-1.5">
                          {att.paper.exam.name}
                        </span>
                        {att.paper.title}
                      </td>
                      <td className="px-6 py-4">
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
                      <td className="px-6 py-4 font-black text-gray-900 text-sm">
                        {att.status === "SUBMITTED" || att.status === "AUTO_SUBMITTED"
                          ? `${att.score} pts`
                          : "—"}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-600">
                        <span className="text-emerald-700 font-bold">{att.correct}</span> /{" "}
                        <span className="text-rose-700 font-bold">{att.incorrect}</span> /{" "}
                        <span className="text-gray-400 font-bold">{att.unattempted}</span>
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-800">
                        {att.status === "SUBMITTED" || att.status === "AUTO_SUBMITTED"
                          ? `${Math.round(att.accuracy || 0)}%`
                          : "—"}
                      </td>
                      <td className="px-6 py-4 text-gray-500 font-mono">
                        {att.timeTaken ? `${Math.floor(att.timeTaken / 60)}m ${att.timeTaken % 60}s` : "—"}
                      </td>
                      <td className="px-6 py-4">
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
                      <td suppressHydrationWarning className="px-6 py-4 text-gray-500">
                        {new Date(att.startedAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/solutions/${att.id}`}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold px-3 py-1.5 rounded text-xs transition-colors"
                        >
                          Review &rarr;
                        </Link>
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
