"use client";

import { useState } from "react";
import type { Question, AttemptAnswer } from "@prisma/client";
import { renderMarkdownWithMath } from "@/lib/render-markdown";
import { parseQuestionOptions } from "@/lib/parse-markdown-questions";

type FilterType = "ALL" | "CORRECT" | "INCORRECT" | "UNATTEMPTED";

interface SolutionClientProps {
  questions: Question[];
  answers: AttemptAnswer[];
}

export function SolutionClient({ questions, answers }: SolutionClientProps) {
  const [filter, setFilter] = useState<FilterType>("ALL");

  const getQuestionStatus = (questionId: string) => {
    const ans = answers.find((a) => a.questionId === questionId);
    if (!ans || !ans.selectedAnswer) return "UNATTEMPTED";
    return ans.isCorrect ? "CORRECT" : "INCORRECT";
  };

  const filteredQuestions = questions.filter((q) => {
    if (filter === "ALL") return true;
    return getQuestionStatus(q.id) === filter;
  });

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-8 bg-white p-2 rounded-lg border border-gray-200 shadow-sm sticky top-20 z-10">
        {(["ALL", "CORRECT", "INCORRECT", "UNATTEMPTED"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${
              filter === f
                ? "bg-gray-900 text-white"
                : "bg-transparent text-gray-600 hover:bg-gray-100"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-8">
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

            return (
              <div key={q.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900">QUESTION {q.questionNumber}</h3>
                    {q.section && (
                      <span className="text-[10px] font-bold bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                        {q.section}
                      </span>
                    )}
                  </div>
                  {status === "CORRECT" && <span className="text-emerald-600 font-bold text-sm">✓ Correct</span>}
                  {status === "INCORRECT" && <span className="text-rose-600 font-bold text-sm">❌ Incorrect</span>}
                  {status === "UNATTEMPTED" && <span className="text-gray-400 font-bold text-sm">⚪ Unattempted</span>}
                </div>

                <div className="p-6">
                  <div
                    className="prose max-w-none text-gray-900 text-lg mb-8 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(q.questionText) }}
                  />

                  <div className="space-y-3 mb-8">
                    {Object.entries(optionsObj).map(([key, value]) => {
                      const isCorrect = q.correctAnswer === key;
                      const isSelected = selectedAnswer === key;

                      let bgClass = "bg-white border-gray-200 opacity-60";
                      let indicator = "";

                      if (isCorrect) {
                        bgClass = "bg-emerald-50 border-emerald-500 text-emerald-950 opacity-100 font-medium";
                        indicator = isSelected ? " (Your Answer - Correct ✓)" : " (Correct Answer)";
                      } else if (isSelected) {
                        bgClass = "bg-rose-50 border-rose-500 text-rose-950 opacity-100 font-medium";
                        indicator = " (Your Answer - Incorrect ✗)";
                      }

                      return (
                        <div key={key} className={`p-4 rounded-xl border-2 flex items-start gap-4 ${bgClass}`}>
                          <div className="shrink-0 w-8 h-8 rounded-lg border-2 border-current flex items-center justify-center font-bold text-sm">
                            {key}
                          </div>
                          <div className="pt-1 flex-1">
                            <span dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(value) }} />
                            <strong className={isCorrect ? "text-emerald-700 ml-2" : "text-rose-700 ml-2"}>
                              {indicator}
                            </strong>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {q.explanation && (
                    <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-6">
                      <h4 className="font-bold text-blue-900 mb-3 text-sm uppercase tracking-wide">DETAILED SOLUTION</h4>
                      <div
                        className="prose max-w-none text-blue-950 leading-relaxed"
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
