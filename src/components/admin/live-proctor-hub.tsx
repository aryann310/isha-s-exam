"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  adminForceSubmitExamAction,
  adminStartExamForStudentAction,
  adminExtendExamTimeAction,
  adminResetAttemptAction,
  adminDeleteAttemptAction,
  adminGetLiveAttemptDetailsAction,
} from "@/server/actions/admin";
import { renderMarkdownWithMath } from "@/lib/render-markdown";

export interface StudentOption {
  id: string;
  name: string;
  email: string;
  username: string | null;
}

export interface PaperOption {
  id: string;
  title: string;
  durationSeconds: number;
  totalQuestions: number;
  exam: { id: string; name: string };
}

export interface AttemptItem {
  id: string;
  userId: string;
  paperId: string;
  mode: string;
  status: string;
  startedAt: string | Date;
  endsAt: string | Date | null;
  submittedAt: string | Date | null;
  score: number | null;
  correct: number | null;
  incorrect: number | null;
  unattempted: number | null;
  accuracy: number | null;
  timeTaken: number | null;
  user: {
    id: string;
    name: string;
    email: string;
    username?: string | null;
  };
  paper: {
    id: string;
    title: string;
    durationSeconds: number;
    totalQuestions: number;
    exam: { name: string };
  };
  answers: {
    id: string;
    questionId: string;
    selectedAnswer: string | null;
    isCorrect: boolean | null;
    answeredAt: string | Date;
  }[];
}

