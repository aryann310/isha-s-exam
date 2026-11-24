"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveResponseAction, submitExamAction, submitSectionAction, visitQuestionAction } from "@/server/actions/engine";
import { renderMarkdownWithMath } from "@/lib/render-markdown";
import { ExamCalculator } from "@/components/exam/exam-calculator";
import { PALETTE_LABELS, PALETTE_ORDER, PaletteSymbol, paletteStatus, type PaletteStatus } from "@/components/exam/palette-symbol";

export interface MockQuestion {
  id: string;
  number: number;
  section: string;
  type: "MCQ" | "TITA";
  text: string;
  options: Record<string, string>;
}

export interface MockSection {
  name: string;
  index: number;
  /** open: free movement (overall-timed exam). done/current/upcoming: sectional exam. */
  state: "open" | "done" | "current" | "upcoming";
  durationSeconds: number | null;
  total: number;
  summary: Record<PaletteStatus, number>;
}

interface Response {
  visited: boolean;
  answer: string | null;
  markedForReview: boolean;
}

interface Props {
  attemptId: string;
  paperTitle: string;
  patternLabel: string;
  candidateName: string;
  sectional: boolean;
  currentSectionIndex: number;
  isLastSection: boolean;
  canSubmitSectionEarly: boolean;
  canSubmitEarly: boolean;
  /** One-way navigation (NMAT): answer each question in order, no going back. The server enforces it too. */
  linear: boolean;
  calculator: boolean;
  marks: Record<"MCQ" | "TITA", { correct: number; incorrect: number }>;
  instructions: string[];
  sections: MockSection[];
  questions: MockQuestion[];
  initialResponses: Record<string, Response>;
  deadline: string | null;
  serverNow: string;
}

const KEYPAD = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "-"];

