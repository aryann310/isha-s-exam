import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LiveProctorHub } from "@/components/admin/live-proctor-hub";

export const dynamic = "force-dynamic";

export default async function AdminLiveProctorPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const [attempts, students, papers] = await Promise.all([
    prisma.attempt.findMany({
      orderBy: { startedAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true, username: true } },
        paper: {
          select: {
            id: true,
            title: true,
            durationSeconds: true,
            totalQuestions: true,
            exam: { select: { name: true } },
          },
        },
        answers: {
          select: {
            id: true,
            questionId: true,
            selectedAnswer: true,
            isCorrect: true,
            answeredAt: true,
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: "STUDENT" },
      select: { id: true, name: true, email: true, username: true },
      orderBy: { name: "asc" },
    }),
    prisma.paper.findMany({
      select: {
        id: true,
        title: true,
        durationSeconds: true,
        totalQuestions: true,
        exam: { select: { id: true, name: true } },
      },
      orderBy: { title: "asc" },
    }),
  ]);

  const activeCount = attempts.filter((a) => a.status === "IN_PROGRESS").length;

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
            <Link href="/admin" className="hover:text-white transition-colors">
              Overview
            </Link>
            <Link href="/admin/live" className="text-rose-400 font-bold border-b-2 border-rose-500 pb-1 flex items-center gap-1.5">
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
          <Link href="/admin" className="text-xs text-gray-400 hover:text-white">
            &larr; Back to Dashboard
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-10 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                Live Proctoring & Control Hub
              </h2>
              {activeCount > 0 && (
                <span className="bg-rose-500 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full animate-pulse">
                  {activeCount} Active
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Real-time student screen inspector, remote exam launcher, timer adjustments, and force-submit controls.
            </p>
          </div>
        </div>

        <LiveProctorHub
          initialAttempts={attempts as any}
          students={students}
          papers={papers as any}
        />
      </main>
    </div>
  );
}
