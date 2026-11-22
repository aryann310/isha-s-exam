"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CircleAlert, Eye, MoreHorizontal, Pause, Play, Plus, Rocket, RotateCcw, Square, Trash2, X } from "lucide-react";
import { adminAddTimeAction, adminInspectAttemptAction, adminLiveSnapshotAction } from "@/server/actions/admin-live";
import { adminDeleteAttemptAction, adminForceSubmitExamAction, adminResetAttemptAction, adminStartExamForStudentAction } from "@/server/actions/admin";
import type { LiveSession, LiveSnapshot } from "@/server/admin-data";
import { formatAgo, formatClock, formatDuration, formatMarks, formatPercent, formatTime } from "@/lib/admin-format";
import { renderMarkdownWithMath } from "@/lib/render-markdown";
import { parseQuestionOptions } from "@/lib/parse-markdown-questions";
import { Badge, Card, EmptyState, ModeBadge, ProgressBar, StatCard, StatusBadge, btnCls, tableCls } from "@/components/admin/ui";

const POLL_MS = 5000;
/** No answer or navigation for this long counts as idle. */
const IDLE_MS = 3 * 60_000;

export interface StudentOption { id: string; name: string; handle: string }
export interface PaperOption { id: string; title: string; exam: string; minutes: number; published: boolean; sectional: boolean }

type InspectData = Extract<Awaited<ReturnType<typeof adminInspectAttemptAction>>, { ok: true }>["data"];

