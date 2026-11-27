"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { renderMarkdownWithMath } from "@/lib/render-markdown";
import { resolveAdvisorReportAction, setAdvisorLimitAction } from "@/server/actions/test-advisor";
import { btnCls } from "@/components/admin/ui";

/** Inline control to set one student's daily advisor message limit. */
export function AdvisorLimitForm({ userId, limit, suggested }: { userId: string; limit: number; suggested?: number }) {
  const [value, setValue] = useState(String(suggested ?? limit));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <form
      className="inline-flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setAdvisorLimitAction(userId, Number(value));
          setMsg(res.ok ? "Saved" : res.error);
        });
      }}
    >
      <label className="sr-only" htmlFor={`limit-${userId}`}>
        Messages per day
      </label>
      <input
        id={`limit-${userId}`}
        type="number"
        min={0}
        max={1000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular-nums"
      />
      <span className="text-xs text-slate-500">/ day</span>
      <button type="submit" disabled={busy} className={btnCls.secondary}>
        {busy ? "Saving…" : "Save"}
      </button>
      {msg && <span className="text-xs text-slate-600">{msg}</span>}
    </form>
  );
}

export interface ReportedItem {
  id: string;
  student: string;
  paper: string;
  chatHref: string;
  question: string | null;
  answer: string;
  note: string | null;
  when: string;
}

export function ReportedAnswer({ item }: { item: ReportedItem }) {
  const [done, setDone] = useState(false);
  const [busy, start] = useTransition();
  return (
    <li className="p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          <span className="font-semibold text-slate-900">{item.student}</span>
          <span className="text-slate-500"> · {item.paper} · {item.when}</span>
        </span>
        <span className="flex gap-2">
          <Link href={item.chatHref} className={btnCls.secondary}>
            Open the chat
          </Link>
          {done ? (
            <span className="text-sm font-medium text-emerald-700 self-center">Marked as checked</span>
          ) : (
            <button
              type="button"
              disabled={busy}
              className={btnCls.primary}
              onClick={() =>
                start(async () => {
                  const res = await resolveAdvisorReportAction(item.id);
                  if (res.ok) setDone(true);
                })
              }
            >
              Mark as checked
            </button>
          )}
        </span>
      </div>
      {item.note && (
        <p className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <span className="font-semibold">Student says: </span>
          {item.note}
        </p>
      )}
      {item.question && (
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Asked: </span>
          {item.question}
        </p>
      )}
      <div className="prose prose-sm max-w-none border border-slate-200 rounded-lg p-3 bg-slate-50" dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(item.answer) }} />
    </li>
  );
}
