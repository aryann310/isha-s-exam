import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ExamManager } from "@/components/admin/exam-manager";

export const dynamic = "force-dynamic";

export default async function AdminExamsPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const exams = await prisma.exam.findMany({
    include: {
      papers: {
        include: {
          _count: {
            select: { questions: true, attempts: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      _count: {
        select: { papers: true },
      },
    },
    orderBy: { name: "asc" },
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
            <Link href="/admin" className="hover:text-white transition-colors">
              Overview
            </Link>
            <Link href="/admin/exams" className="text-white font-bold border-b-2 border-white pb-1">
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
        <Link href="/admin" className="text-xs text-gray-400 hover:text-white">
          &larr; Back to Dashboard
        </Link>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-10">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Exam Categories & Management</h2>
            <p className="text-sm text-gray-500 mt-1">
              Create, configure, and manage examinations like CMAT, SNAP, CAT, XAT, and publish question papers.
            </p>
          </div>
        </div>

        <ExamManager initialExams={exams} />
      </main>
    </div>
  );
}