function clock(total: number) {
  const s = Math.max(0, total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}

function emptySummary(): Record<PaletteStatus, number> {
  return { notVisited: 0, notAnswered: 0, answered: 0, marked: 0, answeredMarked: 0 };
}

/** Statuses that can occur on a one-way (linear) paper: there is no marking for review. */
const LINEAR_STATUSES: PaletteStatus[] = ["answered", "notAnswered", "notVisited"];

const hasAnswer = (r: Response | undefined) => !!r?.answer && r.answer.trim() !== "";

export function MockExamEngine(props: Props) {
  const { attemptId, questions, sections, sectional, linear } = props;
  const router = useRouter();

  const firstIndex = useMemo(() => {
    // Linear: resume on the first unanswered question (the last one when all are answered).
    // Otherwise: the first question not yet visited, else the first one.
    if (linear) {
      const i = questions.findIndex((q) => !hasAnswer(props.initialResponses[q.id]));
      return i === -1 ? Math.max(0, questions.length - 1) : i;
    }
    const i = questions.findIndex((q) => !props.initialResponses[q.id]?.visited);
    return i === -1 ? 0 : i;
  }, [questions, props.initialResponses, linear]);
  // The question shown first counts as visited straight away.
  const [responses, setResponses] = useState<Record<string, Response>>(() => {
    const first = questions[firstIndex];
    if (!first || props.initialResponses[first.id]?.visited) return props.initialResponses;
    return { ...props.initialResponses, [first.id]: { visited: true, answer: null, markedForReview: false } };
  });
  const [current, setCurrent] = useState(firstIndex);
  const [draft, setDraft] = useState<string | null>(props.initialResponses[questions[firstIndex]?.id]?.answer ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "submit" | "instructions" | "paper">(null);
  const [showCalc, setShowCalc] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [ending, setEnding] = useState(false);

  // ---------------- clock (server time is the reference) ----------------
  const [clockState] = useState(() => {
    const skew = new Date(props.serverNow).getTime() - Date.now();
    const left = props.deadline ? Math.floor((new Date(props.deadline).getTime() - (Date.now() + skew)) / 1000) : null;
    return { skew, left };
  });
  const [remaining, setRemaining] = useState<number | null>(clockState.left);
  const timeUpStarted = useRef(false);

  const q = questions[current];
  const currentSection = sections.find((s) => s.name === q?.section) ?? sections[props.currentSectionIndex];

  // ---------------- server calls ----------------
  const finish = useCallback(() => {
    setEnding(true);
    router.replace(`/results/${attemptId}`);
  }, [attemptId, router]);

  const timeUp = useCallback(async () => {
    setEnding(true);
    try {
      if (sectional) {
        const res = await submitSectionAction(attemptId, props.currentSectionIndex);
        if (res.ok && res.finished) return finish();
        router.refresh();
      } else {
        const res = await submitExamAction(attemptId);
        if (res.ok) return finish();
        router.refresh();
      }
    } catch {
      router.refresh();
    }
    // If the server has not caught up yet (clock skew), allow another try shortly.
    setTimeout(() => {
      timeUpStarted.current = false;
      setEnding(false);
    }, 4000);
  }, [attemptId, finish, props.currentSectionIndex, router, sectional]);

  useEffect(() => {
    if (!props.deadline) return;
    const deadlineMs = new Date(props.deadline).getTime();
    const tick = () => {
      const left = Math.floor((deadlineMs - (Date.now() + clockState.skew)) / 1000);
      setRemaining(left);
      if (left <= 0 && !timeUpStarted.current) {
        timeUpStarted.current = true;
        void timeUp();
      }
    };
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [props.deadline, clockState.skew, timeUp]);

  // Tell the server about every question opened, so the palette survives a reload.
  const reported = useRef(new Set(Object.keys(props.initialResponses).filter((id) => props.initialResponses[id]?.visited)));
  const qid = q?.id;
  useEffect(() => {
    if (!qid || reported.current.has(qid)) return;
    reported.current.add(qid);
    void visitQuestionAction(attemptId, qid).catch(() => undefined);
  }, [attemptId, qid]);

  const goTo = (index: number, force = false) => {
    const target = questions[index];
    if (!target) return;
    // One-way papers only ever move forward, and only from the code path that saved an answer.
    if (linear && !force) return;
    // Moving away without Save & Next discards an unsaved choice, as in the real exam.
    setCurrent(index);
    setDraft(responses[target.id]?.answer ?? null);
    setPaletteOpen(false);
    if (!responses[target.id]?.visited) {
      setResponses((prev) => ({ ...prev, [target.id]: { visited: true, answer: prev[target.id]?.answer ?? null, markedForReview: prev[target.id]?.markedForReview ?? false } }));
    }
  };

  const persist = async (next: Response, advance: boolean) => {
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    const before = responses[q.id];
    setResponses((prev) => ({ ...prev, [q.id]: next }));
    try {
      const res = await saveResponseAction(attemptId, q.id, { answer: next.answer, markedForReview: next.markedForReview });
      if (!res.ok) {
        setResponses((prev) => ({ ...prev, [q.id]: before ?? { visited: true, answer: null, markedForReview: false } }));
        if (res.finished) return finish();
        setError(res.error);
        if (res.error.includes("closed")) router.refresh();
        return;
      }
      // On the last question there is nowhere to go: stay and keep showing the saved answer.
      if (advance && current < questions.length - 1) goTo(current + 1, true);
    } catch {
      setResponses((prev) => ({ ...prev, [q.id]: before ?? { visited: true, answer: null, markedForReview: false } }));
      setError("Could not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const saveAndNext = () => persist({ visited: true, answer: draft, markedForReview: false }, true);
  const markAndNext = () => persist({ visited: true, answer: draft, markedForReview: true }, true);
  const clearResponse = () => {
    setDraft(null);
    void persist({ visited: true, answer: null, markedForReview: false }, false);
  };

  // ---------------- submit ----------------
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = sectional ? await submitSectionAction(attemptId, props.currentSectionIndex) : await submitExamAction(attemptId);
      if (!res.ok) {
        setError(res.error);
        setModal(null);
        return;
      }
      if ("finished" in res && !res.finished) {
        setModal(null);
        setEnding(true);
        router.refresh();
        return;
      }
      finish();
    } catch {
      setError("Could not submit. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  // ---------------- derived ----------------
  const status = (qid: string) => paletteStatus(responses[qid]);
  const sectionQuestions = questions.map((item, i) => ({ item, i })).filter(({ item }) => item.section === q?.section);
  const counts = emptySummary();
  for (const { item } of sectionQuestions) counts[status(item.id)]++;

  const summaryRows = sections.map((s) => {
    if (s.state === "done" || s.state === "upcoming") return { s, c: s.state === "upcoming" ? { ...emptySummary(), notVisited: s.total } : s.summary };
    const c = emptySummary();
    for (const item of questions.filter((x) => x.section === s.name)) c[status(item.id)]++;
    return { s, c };
  });

  const submitAllowed = sectional ? props.canSubmitSectionEarly : props.canSubmitEarly;
  const submitLabel = sectional ? (props.isLastSection ? "Submit Test" : "Submit Section") : "Submit";
  const legend = linear ? PALETTE_ORDER.filter((st) => LINEAR_STATUSES.includes(st)) : PALETTE_ORDER;
  const answeredInSection = sectionQuestions.filter(({ item }) => hasAnswer(responses[item.id])).length;
  const allAnswered = linear && questions.length > 0 && questions.every((x) => hasAnswer(responses[x.id]));

  if (!q) {
    return (
      <div className="h-screen flex items-center justify-center text-gray-600">
        {ending ? "Loading the next section…" : "This section has no questions."}
      </div>
    );
  }

  const marks = props.marks[q.type];
  const optionKeys = Object.keys(q.options).filter((k) => q.options[k]?.trim());

  return (
    <div className="h-screen flex flex-col bg-white text-gray-900 select-none" onContextMenu={(e) => e.preventDefault()}>
      {/* Top bar */}
      <header className="flex-none bg-[#1f4e79] text-white flex items-center justify-between px-3 md:px-4 py-2 gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider opacity-75">{props.patternLabel} · Mock Test</p>
          <h1 className="font-bold truncate">{props.paperTitle}</h1>
        </div>
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {!linear && (
            <button onClick={() => setModal("paper")} className="hidden sm:inline text-xs font-semibold bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded">
              Question Paper
            </button>
          )}
          <button onClick={() => setModal("instructions")} className="text-xs font-semibold bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded">
            Instructions
          </button>
          {props.calculator && (
            <button onClick={() => setShowCalc((v) => !v)} className="text-xs font-semibold bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded" aria-label="Calculator">
              🖩 Calculator
            </button>
          )}
          <div className="hidden md:flex items-center gap-2 pl-2 border-l border-white/20">
            <div className="w-8 h-8 rounded bg-white/20 flex items-center justify-center font-bold">{props.candidateName.slice(0, 1).toUpperCase()}</div>
            <span className="text-sm font-semibold max-w-[10rem] truncate">{props.candidateName}</span>
          </div>
        </div>
      </header>

      {/* Section bar + timer */}
      <div className="flex-none border-b border-gray-300 bg-[#eef3f8] flex items-stretch justify-between gap-2 px-2">
        <div className="flex items-stretch overflow-x-auto">
          <span className="hidden sm:flex items-center text-xs font-bold text-gray-600 px-2">Sections</span>
          {sections.map((s) => {
            const active = s.name === q.section;
            const clickable = s.state === "open";
            const firstOfSection = questions.findIndex((x) => x.section === s.name);
            return (
              <button
                key={s.name}
                disabled={!clickable || firstOfSection === -1}
                onClick={() => clickable && goTo(firstOfSection)}
                title={s.state === "done" ? "Section submitted" : s.state === "upcoming" ? "Opens after the current section" : s.name}
                className={`px-3 py-2 text-xs font-semibold border-x border-transparent whitespace-nowrap ${
                  active ? "bg-[#1f4e79] text-white" : clickable ? "text-[#1f4e79] hover:bg-white" : "text-gray-400 cursor-not-allowed"
                }`}
              >
                {s.state === "done" && "✓ "}
                {s.state === "upcoming" && "🔒 "}
                {s.name}
              </button>
            );
          })}
        </div>
        {remaining !== null && (
          <div className={`flex items-center gap-2 px-3 text-sm font-bold whitespace-nowrap ${remaining <= 300 ? "text-red-600" : "text-gray-900"}`}>
            <span className="text-xs font-semibold text-gray-600">{sectional ? "Section Time Left" : "Time Left"}:</span>
            <span className="font-mono text-base">{clock(remaining)}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="flex-none bg-red-50 border-b border-red-200 text-red-800 text-sm px-4 py-2 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold">✕</button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Question area */}
        {allAnswered ? (
          <main className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-lg font-bold">You have answered all {questions.length} questions in this section.</p>
            <p className="text-sm text-gray-600 max-w-md">
              {props.isLastSection
                ? "Submit the test to see your result. Answers can no longer be changed."
                : "Submit this section to move on to the next one. The time left in this section is not carried over."}
            </p>
            <button
              onClick={() => setModal("submit")}
              disabled={busy}
              className="px-8 py-2.5 rounded font-bold text-white bg-[#3d9b35] hover:bg-[#2f7d29] disabled:opacity-50"
            >
              {submitLabel}
            </button>
          </main>
        ) : (
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-none flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-gray-300">
            <span className="font-bold">Question No. {q.number}</span>
            <span className="text-xs text-gray-600">
              {q.type === "TITA" ? "Type in the Answer" : "Multiple Choice"} ·{" "}
              <span className="text-green-700 font-semibold">+{marks.correct}</span> /{" "}
              <span className="text-red-700 font-semibold">{marks.incorrect === 0 ? "0" : marks.incorrect}</span>
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5">
            <div className="prose prose-sm max-w-none mb-6" dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(q.text) }} />

            {q.type === "MCQ" ? (
              <div className="space-y-2.5" role="radiogroup">
                {optionKeys.map((k) => (
                  <label
                    key={k}
                    className={`flex items-start gap-3 p-2.5 rounded border cursor-pointer ${draft === k ? "border-[#1f4e79] bg-[#eef3f8]" : "border-transparent hover:bg-gray-50"}`}
                  >
                    <input type="radio" name={`q-${q.id}`} checked={draft === k} onChange={() => setDraft(k)} className="mt-1 w-4 h-4 accent-[#1f4e79]" />
                    <span className="font-semibold w-5">{k}.</span>
                    <span className="flex-1" dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(q.options[k]) }} />
                  </label>
                ))}
              </div>
            ) : (
              <div className="max-w-xs space-y-2">
                <input
                  readOnly
                  value={draft ?? ""}
                  aria-label="Your answer"
                  className="w-full border-2 border-gray-400 rounded px-3 py-2 font-mono text-lg bg-white"
                />
                <div className="grid grid-cols-3 gap-1.5">
                  {KEYPAD.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setDraft((d) => ((d ?? "").length < 20 ? `${d ?? ""}${k}` : d))}
                      className="h-10 rounded border border-gray-300 bg-gradient-to-b from-white to-gray-100 font-semibold hover:to-gray-200"
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

          {/* Action bar */}
          {linear ? (
            <div className="flex-none border-t border-gray-300 bg-gray-50 px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-xs text-gray-600">Answer this question to continue. You cannot come back to it.</span>
              <div className="flex gap-2">
                <button
                  onClick={saveAndNext}
                  disabled={busy || !draft}
                  className="px-6 py-2 text-sm font-bold rounded bg-[#2a7ab8] text-white hover:bg-[#21689e] disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Next"}
                </button>
                <button onClick={() => setPaletteOpen(true)} className="md:hidden px-3 py-2 text-sm font-semibold rounded border border-gray-400 bg-white">
                  Progress
                </button>
              </div>
            </div>
          ) : (
          <div className="flex-none border-t border-gray-300 bg-gray-50 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <button onClick={markAndNext} disabled={busy} className="px-3 py-2 text-sm font-semibold rounded border border-gray-400 bg-white hover:bg-gray-100 disabled:opacity-50">
                Mark for Review &amp; Next
              </button>
              <button onClick={clearResponse} disabled={busy} className="px-3 py-2 text-sm font-semibold rounded border border-gray-400 bg-white hover:bg-gray-100 disabled:opacity-50">
                Clear Response
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => goTo(Math.max(0, current - 1))} disabled={current === 0} className="px-3 py-2 text-sm font-semibold rounded border border-gray-400 bg-white hover:bg-gray-100 disabled:opacity-40">
                Back
              </button>
              <button onClick={saveAndNext} disabled={busy} className="px-5 py-2 text-sm font-bold rounded bg-[#2a7ab8] text-white hover:bg-[#21689e] disabled:opacity-50">
                Save &amp; Next
              </button>
              <button onClick={() => setPaletteOpen(true)} className="md:hidden px-3 py-2 text-sm font-semibold rounded border border-gray-400 bg-white">
                Palette
              </button>
            </div>
          </div>
          )}
        </main>
        )}

        {/* Palette */}
        <aside
          className={`${paletteOpen ? "fixed inset-0 z-40 flex" : "hidden"} md:static md:flex md:z-auto w-full md:w-80 flex-col border-l border-gray-300 bg-[#f7f9fb]`}
        >
          <div className="flex-none flex items-center gap-3 p-3 border-b border-gray-300">
            <div className="w-12 h-12 rounded bg-gray-300 flex items-center justify-center text-xl font-bold text-gray-700">
              {props.candidateName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500">Candidate</p>
              <p className="font-semibold truncate">{props.candidateName}</p>
            </div>
            <button onClick={() => setPaletteOpen(false)} className="md:hidden text-xl font-bold px-2" aria-label="Close palette">
              ✕
            </button>
          </div>

          <ul className="flex-none grid grid-cols-2 gap-x-2 gap-y-2 p-3 border-b border-gray-300 text-[11px] leading-tight">
            {legend.map((st) => (
              <li key={st} className={`flex items-center gap-2 ${st === "answeredMarked" ? "col-span-2" : ""}`}>
                <PaletteSymbol status={st} label={counts[st]} size="sm" />
                <span>{PALETTE_LABELS[st]}</span>
              </li>
            ))}
          </ul>

          <div className="flex-none bg-[#1f4e79] text-white text-xs font-bold px-3 py-1.5 truncate">{currentSection?.name}</div>
          <p className="flex-none text-[11px] font-semibold text-gray-600 px-3 pt-2">
            {linear ? `Progress: ${answeredInSection} of ${sectionQuestions.length} answered` : "Choose a Question"}
          </p>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="grid grid-cols-5 gap-2.5">
              {sectionQuestions.map(({ item, i }) =>
                linear ? (
                  <span key={item.id} title={PALETTE_LABELS[status(item.id)]} className="flex justify-center">
                    <PaletteSymbol status={status(item.id)} label={item.number} current={!allAnswered && i === current} />
                  </span>
                ) : (
                  <button key={item.id} onClick={() => goTo(i)} title={PALETTE_LABELS[status(item.id)]} className="flex justify-center">
                    <PaletteSymbol status={status(item.id)} label={item.number} current={i === current} />
                  </button>
                )
              )}
            </div>
          </div>

          <div className="flex-none p-3 border-t border-gray-300 space-y-1.5">
            <button
              onClick={() => setModal("submit")}
              disabled={!submitAllowed || busy}
              className="w-full py-2.5 rounded font-bold text-white bg-[#3d9b35] hover:bg-[#2f7d29] disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {submitLabel}
            </button>
            {!submitAllowed && (
              <p className="text-[11px] text-gray-600 text-center">
                {sectional ? "This section ends automatically when its time is over." : "The test ends automatically when the time is over."}
              </p>
            )}
          </div>
        </aside>
      </div>

      {showCalc && <ExamCalculator onClose={() => setShowCalc(false)} />}

      {/* Modals */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !busy && setModal(null)}>
          <div className="bg-white rounded shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex-none flex justify-between items-center bg-[#1f4e79] text-white px-4 py-2 rounded-t">
              <h2 className="font-bold">
                {modal === "submit" ? (sectional && !props.isLastSection ? "Submit Section" : "Exam Summary") : modal === "instructions" ? "Instructions" : "Question Paper"}
              </h2>
              <button onClick={() => !busy && setModal(null)} className="font-bold">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-sm">
              {modal === "submit" && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full border border-gray-300 text-center text-xs">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="border border-gray-300 px-2 py-2 text-left">Section</th>
                          <th className="border border-gray-300 px-2 py-2">No. of Questions</th>
                          <th className="border border-gray-300 px-2 py-2">Answered</th>
                          <th className="border border-gray-300 px-2 py-2">Not Answered</th>
                          {!linear && <th className="border border-gray-300 px-2 py-2">Marked for Review</th>}
                          {!linear && <th className="border border-gray-300 px-2 py-2">Answered &amp; Marked for Review</th>}
                          <th className="border border-gray-300 px-2 py-2">Not Visited</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryRows.map(({ s, c }) => (
                          <tr key={s.name} className={s.name === q.section ? "bg-[#eef3f8] font-semibold" : ""}>
                            <td className="border border-gray-300 px-2 py-2 text-left">
                              {s.name}
                              {s.state === "done" && <span className="text-gray-500 font-normal"> (submitted)</span>}
                            </td>
                            <td className="border border-gray-300 px-2 py-2">{s.total}</td>
                            <td className="border border-gray-300 px-2 py-2">{c.answered}</td>
                            <td className="border border-gray-300 px-2 py-2">{c.notAnswered}</td>
                            {!linear && <td className="border border-gray-300 px-2 py-2">{c.marked}</td>}
                            {!linear && <td className="border border-gray-300 px-2 py-2">{c.answeredMarked}</td>}
                            <td className="border border-gray-300 px-2 py-2">{c.notVisited}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-4 font-semibold text-center">
                    {sectional && !props.isLastSection
                      ? "Are you sure you want to submit this section? You will not be able to return to it."
                      : "Are you sure you want to submit the test? You will not be able to change your answers after this."}
                  </p>
                </>
              )}
              {modal === "instructions" && (
                <div className="space-y-4">
                  <ol className="list-decimal pl-5 space-y-2">
                    {props.instructions.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ol>
                  <ul className="grid sm:grid-cols-2 gap-2">
                    {legend.map((st, i) => (
                      <li key={st} className="flex items-center gap-2">
                        <PaletteSymbol status={st} label={i + 1} size="sm" />
                        <span>{PALETTE_LABELS[st]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {modal === "paper" && (
                <ol className="space-y-5">
                  {questions.map((item) => (
                    <li key={item.id} className="border-b border-gray-200 pb-4">
                      <p className="font-bold mb-1">
                        Q{item.number} <span className="font-normal text-gray-500">· {item.section}</span>
                      </p>
                      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(item.text) }} />
                    </li>
                  ))}
                </ol>
              )}
            </div>
            {modal === "submit" && (
              <div className="flex-none flex justify-center gap-3 p-3 border-t border-gray-200">
                <button onClick={submit} disabled={busy} className="px-8 py-2 rounded font-bold bg-[#3d9b35] text-white hover:bg-[#2f7d29] disabled:opacity-50">
                  {busy ? "Submitting…" : "Yes"}
                </button>
                <button onClick={() => setModal(null)} disabled={busy} className="px-8 py-2 rounded font-bold border border-gray-400 bg-white hover:bg-gray-100">
                  No
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {ending && (
        <div className="fixed inset-0 z-[60] bg-white/80 flex items-center justify-center text-gray-800 font-semibold">
          {sectional && !props.isLastSection ? "Opening the next section…" : "Submitting your test…"}
        </div>
      )}
    </div>
  );
}
