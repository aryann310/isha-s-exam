"use client";

import { useState } from "react";
import type { Question, AttemptAnswer } from "@prisma/client";
import { renderMarkdownWithMath } from "@/lib/render-markdown";
import { parseQuestionOptions } from "@/lib/parse-markdown-questions";
import { isAnswerCorrect } from "@/lib/exam-patterns";

type FilterType = "ALL" | "CORRECT" | "INCORRECT" | "UNATTEMPTED";

const FILTER_LABELS: Record<FilterType, string> = { ALL: "All", CORRECT: "Correct", INCORRECT: "Wrong", UNATTEMPTED: "Skipped" };

interface SolutionClientProps {
  questions: Question[];
  answers: AttemptAnswer[];
  /** Answers given after the test in the untimed phase (not scored). */
  untimedAnswers?: Array<{ questionId: string; selectedAnswer: string }>;
  /** Reading a closed paper without having taken it: no answers, filters or right/wrong labels. */
  viewOnly?: boolean;
}

export function SolutionClient({ questions, answers, untimedAnswers = [], viewOnly = false }: SolutionClientProps) {
  const [filter, setFilter] = useState<FilterType>("ALL");

  const getQuestionStatus = (questionId: string) => {
    const ans = answers.find((a) => a.questionId === questionId);
    if (!ans || !ans.selectedAnswer) return "UNATTEMPTED";
    const q = questions.find((x) => x.id === questionId);
    return q && isAnswerCorrect(q.questionType, q.correctAnswer, ans.selectedAnswer) ? "CORRECT" : "INCORRECT";
  };

  const filteredQuestions = questions.filter((q) => {
    if (filter === "ALL") return true;
    return getQuestionStatus(q.id) === filter;
  });

  return (
    <div>
      <div role="group" aria-label="Show questions" hidden={viewOnly} className="flex flex-wrap gap-1 mb-6 bg-white p-1.5 rounded-xl border border-gray-200 sticky top-2 z-10 w-fit">
        {(["ALL", "CORRECT", "INCORRECT", "UNATTEMPTED"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`px-4 h-9 rounded-lg text-sm font-semibold transition-colors ${
              filter === f
                ? "bg-exam-primary text-white"
                : "bg-transparent text-gray-600 hover:bg-gray-100"
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {filteredQuestions.length === 0 ? (
          <div className="bg-white p-12 text-center border border-gray-200 rounded-xl text-gray-500">
            No questions match the current filter.
          </div>
        ) : (
          filteredQuestions.map((q) => {
            const status = getQuestionStatus(q.id);
            const ans = answers.find((a) => a.questionId === q.id);
            const selectedAnswer = ans?.selectedAnswer;

            const optionsObj = parseQuestionOptions(q.options);
            const untimed = untimedAnswers.find((u) => u.questionId === q.id);
            const untimedRight = untimed ? isAnswerCorrect(q.questionType, q.correctAnswer, untimed.selectedAnswer) : false;

            return (
              <div key={q.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="bg-exam-tint px-6 py-3.5 border-b border-exam-line flex justify-between items-center gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold text-gray-900">Question {q.questionNumber}</h2>
                    {q.section && (
                      <span className="text-xs font-semibold bg-white text-exam-dark border border-exam-line px-2 py-0.5 rounded">
                        {q.section}
                      </span>
                    )}
                    {q.topic && <span className="text-xs font-medium text-gray-700">{q.topic}</span>}
                    {q.difficulty && (
                      <span className="text-xs font-medium text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded">{q.difficulty}</span>
                    )}
                  </div>
                  {!viewOnly && status === "CORRECT" && <span className="text-st-answered font-bold text-sm">Correct</span>}
                  {!viewOnly && status === "INCORRECT" && <span className="text-st-not-answered font-bold text-sm">Wrong</span>}
                  {!viewOnly && status === "UNATTEMPTED" && <span className="text-gray-600 font-bold text-sm">Skipped</span>}
                </div>

                <div className="p-6">
                  {untimed && (
                    <p className="mb-6 text-sm rounded-lg border border-amber-200 bg-amber-50 text-gray-800 px-4 py-2">
                      Answered after the test (untimed, not scored): <strong className="font-mono">{untimed.selectedAnswer}</strong>{" "}
                      <strong className={untimedRight ? "text-st-answered" : "text-st-not-answered"}>{untimedRight ? "Correct" : "Wrong"}</strong>
                    </p>
                  )}
                  <div
                    className="prose max-w-none text-gray-900 text-[17px] mb-6 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(q.questionText) }}
                  />

                  {q.questionType === "TITA" && (
                    <div className="grid sm:grid-cols-2 gap-3 mb-8 text-sm">
                      <div hidden={viewOnly} className={`p-4 rounded-xl border-2 ${status === "CORRECT" ? "border-emerald-500 bg-emerald-50" : status === "INCORRECT" ? "border-rose-500 bg-rose-50" : "border-gray-200"}`}>
                        <p className="text-sm font-medium text-gray-600 mb-1">Your answer</p>
                        <p className="font-mono text-lg">{selectedAnswer || "—"}</p>
                      </div>
                      <div className="p-4 rounded-xl border-2 border-emerald-500 bg-emerald-50">
                        <p className="text-sm font-medium text-gray-600 mb-1">Correct answer</p>
                        <p className="font-mono text-lg">{q.correctAnswer.split("|").join(" or ")}</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 mb-8">
                    {q.questionType !== "TITA" && Object.entries(optionsObj).map(([key, value]) => {
                      const isCorrect = q.correctAnswer === key;
                      const isSelected = selectedAnswer === key;

                      let bgClass = "bg-white border-gray-200 opacity-60";
                      let indicator = "";

                      if (isCorrect) {
                        bgClass = "bg-emerald-50 border-emerald-500 text-emerald-950 opacity-100 font-medium";
                        indicator = isSelected ? "Your answer · correct" : "Correct answer";
                      } else if (isSelected) {
                        bgClass = "bg-rose-50 border-rose-500 text-rose-950 opacity-100 font-medium";
                        indicator = "Your answer · wrong";
                      }

                      return (
                        <div key={key} className={`p-4 rounded-xl border-2 flex items-start gap-4 ${bgClass}`}>
                          <div className="shrink-0 w-8 h-8 rounded-lg border-2 border-current flex items-center justify-center font-bold text-sm">
                            {key}
                          </div>
                          <div className="pt-1 flex-1">
                            <span dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(value) }} />
                            <strong className={`block text-xs mt-1 ${isCorrect ? "text-emerald-800" : "text-rose-800"}`}>
                              {indicator}
                            </strong>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {q.explanation && (
                    <div className="bg-exam-tint border border-exam-line rounded-xl p-6">
                      <h3 className="font-bold text-exam-dark mb-3 text-sm">Solution</h3>
                      <div
                        className="prose max-w-none text-gray-900 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(q.explanation) }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
