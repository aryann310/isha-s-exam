"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPaperAction, togglePaperStatusAction, deletePaperAction } from "@/server/actions/admin";

interface ExamItem {
  id: string;
  name: string;
  description: string | null;
}

interface PaperItem {
  id: string;
  title: string;
  year: number;
  shift: string | null;
  durationSeconds: number;
  correctMarks: number;
  incorrectMarks: number;
  isActive: boolean;
  exam: { name: string };
  _count: { questions: number; attempts: number };
}

export function PaperManager({ exams, papers }: { exams: ExamItem[]; papers: PaperItem[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);
    const formEl = e.currentTarget;

    startTransition(async () => {
      try {
        await createPaperAction(formData);
        setSuccess("Paper created successfully!");
        formEl.reset();
        router.refresh();
      } catch (err: any) {
        setError(err?.message || "Failed to create paper");
      }
    });
  };

  const handleToggle = (paperId: string, currentStatus: boolean) => {
    setError(null);
    startTransition(async () => {
      try {
        await togglePaperStatusAction(paperId, !currentStatus);
        router.refresh();
      } catch (err: any) {
        setError(err?.message || "Failed to update status");
      }
    });
  };

  const handleDelete = (paperId: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"? All associated questions and attempts will be removed.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await deletePaperAction(paperId);
        router.refresh();
      } catch (err: any) {
        setError(err?.message || "Failed to delete paper");
      }
    });
  };

  return (
    <div className="grid lg:grid-cols-3 gap-8">
      {/* Create Paper Form */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs h-fit">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Create New Paper</h3>

        {error && (
          <div className="mb-4 p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
            {success}
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-4 text-xs font-semibold">
          <div>
            <label className="block text-gray-700 mb-1">Target Examination</label>
            <select
              name="examId"
              required
              className="w-full border border-gray-300 rounded-lg p-2.5 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} ({ex.description || "Official Exam"})
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
            disabled={isPending}
            className="w-full bg-gray-900 text-white font-bold py-3 rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors text-sm shadow-sm"
          >
            {isPending ? "Creating..." : "+ Create Paper"}
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

              <button
                type="button"
                disabled={isPending}
                onClick={() => handleToggle(paper.id, paper.isActive)}
                className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {paper.isActive ? "Disable" : "Enable"}
              </button>

              <button
                type="button"
                disabled={isPending}
                onClick={() => handleDelete(paper.id, paper.title)}
                className="border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
