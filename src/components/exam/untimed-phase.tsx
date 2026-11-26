"use client";

// Untimed phase after a mock: only the questions left unanswered, no clock, free movement. Answers are saved in
// the background (same queue as the test) and never change the test score. Finishing opens the solutions.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { finishUntimedAction, saveUntimedAnswerAction } from "@/server/actions/untimed";
import { useSaveQueue, type SaveJob } from "@/components/exam/use-save-queue";
import { renderMarkdownWithMath } from "@/lib/render-markdown";
import { ExamCalculator } from "@/components/exam/exam-calculator";

export interface UntimedQuestion {
  id: string;
  number: number;
  section: string;
  type: "MCQ" | "TITA";
  text: string;
  options: Record<string, string>;
  marks: { correct: number; incorrect: number };
}

interface Props {
  attemptId: string;
  paperTitle: string;
  patternLabel: string;
  calculator: boolean;
  questions: UntimedQuestion[];
  initialAnswers: Record<string, string>;
}

const KEYPAD = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "-"];

export function UntimedPhase({ attemptId, paperTitle, patternLabel, calculator, questions, initialAnswers }: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [current, setCurrent] = useState(() => Math.max(0, questions.findIndex((q) => !initialAnswers[q.id])));
  const q = questions[current];
  const [draft, setDraft] = useState<string | null>(q ? initialAnswers[q.id] ?? null : null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [showCalc, setShowCalc] = useState(false);

  const send = useCallback(
    async (job: SaveJob) => (job.kind === "save" ? saveUntimedAnswerAction(attemptId, job.questionId, job.answer) : ({ ok: true } as const)),
    [attemptId]
  );
  const { enqueue, flush, pending, retrying } = useSaveQueue({
    send,
    onFinished: () => router.replace(`/results/${attemptId}`),
    onRefused: (job, message) => setError(`Your answer to ${job.label} was not saved: ${message}`),
    storageKey: `untimed-unsent:${attemptId}`,
    onRestore: (jobs) =>
      setAnswers((prev) => {
        const next = { ...prev };
        for (const j of jobs) if (j.kind === "save") {
          if (j.answer) next[j.questionId] = j.answer;
          else delete next[j.questionId];
        }
        return next;
      }),
  });

  const goTo = (index: number) => {
    const target = questions[index];
    if (!target) return;
    setCurrent(index);
    setDraft(answers[target.id] ?? null);
  };

  const save = (answer: string | null, advance: boolean) => {
    if (!q || finishing) return;
    setError(null);
    setAnswers((prev) => {
      const next = { ...prev };
      if (answer) next[q.id] = answer;
      else delete next[q.id];
      return next;
    });
    if ((answers[q.id] ?? null) !== answer) {
      enqueue({ kind: "save", key: `save:${q.id}`, label: `Question ${q.number}`, questionId: q.id, answer, markedForReview: false, visitNext: null });
    }
    if (advance) {
      // Next unanswered question after this one (wrapping round), else simply the next one.
      const after = [...questions.slice(current + 1), ...questions.slice(0, current)].find((x) => x.id !== q.id && !answers[x.id]);
      goTo(after ? questions.indexOf(after) : Math.min(current + 1, questions.length - 1));
    } else {
      setDraft(answer);
    }
  };

  const finish = async () => {
    setFinishing(true);
    setError(null);
    if (!(await flush(20_000))) {
      setFinishing(false);
      setError("Some answers are still being saved. Check your internet connection, then try again.");
      return;
    }
    try {
      const res = await finishUntimedAction(attemptId);
      if (!res.ok) throw new Error(res.error);
      router.replace(`/results/${attemptId}`);
    } catch {
      setFinishing(false);
      setError("Could not finish. Check your connection and try again.");
    }
  };

  // Close the confirm dialog with Escape.
  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setConfirming(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming]);

  const sections = useMemo(() => {
    const groups: Array<{ name: string; items: Array<{ q: UntimedQuestion; index: number }> }> = [];
    questions.forEach((item, index) => {
      const g = groups.find((x) => x.name === item.section) ?? (groups.push({ name: item.section, items: [] }), groups[groups.length - 1]);
      g.items.push({ q: item, index });
    });
    return groups;
  }, [questions]);

  const answeredCount = questions.filter((x) => answers[x.id]).length;
  const saveStatus = retrying ? "Connection problem, retrying to save…" : pending > 0 ? "Saving…" : "All answers saved";

  if (!q) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-md text-center">
          <p className="font-semibold text-gray-900 mb-4">No questions are left to answer.</p>
          <button onClick={finish} className="bg-gray-950 text-white font-bold px-6 py-3 rounded-xl text-sm">See result &amp; solutions</button>
        </div>
      </div>
    );
  }

  const optionKeys = Object.keys(q.options);
  const changed = (answers[q.id] ?? null) !== draft;

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-white text-gray-900">
      <header className="flex-none bg-gray-950 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">{patternLabel} · Untimed phase · No time limit</p>
          <h1 className="font-bold truncate">{paperTitle}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span role="status" className={`text-xs ${retrying ? "text-amber-300" : "text-gray-300"}`}>{saveStatus}</span>
          {calculator && (
            <button onClick={() => setShowCalc((v) => !v)} className="text-xs font-semibold bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded" aria-label="Calculator">
              Calculator
            </button>
          )}
          <button
            onClick={() => setConfirming(true)}
            disabled={finishing}
            className="text-sm font-bold bg-white text-gray-950 px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            Finish &amp; see solutions
          </button>
        </div>
      </header>

      <div className="flex-none bg-amber-50 border-b border-amber-200 text-amber-900 text-sm px-4 py-2">
        Your test score is final. These are the {questions.length} question{questions.length === 1 ? "" : "s"} you left unanswered: take as long as you
        need. They are shown separately on your result and do not change your score. Solutions open when you finish.
      </div>

      {error && (
        <div role="alert" className="flex-none bg-red-50 border-b border-red-200 text-red-800 text-sm px-4 py-2 flex justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="font-bold">✕</button>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row lg:min-h-0">
        <main className="flex-1 flex flex-col min-w-0 lg:min-h-0">
          <div className="flex-none flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-gray-200">
            <span className="font-bold">
              Question No. {q.number} <span className="ml-2 text-xs font-semibold text-gray-500">{q.section}</span>
            </span>
            <span className="text-xs text-gray-600">
              {q.type === "TITA" ? "Type in the Answer" : "Multiple Choice"} ·{" "}
              <span className="text-green-700 font-semibold">+{q.marks.correct}</span> /{" "}
              <span className="text-red-700 font-semibold">{q.marks.incorrect === 0 ? "0" : q.marks.incorrect}</span>
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5">
            <div className="prose prose-sm max-w-none mb-6" dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(q.text) }} />
            {q.type === "MCQ" ? (
              <div className="space-y-2.5" role="radiogroup">
                {optionKeys.map((k) => (
                  <label
                    key={k}
                    className={`flex items-start gap-3 p-2.5 rounded border cursor-pointer ${draft === k ? "border-gray-900 bg-gray-100" : "border-transparent hover:bg-gray-50"}`}
                  >
                    <input type="radio" name={`q-${q.id}`} checked={draft === k} onChange={() => setDraft(k)} className="mt-1 w-4 h-4 accent-gray-900" />
                    <span className="font-semibold w-5">{k}.</span>
                    <span className="flex-1" dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(q.options[k]) }} />
                  </label>
                ))}
              </div>
            ) : (
              <div className="max-w-xs space-y-2">
                <input readOnly value={draft ?? ""} aria-label="Your answer" className="w-full border-2 border-gray-400 rounded px-3 py-2 font-mono text-lg bg-white" />
                <div className="grid grid-cols-3 gap-1.5">
                  {KEYPAD.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setDraft((d) => ((d ?? "").length < 20 ? `${d ?? ""}${k}` : d))}
                      className="h-10 rounded border border-gray-300 bg-gray-50 font-semibold hover:bg-gray-100"
                    >
                      {k}
                    </button>
                  ))}
                  <button type="button" onClick={() => setDraft((d) => (d ? d.slice(0, -1) || null : null))} className="h-10 col-span-2 rounded border border-gray-300 bg-gray-100 text-sm font-semibold">
                    Backspace
                  </button>
                  <button type="button" onClick={() => setDraft(null)} className="h-10 rounded border border-gray-300 bg-gray-100 text-sm font-semibold">
                    Clear All
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-none border-t border-gray-200 bg-gray-50 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <button onClick={() => goTo(current - 1)} disabled={current === 0} className="px-3 py-2 text-sm font-semibold rounded border border-gray-400 bg-white hover:bg-gray-100 disabled:opacity-40">
                Back
              </button>
              <button onClick={() => save(null, false)} disabled={!answers[q.id] && !draft} className="px-3 py-2 text-sm font-semibold rounded border border-gray-400 bg-white hover:bg-gray-100 disabled:opacity-40">
                Clear Response
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => goTo(current + 1)} disabled={current >= questions.length - 1} className="px-3 py-2 text-sm font-semibold rounded border border-gray-400 bg-white hover:bg-gray-100 disabled:opacity-40">
                Skip
              </button>
              <button
                onClick={() => save(draft, true)}
                disabled={!draft || finishing}
                className="px-6 py-2 text-sm font-bold rounded bg-gray-950 text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {changed ? "Save & Next" : "Next"}
              </button>
            </div>
          </div>
        </main>

        <aside className="flex-none lg:w-72 border-t lg:border-t-0 lg:border-l border-gray-200 bg-gray-50 p-4 lg:overflow-y-auto">
          <p className="text-sm font-bold mb-1">
            {answeredCount} of {questions.length} answered
          </p>
          <p className="text-xs text-gray-500 mb-4">Pick any question. You can change answers until you finish.</p>
          {sections.map((g) => (
            <div key={g.name} className="mb-4">
              {sections.length > 1 && <p className="text-xs font-bold uppercase tracking-wide text-gray-600 mb-2">{g.name}</p>}
              <div className="grid grid-cols-6 lg:grid-cols-5 gap-1.5">
                {g.items.map(({ q: item, index }) => (
                  <button
                    key={item.id}
                    onClick={() => goTo(index)}
                    aria-label={`Question ${item.number}${answers[item.id] ? ", answered" : ""}`}
                    aria-current={index === current ? "true" : undefined}
                    className={`h-9 rounded text-xs font-bold border ${answers[item.id] ? "bg-green-600 border-green-700 text-white" : "bg-white border-gray-300 text-gray-800"} ${index === current ? "ring-2 ring-offset-1 ring-gray-900" : ""}`}
                  >
                    {item.number}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <Link href={`/results/${attemptId}`} className="text-xs font-semibold text-gray-600 underline">
            Back to result (come back later)
          </Link>
        </aside>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="finish-title">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h2 id="finish-title" className="font-bold text-lg mb-2">Finish the untimed phase?</h2>
            <p className="text-sm text-gray-600 mb-5">
              You answered {answeredCount} of {questions.length}. After finishing you cannot change these answers, and the solutions open.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirming(false)} className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-300">
                Keep going
              </button>
              <button
                onClick={() => {
                  setConfirming(false);
                  void finish();
                }}
                className="px-4 py-2 text-sm font-bold rounded-lg bg-gray-950 text-white"
              >
                Finish
              </button>
            </div>
          </div>
        </div>
      )}
      {showCalc && <ExamCalculator onClose={() => setShowCalc(false)} />}
    </div>
  );
}