export function LiveProctor({ initial, students, papers }: { initial: LiveSnapshot; students: StudentOption[]; papers: PaperOption[] }) {
  const [snap, setSnap] = useState(initial);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Difference between the server clock and this browser's clock, so countdowns match the exam screen.
  const [skew, setSkew] = useState(() => new Date(initial.serverNow).getTime() - Date.now());
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [toast, setToast] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  // Open dropdown, positioned in the viewport so the table's scroll area can't clip it.
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const toggleMenu = (key: string, button: HTMLElement) => {
    if (menu?.key === key) return setMenu(null);
    const r = button.getBoundingClientRect();
    setMenu({ key, top: r.bottom + 4, right: window.innerWidth - r.right });
  };
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [showIdle, setShowIdle] = useState(false);
  const [confirming, setConfirming] = useState<Confirmation | null>(null);
  const [busy, startTransition] = useTransition();
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await adminLiveSnapshotAction();
      if (res.ok) {
        setSnap(res.data);
        setSkew(new Date(res.data.serverNow).getTime() - Date.now());
        setReceivedAt(Date.now());
      } else setToast({ tone: "err", text: res.error });
    } catch {
      setToast({ tone: "err", text: "Couldn't reach the server. Retrying…" });
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [paused, refresh]);

  const serverNow = now + skew;
  const idle = (s: LiveSession) => serverNow - new Date(s.lastActivity).getTime() > IDLE_MS;
  const liveMock = snap.live.filter((s) => s.mode === "MOCK").length;
  const idleCount = snap.live.filter(idle).length;

  function run(label: string, fn: () => Promise<unknown>) {
    setMenu(null);
    startTransition(async () => {
      try {
        const res = (await fn()) as { ok?: boolean; error?: string } | undefined;
        if (res && res.ok === false) setToast({ tone: "err", text: res.error ?? "That didn't work." });
        else setToast({ tone: "ok", text: label });
      } catch {
        setToast({ tone: "err", text: "That didn't work. Please try again." });
      }
      await refresh();
    });
  }

  const forceSubmit = (s: LiveSession) => {
    setMenu(null);
    setConfirming({
      title: `Submit ${s.student.name}'s test now?`,
      body: `"${s.paper.title}" will be scored with the ${s.answered} answer${s.answered === 1 ? "" : "s"} saved so far, and the student can't continue.`,
      action: "Submit test",
      onConfirm: () => run(`${s.student.name}'s test was submitted.`, () => adminForceSubmitExamAction(s.id)),
    });
  };
  const reset = (s: LiveSession) => {
    setMenu(null);
    setConfirming({
      title: `Reset ${s.student.name}'s attempt?`,
      body: "All saved answers are cleared and the clock starts again from the beginning.",
      action: "Reset attempt",
      danger: true,
      onConfirm: () => run(`${s.student.name}'s attempt was reset.`, () => adminResetAttemptAction(s.id)),
    });
  };
  const remove = (s: LiveSession) => {
    setMenu(null);
    setConfirming({
      title: `Delete ${s.student.name}'s attempt?`,
      body: "The attempt and all its answers are removed permanently. This can't be undone.",
      action: "Delete permanently",
      danger: true,
      onConfirm: () => {
        if (inspectId === s.id) setInspectId(null);
        run("Attempt deleted.", () => adminDeleteAttemptAction(s.id));
      },
    });
  };
  const addTime = (s: LiveSession, minutes: number) =>
    run(`Added ${minutes} min to ${s.student.name}'s ${s.sectional ? "current section" : "test"}.`, () => adminAddTimeAction(s.id, minutes));

  return (
    <div className="space-y-6" onClick={() => menu && setMenu(null)}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Live proctor</h1>
          <p className="mt-1 text-sm text-slate-500">Watch tests as they happen, add time, inspect answers or end a test.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <span className={`size-1.5 rounded-full ${paused ? "bg-slate-300" : "bg-emerald-500 animate-pulse"}`} />
            {paused ? "Paused" : `Updated ${Math.max(0, Math.round((now - receivedAt) / 1000))}s ago`}
          </span>
          <button type="button" className={btnCls.secondary} onClick={() => setPaused((p) => !p)}>
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button type="button" className={btnCls.primary} onClick={() => setLaunchOpen(true)}>
            <Rocket className="size-4" /> Start a test for a student
          </button>
        </div>
      </div>

      {toast && (
        <div className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${toast.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss"><X className="size-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Live now" value={snap.live.length} hint={`${liveMock} mock · ${snap.live.length - liveMock} practice`} tone={snap.live.length ? "live" : "default"} />
        <StatCard label="Idle over 3 min" value={idleCount} hint="No answer or navigation" />
        <StatCard label="Finished in last 24 h" value={snap.recent.length} hint={snap.recent.length === 20 ? "Showing latest 20" : undefined} />
        <StatCard label="Inactive practice" value={snap.idlePractice.length} hint={`Nothing for ${30}+ min`} />
      </div>

      {snap.autoClosed > 0 && (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <CircleAlert className="size-4 text-amber-500" />
          {snap.autoClosed} test{snap.autoClosed > 1 ? "s" : ""} had run out of time without the student returning and {snap.autoClosed > 1 ? "were" : "was"} submitted automatically.
        </p>
      )}

      {/* Live sessions */}
      <Card title="In progress" description="Section clocks are the student's real time left; scores are provisional until submission." bodyClassName="">
        {snap.live.length === 0 ? (
          <EmptyState title="No tests in progress">Students who start a test appear here within a few seconds.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableCls.table}>
              <thead className={tableCls.thead}>
                <tr>
                  <th className={tableCls.th}>Student</th>
                  <th className={tableCls.th}>Test</th>
                  <th className={tableCls.th}>Time left</th>
                  <th className={tableCls.th}>Progress</th>
                  <th className={tableCls.th}>So far</th>
                  <th className={tableCls.th}>Last activity</th>
                  <th className={`${tableCls.th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className={tableCls.tbody}>
                {snap.live.map((s) => {
                  const deadline = s.sectionDeadline ?? s.overallDeadline;
                  const left = deadline ? new Date(deadline).getTime() - serverNow : null;
                  const isIdle = idle(s);
                  return (
                    <tr key={s.id} className={tableCls.tr}>
                      <td className={tableCls.td}>
                        <p className="font-medium text-slate-900">{s.student.name}</p>
                        <p className="text-xs text-slate-500">{s.student.handle}</p>
                      </td>
                      <td className={tableCls.td}>
                        <p className="font-medium text-slate-800">{s.paper.title}</p>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                          <ModeBadge mode={s.mode} />
                          <span>Started {formatTime(s.startedAt)}</span>
                        </div>
                      </td>
                      <td className={tableCls.td}>
                        {left === null ? (
                          <span className="text-xs text-slate-500">No limit</span>
                        ) : (
                          <>
                            <p className={`font-mono text-base font-semibold tabular-nums ${left < 60_000 ? "text-rose-600" : left < 5 * 60_000 ? "text-amber-600" : "text-slate-900"}`}>
                              {formatClock(left)}
                            </p>
                            {s.section ? (
                              <p className="text-xs text-slate-500">
                                Section {s.section.index + 1}/{s.section.count} · {shortSection(s.section.name)}
                              </p>
                            ) : (
                              <p className="text-xs text-slate-500">Whole test</p>
                            )}
                          </>
                        )}
                      </td>
                      <td className={`${tableCls.td} min-w-40`}>
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span>{s.answered}/{s.totalQuestions} answered</span>
                          {s.marked > 0 && <span className="text-violet-600">{s.marked} marked</span>}
                        </div>
                        <div className="mt-1.5"><ProgressBar value={s.totalQuestions ? (s.answered / s.totalQuestions) * 100 : 0} /></div>
                        {s.section && <p className="mt-1 text-xs text-slate-500">This section: {s.section.answered}/{s.section.questions}</p>}
                      </td>
                      <td className={`${tableCls.td} text-xs`}>
                        <p className="font-medium text-slate-900 tabular-nums">{formatMarks(s.provisionalScore)} / {formatMarks(s.maxMarks)}</p>
                        <p className="text-slate-500 tabular-nums"><span className="text-emerald-600">{s.correct} right</span> · <span className="text-rose-600">{s.incorrect} wrong</span></p>
                      </td>
                      <td className={`${tableCls.td} text-xs`}>
                        <span className={`inline-flex items-center gap-1.5 ${isIdle ? "text-amber-700" : "text-slate-600"}`}>
                          <span className={`size-1.5 rounded-full ${isIdle ? "bg-amber-500" : "bg-emerald-500"}`} />
                          {formatAgo(s.lastActivity, serverNow)}
                        </span>
                      </td>
                      <td className={`${tableCls.td} text-right`}>
                        <div className="relative inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className={btnCls.secondary} onClick={() => setInspectId(s.id)}>
                            <Eye className="size-4" /> Inspect
                          </button>
                          {s.mode === "MOCK" && (
                            <button type="button" className={btnCls.secondary} disabled={busy} onClick={(e) => toggleMenu(`t:${s.id}`, e.currentTarget)}>
                              <Plus className="size-4" /> Time
                            </button>
                          )}
                          <button type="button" className={btnCls.ghost} aria-label="More actions" onClick={(e) => toggleMenu(`m:${s.id}`, e.currentTarget)}>
                            <MoreHorizontal className="size-4" />
                          </button>
                          {menu?.key === `t:${s.id}` && (
                            <Menu at={menu}>
                              <p className="px-3 pb-1 pt-1.5 text-[11px] text-slate-400">{s.sectional ? "Adds to the current section" : "Adds to the test"}</p>
                              {[5, 10, 15, 30].map((m) => (
                                <MenuItem key={m} onClick={() => addTime(s, m)}>+{m} minutes</MenuItem>
                              ))}
                            </Menu>
                          )}
                          {menu?.key === `m:${s.id}` && (
                            <Menu at={menu}>
                              <MenuItem onClick={() => forceSubmit(s)}><Square className="size-4" /> Submit now</MenuItem>
                              <MenuItem onClick={() => reset(s)}><RotateCcw className="size-4" /> Reset attempt</MenuItem>
                              <MenuItem danger onClick={() => remove(s)}><Trash2 className="size-4" /> Delete attempt</MenuItem>
                            </Menu>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {snap.idlePractice.length > 0 && (
        <Card
          title={`Inactive practice sessions (${snap.idlePractice.length})`}
          description="Practice has no time limit, so these stay open until the student finishes or you close them."
          action={<button type="button" className={btnCls.ghost} onClick={() => setShowIdle((v) => !v)}>{showIdle ? "Hide" : "Show"}</button>}
          bodyClassName=""
        >
          {showIdle && (
            <ul className="divide-y divide-slate-100">
              {snap.idlePractice.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{s.student.name} · <span className="font-normal text-slate-600">{s.paper.title}</span></p>
                    <p className="text-xs text-slate-500">{s.answered}/{s.totalQuestions} answered · last activity {formatAgo(s.lastActivity, serverNow)}</p>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" className={btnCls.secondary} onClick={() => setInspectId(s.id)}><Eye className="size-4" /> Inspect</button>
                    <button type="button" className={btnCls.secondary} disabled={busy} onClick={() => forceSubmit(s)}><Square className="size-4" /> Close</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Recently finished */}
      <Card title="Finished in the last 24 hours" action={<Link href="/admin/results" className="text-sm text-slate-600 hover:text-slate-900">All results →</Link>} bodyClassName="">
        {snap.recent.length === 0 ? (
          <EmptyState title="Nothing finished in the last 24 hours" />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableCls.table}>
              <thead className={tableCls.thead}>
                <tr>
                  <th className={tableCls.th}>Student</th>
                  <th className={tableCls.th}>Test</th>
                  <th className={tableCls.th}>Score</th>
                  <th className={tableCls.th}>Accuracy</th>
                  <th className={tableCls.th}>Time taken</th>
                  <th className={tableCls.th}>Finished</th>
                  <th className={`${tableCls.th} text-right`} />
                </tr>
              </thead>
              <tbody className={tableCls.tbody}>
                {snap.recent.map((r) => (
                  <tr key={r.id} className={tableCls.tr}>
                    <td className={`${tableCls.td} font-medium text-slate-900`}>{r.student}</td>
                    <td className={tableCls.td}>
                      <p className="text-slate-800">{r.paper}</p>
                      <div className="mt-0.5 flex gap-1.5"><ModeBadge mode={r.mode} /><StatusBadge status={r.status} /></div>
                    </td>
                    <td className={`${tableCls.td} tabular-nums`}>{formatMarks(r.score)} <span className="text-xs text-slate-500">({formatPercent(r.percent)})</span></td>
                    <td className={`${tableCls.td} tabular-nums`}>{formatPercent(r.accuracy)}</td>
                    <td className={`${tableCls.td} tabular-nums`}>{formatDuration(r.timeTaken)}</td>
                    <td className={`${tableCls.td} text-slate-500`}>{r.submittedAt ? formatTime(r.submittedAt) : "—"}</td>
                    <td className={`${tableCls.td} text-right`}>
                      <Link href={`/solutions/${r.id}`} target="_blank" className="text-sm text-slate-600 hover:text-slate-900">Review ↗</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {confirming && <ConfirmDialog c={confirming} onClose={() => setConfirming(null)} />}
      {inspectId && <Inspector attemptId={inspectId} paused={paused} onClose={() => setInspectId(null)} />}
      {launchOpen && (
        <LaunchDialog
          students={students}
          papers={papers}
          onClose={() => setLaunchOpen(false)}
          onDone={(text) => {
            setLaunchOpen(false);
            setToast({ tone: "ok", text });
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function shortSection(name: string) {
  const known: Record<string, string> = {
    "Verbal Ability and Reading Comprehension": "VARC",
    "Data Interpretation and Logical Reasoning": "DILR",
    "Quantitative Ability": "QA",
  };
  return known[name] ?? name;
}

type MenuAnchor = { key: string; top: number; right: number };
type Confirmation = { title: string; body: string; action: string; danger?: boolean; onConfirm: () => void };

function ConfirmDialog({ c, onClose }: { c: Confirmation; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-label={c.title}>
      <button type="button" className="absolute inset-0 bg-slate-900/30" aria-label="Cancel" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-slate-900">{c.title}</h2>
        <p className="mt-1.5 text-sm text-slate-600">{c.body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={btnCls.secondary} onClick={onClose} autoFocus>Cancel</button>
          <button
            type="button"
            className={c.danger ? btnCls.danger : btnCls.primary}
            onClick={() => {
              onClose();
              c.onConfirm();
            }}
          >
            {c.action}
          </button>
        </div>
      </div>
    </div>
  );
}

function Menu({ at, children }: { at: MenuAnchor; children: React.ReactNode }) {
  return (
    <div style={{ top: at.top, right: at.right }} className="fixed z-40 w-52 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg">
      {children}
    </div>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 ${danger ? "text-rose-600" : "text-slate-700"}`}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inspector: what the student sees and has answered, question by question
// ---------------------------------------------------------------------------

function Inspector({ attemptId, paused, onClose }: { attemptId: string; paused: boolean; onClose: () => void }) {
  const [data, setData] = useState<InspectData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await adminInspectAttemptAction(attemptId);
      if (res.ok) {
        setData(res.data);
        setError(null);
      } else setError(res.error);
    } catch {
      setError("Couldn't load this attempt.");
    }
  }, [attemptId]);

  useEffect(() => {
    let alive = true;
    const first = setTimeout(() => alive && void load(), 0);
    const id = paused ? null : setInterval(() => !document.hidden && void load(), POLL_MS);
    return () => {
      alive = false;
      clearTimeout(first);
      if (id) clearInterval(id);
    };
  }, [load, paused]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = data?.questions.find((x) => x.id === selected) ?? data?.questions[0] ?? null;
  const sections = data ? data.sectionOrder.filter((name) => data.questions.some((x) => x.section === name)) : [];
  const counts = data && {
    answered: data.questions.filter((x) => x.selected !== null).length,
    correct: data.questions.filter((x) => x.correct === true).length,
    wrong: data.questions.filter((x) => x.correct === false).length,
    marked: data.questions.filter((x) => x.marked).length,
    visited: data.questions.filter((x) => x.visited).length,
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-slate-900/30" aria-label="Close inspector" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">{data ? data.student.name : "Loading…"}</p>
            {data && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <span>{data.paper.title}</span>
                <ModeBadge mode={data.mode} />
                <StatusBadge status={data.status} />
                {data.openSection && <Badge tone="amber">Now in {shortSection(data.openSection)}</Badge>}
              </div>
            )}
          </div>
          <button type="button" className={btnCls.ghost} onClick={onClose} aria-label="Close"><X className="size-5" /></button>
        </header>

        {error && <p className="m-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

        {data && counts && (
          <div className="grid min-h-0 flex-1 md:grid-cols-[280px_1fr]">
            {/* Palette */}
            <div className="overflow-y-auto border-b border-slate-200 p-4 md:border-b-0 md:border-r">
              <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                <Pill label="Answered" value={`${counts.answered}/${data.questions.length}`} />
                <Pill label="Visited" value={counts.visited} />
                <Pill label="Right" value={counts.correct} tone="text-emerald-700" />
                <Pill label="Wrong" value={counts.wrong} tone="text-rose-700" />
              </div>
              {sections.map((name) => (
                <div key={name} className="mb-4">
                  <p className="mb-1.5 text-xs font-medium text-slate-500">{name}</p>
                  <div className="grid grid-cols-6 gap-1.5">
                    {data.questions.filter((x) => x.section === name).map((x) => (
                      <button
                        key={x.id}
                        type="button"
                        onClick={() => setSelected(x.id)}
                        title={x.selected ? `Answer: ${x.selected}` : x.visited ? "Seen, not answered" : "Not visited"}
                        className={`relative h-8 rounded-md text-xs font-medium tabular-nums ring-1 ring-inset ${paletteTone(x)} ${q?.id === x.id ? "outline outline-2 outline-offset-1 outline-slate-900" : ""}`}
                      >
                        {x.number}
                        {x.marked && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-violet-500" />}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                <Legend cls="bg-emerald-50 ring-emerald-300" text="Answered correctly" />
                <Legend cls="bg-rose-50 ring-rose-300" text="Answered wrongly" />
                <Legend cls="bg-white ring-amber-300" text="Seen, not answered" />
                <Legend cls="bg-slate-50 ring-slate-200" text="Not visited" />
                <p className="flex items-center gap-2"><span className="size-2 rounded-full bg-violet-500" /> Marked for review</p>
              </div>
            </div>

            {/* Question */}
            <div className="min-h-0 overflow-y-auto p-5">
              {q && <QuestionView q={q} />}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function paletteTone(x: InspectData["questions"][number]) {
  if (x.correct === true) return "bg-emerald-50 text-emerald-800 ring-emerald-300";
  if (x.correct === false) return "bg-rose-50 text-rose-800 ring-rose-300";
  if (x.visited) return "bg-white text-slate-700 ring-amber-300";
  return "bg-slate-50 text-slate-400 ring-slate-200";
}

function Pill({ label, value, tone = "text-slate-900" }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-2.5 py-1.5">
      <p className="text-slate-500">{label}</p>
      <p className={`font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function Legend({ cls, text }: { cls: string; text: string }) {
  return <p className="flex items-center gap-2"><span className={`size-3 rounded ring-1 ring-inset ${cls}`} /> {text}</p>;
}

function QuestionView({ q }: { q: InspectData["questions"][number] }) {
  const options = q.type === "TITA" ? null : parseQuestionOptions(q.options);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-slate-900">Question {q.number}</span>
        <Badge>{q.section}</Badge>
        {q.type === "TITA" && <Badge tone="blue">Type the answer</Badge>}
        {q.marked && <Badge tone="violet">Marked for review</Badge>}
        {q.answeredAt && q.selected && <span className="text-slate-500">Answered at {formatTime(q.answeredAt)}</span>}
      </div>
      <div className="prose max-w-none text-sm text-slate-800" dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(q.text) }} />
      {options ? (
        <ul className="space-y-2">
          {Object.entries(options).map(([key, val]) => {
            const picked = q.selected?.toUpperCase() === key.toUpperCase();
            const right = q.correctAnswer.toUpperCase() === key.toUpperCase();
            return (
              <li
                key={key}
                className={`flex gap-3 rounded-lg border px-3 py-2 text-sm ${
                  picked && right ? "border-emerald-300 bg-emerald-50" : picked ? "border-rose-300 bg-rose-50" : right ? "border-emerald-200 bg-white" : "border-slate-200"
                }`}
              >
                <span className="font-semibold text-slate-700">{key}</span>
                <span className="flex-1 text-slate-800" dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(String(val)) }} />
                {picked && <span className={`text-xs font-medium ${right ? "text-emerald-700" : "text-rose-700"}`}>Student&apos;s answer</span>}
                {!picked && right && <span className="text-xs font-medium text-emerald-700">Correct answer</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <div className={`rounded-lg border px-3 py-2 ${q.correct === true ? "border-emerald-300 bg-emerald-50" : q.correct === false ? "border-rose-300 bg-rose-50" : "border-slate-200"}`}>
            <p className="text-xs text-slate-500">Student typed</p>
            <p className="font-mono">{q.selected ?? "—"}</p>
          </div>
          <div className="rounded-lg border border-slate-200 px-3 py-2">
            <p className="text-xs text-slate-500">Correct answer</p>
            <p className="font-mono">{q.correctAnswer.split("|").join(" or ")}</p>
          </div>
        </div>
      )}
      {!q.visited && <p className="text-sm text-slate-500">The student hasn&apos;t opened this question yet.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Start a test on a student's behalf
// ---------------------------------------------------------------------------

function LaunchDialog({ students, papers, onClose, onDone }: { students: StudentOption[]; papers: PaperOption[]; onClose: () => void; onDone: (text: string) => void }) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [paperId, setPaperId] = useState(papers[0]?.id ?? "");
  const [mode, setMode] = useState<"MOCK" | "PRACTICE">("MOCK");
  const paper = papers.find((p) => p.id === paperId);
  const [minutes, setMinutes] = useState<number>(paper?.minutes ?? 60);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const customTime = mode === "MOCK" && paper && !paper.sectional;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        const res = await adminStartExamForStudentAction(studentId, paperId, mode, customTime ? minutes : undefined);
        const who = students.find((s) => s.id === studentId)?.name ?? "the student";
        onDone(res.isExisting ? `${who} already has this test open; nothing new was started.` : `Started "${paper?.title}" (${mode === "MOCK" ? "mock" : "practice"}) for ${who}.`);
      } catch {
        setError("Couldn't start the test. Check the student and paper and try again.");
      }
    });
  };

  const field = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/30" aria-label="Close" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Start a test for a student</h2>
            <p className="mt-0.5 text-sm text-slate-500">It appears on their dashboard, ready to continue.</p>
          </div>
          <button type="button" className={btnCls.ghost} onClick={onClose} aria-label="Close"><X className="size-4" /></button>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-slate-700">Student</span>
          <select className={field} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.handle})</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-slate-700">Paper</span>
          <select
            className={field}
            value={paperId}
            onChange={(e) => {
              setPaperId(e.target.value);
              setMinutes(papers.find((p) => p.id === e.target.value)?.minutes ?? 60);
            }}
          >
            {papers.map((p) => <option key={p.id} value={p.id}>{p.title}{p.published ? "" : " (hidden)"}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-sm">
            <span className="text-slate-700">Mode</span>
            <select className={field} value={mode} onChange={(e) => setMode(e.target.value as "MOCK" | "PRACTICE")}>
              <option value="MOCK">Mock (timed)</option>
              <option value="PRACTICE">Practice</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-700">Minutes</span>
            <input
              type="number"
              min={1}
              max={600}
              className={`${field} disabled:bg-slate-50 disabled:text-slate-400`}
              value={customTime ? minutes : paper?.minutes ?? ""}
              disabled={!customTime}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>
        </div>
        {mode === "MOCK" && paper?.sectional && <p className="text-xs text-slate-500">This paper uses timed sections, so the paper&apos;s own section times apply.</p>}
        {mode === "PRACTICE" && <p className="text-xs text-slate-500">Practice has no time limit.</p>}
        {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnCls.secondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnCls.primary} disabled={pending || !studentId || !paperId}>{pending ? "Starting…" : "Start test"}</button>
        </div>
      </form>
    </div>
  );
}