export function LiveProctorHub({
  initialAttempts,
  students,
  papers,
}: {
  initialAttempts: AttemptItem[];
  students: StudentOption[];
  papers: PaperOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [filter, setFilter] = useState<"ALL" | "LIVE" | "COMPLETED">("ALL");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Start exam modal
  const [showStartModal, setShowStartModal] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id || "");
  const [selectedPaperId, setSelectedPaperId] = useState(papers[0]?.id || "");
  const [selectedMode, setSelectedMode] = useState<"MOCK" | "PRACTICE">("MOCK");
  const [customDuration, setCustomDuration] = useState<number>(60);

  // Live Inspector Modal
  const [inspectingAttemptId, setInspectingAttemptId] = useState<string | null>(null);
  const [inspectData, setInspectData] = useState<any | null>(null);
  const [inspectingLoading, setInspectingLoading] = useState(false);
  const [inspectQuestionIndex, setInspectQuestionIndex] = useState(0);

  // Auto-refresh interval (5s)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      startTransition(() => {
        router.refresh();
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, router]);

  // Open inspector
  const handleOpenInspector = async (attemptId: string) => {
    setInspectingAttemptId(attemptId);
    setInspectingLoading(true);
    setInspectQuestionIndex(0);
    try {
      const data = await adminGetLiveAttemptDetailsAction(attemptId);
      setInspectData(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load attempt details");
    } finally {
      setInspectingLoading(false);
    }
  };

  // Force close/submit
  const handleForceSubmit = (attemptId: string, studentName: string) => {
    if (!confirm(`Are you sure you want to FORCE CLOSE the exam for ${studentName}? The test will be immediately evaluated and finalized.`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await adminForceSubmitExamAction(attemptId);
        setSuccess(`Exam for ${studentName} was closed and submitted.`);
        if (inspectingAttemptId === attemptId) {
          setInspectingAttemptId(null);
        }
        router.refresh();
      } catch (err: any) {
        setError(err?.message || "Failed to close exam");
      }
    });
  };

  // Extend time
  const handleExtendTime = (attemptId: string, minutes: number, studentName: string) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await adminExtendExamTimeAction(attemptId, minutes);
        setSuccess(`Added +${minutes} minutes to ${studentName}'s exam timer.`);
        if (inspectingAttemptId === attemptId) {
          const updated = await adminGetLiveAttemptDetailsAction(attemptId);
          setInspectData(updated);
        }
        router.refresh();
      } catch (err: any) {
        setError(err?.message || "Failed to extend time");
      }
    });
  };

  // Reset attempt
  const handleResetAttempt = (attemptId: string, studentName: string) => {
    if (!confirm(`Are you sure you want to RESET ${studentName}'s attempt? All answers will be cleared and the timer restarted.`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await adminResetAttemptAction(attemptId);
        setSuccess(`Attempt for ${studentName} was reset.`);
        if (inspectingAttemptId === attemptId) {
          setInspectingAttemptId(null);
        }
        router.refresh();
      } catch (err: any) {
        setError(err?.message || "Failed to reset attempt");
      }
    });
  };

  // Delete attempt
  const handleDeleteAttempt = (attemptId: string, studentName: string) => {
    if (!confirm(`Permanently delete this attempt for ${studentName}?`)) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await adminDeleteAttemptAction(attemptId);
        setSuccess(`Attempt deleted.`);
        if (inspectingAttemptId === attemptId) {
          setInspectingAttemptId(null);
        }
        router.refresh();
      } catch (err: any) {
        setError(err?.message || "Failed to delete attempt");
      }
    });
  };

  // Launch exam for student
  const handleLaunchExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const res = await adminStartExamForStudentAction(
          selectedStudentId,
          selectedPaperId,
          selectedMode,
          customDuration
        );
        const stu = students.find((s) => s.id === selectedStudentId);
        const pap = papers.find((p) => p.id === selectedPaperId);
        setSuccess(`Launched ${selectedMode} exam "${pap?.title}" for ${stu?.name}. They can now take it!`);
        setShowStartModal(false);
        router.refresh();
      } catch (err: any) {
        setError(err?.message || "Failed to start exam");
      }
    });
  };

  // Format countdown / duration
  const getRemainingTimeStr = (endsAt: string | Date | null) => {
    if (!endsAt) return "No limit (Practice)";
    const remainingSec = Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000));
    if (remainingSec === 0) return "Time expired (Pending submit)";
    const m = Math.floor(remainingSec / 60);
    const s = remainingSec % 60;
    return `${m}m ${s.toString().padStart(2, "0")}s left`;
  };

  const inProgressAttempts = initialAttempts.filter((a) => a.status === "IN_PROGRESS");
  const completedAttempts = initialAttempts.filter((a) => a.status !== "IN_PROGRESS");

  const displayedAttempts =
    filter === "LIVE"
      ? inProgressAttempts
      : filter === "COMPLETED"
      ? completedAttempts
      : initialAttempts;

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <span
              className={`w-3.5 h-3.5 rounded-full ${
                inProgressAttempts.length > 0 ? "bg-rose-500 animate-ping absolute" : "bg-emerald-500"
              }`}
            />
            <span
              className={`w-3 h-3 rounded-full ${
                inProgressAttempts.length > 0 ? "bg-rose-600" : "bg-emerald-600"
              }`}
            />
          </div>
          <div>
            <h3 className="text-base font-black text-gray-950 flex items-center gap-2">
              Live Proctoring & Control Hub
              <span className="text-[11px] font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                {inProgressAttempts.length} Active Now
              </span>
            </h3>
            <p className="text-xs text-gray-500">
              Real-time monitoring, live student screen inspector, and master exam control.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
              autoRefresh
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : "bg-gray-100 text-gray-600 border-gray-200"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-emerald-500" : "bg-gray-400"}`} />
            {autoRefresh ? "Auto-Refresh ON (5s)" : "Auto-Refresh Paused"}
          </button>

          <button
            type="button"
            onClick={() => startTransition(() => router.refresh())}
            disabled={isPending}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-800 transition-colors"
          >
            ↻ Refresh
          </button>

          <button
            type="button"
            onClick={() => setShowStartModal(true)}
            className="text-xs font-black bg-gray-950 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors shadow-xs flex items-center gap-1.5"
          >
            🚀 Launch Exam for Student
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded-xl flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold ml-2">✕</button>
        </div>
      )}
      {success && (
        <div className="p-3 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="font-bold ml-2">✕</button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 text-xs">
        <span className="font-bold text-gray-500">Filter:</span>
        <button
          type="button"
          onClick={() => setFilter("ALL")}
          className={`px-3 py-1 rounded-lg font-bold transition-colors ${
            filter === "ALL" ? "bg-gray-950 text-white" : "bg-white border text-gray-700 hover:bg-gray-50"
          }`}
        >
          All Attempts ({initialAttempts.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("LIVE")}
          className={`px-3 py-1 rounded-lg font-bold transition-colors flex items-center gap-1.5 ${
            filter === "LIVE" ? "bg-rose-600 text-white" : "bg-white border text-rose-700 hover:bg-rose-50"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
          Active In-Progress ({inProgressAttempts.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("COMPLETED")}
          className={`px-3 py-1 rounded-lg font-bold transition-colors ${
            filter === "COMPLETED" ? "bg-gray-950 text-white" : "bg-white border text-gray-700 hover:bg-gray-50"
          }`}
        >
          Completed ({completedAttempts.length})
        </button>
      </div>

      {/* Attempts Grid / Table */}
      {displayedAttempts.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center text-gray-500">
          <p className="font-bold text-gray-800 mb-1">No attempts match this filter.</p>
          <p className="text-xs text-gray-400">
            {filter === "LIVE"
              ? "There are currently no active in-progress exams. Click 'Launch Exam for Student' to start one."
              : "No recorded examination attempts yet."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {displayedAttempts.map((att) => {
            const isLive = att.status === "IN_PROGRESS";
            const answeredCount = att.answers.filter((a) => a.selectedAnswer).length;
            const totalQuestions = att.paper?.totalQuestions || 1;
            const progressPct = Math.round((answeredCount / totalQuestions) * 100);

            // Live calculate score so far
            const correctSoFar = att.answers.filter((a) => a.isCorrect === true).length;
            const incorrectSoFar = att.answers.filter((a) => a.isCorrect === false && a.selectedAnswer).length;

            return (
              <div
                key={att.id}
                className={`bg-white p-5 rounded-2xl border transition-all shadow-xs ${
                  isLive
                    ? "border-rose-300 ring-2 ring-rose-100 bg-rose-50/20"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                  {/* Left: Student & Exam Info */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-gray-950 text-base">
                        {att.user.name}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">
                        ({att.user.username || att.user.email})
                      </span>
                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          isLive
                            ? "bg-rose-100 text-rose-800 animate-pulse border border-rose-300"
                            : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        }`}
                      >
                        {isLive ? "🔴 LIVE NOW" : att.status}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          att.mode === "MOCK"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {att.mode}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-gray-600 flex-wrap">
                      <span className="bg-gray-900 text-white text-[9px] font-black px-1.5 py-0.5 rounded">
                        {att.paper?.exam?.name || "Exam"}
                      </span>
                      <span className="font-bold text-gray-900">{att.paper?.title || "Paper"}</span>
                      <span>•</span>
                      <span>
                        Started:{" "}
                        {new Date(att.startedAt).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    {/* Progress / Status Bar */}
                    <div className="flex items-center gap-3 pt-1">
                      <div className="w-36 bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full ${isLive ? "bg-rose-500" : "bg-emerald-500"}`}
                          style={{ width: `${Math.min(progressPct, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-600">
                        {answeredCount} of {att.paper?.totalQuestions || 0} Qs Answered ({progressPct}%)
                      </span>
                      {isLive ? (
                        <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 font-mono">
                          ⏱ {getRemainingTimeStr(att.endsAt)}
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-emerald-700">
                          Score: {att.score} pts ({Math.round(att.accuracy || 0)}% Acc)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Master Control Actions */}
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleOpenInspector(att.id)}
                      className="bg-gray-950 hover:bg-gray-800 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                    >
                      👁 Live Inspector & Preview
                    </button>

                    {isLive ? (
                      <>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleForceSubmit(att.id, att.user.name)}
                          className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors shadow-xs"
                          title="Force submit and evaluate test immediately"
                        >
                          ⏹ Force Submit
                        </button>

                        <div className="relative group">
                          <button
                            type="button"
                            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 text-xs font-bold px-2.5 py-2 rounded-lg transition-colors flex items-center gap-1"
                          >
                            ⏳ + Time
                          </button>
                          <div className="hidden group-hover:flex flex-col absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 py-1 w-32">
                            <button
                              type="button"
                              onClick={() => handleExtendTime(att.id, 5, att.user.name)}
                              className="text-left px-3 py-1.5 text-xs hover:bg-gray-100 font-semibold text-gray-800"
                            >
                              +5 Minutes
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExtendTime(att.id, 10, att.user.name)}
                              className="text-left px-3 py-1.5 text-xs hover:bg-gray-100 font-semibold text-gray-800"
                            >
                              +10 Minutes
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExtendTime(att.id, 15, att.user.name)}
                              className="text-left px-3 py-1.5 text-xs hover:bg-gray-100 font-semibold text-gray-800"
                            >
                              +15 Minutes
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExtendTime(att.id, 30, att.user.name)}
                              className="text-left px-3 py-1.5 text-xs hover:bg-gray-100 font-semibold text-gray-800"
                            >
                              +30 Minutes
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <Link
                        href={`/solutions/${att.id}`}
                        target="_blank"
                        className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 text-xs font-bold px-3 py-2 rounded-lg transition-colors"
                      >
                        Review Solutions ↗
                      </Link>
                    )}

                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleResetAttempt(att.id, att.user.name)}
                      className="border border-amber-300 text-amber-800 hover:bg-amber-50 text-xs font-semibold px-2.5 py-2 rounded-lg transition-colors"
                      title="Clear answers and reset attempt for student"
                    >
                      🔄 Reset
                    </button>

                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleDeleteAttempt(att.id, att.user.name)}
                      className="border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold px-2.5 py-2 rounded-lg transition-colors"
                      title="Delete attempt record"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Launch / Start Exam for Student */}
      {showStartModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-gray-200 my-8">
            <div className="flex justify-between items-center pb-4 mb-5 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-black text-gray-950">
                  Launch / Start Exam for Student
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Remotely initiate an exam session for a registered student
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowStartModal(false)}
                className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleLaunchExam} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-gray-700 mb-1">Select Student</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-gray-950 outline-none"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.username || s.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-700 mb-1">Target Examination Paper</label>
                <select
                  value={selectedPaperId}
                  onChange={(e) => setSelectedPaperId(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-gray-950 outline-none"
                >
                  {papers.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.exam.name}] {p.title} ({p.totalQuestions} Qs)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 mb-1">Mode</label>
                  <select
                    value={selectedMode}
                    onChange={(e) => setSelectedMode(e.target.value as any)}
                    className="w-full border border-gray-300 rounded-lg p-2.5 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-gray-950 outline-none"
                  >
                    <option value="MOCK">MOCK TEST (Timed Simulation)</option>
                    <option value="PRACTICE">PRACTICE (Interactive)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 mb-1">Duration (Minutes)</label>
                  <input
                    type="number"
                    value={customDuration}
                    onChange={(e) => setCustomDuration(parseInt(e.target.value, 10) || 60)}
                    required
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-950 outline-none"
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs">
                ℹ️ Once launched, the exam will immediately appear in the student&apos;s active exam view. If they are logged in, they can jump right in.
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowStartModal(false)}
                  className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2.5 bg-gray-950 hover:bg-gray-800 text-white font-bold rounded-lg shadow-sm disabled:opacity-50 transition-colors"
                >
                  {isPending ? "Starting Exam..." : "🚀 Launch Exam"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Live Student Screen / Inspector */}
      {inspectingAttemptId && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-gray-200 overflow-hidden">
            {/* Inspector Topbar */}
            <div className="bg-gray-950 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
                <div>
                  <h3 className="text-base font-black tracking-tight flex items-center gap-2">
                    Live Exam Inspector: {inspectData?.user?.name || "Loading..."}
                    <span className="text-[10px] bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-mono">
                      {inspectData?.mode}
                    </span>
                  </h3>
                  <p className="text-xs text-gray-400">
                    {inspectData?.paper?.exam?.name} • {inspectData?.paper?.title}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {inspectData?.status === "IN_PROGRESS" && (
                  <button
                    type="button"
                    onClick={() => handleForceSubmit(inspectData.id, inspectData.user.name)}
                    className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Force Submit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setInspectingAttemptId(null)}
                  className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 text-sm font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Inspector Body */}
            {inspectingLoading || !inspectData ? (
              <div className="p-16 text-center text-gray-500 flex flex-col items-center justify-center gap-3">
                <span className="w-6 h-6 border-2 border-gray-950 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-bold">Connecting to live student exam state...</span>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Live Stats Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-200 text-center">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-gray-400 block">Status</span>
                    <span
                      className={`text-xs font-black px-2 py-0.5 rounded ${
                        inspectData.status === "IN_PROGRESS"
                          ? "bg-rose-100 text-rose-800 animate-pulse"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {inspectData.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-gray-400 block">Time Left</span>
                    <span className="text-xs font-mono font-bold text-gray-900">
                      {getRemainingTimeStr(inspectData.endsAt)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-gray-400 block">Answered</span>
                    <span className="text-xs font-bold text-gray-900">
                      {inspectData.answers.filter((a: any) => a.selectedAnswer).length} of{" "}
                      {inspectData.paper.questions.length} Qs
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-gray-400 block">Correct So Far</span>
                    <span className="text-xs font-bold text-emerald-600">
                      {inspectData.answers.filter((a: any) => a.isCorrect === true).length} Correct
                    </span>
                  </div>
                </div>

                {/* Question Selector Dots */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-black uppercase text-gray-600">Question Matrix:</span>
                    <div className="flex items-center gap-3 text-[11px] text-gray-500">
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Correct
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Incorrect
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-gray-300" /> Unanswered
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 p-3 bg-gray-50 rounded-2xl border border-gray-200">
                    {inspectData.paper.questions.map((q: any, idx: number) => {
                      const ans = inspectData.answers.find((a: any) => a.questionId === q.id);
                      let btnColor = "bg-white border-gray-200 text-gray-600 hover:border-gray-400";
                      if (ans?.selectedAnswer) {
                        btnColor = ans.isCorrect
                          ? "bg-emerald-500 text-white border-emerald-600 font-bold"
                          : "bg-rose-500 text-white border-rose-600 font-bold";
                      }
                      if (idx === inspectQuestionIndex) {
                        btnColor += " ring-2 ring-gray-950 font-black";
                      }

                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => setInspectQuestionIndex(idx)}
                          className={`w-8 h-8 rounded-lg text-xs border flex items-center justify-center transition-all ${btnColor}`}
                        >
                          {q.questionNumber || idx + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Current Question Detail View */}
                {inspectData.paper.questions[inspectQuestionIndex] && (() => {
                  const q = inspectData.paper.questions[inspectQuestionIndex];
                  const ans = inspectData.answers.find((a: any) => a.questionId === q.id);
                  let opts: Record<string, string> = {};
                  try {
                    opts = JSON.parse(q.options);
                  } catch {}

                  return (
                    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-5">
                      <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-gray-950 text-base">
                            Question {q.questionNumber}
                          </span>
                          {q.section && (
                            <span className="text-[10px] font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                              {q.section}
                            </span>
                          )}
                        </div>
                        {ans?.selectedAnswer ? (
                          <span
                            className={`text-xs font-black px-2.5 py-1 rounded-full ${
                              ans.isCorrect
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {ans.isCorrect ? "✓ Answered Correctly" : "✗ Answered Incorrectly"}
                          </span>
                        ) : (
                          <span className="text-xs font-bold bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">
                            ⚪ Not Answered Yet
                          </span>
                        )}
                      </div>

                      <div
                        className="prose max-w-none text-gray-900 leading-relaxed text-sm"
                        dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(q.questionText) }}
                      />

                      {/* Options with Student selection highlighted */}
                      <div className="space-y-2">
                        {Object.entries(opts).map(([key, val]) => {
                          const isStudentPick = ans?.selectedAnswer === key;
                          const isCorrect = q.correctAnswer === key;

                          let bg = "bg-gray-50 border-gray-200 text-gray-800";
                          if (isCorrect) {
                            bg = "bg-emerald-50 border-emerald-500 text-emerald-950 font-bold";
                          } else if (isStudentPick && !isCorrect) {
                            bg = "bg-rose-50 border-rose-500 text-rose-950 font-bold";
                          }

                          return (
                            <div
                              key={key}
                              className={`p-3 rounded-xl border flex items-start gap-3 text-xs ${bg}`}
                            >
                              <span className="w-6 h-6 rounded-md bg-white border border-current font-bold flex items-center justify-center shrink-0">
                                {key}
                              </span>
                              <div className="pt-0.5 flex-1">
                                <span dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(val) }} />
                                {isStudentPick && (
                                  <span className="ml-2 font-black uppercase text-[10px] bg-gray-900 text-white px-2 py-0.5 rounded">
                                    Student Choice
                                  </span>
                                )}
                                {isCorrect && (
                                  <span className="ml-2 font-black uppercase text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded">
                                    Official Answer
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {q.explanation && (
                        <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 text-xs">
                          <span className="font-bold text-blue-900 uppercase block mb-1">
                            Explanation:
                          </span>
                          <div
                            className="text-blue-950 leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(q.explanation) }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
