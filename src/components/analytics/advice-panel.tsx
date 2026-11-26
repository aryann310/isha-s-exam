"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { generateAdviceAction } from "@/server/actions/advisor";
import type { Advice } from "@/server/advisor";

interface Props {
  scope: string;
  scopeLabel: string;
  studentId: string | null;
  configured: boolean;
  hasTests: boolean;
  initial: { advice: Advice; createdAt: string; stale: boolean } | null;
}

export function AdvicePanel({ scope, scopeLabel, studentId, configured, hasTests, initial }: Props) {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      setError(null);
      try {
        const res = await generateAdviceAction(scope, studentId);
        if (res.ok) setState({ advice: res.advice, createdAt: res.createdAt, stale: false });
        else setError(res.error);
      } catch {
        setError("Could not reach the server. Check your connection and try again.");
      }
    });

  const when = state ? new Date(state.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;
  const a = state?.advice;

  return (
    <section aria-labelledby="coach" className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h2 id="coach" className="font-heading text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-600" aria-hidden /> Your coach
        </h2>
        {configured && hasTests && (!state || state.stale) && (
          <button
            onClick={run}
            disabled={pending}
            className="inline-flex items-center justify-center bg-gray-900 hover:bg-gray-800 text-white font-semibold px-5 h-10 rounded-lg text-sm disabled:opacity-60"
          >
            {pending ? "Writing your advice…" : state ? "Update with my latest tests" : "Get my advice"}
          </button>
        )}
      </div>
      <p className="text-sm text-gray-600 mb-5">
        AI-written guidance on your mistakes and your next test, based on {scopeLabel === "All tests" ? "all your tests" : `your ${scopeLabel}`}.
        {when && ` Written ${when}.`}
        {state?.stale && " You have finished new tests since then."}
      </p>

      {pending && (
        <p role="status" className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-5">
          Reading your tests and mistakes. This takes about half a minute.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-st-not-answered-text bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5">
          {error}
        </p>
      )}

      {!configured && !a && (
        <p className="text-sm text-gray-600">The AI coach is not switched on yet. The admin needs to add the Anthropic API key.</p>
      )}
      {configured && !hasTests && !a && <p className="text-sm text-gray-600">Finish a test and your coach will review it here.</p>}

      {a && (
        <div className="space-y-6">
          <div>
            <p className="text-lg font-semibold text-gray-900">{a.headline}</p>
            <p className="text-gray-700 mt-1">{a.summary}</p>
          </div>

          {a.strengths.length > 0 && (
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-st-answered mb-2">What&apos;s working</h3>
              <ul className="list-disc pl-5 space-y-1 text-gray-800">
                {a.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {a.mistakes.length > 0 && (
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-st-not-answered mb-2">Mistakes costing you marks</h3>
              <ol className="space-y-3">
                {a.mistakes.map((m, i) => (
                  <li key={i} className="border border-gray-200 rounded-xl p-4">
                    <p className="font-semibold text-gray-900">
                      {i + 1}. {m.title}
                    </p>
                    <p className="text-sm text-gray-700 mt-1">{m.evidence}</p>
                    <p className="text-sm text-gray-900 mt-2">
                      <span className="font-semibold">Fix: </span>
                      {m.fix}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {a.nextTestPlan.length > 0 && (
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-900 mb-2">Plan for your next test</h3>
              <ol className="space-y-2">
                {a.nextTestPlan.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                    <span className="text-gray-800">
                      <span className="font-semibold text-gray-900">{s.action}</span> {s.detail}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {a.practiceFocus.length > 0 && (
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-900 mb-2">Practise before then</h3>
              <ul className="grid sm:grid-cols-2 gap-3">
                {a.practiceFocus.map((p, i) => (
                  <li key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="font-semibold text-gray-900">{p.area}</p>
                    <p className="text-sm text-gray-700 mt-1">{p.why}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-gray-500">Written by AI from your test data. Check the solutions for the full working.</p>
        </div>
      )}
    </section>
  );
}
