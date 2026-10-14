"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createPaperAction,
  updatePaperAction,
  togglePaperStatusAction,
  deletePaperAction,
} from "@/server/actions/admin";

interface ExamItem {
  id: string;
  name: string;
  slug?: string;
  description: string | null;
}

interface PaperItem {
  id: string;
  examId: string;
  title: string;
  year: number;
  shift: string | null;
  durationSeconds: number;
  correctMarks: number;
  incorrectMarks: number;
  unattemptedMarks: number;
  description: string | null;
  isActive: boolean;
  exam: { id: string; name: string; slug?: string };
  _count: { questions: number; attempts: number };
}

export function PaperManager({
  exams,
  papers,
  initialExamId,
}: {
  exams: ExamItem[];
  papers: PaperItem[];
  initialExamId?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingPaper, setEditingPaper] = useState<PaperItem | null>(null);

  const [selectedExamId, setSelectedExamId] = useState<string>(
    initialExamId || exams[0]?.id || ""
  );
  const [examFilter, setExamFilter] = useState<string>(
    initialExamId || "all"
  );
  const [searchQuery, setSearchQuery] = useState<string>("");

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
        setSuccess("Paper published / created successfully!");
        formEl.reset();
        router.refresh();
      } catch (err: any) {
        setError(err?.message || "Failed to create paper");
      }
    });
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        await updatePaperAction(formData);
        setSuccess("Paper updated successfully!");
        setEditingPaper(null);
        router.refresh();
      } catch (err: any) {
        setError(err?.message || "Failed to update paper");
      }
    });
  };

  const handleToggle = (paperId: string, currentStatus: boolean, title: string) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await togglePaperStatusAction(paperId, !currentStatus);
        setSuccess(`"${title}" is now ${!currentStatus ? "Published (Live)" : "Unpublished (Draft)"}.`);
        router.refresh();
      } catch (err: any) {
        setError(err?.message || "Failed to update status");
      }
    });
  };

  const handleDelete = (paperId: string, title: string) => {
    if (
      !confirm(
        `Are you sure you want to delete "${title}"? All associated questions and attempts will be removed.`
      )
    ) {
      return;
    }
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await deletePaperAction(paperId);
        setSuccess(`"${title}" deleted successfully.`);
        router.refresh();
      } catch (err: any) {
        setError(err?.message || "Failed to delete paper");
      }
    });
  };

  // Filter papers
  const filteredPapers = papers.filter((paper) => {
    const matchesExam = examFilter === "all" || paper.examId === examFilter;
    const matchesSearch =
      !searchQuery.trim() ||
      paper.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      paper.exam.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesExam && matchesSearch;
  });

  return (
    <>
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Create Paper Form */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs h-fit lg:sticky lg:top-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Create & Publish Paper</h3>
            <Link
              href="/admin/exams"
              className="text-[11px] font-bold text-blue-600 hover:underline"
            >
              + Manage Exams
            </Link>
          </div>

          {error && !editingPaper && (
            <div className="mb-4 p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
              {success}
            </div>
          )}

          {exams.length === 0 ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2">
              <p className="font-bold">No exams created yet.</p>
              <p>You need to create an exam category (like CMAT, SNAP, CAT) before you can publish papers.</p>
              <Link
                href="/admin/exams"
                className="inline-block bg-amber-900 text-white font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-amber-800 transition-colors"
              >
                + Create Exam Category &rarr;
              </Link>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-gray-700 mb-1">Target Examination</label>
                <select
                  name="examId"
                  value={selectedExamId}
                  onChange={(e) => setSelectedExamId(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                >
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name} {ex.description ? `— ${ex.description}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-700 mb-1">Paper Title</label>
                <input
                  name="title"
                  placeholder="e.g. CMAT 2025 Official PYQ Slot 1"
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none placeholder:text-gray-400"
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
                    placeholder="e.g. Slot 1"
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none placeholder:text-gray-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 mb-1">Duration (Mins)</label>
                  <input
                    name="durationMinutes"
                    type="number"
                    defaultValue={60}
                    required
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 mb-1">Initial Status</label>
                  <select
                    name="isActive"
                    defaultValue="true"
                    className="w-full border border-gray-300 rounded-lg p-2.5 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                  >
                    <option value="true">Published (Active)</option>
                    <option value="false">Draft (Hidden)</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block">
                  Marking Scheme
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-emerald-800 mb-1 font-bold">Correct</label>
                    <input
                      name="correctMarks"
                      type="number"
                      step="0.25"
                      defaultValue={4}
                      required
                      className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-gray-900 outline-none text-emerald-700 font-bold bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-rose-800 mb-1 font-bold">Incorrect</label>
                    <input
                      name="incorrectMarks"
                      type="number"
                      step="0.25"
                      defaultValue={-1}
                      required
                      className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-gray-900 outline-none text-rose-700 font-bold bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 mb-1 font-bold">Blank</label>
                    <input
                      name="unattemptedMarks"
                      type="number"
                      step="0.25"
                      defaultValue={0}
                      className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-gray-900 outline-none bg-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-gray-700 mb-1">Description / Notes</label>
                <textarea
                  name="description"
                  rows={2}
                  placeholder="Optional details or syllabus covered"
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none placeholder:text-gray-400"
                />
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-gray-950 text-white font-bold py-3 rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors text-sm shadow-sm"
              >
                {isPending ? "Creating Paper..." : "+ Publish Paper"}
              </button>
            </form>
          )}
        </div>

        {/* Existing Papers List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                Configured Papers ({filteredPapers.length} of {papers.length})
              </h3>
              <p className="text-xs text-gray-500">
                Manage, publish, unpublish, and configure questions for each paper.
              </p>
            </div>

            {/* Search Input */}
            <input
              type="text"
              placeholder="Search papers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-gray-950 outline-none bg-white w-full sm:w-48"
            />
          </div>

          {/* Exam Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-gray-400 font-bold mr-1 shrink-0">Filter by Exam:</span>
            <button
              type="button"
              onClick={() => setExamFilter("all")}
              className={`px-3 py-1 rounded-lg font-bold shrink-0 transition-colors ${
                examFilter === "all"
                  ? "bg-gray-950 text-white"
                  : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              All ({papers.length})
            </button>
            {exams.map((ex) => {
              const count = papers.filter((p) => p.examId === ex.id).length;
              return (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => setExamFilter(ex.id)}
                  className={`px-3 py-1 rounded-lg font-bold shrink-0 transition-colors ${
                    examFilter === ex.id
                      ? "bg-gray-950 text-white"
                      : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {ex.name} ({count})
                </button>
              );
            })}
          </div>

          {filteredPapers.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center text-gray-500">
              <p className="font-bold text-gray-800">No papers found.</p>
              <p className="text-xs text-gray-400 mt-1">
                {searchQuery || examFilter !== "all"
                  ? "Try adjusting your search or exam filter."
                  : "Publish your first paper using the form on the left."}
              </p>
            </div>
          ) : (
            filteredPapers.map((paper) => (
              <div
                key={paper.id}
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-gray-300 transition-all"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-gray-900 text-white text-[10px] font-black px-2 py-0.5 rounded">
                      {paper.exam.name}
                    </span>
                    <h4 className="text-base font-bold text-gray-900">{paper.title}</h4>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded ${
                        paper.isActive
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {paper.isActive ? "PUBLISHED" : "DRAFT / UNPUBLISHED"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {paper.year} • {paper.shift || "Standard Slot"} •{" "}
                    {paper.durationSeconds / 60} mins •{" "}
                    <span className="font-semibold text-gray-700">
                      {paper._count.questions} questions loaded
                    </span>{" "}
                    • {paper._count.attempts} attempts
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Marking:{" "}
                    <span className="font-bold text-emerald-600">
                      +{paper.correctMarks}
                    </span>{" "}
                    /{" "}
                    <span className="font-bold text-rose-600">
                      {paper.incorrectMarks}
                    </span>
                    {paper.unattemptedMarks !== 0 && (
                      <span>
                        {" "}
                        / (
                        {paper.unattemptedMarks > 0
                          ? `+${paper.unattemptedMarks}`
                          : paper.unattemptedMarks}{" "}
                        unattempted)
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <Link
                    href={`/admin/questions?paperId=${paper.id}`}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Questions ({paper._count.questions})
                  </Link>

                  <Link
                    href={`/papers/${paper.id}`}
                    target="_blank"
                    className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                    title="Preview student test page"
                  >
                    Preview ↗
                  </Link>

                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      setError(null);
                      setSuccess(null);
                      setEditingPaper(paper);
                    }}
                    className="border border-gray-300 hover:border-gray-950 hover:bg-gray-50 text-gray-800 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    Edit
                  </button>

                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleToggle(paper.id, paper.isActive, paper.title)}
                    className={`border text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                      paper.isActive
                        ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                        : "border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                    }`}
                  >
                    {paper.isActive ? "Unpublish" : "Publish"}
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
            ))
          )}
        </div>
      </div>

      {/* Edit Paper Modal Dialog */}
      {editingPaper && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-gray-200 my-8">
            <div className="flex justify-between items-center pb-4 mb-5 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-black text-gray-900">
                  Edit Paper & Marking Scheme
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Update title, duration, examination, or marks schema for{" "}
                  <span className="font-semibold text-gray-900">
                    {editingPaper.title}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPaper(null)}
                className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
                {error}
              </div>
            )}

            <form onSubmit={handleUpdate} className="space-y-4 text-xs font-semibold">
              <input type="hidden" name="paperId" value={editingPaper.id} />

              <div>
                <label className="block text-gray-700 mb-1">
                  Target Examination
                </label>
                <select
                  name="examId"
                  defaultValue={editingPaper.examId}
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                >
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name} {ex.description ? `— ${ex.description}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-700 mb-1">Paper Title</label>
                <input
                  name="title"
                  defaultValue={editingPaper.title}
                  required
                  placeholder="e.g. SNAP 2024 Slot 1 PYQ"
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 mb-1">Year</label>
                  <input
                    name="year"
                    type="number"
                    defaultValue={editingPaper.year}
                    required
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 mb-1">Shift / Slot</label>
                  <input
                    name="shift"
                    defaultValue={editingPaper.shift || ""}
                    placeholder="e.g. Shift 1"
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 mb-1">
                  Duration (Minutes)
                </label>
                <input
                  name="durationMinutes"
                  type="number"
                  defaultValue={Math.round(editingPaper.durationSeconds / 60)}
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>

              {/* Marking Schema Section */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                <span className="text-[11px] font-bold text-gray-900 uppercase tracking-wider block">
                  Marking Scheme Configuration
                </span>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-emerald-800 mb-1 font-bold">
                      Correct (+ marks)
                    </label>
                    <input
                      name="correctMarks"
                      type="number"
                      step="0.25"
                      defaultValue={editingPaper.correctMarks}
                      required
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none text-emerald-700 font-bold bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-rose-800 mb-1 font-bold">
                      Incorrect (- penalty)
                    </label>
                    <input
                      name="incorrectMarks"
                      type="number"
                      step="0.25"
                      defaultValue={editingPaper.incorrectMarks}
                      required
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none text-rose-700 font-bold bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 mb-1">
                      Unattempted
                    </label>
                    <input
                      name="unattemptedMarks"
                      type="number"
                      step="0.25"
                      defaultValue={editingPaper.unattemptedMarks ?? 0}
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none bg-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-gray-700 mb-1">
                  Description / Notes
                </label>
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={editingPaper.description || ""}
                  placeholder="Optional details about this question paper"
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingPaper(null)}
                  className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-lg shadow-sm disabled:opacity-50 transition-colors"
                >
                  {isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
