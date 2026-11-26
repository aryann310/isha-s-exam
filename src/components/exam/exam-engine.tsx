"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Attempt, Paper, Question, AttemptAnswer } from "@prisma/client";
import { saveAnswerAction, submitExamAction } from "@/server/actions/engine";
import { renderMarkdownWithMath } from "@/lib/render-markdown";
import { parseQuestionOptions } from "@/lib/parse-markdown-questions";
import { isAnswerCorrect, marksFor } from "@/lib/exam-patterns";
import type { ExamTheme } from "@/lib/exam-theme";
import { AlertTriangle, X } from "lucide-react";

type OptionType = { [key: string]: string };

interface ExamEngineProps {
  attempt: Attempt;
  paper: Paper;
  questions: Question[];
  initialAnswers: AttemptAnswer[];
  /** Colours and font of this exam. */
  theme: ExamTheme;
}

export function ExamEngine({ attempt, paper, questions, initialAnswers, theme }: ExamEngineProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Track tentatively selected answers
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const acc: Record<string, string> = {};
    if (!questions || questions.length === 0) return acc;
    initialAnswers.forEach((ans) => {
      if (ans.selectedAnswer) acc[ans.questionId] = ans.selectedAnswer;
    });
    return acc;
  });

  // Track confirmed results & solutions per question
  const [results, setResults] = useState<
    Record<string, { isCorrect: boolean; correctAnswer: string; explanation: string | null }>
  >(() => {
    const acc: Record<string, { isCorrect: boolean; correctAnswer: string; explanation: string | null }> = {};
    initialAnswers.forEach((ans) => {
      if (ans.selectedAnswer) {
        const q = questions.find((item) => item.id === ans.questionId);
        if (q) {
          acc[ans.questionId] = {
            isCorrect: isAnswerCorrect(q.questionType, q.correctAnswer, ans.selectedAnswer),
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
          };
        }
      }
    });
    return acc;
  });

  // Track visited questions
  const [visited, setVisited] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (questions.length > 0) s.add(questions[0].id);
    initialAnswers.forEach((ans) => {
      s.add(ans.questionId);
    });
    return s;
  });

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirming, setConfirming] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const navigateTo = (idx: number) => {
    setCurrentIndex(idx);
    const q = questions[idx];
    if (q) {
      setVisited((prev) => (prev.has(q.id) ? prev : new Set(prev).add(q.id)));
    }
  };

  const handleAutoSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    await submitExamAction(attempt.id);
    router.push(`/results/${attempt.id}`);
  }, [attempt.id, router, submitting]);

  // Timer logic for timed exams
  useEffect(() => {
    if (!attempt.endsAt) return;

    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((new Date(attempt.endsAt!).getTime() - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        handleAutoSubmit();
      }
    };

    updateTimer(); // Initial update on client to prevent hydration mismatch
    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, [attempt.endsAt, handleAutoSubmit]);

  const handleConfirmedSubmit = async () => {
    setSubmitting(true);
    setShowSubmitModal(false);
    await submitExamAction(attempt.id);
    router.push(`/results/${attempt.id}`);
  };

  if (!questions || questions.length === 0) {
    return (
      <div data-exam-theme={theme} className="flex flex-col items-center justify-center h-screen bg-gray-50 p-6 text-center font-exam">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">No Questions Found</h2>
        <p className="text-gray-500 mb-6">This paper currently has no questions assigned to it.</p>
        <button
          onClick={() => router.push("/exams")}
          className="bg-exam-primary hover:bg-exam-primary-hover text-white px-6 py-2 rounded-lg font-medium"
        >
          Return Home
        </button>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const isConfirmed = !!results[currentQuestion?.id];

  const optionsObj: OptionType = parseQuestionOptions(currentQuestion?.options);

  // Option Selection: Selects option locally before user clicks Confirm
  const handleSelectOption = (optionKey: string) => {
    if (isConfirmed) return; // Locked once confirmed
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: optionKey }));
  };

  // Confirm Button: Saves answer and displays solution on the spot
  const handleConfirmAnswer = async () => {
    const chosen = answers[currentQuestion.id];
    if (!chosen || confirming) return;

    setConfirming(true);
    setSaveStatus("saving");

    try {
      const res = await saveAnswerAction(attempt.id, currentQuestion.id, chosen);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);

      if (res) {
        // The server keeps the first confirmed answer; show what it actually recorded.
        if (res.selectedAnswer && res.selectedAnswer !== chosen) {
          setAnswers((prev) => ({ ...prev, [currentQuestion.id]: res.selectedAnswer }));
        }
        setResults((prev) => ({
          ...prev,
          [currentQuestion.id]: {
            isCorrect: res.isCorrect,
            correctAnswer: res.correctAnswer,
            explanation: res.explanation,
          },
        }));
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setConfirming(false);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Counts based on confirmed answers
  const answeredCount = Object.keys(results).length;
  const unansweredCount = questions.filter(
    (q) => visited.has(q.id) && !results[q.id]
  ).length;
  const notVisitedCount = questions.length - visited.size;
  const correctCount = Object.values(results).filter((r) => r.isCorrect).length;

  return (
    <div data-exam-theme={theme} className="flex flex-col h-screen bg-white select-none font-exam">
      {/* HEADER */}
      <header className="flex-none bg-exam-dark text-white px-4 md:px-6 py-3 flex justify-between items-center gap-3 z-20">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-base md:text-lg font-semibold">{paper.title}</h1>
            <p className="text-xs text-exam-on-dark">
              Practice · {paper.totalQuestions} questions · answers shown as you go
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-6">
          {saveStatus === "saving" && (
            <span className="hidden sm:inline-block text-xs text-exam-on-dark animate-pulse">Saving…</span>
          )}
          {saveStatus === "saved" && (
            <span className="hidden sm:inline-block text-xs text-exam-on-dark font-medium">Saved</span>
          )}
          {saveStatus === "error" && (
            <span className="hidden sm:inline-block text-xs text-white font-semibold">Connection interrupted</span>
          )}

          {timeLeft !== null && (
            <div
              className={`text-base md:text-lg tabular-nums font-bold px-3 py-1 rounded-lg border ${
                timeLeft < 300
                  ? "bg-white border-white text-st-not-answered"
                  : timeLeft < 600
                  ? "bg-white/15 border-amber-300 text-amber-100"
                  : "bg-white/10 border-white/20 text-white"
              }`}
            >
              <span className="text-xs font-medium mr-1.5 opacity-80 hidden sm:inline">Time left</span>
              {formatTime(timeLeft)}
            </div>
          )}

          <button
            onClick={() => setShowSubmitModal(true)}
            disabled={submitting}
            className="bg-white text-exam-dark font-bold px-4 md:px-5 py-2 rounded-md text-sm hover:bg-exam-tint transition-colors disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit test"}
          </button>
        </div>
      </header>

      {/* BODY */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* LEFT MAIN: QUESTION */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col justify-between">
          <div className="max-w-4xl w-full mx-auto pb-24">
            {/* Question Meta Bar */}
            <div className="flex justify-between items-center pb-4 mb-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold bg-exam-dark text-white px-3 py-1 rounded-md">
                  Question {currentQuestion.questionNumber} of {questions.length}
                </span>
                {currentQuestion.section && (
                  <span className="text-xs font-semibold bg-exam-tint text-exam-dark px-3 py-1 rounded-full border border-exam-line">
                    {currentQuestion.section}
                  </span>
                )}
                {currentQuestion.topic && (
                  <span className="hidden sm:inline-block text-xs text-gray-500">
                    Topic: {currentQuestion.topic}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 font-medium">
                Marking: <span className="text-emerald-600 font-bold">+{marksFor(paper, currentQuestion.questionType, currentQuestion.section).correct}</span> /{" "}
                <span className="text-rose-600 font-bold">{marksFor(paper, currentQuestion.questionType, currentQuestion.section).incorrect}</span>
              </div>
            </div>

            {/* Question Text */}
            <div
              className="prose max-w-none text-gray-900 text-[17px] md:text-lg leading-relaxed mb-8"
              dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(currentQuestion.questionText) }}
            />

            {/* Typed answer (TITA) */}
            {currentQuestion.questionType === "TITA" && (
              <div className="max-w-sm space-y-2">
                <label className="block text-sm font-semibold text-gray-700">Type your answer</label>
                <input
                  value={answers[currentQuestion.id] ?? ""}
                  disabled={isConfirmed}
                  inputMode="decimal"
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9a-zA-Z.\-/: ]/g, "").slice(0, 20);
                    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: v }));
                  }}
                  className={`w-full border-2 rounded-xl px-4 py-3 font-mono text-lg ${
                    isConfirmed
                      ? results[currentQuestion.id]?.isCorrect
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-rose-500 bg-rose-50"
                      : "border-gray-300 focus:border-exam-primary outline-none"
                  }`}
                />
                {isConfirmed && !results[currentQuestion.id]?.isCorrect && (
                  <p className="text-sm font-semibold text-emerald-800">
                    Correct answer: {results[currentQuestion.id]?.correctAnswer.split("|")[0]}
                  </p>
                )}
              </div>
            )}

            {/* Options */}
            <div className="space-y-3.5">
              {currentQuestion.questionType !== "TITA" && Object.entries(optionsObj).map(([key, value]) => {
                const isSelected = answers[currentQuestion.id] === key;
                let containerClass =
                  "border-2 rounded-xl p-4 transition-all flex items-start gap-4 text-left w-full ";

                if (isConfirmed) {
                  const pr = results[currentQuestion.id];
                  if (pr.correctAnswer === key) {
                    containerClass += "bg-emerald-50 border-emerald-500 text-emerald-950 font-medium cursor-default";
                  } else if (isSelected && !pr.isCorrect) {
                    containerClass += "bg-rose-50 border-rose-500 text-rose-950 font-medium cursor-default";
                  } else {
                    containerClass += "bg-white border-gray-200 opacity-60 cursor-default";
                  }
                } else {
                  if (isSelected) {
                    containerClass += "bg-exam-tint border-exam-primary text-gray-900 cursor-pointer";
                  } else {
                    containerClass += "bg-white border-gray-200 hover:border-gray-400 text-gray-800 cursor-pointer";
                  }
                }

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelectOption(key)}
                    className={containerClass}
                  >
                    <div
                      className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm border-2 ${
                        isConfirmed
                          ? results[currentQuestion.id].correctAnswer === key
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : isSelected
                            ? "bg-rose-600 text-white border-rose-600"
                            : "border-gray-300 text-gray-400 bg-white"
                          : isSelected
                          ? "bg-exam-primary text-white border-exam-primary"
                          : "border-gray-400 text-gray-700 bg-white"
                      }`}
                    >
                      {key}
                    </div>
                    <div
                      className="pt-1 text-base md:text-lg flex-1"
                      dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(value) }}
                    />
                  </button>
                );
              })}
            </div>

            {/* CONFIRM BUTTON (Shown before confirming) */}
            {!isConfirmed && (
              <div className="mt-8 flex flex-wrap items-center gap-4 p-5 bg-gray-50 border border-gray-200 rounded-2xl shadow-xs">
                <button
                  type="button"
                  onClick={handleConfirmAnswer}
                  disabled={!answers[currentQuestion.id] || confirming}
                  className="bg-exam-primary text-white font-bold text-sm px-8 py-3 rounded-lg hover:bg-exam-primary-hover disabled:opacity-40 transition-colors flex items-center gap-2"
                >
                  {confirming ? "Checking…" : "Confirm answer"}
                </button>
                {!answers[currentQuestion.id] ? (
                  <span className="text-xs text-gray-500 font-medium">
                    {currentQuestion.questionType === "TITA" ? "Type your answer above" : "Select an option above"}, then click <strong>Confirm answer</strong> to check it.
                  </span>
                ) : (
                  <span className="text-xs text-exam-primary font-semibold">
                    {currentQuestion.questionType === "TITA" ? "Answer" : "Option"} {answers[currentQuestion.id]} selected. Click Confirm answer to see the solution.
                  </span>
                )}
              </div>
            )}

            {/* ON-THE-SPOT SOLUTION CARD (Shown after clicking confirm) */}
            {isConfirmed && results[currentQuestion.id] && (
              <div className="mt-8 p-6 md:p-8 bg-gray-50 border border-gray-200 rounded-2xl shadow-xs animate-in fade-in duration-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-gray-200">
                  <div className="space-y-1">
                    <span
                      className={`text-2xl font-bold ${
                        results[currentQuestion.id].isCorrect
                          ? "text-emerald-600"
                          : "text-rose-600"
                      }`}
                    >
                      {results[currentQuestion.id].isCorrect ? "Correct" : "Incorrect"}
                    </span>
                    <div className="text-sm text-gray-700 font-medium">
                      Your Answer:{" "}
                      <strong className="text-gray-950 font-bold">
                        {currentQuestion.questionType === "TITA" ? "" : "Option "}{answers[currentQuestion.id]}
                      </strong>
                      {" • "}
                      Correct Answer:{" "}
                      <strong className="text-emerald-700 font-bold">
                        {currentQuestion.questionType === "TITA" ? results[currentQuestion.id].correctAnswer.split("|").join(" or ") : `Option ${results[currentQuestion.id].correctAnswer}`}
                      </strong>
                    </div>
                  </div>

                  {/* Prominent Next Question Button */}
                  {currentIndex < questions.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => navigateTo(currentIndex + 1)}
                      className="bg-exam-primary text-white font-bold text-sm px-7 py-3 rounded-lg hover:bg-exam-primary-hover transition-colors flex items-center gap-2 self-start sm:self-auto"
                    >
                      Next question &rarr;
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowSubmitModal(true)}
                      className="bg-emerald-600 text-white font-bold text-sm px-7 py-3 rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 self-start sm:self-auto"
                    >
                      Submit test &rarr;
                    </button>
                  )}
                </div>

                {results[currentQuestion.id].explanation && (
                  <div className="mt-5 pt-1">
                    <h4 className="text-sm font-bold text-gray-900 mb-2">
                      Solution
                    </h4>
                    <div
                      className="prose max-w-none text-gray-800 text-base leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdownWithMath(results[currentQuestion.id].explanation),
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* BOTTOM NAVIGATION BAR */}
          <div className="fixed md:sticky bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 md:p-4 flex justify-between items-center px-4 md:px-8 z-10 shadow-lg md:shadow-none">
            <button
              onClick={() => navigateTo(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              className="px-5 py-2.5 border border-gray-300 rounded-lg font-bold text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >
              &larr; Previous
            </button>

            {/* Mobile Toggle Button for Questions Drawer */}
            <button
              onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
              className="md:hidden flex items-center gap-1.5 px-3.5 py-2 bg-gray-100 rounded-lg text-xs font-bold text-gray-800 border border-gray-200"
            >
              Questions ({answeredCount}/{questions.length}) {mobileDrawerOpen ? "▲" : "▼"}
            </button>

            <button
              onClick={() => navigateTo(Math.min(questions.length - 1, currentIndex + 1))}
              disabled={currentIndex === questions.length - 1}
              className="px-6 py-2.5 bg-exam-primary text-white rounded-lg font-bold text-sm hover:bg-exam-primary-hover disabled:opacity-40 transition-colors"
            >
              Next &rarr;
            </button>
          </div>
        </div>

        {/* RIGHT SIDEBAR: QUESTION NAVIGATOR */}
        <aside
          className={`fixed md:relative inset-y-0 right-0 w-80 bg-gray-50 border-l border-gray-200 flex flex-col shrink-0 z-30 transition-transform duration-200 ${
            mobileDrawerOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
          }`}
        >
          {/* Header */}
          <div className="p-4 border-b border-gray-200 bg-white flex justify-between items-center shadow-xs">
            <div>
              <h3 className="font-bold text-gray-900 text-sm">Questions</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {answeredCount} of {questions.length} confirmed
              </p>
            </div>
            <button
              onClick={() => setMobileDrawerOpen(false)}
              aria-label="Close questions"
              className="md:hidden text-gray-600 hover:text-gray-900 p-1"
            >
              <X className="w-5 h-5" aria-hidden />
            </button>
          </div>

          {/* Palette Legend */}
          <div className="p-3 bg-gray-100 border-b border-gray-200 grid grid-cols-2 gap-2 text-xs font-medium text-gray-600">
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded bg-emerald-600"></span>
              <span>Correct ({correctCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded bg-rose-600"></span>
              <span>Wrong ({answeredCount - correctCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded bg-amber-100 border border-amber-400"></span>
              <span>Unanswered ({unansweredCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded bg-white border border-gray-300"></span>
              <span>Not Visited ({notVisitedCount})</span>
            </div>
          </div>

          {/* Questions Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx: number) => {
                const isAns = !!results[q.id];
                const isVisited = visited.has(q.id);
                const isCurrent = idx === currentIndex;

                let btnClass =
                  "w-11 h-11 flex flex-col items-center justify-center rounded-lg font-bold text-xs transition-all relative ";

                if (isCurrent) {
                  btnClass += "ring-2 ring-exam-primary ring-offset-2 z-10 ";
                }

                if (isAns) {
                  btnClass += results[q.id].isCorrect
                    ? "bg-emerald-600 text-white border border-emerald-700 hover:bg-emerald-700"
                    : "bg-rose-600 text-white border border-rose-700 hover:bg-rose-700";
                } else if (isVisited) {
                  btnClass += "bg-amber-50 text-amber-900 border-2 border-amber-400 hover:bg-amber-100";
                } else {
                  btnClass += "bg-white text-gray-600 border border-gray-300 hover:border-gray-500";
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      navigateTo(idx);
                      setMobileDrawerOpen(false);
                    }}
                    className={btnClass}
                    title={`Question ${q.questionNumber}: ${
                      isAns ? (results[q.id].isCorrect ? "Correct" : "Incorrect") : isVisited ? "Unanswered" : "Not Visited"
                    }`}
                  >
                    <span>{q.questionNumber || idx + 1}</span>
                    {isAns && (
                      <span className="text-[8px] leading-none opacity-80">
                        {answers[q.id]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {/* SUBMISSION CONFIRMATION MODAL */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 md:p-8 shadow-2xl border border-gray-200">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Submit the test?</h3>
            <p className="text-sm text-gray-500 mb-6">
              Review your question status summary before finalizing your submission.
            </p>

            <div className="grid grid-cols-3 gap-3 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200 text-center">
              <div>
                <p className="text-2xl font-bold text-exam-primary">{answeredCount}</p>
                <p className="text-xs font-semibold text-gray-600 mt-1">Confirmed</p>
              </div>
              <div className="border-x border-gray-200">
                <p className="text-2xl font-bold text-amber-700">{unansweredCount}</p>
                <p className="text-xs font-semibold text-gray-600 mt-1">Unanswered</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-600">{notVisitedCount}</p>
                <p className="text-xs font-semibold text-gray-600 mt-1">Not visited</p>
              </div>
            </div>

            <p className="text-xs text-rose-600 font-semibold mb-6 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" aria-hidden /> Once submitted, you cannot change your answers.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
                className="px-5 py-2.5 rounded-lg border border-gray-300 font-semibold text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmedSubmit}
                disabled={submitting}
                className="px-6 py-2.5 rounded-lg bg-exam-primary text-white font-bold text-sm hover:bg-exam-primary-hover transition-colors"
              >
                {submitting ? "Submitting…" : "Submit test"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
