"use client";

import { useMemo, useState, useTransition } from "react";
import { Bell, Search, Send } from "lucide-react";
import { announcePaperNowAction, deleteNotificationAction, sendNotificationAction } from "@/server/actions/notifications";
import { btnCls } from "@/components/admin/ui";

const TITLE_MAX = 90;
const BODY_MAX = 600;

type LinkChoice = "none" | "paper" | "surprise" | "analytics" | "exams" | "custom";
const FIXED_LINKS: Record<string, string> = { surprise: "/surprise", analytics: "/analytics", exams: "/exams" };

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900";
const labelCls = "block text-sm font-medium text-slate-800 mb-1.5";

export function NotificationComposer({
  students,
  papers,
}: {
  students: { id: string; name: string; username: string | null }[];
  papers: { id: string; label: string }[];
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkChoice, setLinkChoice] = useState<LinkChoice>("none");
  const [paperId, setPaperId] = useState(papers[0]?.id ?? "");
  const [customLink, setCustomLink] = useState("");
  const [audience, setAudience] = useState<"ALL" | "SELECTED">("ALL");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  const link =
    linkChoice === "none" ? null : linkChoice === "paper" ? (paperId ? `/papers/${paperId}` : null) : linkChoice === "custom" ? customLink.trim() || null : FIXED_LINKS[linkChoice];

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? students.filter((s) => s.name.toLowerCase().includes(q) || (s.username ?? "").toLowerCase().includes(q)) : students;
  }, [filter, students]);

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const who = audience === "ALL" ? `all ${students.length} students` : `${chosen.size} student${chosen.size === 1 ? "" : "s"}`;
    if (!window.confirm(`Send "${title.trim()}" to ${who}?`)) return;
    start(async () => {
      const res = await sendNotificationAction({ title, body, link, audience, userIds: [...chosen] });
      if (res.ok) {
        setMsg({ ok: true, text: `Sent to ${res.sentTo ?? 0} student${res.sentTo === 1 ? "" : "s"}. They'll see it within a minute.` });
        setTitle("");
        setBody("");
        setLinkChoice("none");
        setCustomLink("");
        setChosen(new Set());
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="n-title" className={labelCls}>
          Title
        </label>
        <input
          id="n-title"
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Full mock this Sunday at 10 AM"
          className={inputCls}
          required
        />
      </div>

      <div>
        <label htmlFor="n-body" className={labelCls}>
          Message
        </label>
        <textarea
          id="n-body"
          value={body}
          maxLength={BODY_MAX}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="What should students know?"
          className={`${inputCls} resize-y`}
          required
        />
        <p className="mt-1 text-right text-xs tabular-nums text-slate-500">
          {body.length} / {BODY_MAX}
        </p>
      </div>

      <div>
        <label htmlFor="n-link" className={labelCls}>
          Button in the notification
        </label>
        <select id="n-link" value={linkChoice} onChange={(e) => setLinkChoice(e.target.value as LinkChoice)} className={inputCls}>
          <option value="none">No button</option>
          <option value="paper" disabled={papers.length === 0}>
            Open a paper
          </option>
          <option value="surprise">Open the Surprise Test</option>
          <option value="analytics">Open My analytics</option>
          <option value="exams">Open the exam list</option>
          <option value="custom">Another link…</option>
        </select>
        {linkChoice === "paper" && (
          <select aria-label="Paper" value={paperId} onChange={(e) => setPaperId(e.target.value)} className={`${inputCls} mt-2`}>
            {papers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        {linkChoice === "custom" && (
          <input
            aria-label="Link"
            value={customLink}
            onChange={(e) => setCustomLink(e.target.value)}
            placeholder="/exams/cat  or  https://…"
            className={`${inputCls} mt-2`}
          />
        )}
      </div>

      <fieldset>
        <legend className={labelCls}>Send to</legend>
        <div className="flex flex-wrap gap-2">
          {(["ALL", "SELECTED"] as const).map((a) => (
            <label
              key={a}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium ${audience === a ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"}`}
            >
              <input type="radio" name="audience" value={a} checked={audience === a} onChange={() => setAudience(a)} className="sr-only" />
              {a === "ALL" ? `All students (${students.length})` : "Chosen students"}
            </label>
          ))}
        </div>
        {audience === "SELECTED" && (
          <div className="mt-3 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
              <Search className="size-4 text-slate-400" aria-hidden />
              <input
                aria-label="Find a student"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Find a student"
                className="flex-1 bg-transparent text-sm focus:outline-none"
              />
              <button type="button" className={btnCls.ghost} onClick={() => setChosen(new Set([...chosen, ...shown.map((s) => s.id)]))}>
                Select shown
              </button>
              <button type="button" className={btnCls.ghost} onClick={() => setChosen(new Set())}>
                Clear
              </button>
            </div>
            <ul className="max-h-56 overflow-y-auto py-1">
              {shown.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">No student matches.</li>}
              {shown.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={chosen.has(s.id)} onChange={() => toggle(s.id)} className="size-4 accent-slate-900" />
                    <span className="text-slate-900">{s.name}</span>
                    {s.username && <span className="text-xs text-slate-500">@{s.username}</span>}
                  </label>
                </li>
              ))}
            </ul>
            <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-600">{chosen.size} chosen</p>
          </div>
        )}
      </fieldset>

      <div>
        <p className={labelCls}>Preview</p>
        <div className="flex gap-3 rounded-2xl bg-slate-900 p-4 text-white">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15">
            <Bell className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title.trim() || "Your title"}</p>
            <p className="mt-0.5 whitespace-pre-line break-words text-sm text-white/75">{body.trim() || "Your message"}</p>
            {link && <span className="mt-2.5 inline-flex h-8 items-center rounded-lg bg-white px-3 text-sm font-semibold text-slate-900">Open →</span>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !title.trim() || !body.trim() || (audience === "SELECTED" && chosen.size === 0)} className={btnCls.primary}>
          <Send className="size-4" aria-hidden />
          {busy ? "Sending…" : "Send notification"}
        </button>
        {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
      </div>
    </form>
  );
}

export function RemoveNotificationButton({ id }: { id: string }) {
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      disabled={busy}
      className={btnCls.ghost}
      onClick={() => {
        if (!window.confirm("Remove this notification from every student's bell?")) return;
        start(async () => {
          await deleteNotificationAction(id);
        });
      }}
    >
      {busy ? "Removing…" : "Remove"}
    </button>
  );
}

export function AnnounceNowButton({ paperId }: { paperId: string }) {
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {err && <span className="text-xs text-rose-700">{err}</span>}
      <button
        type="button"
        disabled={busy}
        className={btnCls.secondary}
        onClick={() =>
          start(async () => {
            const res = await announcePaperNowAction(paperId);
            setErr(res.ok ? null : res.error);
          })
        }
      >
        {busy ? "Announcing…" : "Announce now"}
      </button>
    </span>
  );
}
