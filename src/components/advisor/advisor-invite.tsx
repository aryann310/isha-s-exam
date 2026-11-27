"use client";

// After a test ends, the advisor offers to guide the student through that paper: a dialog the first time the
// result opens (once per test), and a card on the result page that stays. While unanswered questions wait in
// the untimed phase, it offers to try them first or skip them and start.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, Sparkles } from "lucide-react";
import { skipUntimedFormAction } from "@/server/actions/untimed";

interface Props {
  attemptId: string;
  paperTitle: string;
  firstName: string;
  /** Unanswered questions still waiting in the untimed phase (0 when the advisor is open). */
  pendingUntimed: number;
  configured: boolean;
  allowance: { left: number; limit: number } | null;
}

const seenKey = (id: string) => `advisor-invite:${id}`;

export function AdvisorInvite({ attemptId, paperTitle, firstName, pendingUntimed, configured, allowance }: Props) {
  const [open, setOpen] = useState(false);
  const first = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);
  const guideHref = `/results/${attemptId}/advisor?guide=1`;

  // Once per test (remembered in this browser). Storage may be blocked: then it just shows each visit.
  useEffect(() => {
    if (!configured) return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(seenKey(attemptId)) === "1";
    } catch {
      // storage blocked
    }
    if (seen) return;
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [attemptId, configured]);

  const close = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(seenKey(attemptId), "1");
    } catch {
      // storage blocked
    }
  };

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const remaining = allowance && (
    <p className="text-sm text-gray-600">
      <span className="font-semibold text-gray-900">{allowance.left}</span> of {allowance.limit} advisor chats left today
    </p>
  );

  const actions = (inDialog: boolean) =>
    pendingUntimed > 0 ? (
      <div className="flex flex-col sm:flex-row gap-2">
        <Link
          ref={inDialog ? (el) => void (first.current = el) : undefined}
          href={`/exam/${attemptId}/continue`}
          onClick={inDialog ? close : undefined}
          className="inline-flex items-center justify-center bg-gray-900 hover:bg-gray-800 text-white font-semibold px-5 h-11 rounded-lg"
        >
          Try them first
        </Link>
        <form action={skipUntimedFormAction} onSubmit={inDialog ? close : undefined}>
          <input type="hidden" name="attemptId" value={attemptId} />
          <input type="hidden" name="next" value="advisor" />
          <button type="submit" className="w-full inline-flex items-center justify-center border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 font-semibold px-5 h-11 rounded-lg">
            Skip them and guide me
          </button>
        </form>
      </div>
    ) : (
      <div className="flex flex-col sm:flex-row gap-2">
        <Link
          ref={inDialog ? (el) => void (first.current = el) : undefined}
          href={guideHref}
          onClick={inDialog ? close : undefined}
          className="inline-flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold px-5 h-11 rounded-lg"
        >
          <Sparkles className="w-4 h-4" aria-hidden /> Yes, guide me
        </Link>
        <Link
          href={`/results/${attemptId}/advisor#chat`}
          onClick={inDialog ? close : undefined}
          className="inline-flex items-center justify-center border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 font-semibold px-5 h-11 rounded-lg"
        >
          I have a question
        </Link>
      </div>
    );

  const message =
    pendingUntimed > 0
      ? `Your test is done, ${firstName}. Before I guide you through ${paperTitle}, you have ${pendingUntimed} unanswered question${pendingUntimed === 1 ? "" : "s"}. Try them with no time limit, or skip them and I'll start.`
      : `Your test is done, ${firstName}. Shall I guide you through ${paperTitle}? I'll go through every question, your time on each and the answers you changed, then we can talk about anything in it.`;

  return (
    <>
      {/* While questions wait in the untimed phase, the result page's own Continue box is the lasting option. */}
      {pendingUntimed === 0 && (
      <section aria-labelledby="advisor" className="bg-white border-2 border-gray-900 rounded-2xl p-6 sm:p-8">
        <div className="flex gap-4">
          <span className="shrink-0 w-11 h-11 rounded-full bg-gray-900 text-white flex items-center justify-center" aria-hidden>
            <MessageCircle className="w-5 h-5" />
          </span>
          <div className="space-y-3 min-w-0">
            <h2 id="advisor" className="font-heading text-2xl font-semibold text-gray-900">
              Your advisor
            </h2>
            <p className="text-gray-800">{configured ? message : "Your advisor is not switched on yet. The admin needs to add the Anthropic API key."}</p>
            {configured && actions(false)}
            {configured && remaining}
          </div>
        </div>
      </section>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="advisor-invite-title"
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center" aria-hidden>
                <MessageCircle className="w-5 h-5" />
              </span>
              <h2 id="advisor-invite-title" className="font-heading text-xl font-semibold text-gray-900">
                Your advisor
              </h2>
            </div>
            <p className="text-gray-800">{message}</p>
            {actions(true)}
            <div className="flex items-center justify-between gap-3">
              {remaining}
              <button type="button" onClick={close} className="text-sm font-semibold text-gray-600 hover:text-gray-900 underline underline-offset-2">
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
