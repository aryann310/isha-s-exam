"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { keepAliveAction, saveResponseAction, submitExamAction, submitSectionAction, visitQuestionAction } from "@/server/actions/engine";
import { useSaveQueue, type SaveJob } from "@/components/exam/use-save-queue";
import { renderMarkdownWithMath } from "@/lib/render-markdown";
import { ExamCalculator } from "@/components/exam/exam-calculator";
import { PALETTE_LABELS, PALETTE_ORDER, PaletteSymbol, paletteStatus, type PaletteStatus } from "@/components/exam/palette-symbol";
import type { ExamTheme } from "@/lib/exam-theme";
import { Calculator, Check, FileText, Info, Lock, X } from "lucide-react";

export interface MockQuestion {
  id: string;
  number: number;
  section: string;
  type: "MCQ" | "TITA";
  text: string;
  options: Record<string, string>;
  /** Marks for this question (its type and section decide them). */
  marks: { correct: number; incorrect: number };
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
  /** Colours and font of this exam (CAT, NMAT, SNAP, CMAT). */
  theme: ExamTheme;
  candidateName: string;
  sectional: boolean;
  currentSectionIndex: number;
  isLastSection: boolean;
  canSubmitSectionEarly: boolean;
  canSubmitEarly: boolean;
  /** One-way navigation (NMAT): answer each question in order, no going back. The server enforces it too. */
  linear: boolean;
  calculator: boolean;
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

  // Answers are saved in the background, in order, so moving to the next question never waits for the network.
  const send = useCallback(
    async (job: SaveJob) => {
      if (job.kind === "save") {
        return saveResponseAction(attemptId, job.questionId, { answer: job.answer, markedForReview: job.markedForReview }, job.visitNext);
      }
      if (job.kind === "visit") {
        await visitQuestionAction(attemptId, job.questionId);
        return { ok: true as const };
      }
      const r = await keepAliveAction(attemptId);
      return r.status && r.status !== "IN_PROGRESS" ? { ok: false as const, error: "This test has ended.", finished: true } : { ok: true as const };
    },
    [attemptId]
  );
  const onRefused = useCallback(
    (job: SaveJob, message: string) => {
      if (job.kind !== "save") return;
      setError(`Your answer to ${job.label} was not saved: ${message}`);
      if (message.includes("closed")) router.refresh();
    },
    [router]
  );
  // Answers that were still unsent when the page was last closed or reloaded: show them as given.
  const onRestore = useCallback((jobs: SaveJob[]) => {
    setResponses((prev) => {
      const next = { ...prev };
      for (const job of jobs) {
        if (job.kind === "save") next[job.questionId] = { visited: true, answer: job.answer, markedForReview: job.markedForReview };
      }
      return next;
    });
  }, []);
  const { enqueue, flush, pending, retrying, lastActivity } = useSaveQueue({
    send,
    onFinished: finish,
    onRefused,
    storageKey: `exam-unsent:${attemptId}`,
    onRestore,
  });

  const timeUp = useCallback(async () => {
    setEnding(true);
    // Send answers still in the queue first (the server accepts saves a few seconds past the deadline).
    await flush(8000);
    // The next section is on its way once the server has moved on: give the page refresh time to arrive (it can
    // take several seconds on a slow connection; starting another one would cancel it). Otherwise retry soon.
    let retryMs = 4000;
    try {
      if (sectional) {
        const res = await submitSectionAction(attemptId, props.currentSectionIndex);
        if (res.ok && res.finished) return finish();
        if (res.ok) retryMs = 15000;
        router.refresh();
      } else {
        const res = await submitExamAction(attemptId);
        if (res.ok) return finish();
        router.refresh();
      }
    } catch {
      router.refresh();
    }
    // If the server has not caught up yet (clock skew), allow another try.
    setTimeout(() => {
      timeUpStarted.current = false;
      setEnding(false);
    }, retryMs);
  }, [attemptId, finish, flush, props.currentSectionIndex, router, sectional]);

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

  // Tell the server about every question opened, so the palette survives a reload. After Save & Next the
  // save itself carries this (see persist); here it covers the first question and palette jumps.
  const reported = useRef(new Set(Object.keys(props.initialResponses).filter((id) => props.initialResponses[id]?.visited)));
  const qid = q?.id;
  useEffect(() => {
    if (!qid || reported.current.has(qid)) return;
    reported.current.add(qid);
    enqueue({ kind: "visit", key: `visit:${qid}`, label: "", questionId: qid });
  }, [enqueue, qid]);

  // Keep the database and server warm during long pauses (reading a passage): the free database sleeps after
  // a few idle minutes and waking it would delay the next click. Saves already count as activity.
  useEffect(() => {
    const t = setInterval(() => {
      if (pending === 0 && Date.now() - lastActivity.current > 150_000) enqueue({ kind: "ping", key: "ping", label: "" });
    }, 30_000);
    return () => clearInterval(t);
  }, [enqueue, lastActivity, pending]);

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

