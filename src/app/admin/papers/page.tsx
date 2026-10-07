import { getSession } from "@/lib/auth/session";
import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createPaperAction, togglePaperStatusAction, deletePaperAction } from "@/server/actions/admin";

const prisma = new PrismaClient();

export default async function AdminPapersPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const [exams, papers] = await Promise.all([
    prisma.exam.findMany({ where: { isActive: true } }),
    prisma.paper.findMany({
      include: {
        exam: true,
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

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
            <Link href="/admin/papers" className="text-white font-bold border-b-2 border-white pb-1">
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
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Paper Management</h2>
            <p className="text-sm text-gray-500 mt-1">
              Create and configure PYQ mock exam papers for CMAT and SNAP.
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Create Paper Form */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs h-fit">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Create New Paper</h3>
            <form action={createPaperAction} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-gray-700 mb-1">Target Examination</label>
                <select
                  name="examId"
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                >
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name} ({ex.description})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-700 mb-1">Paper Title</label>
                <input
                  name="title"
                  placeholder="e.g. CMAT 2025 Official PYQ"
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 mb-1">Year</label>
                  <input
                    name="year"
                    type="number"
                    defaultValue={2025}
                    required
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 mb-1">Shift / Slot</label>
                  <input
                    name="shift"
                    placeholder="Shift 1"
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 mb-1">Duration (Minutes)</label>
                <input
                  name="durationMinutes"
                  type="number"
                  defaultValue={60}
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-gray-700 mb-1">Correct</label>
                  <input
                    name="correctMarks"
                    type="number"
                    step="0.25"
                    defaultValue={4}
                    required
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none text-emerald-700 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 mb-1">Incorrect</label>
                  <input
                    name="incorrectMarks"
                    type="number"
                    step="0.25"
                    defaultValue={-1}
                    required
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none text-rose-700 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 mb-1">Unattempted</label>
                  <input
                    name="unattemptedMarks"
                    type="number"
                    step="0.25"
                    defaultValue={0}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 mb-1">Description / Notes</label>
                <textarea
                  name="description"
                  rows={2}
                  placeholder="Optional details about this question paper"
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-gray-900 text-white font-bold py-3 rounded-lg hover:bg-gray-800 transition-colors text-sm shadow-sm"
              >
                + Create Paper
              </button>
            </form>
          </div>

          {/* Existing Papers List */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Configured Papers ({papers.length})</h3>

            {papers.map((paper) => (
              <div
                key={paper.id}
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="bg-gray-900 text-white text-[10px] font-black px-2 py-0.5 rounded">
                      {paper.exam.name}
                    </span>
                    <h4 className="text-base font-bold text-gray-900">{paper.title}</h4>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        paper.isActive
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {paper.isActive ? "ACTIVE" : "DISABLED"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {paper.year} • {paper.shift || "Standard Slot"} • {paper.durationSeconds / 60} mins •{" "}
                    <span className="font-semibold text-gray-700">
                      {paper._count.questions} questions loaded
                    </span>{" "}
                    • {paper._count.attempts} attempts
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Marking: +{paper.correctMarks} / {paper.incorrectMarks}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/admin/questions?paperId=${paper.id}`}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Questions ({paper._count.questions})
                  </Link>

                  <form
                    action={async () => {
                      "use server";
                      await togglePaperStatusAction(paper.id, !paper.isActive);
                    }}
                  >
                    <button
                      type="submit"
                      className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      {paper.isActive ? "Disable" : "Enable"}
                    </button>
                  </form>

                  <form
                    action={async () => {
                      "use server";
                      await deletePaperAction(paper.id);
                    }}
                  >
                    <button
                      type="submit"
                      className="border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
