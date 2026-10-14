"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createExamAction,
  updateExamAction,
  toggleExamStatusAction,
  deleteExamAction,
} from "@/server/actions/admin";

export interface ExamWithDetails {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  papers: {
    id: string;
    title: string;
    isActive: boolean;
    totalQuestions: number;
    _count: {
      questions: number;
      attempts: number;
    };
  }[];
  _count: {
    papers: number;
  };
}

export function ExamManager({ initialExams }: { initialExams: ExamWithDetails[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingExam, setEditingExam] = useState<ExamWithDetails | null>(null);

  // Form states for creating exam
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isAutoSlug, setIsAutoSlug] = useState(true);

  // Auto-slug generator
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (isAutoSlug) {
      setSlug(
        val
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
      );
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsAutoSlug(false);
    setSlug(
      e.target.value
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
    );
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        await createExamAction(formData);
        setSuccess(`Exam "${name}" created successfully! You can now publish papers in this exam.`);
        setName("");
        setSlug("");
        setDescription("");
        setIsActive(true);
        setIsAutoSlug(true);
        router.refresh();
      } catch (err: any) {
        setError(err?.message || "Failed to create exam");
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
        await updateExamAction(formData);
        setSuccess("Exam updated successfully!");
        setEditingExam(null);
        router.refresh();
      } catch (err: any) {
        setError(err?.message || "Failed to update exam");
      }
    });
  };

  const handleToggle = (examId: string, currentStatus: boolean, examName: string) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await toggleExamStatusAction(examId, !currentStatus);
        setSuccess(`Exam "${examName}" is now ${!currentStatus ? "Active (Published)" : "Disabled (Draft)"}.`);
        router.refresh();
      } catch (err: any) {
        setError(err?.message || "Failed to update status");
      }
    });
  };

  const handleDelete = (examId: string, examName: string, paperCount: number) => {
    const msg =
      paperCount > 0
        ? `Are you sure you want to delete "${examName}"? It contains ${paperCount} paper(s) with all their questions and student attempts. This action CANNOT be undone.`
        : `Are you sure you want to delete "${examName}"?`;

    if (!confirm(msg)) {
      return;
    }

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await deleteExamAction(examId);
        setSuccess(`Exam "${examName}" was deleted.`);
        router.refresh();
      } catch (err: any) {
        setError(err?.message || "Failed to delete exam");
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Alert Notifications */}
      {error && !editingExam && (
        <div className="p-4 rounded-xl text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-500 hover:text-rose-700 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {success && !editingExam && (
        <div className="p-4 rounded-xl text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>{success}</span>
          </div>
          <button
            onClick={() => setSuccess(null)}
            className="text-emerald-500 hover:text-emerald-700 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-8 items-start">
        {/* Create Exam Card */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs lg:sticky lg:top-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-7 h-7 bg-gray-900 text-white rounded-lg flex items-center justify-center font-black text-xs">
              +
            </span>
            <div>
              <h3 className="text-base font-black text-gray-950">Create New Exam</h3>
              <p className="text-[11px] text-gray-500">
                e.g. CMAT, SNAP, CAT, XAT, NMAT, or custom
              </p>
            </div>
          </div>

          <form onSubmit={handleCreate} className="space-y-4 text-xs font-semibold">
            <div>
              <label className="block text-gray-700 mb-1">
                Exam Name <span className="text-rose-500">*</span>
              </label>
              <input
                name="name"
                value={name}
                onChange={handleNameChange}
                placeholder="e.g. CMAT, SNAP, XAT, CAT, NMAT"
                required
                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-gray-950 outline-none transition-all placeholder:text-gray-400"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-gray-700">
                  URL Slug / Key <span className="text-rose-500">*</span>
                </label>
                {isAutoSlug ? (
                  <span className="text-[10px] text-gray-400 font-normal">Auto-generated</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAutoSlug(true);
                      setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
                    }}
                    className="text-[10px] text-blue-600 hover:underline"
                  >
                    Reset to auto
                  </button>
                )}
              </div>
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden bg-gray-50 focus-within:ring-2 focus-within:ring-gray-950 focus-within:bg-white transition-all">
                <span className="px-2.5 text-xs text-gray-400 bg-gray-100 border-r border-gray-200 select-none py-2.5">
                  /exams/
                </span>
                <input
                  name="slug"
                  value={slug}
                  onChange={handleSlugChange}
                  placeholder="e.g. cmat"
                  required
                  className="w-full p-2.5 text-sm font-mono text-gray-900 bg-transparent outline-none"
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Unique identifier used in student exam URL
              </p>
            </div>

            <div>
              <label className="block text-gray-700 mb-1">Description</label>
              <textarea
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Brief description of the exam, eligibility, or year papers covered"
                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-950 outline-none transition-all placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-gray-700 mb-1.5">Publish Status</label>
              <div className="grid grid-cols-2 gap-2">
                <label
                  className={`border rounded-lg p-2.5 flex items-center gap-2 cursor-pointer transition-all ${
                    isActive
                      ? "border-emerald-500 bg-emerald-50 text-emerald-900 font-bold"
                      : "border-gray-200 bg-white text-gray-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="isActive"
                    value="true"
                    checked={isActive}
                    onChange={() => setIsActive(true)}
                    className="accent-emerald-600"
                  />
                  <span>Published (Active)</span>
                </label>

                <label
                  className={`border rounded-lg p-2.5 flex items-center gap-2 cursor-pointer transition-all ${
                    !isActive
                      ? "border-amber-500 bg-amber-50 text-amber-900 font-bold"
                      : "border-gray-200 bg-white text-gray-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="isActive"
                    value="false"
                    checked={!isActive}
                    onChange={() => setIsActive(false)}
                    className="accent-amber-600"
                  />
                  <span>Draft (Hidden)</span>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-gray-950 text-white font-bold py-3 rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-all text-sm shadow-sm flex items-center justify-center gap-2"
            >
              {isPending ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating Exam...
                </>
              ) : (
                <>+ Create Exam</>
              )}
            </button>
          </form>
        </div>

        {/* Existing Exams List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2">
            <div>
              <h3 className="text-lg font-black text-gray-950">
                All Configured Exams ({initialExams.length})
              </h3>
              <p className="text-xs text-gray-500">
                Each exam acts as a category where you can publish multiple previous year papers or mocks.
              </p>
            </div>
            <Link
              href="/admin/papers"
              className="text-xs font-bold text-gray-900 bg-white border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
            >
              📄 Manage All Papers &rarr;
            </Link>
          </div>

          {initialExams.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-500">
              <p className="font-bold text-gray-800 mb-1">No exams configured yet.</p>
              <p className="text-xs text-gray-400">
                Use the form on the left to create your first exam (e.g. CMAT, SNAP, CAT).
              </p>
            </div>
          ) : (
            initialExams.map((exam) => {
              const totalQuestions = exam.papers.reduce(
                (sum, p) => sum + (p._count?.questions || p.totalQuestions || 0),
                0
              );
              const totalAttempts = exam.papers.reduce(
                (sum, p) => sum + (p._count?.attempts || 0),
                0
              );

              return (
                <div
                  key={exam.id}
                  className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs hover:border-gray-300 transition-all"
                >
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-gray-950 text-white font-black text-lg flex items-center justify-center shrink-0 shadow-xs">
                        {exam.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-lg font-black text-gray-950 tracking-tight">
                            {exam.name}
                          </h4>
                          <span className="font-mono text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
                            /exams/{exam.slug}
                          </span>
                          <span
                            className={`text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full ${
                              exam.isActive
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {exam.isActive ? "PUBLISHED / ACTIVE" : "DRAFT / DISABLED"}
                          </span>
                        </div>
                        {exam.description && (
                          <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                            {exam.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      <Link
                        href={`/admin/papers?examId=${exam.id}`}
                        className="bg-gray-950 hover:bg-gray-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-xs"
                      >
                        + Add Paper
                      </Link>
                      <Link
                        href={`/exams/${exam.slug}`}
                        target="_blank"
                        className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                        title="View student facing page"
                      >
                        Student View ↗
                      </Link>
                    </div>
                  </div>

                  {/* Metrics Bar */}
                  <div className="grid grid-cols-3 gap-3 bg-gray-50 p-3 rounded-xl border border-gray-100 mb-4 text-center">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                        Papers
                      </p>
                      <p className="text-sm font-black text-gray-900">
                        {exam.papers.length}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                        Total Questions
                      </p>
                      <p className="text-sm font-black text-gray-900">
                        {totalQuestions}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                        Student Attempts
                      </p>
                      <p className="text-sm font-black text-gray-900">
                        {totalAttempts}
                      </p>
                    </div>
                  </div>

                  {/* Papers in this Exam preview */}
                  {exam.papers.length > 0 ? (
                    <div className="mb-4">
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                        Published Papers:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {exam.papers.map((p) => (
                          <span
                            key={p.id}
                            className={`text-xs px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5 ${
                              p.isActive
                                ? "bg-white border-gray-200 text-gray-800"
                                : "bg-gray-100 border-gray-200 text-gray-500 line-through"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                p.isActive ? "bg-emerald-500" : "bg-gray-400"
                              }`}
                            />
                            {p.title}
                            <span className="text-[10px] text-gray-400 font-normal">
                              ({p.totalQuestions || p._count?.questions || 0} Qs)
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 p-3 bg-amber-50/50 border border-amber-200/50 rounded-xl flex items-center justify-between text-xs text-amber-800">
                      <span>No papers published for this exam yet.</span>
                      <Link
                        href={`/admin/papers?examId=${exam.id}`}
                        className="font-bold underline hover:text-amber-950"
                      >
                        Publish first paper &rarr;
                      </Link>
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs">
                    <span className="text-[11px] text-gray-400">
                      ID: <code className="font-mono">{exam.id}</code>
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          setError(null);
                          setSuccess(null);
                          setEditingExam(exam);
                        }}
                        className="border border-gray-300 hover:border-gray-950 hover:bg-gray-50 text-gray-800 font-semibold px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        onClick={() => handleToggle(exam.id, exam.isActive, exam.name)}
                        className={`border font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                          exam.isActive
                            ? "border-gray-200 text-gray-700 hover:bg-gray-100"
                            : "border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                        }`}
                      >
                        {exam.isActive ? "Unpublish / Disable" : "Publish / Enable"}
                      </button>

                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleDelete(exam.id, exam.name, exam.papers.length)}
                        className="border border-rose-200 text-rose-600 hover:bg-rose-50 font-semibold px-2.5 py-1 rounded-lg transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Edit Exam Modal */}
      {editingExam && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-gray-200 my-8">
            <div className="flex justify-between items-center pb-4 mb-5 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-black text-gray-950">Edit Exam Details</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Update title, URL slug, description, or published state
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingExam(null)}
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
              <input type="hidden" name="examId" value={editingExam.id} />

              <div>
                <label className="block text-gray-700 mb-1">
                  Exam Name <span className="text-rose-500">*</span>
                </label>
                <input
                  name="name"
                  defaultValue={editingExam.name}
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm font-semibold focus:ring-2 focus:ring-gray-950 outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-700 mb-1">
                  URL Slug <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden bg-gray-50 focus-within:ring-2 focus-within:ring-gray-950 focus-within:bg-white">
                  <span className="px-2.5 text-xs text-gray-400 bg-gray-100 border-r border-gray-200 select-none py-2.5">
                    /exams/
                  </span>
                  <input
                    name="slug"
                    defaultValue={editingExam.slug}
                    required
                    className="w-full p-2.5 text-sm font-mono text-gray-900 bg-transparent outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 mb-1">Description</label>
                <textarea
                  name="description"
                  defaultValue={editingExam.description || ""}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-950 outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-700 mb-1.5">Status</label>
                <select
                  name="isActive"
                  defaultValue={editingExam.isActive ? "true" : "false"}
                  className="w-full border border-gray-300 rounded-lg p-2.5 bg-white text-sm focus:ring-2 focus:ring-gray-950 outline-none font-semibold"
                >
                  <option value="true">Active (Published to Students)</option>
                  <option value="false">Disabled (Draft / Hidden)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingExam(null)}
                  className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2.5 bg-gray-950 hover:bg-gray-800 text-white font-bold rounded-lg shadow-sm disabled:opacity-50 transition-colors"
                >
                  {isPending ? "Saving Changes..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