  /**
   * Records the response and moves on at once; the save runs in the background queue (in order, retried if the
   * connection drops). The palette shows the answer straight away. The server still checks every save.
   */
  const persist = (next: Response, advance: boolean) => {
    if (!q || busy || ending) return;
    if (linear && !hasAnswer(next)) return;
    setResponses((prev) => ({ ...prev, [q.id]: next }));
    let visitNext: string | null = null;
    // On the last question there is nowhere to go: stay and keep showing the answer.
    if (advance && current < questions.length - 1) {
      const target = questions[current + 1];
      if (!reported.current.has(target.id)) {
        reported.current.add(target.id);
        visitNext = target.id;
      }
      goTo(current + 1, true);
    }
    enqueue({
      kind: "save",
      key: `save:${q.id}`,
      label: `Question ${q.number}`,
      questionId: q.id,
      answer: next.answer,
      markedForReview: next.markedForReview,
      visitNext,
    });
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
    // Every answer must reach the server before the section or test is closed.
    if (!(await flush(20_000))) {
      setError("Some answers are still being saved. Check your internet connection, then submit again.");
      setModal(null);
      setBusy(false);
      return;
    }
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
      <div data-exam-theme={props.theme} className="h-screen flex items-center justify-center font-exam text-gray-600">
        {ending ? "Loading the next section…" : "This section has no questions."}
      </div>
    );
  }

  const marks = q.marks;
  const optionKeys = Object.keys(q.options).filter((k) => q.options[k]?.trim());
  const toolButton = "flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium text-white hover:bg-white/10";
  const barButton =
    "h-10 px-4 rounded-md border border-gray-400 bg-white text-sm font-semibold text-gray-900 hover:bg-gray-100 disabled:opacity-50";
  const primaryButton = "h-10 px-6 rounded-md bg-exam-primary hover:bg-exam-primary-hover text-white text-sm font-bold disabled:opacity-50";
  const submitButton = "w-full h-11 rounded-md font-bold text-white bg-exam-dark hover:opacity-90 disabled:bg-gray-400 disabled:cursor-not-allowed";

  return (
    <div
      data-exam-theme={props.theme}
      className="h-screen flex flex-col bg-white text-gray-900 font-exam select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Top bar */}
      <header className="flex-none bg-exam-dark text-white flex flex-wrap items-center justify-between px-3 md:px-5 py-2 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 px-2 py-1 rounded bg-white text-exam-dark text-xs font-bold leading-none">{props.patternLabel}</span>
          <h1 className="font-semibold truncate">
            {props.paperTitle} <span className="hidden sm:inline font-normal text-exam-on-dark">· Mock test</span>
          </h1>
        </div>
        <nav aria-label="Exam tools" className="flex items-center gap-1 shrink-0">
          <button onClick={() => setModal("instructions")} className={toolButton}>
            <Info className="w-4 h-4" aria-hidden />
            <span className="hidden sm:inline">Instructions</span>
          </button>
          {!linear && (
            <button onClick={() => setModal("paper")} className={`${toolButton} hidden sm:flex`}>
              <FileText className="w-4 h-4" aria-hidden />
              Question Paper
            </button>
          )}
          {props.calculator && (
            <button onClick={() => setShowCalc((v) => !v)} className={toolButton} aria-label="Calculator">
              <Calculator className="w-4 h-4" aria-hidden />
              <span className="hidden sm:inline">Calculator</span>
            </button>
          )}
        </nav>
      </header>

      {/* Section bar + timer */}
      <div className="flex-none border-b border-exam-line bg-exam-tint flex flex-wrap items-stretch justify-between gap-x-4 pr-3 md:pr-5">
        <div role="tablist" aria-label="Sections" className="flex items-stretch overflow-x-auto">
          {sections.map((s) => {
            const active = s.name === q.section;
            const clickable = s.state === "open";
            const firstOfSection = questions.findIndex((x) => x.section === s.name);
            return (
              <button
                key={s.name}
                role="tab"
                aria-selected={active}
                disabled={!clickable || firstOfSection === -1}
                onClick={() => clickable && goTo(firstOfSection)}
                title={s.state === "done" ? "Section submitted" : s.state === "upcoming" ? "Opens after the current section" : s.name}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap ${
                  active ? "bg-exam-dark text-white" : clickable ? "text-exam-dark hover:bg-white" : "text-gray-500 cursor-not-allowed"
                }`}
              >
                {s.state === "done" && <Check className="w-3.5 h-3.5" aria-label="Submitted" />}
                {s.state === "upcoming" && <Lock className="w-3.5 h-3.5" aria-label="Locked" />}
                {s.name}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4 py-1.5 ml-auto">
          <span
            role="status"
            aria-live="polite"
            className={`hidden sm:inline text-xs font-semibold whitespace-nowrap ${retrying ? "text-amber-800" : "text-gray-600"}`}
          >
            {retrying ? "Connection problem, retrying to save…" : pending > 0 ? "Saving…" : "All answers saved"}
          </span>
          {remaining !== null && (
            <div className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-xs font-semibold text-gray-600">{sectional ? "Section time left" : "Time left"}</span>
              <span className={`text-xl font-bold tabular-nums ${remaining <= 300 ? "text-st-not-answered" : "text-exam-dark"}`}>{clock(remaining)}</span>
            </div>
          )}
        </div>
      </div>
      {retrying && (
        <div className="sm:hidden flex-none bg-amber-50 border-b border-amber-200 text-amber-900 text-xs px-4 py-1.5">
          Connection problem: your answers are kept and will be saved when you are back online.
        </div>
      )}

      {error && (
        <div role="alert" className="flex-none bg-red-50 border-b border-red-200 text-red-900 text-sm px-4 py-2 flex justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X className="w-4 h-4" aria-hidden />
          </button>
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
            <button onClick={() => setModal("submit")} disabled={busy} className={`${primaryButton} h-11 px-8`}>
              {submitLabel}
            </button>
          </main>
        ) : (
          <main className="flex-1 flex flex-col min-w-0">
            <div className="flex-none flex flex-wrap items-center justify-between gap-2 px-4 md:px-7 py-3 border-b border-gray-200">
              <h2 className="font-bold text-[17px]">
                Question {q.number}
                {linear && <span className="font-normal text-gray-600"> · {current + 1} of {questions.length}</span>}
              </h2>
              <span className="text-[13px] text-gray-600">
                {q.type === "TITA" ? "Type in the answer" : "Multiple choice"} ·{" "}
                <strong className="text-st-answered">+{marks.correct}</strong> correct ·{" "}
                {marks.incorrect === 0 ? (
                  "no negative marking"
                ) : (
                  <>
                    <strong className="text-st-not-answered">{marks.incorrect}</strong> wrong
                  </>
                )}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-4 md:px-7 py-6">
              <div className="max-w-4xl">
                <div
                  className="prose prose-sm max-w-none mb-6 text-[17px] leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(q.text) }}
                />

                {q.type === "MCQ" ? (
                  <div className="space-y-2" role="radiogroup" aria-label="Options">
                    {optionKeys.map((k) => (
                      <label
                        key={k}
                        className={`flex items-start gap-3 px-3.5 py-3 rounded-lg border cursor-pointer text-base ${
                          draft === k ? "border-exam-primary bg-exam-tint" : "border-transparent hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          checked={draft === k}
                          onChange={() => setDraft(k)}
                          className="mt-1 w-[18px] h-[18px] accent-exam-primary"
                        />
                        <span className="font-bold w-5">{k}.</span>
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
                      className="w-full border-2 border-gray-400 rounded-md px-3 py-2 font-mono text-lg bg-white"
                    />
                    <div className="grid grid-cols-3 gap-1.5">
                      {KEYPAD.map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setDraft((d) => ((d ?? "").length < 20 ? `${d ?? ""}${k}` : d))}
                          className="h-11 rounded-md border border-gray-300 bg-white font-semibold hover:bg-gray-100"
                        >
                          {k}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setDraft((d) => (d ? d.slice(0, -1) || null : null))}
                        className="h-11 col-span-2 rounded-md border border-gray-300 bg-gray-100 text-sm font-semibold hover:bg-gray-200"
                      >
                        Backspace
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraft(null)}
                        className="h-11 rounded-md border border-gray-300 bg-gray-100 text-sm font-semibold hover:bg-gray-200"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action bar */}
            {linear ? (
              <div className="flex-none border-t border-gray-200 bg-gray-50 px-4 md:px-7 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] text-gray-600">Pick an answer to continue. You cannot come back to this question.</span>
                <div className="flex gap-2">
                  <button onClick={() => setPaletteOpen(true)} className={`${barButton} md:hidden`}>
                    Progress
                  </button>
                  <button onClick={saveAndNext} disabled={busy || !draft} className={`${primaryButton} px-8`}>
                    Next
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-none border-t border-gray-200 bg-gray-50 px-3 md:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <button onClick={markAndNext} disabled={busy} className={barButton}>
                    Mark for Review &amp; Next
                  </button>
                  <button onClick={clearResponse} disabled={busy} className={barButton}>
                    Clear Response
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => goTo(Math.max(0, current - 1))} disabled={current === 0} className={barButton}>
                    Back
                  </button>
                  <button onClick={() => setPaletteOpen(true)} className={`${barButton} md:hidden`}>
                    Palette
                  </button>
                  <button onClick={saveAndNext} disabled={busy} className={primaryButton}>
                    Save &amp; Next
                  </button>
                </div>
              </div>
            )}
          </main>
        )}

        {/* Palette */}
        <aside
          aria-label={linear ? "Section progress" : "Question palette"}
          className={`${paletteOpen ? "fixed inset-0 z-40 flex" : "hidden"} md:static md:flex md:z-auto w-full md:w-[340px] flex-col border-l border-exam-line bg-gray-50`}
        >
          <div className="flex-none flex items-center gap-3 px-4 py-3.5 border-b border-gray-200">
            <div className="w-11 h-11 rounded-md bg-exam-tint border border-exam-line flex items-center justify-center text-lg font-bold text-exam-dark">
              {props.candidateName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-600">Candidate</p>
              <p className="font-semibold truncate">{props.candidateName}</p>
            </div>
            <button onClick={() => setPaletteOpen(false)} className="md:hidden p-2" aria-label="Close palette">
              <X className="w-5 h-5" aria-hidden />
            </button>
          </div>

          <ul className="flex-none grid grid-cols-2 gap-x-2 gap-y-2.5 px-4 py-3.5 border-b border-gray-200 text-xs leading-tight">
            {legend.map((st) => (
              <li key={st} className={`flex items-center gap-2 ${st === "answeredMarked" ? "col-span-2" : ""}`}>
                <PaletteSymbol status={st} label={counts[st]} size="sm" />
                <span>{PALETTE_LABELS[st]}</span>
              </li>
            ))}
          </ul>

          <div className="flex-none bg-exam-dark text-white text-[13px] font-bold px-4 py-2 truncate">{currentSection?.name}</div>
          <p className="flex-none text-xs font-semibold text-gray-600 px-4 pt-2.5">
            {linear ? `Progress: ${answeredInSection} of ${sectionQuestions.length} answered` : "Choose a question"}
          </p>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="grid grid-cols-5 gap-3">
              {sectionQuestions.map(({ item, i }) =>
                linear ? (
                  <span key={item.id} title={PALETTE_LABELS[status(item.id)]} className="flex justify-center">
                    <PaletteSymbol status={status(item.id)} label={item.number} current={!allAnswered && i === current} />
                  </span>
                ) : (
                  <button
                    key={item.id}
                    onClick={() => goTo(i)}
                    title={PALETTE_LABELS[status(item.id)]}
                    aria-label={`Question ${item.number}, ${PALETTE_LABELS[status(item.id)]}`}
                    className="flex justify-center"
                  >
                    <PaletteSymbol status={status(item.id)} label={item.number} current={i === current} />
                  </button>
                )
              )}
            </div>
          </div>

          <div className="flex-none px-4 py-3 border-t border-gray-200 space-y-1.5">
            <button onClick={() => setModal("submit")} disabled={!submitAllowed || busy} className={submitButton}>
              {submitLabel}
            </button>
            {!submitAllowed && (
              <p className="text-xs text-gray-600 text-center">
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
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-none flex justify-between items-center bg-exam-dark text-white px-5 py-3">
              <h2 className="font-bold">
                {modal === "submit" ? (sectional && !props.isLastSection ? "Submit Section" : "Exam Summary") : modal === "instructions" ? "Instructions" : "Question Paper"}
              </h2>
              <button onClick={() => !busy && setModal(null)} aria-label="Close">
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-sm">
              {modal === "submit" && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full border border-gray-300 text-center text-xs">
                      <thead className="bg-exam-tint">
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
                          <tr key={s.name} className={s.name === q.section ? "bg-exam-tint/60 font-semibold" : ""}>
                            <td className="border border-gray-300 px-2 py-2 text-left">
                              {s.name}
                              {s.state === "done" && <span className="text-gray-600 font-normal"> (submitted)</span>}
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
                  <ul className="grid sm:grid-cols-2 gap-2.5">
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
                        Q{item.number} <span className="font-normal text-gray-600">· {item.section}</span>
                      </p>
                      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(item.text) }} />
                    </li>
                  ))}
                </ol>
              )}
            </div>
            {modal === "submit" && (
              <div className="flex-none flex justify-center gap-3 p-3 border-t border-gray-200">
                <button onClick={submit} disabled={busy} className={`${primaryButton} px-10`}>
                  {busy ? "Submitting…" : "Yes"}
                </button>
                <button onClick={() => setModal(null)} disabled={busy} className={`${barButton} px-10`}>
                  No
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {ending && (
        <div className="fixed inset-0 z-[60] bg-white/80 flex items-center justify-center text-gray-900 font-semibold">
          {sectional && !props.isLastSection ? "Opening the next section…" : "Submitting your test…"}
        </div>
      )}
    </div>
  );
}
