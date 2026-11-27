"use client";

import { useState, useTransition, type ReactNode } from "react";
import { ClipboardCheck } from "lucide-react";
import { generateReviewAction } from "@/server/actions/test-advisor";
import type { TestReview } from "@/server/test-advisor";

interface Props {
  attemptId: string;
  configured: boolean;
  canGenerate: boolean;
  initial: { review: TestReview; createdAt: string } | null;
}

const H3 = ({ children, tone }: { children: ReactNode; tone?: "good" | "bad" }) => (
  <h3 className={`text-sm font-bold uppercase tracking-wide mb-2 ${tone === "bad" ? "text-st-not-answered" : tone === "good" ? "text-st-answered" : "text-gray-900"}`}>
    {children}
  </h3>
);

export function ReviewPanel({ attemptId, configured, canGenerate, initial }: Props) {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const r = state?.review;

  const run = () =>
    start(async () => {
      setError(null);
      try {
        const res = await generateReviewAction(attemptId);
        if (res.ok) setState({ review: res.review, createdAt: res.createdAt });
        else setError(res.error);
      } catch {
        setError("Could not reach the server. Check your connection and try again.");
      }
    });

  return (
    <section aria-labelledby="review" className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="review" className="font-heading text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-gray-700" aria-hidden /> Test review
        </h2>
        {!r && configured && canGenerate && (
          <button
            onClick={run}
            disabled={pending}
            className="inline-flex items-center justify-center bg-gray-900 hover:bg-gray-800 text-white font-semibold px-5 h-10 rounded-lg text-sm disabled:opacity-60"
          >
            {pending ? "Reviewing your test…" : "Review my test"}
          </button>
        )}
      </div>
      {!r && (
        <p className="text-sm text-gray-600 mt-1">
          Your advisor goes through every question, your time on each, the options you clicked and the answers you changed, then tells you
          what cost you marks and how to do better next time.
        </p>
      )}
      {pending && (
        <p role="status" className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mt-4">
          Going through every question of your test. This takes up to a minute.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-st-not-answered-text bg-red-50 border border-red-200 rounded-lg px-4 py-3 mt-4">
          {error}
        </p>
      )}
      {!configured && !r && <p className="text-sm text-gray-600 mt-3">The advisor is not switched on yet. The admin needs to add the Anthropic API key.</p>}

      {r && (
        <div className="space-y-6 mt-4">
          <div>
            <p className="text-lg font-semibold text-gray-900">{r.verdict}</p>
            <p className="text-gray-700 mt-1">{r.summary}</p>
          </div>
          {r.timeManagement && (
            <div>
              <H3>Your time</H3>
              <p className="text-gray-800">{r.timeManagement}</p>
            </div>
          )}
          {r.mistakes.length > 0 && (
            <div>
              <H3 tone="bad">Mistakes that cost marks</H3>
              <ol className="space-y-3">
                {r.mistakes.map((m, i) => (
                  <li key={i} className="border border-gray-200 rounded-xl p-4">
                    <p className="font-semibold text-gray-900">
                      {i + 1}. {m.title}
                      {m.questions.length > 0 && <span className="ml-2 text-xs font-medium text-gray-500">Q{m.questions.join(", Q")}</span>}
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
          {r.habits.length > 0 && (
            <div>
              <H3 tone="bad">Habits to change</H3>
              <ul className="space-y-3">
                {r.habits.map((h, i) => (
                  <li key={i} className="border border-amber-200 bg-amber-50 rounded-xl p-4">
                    <p className="font-semibold text-gray-900">{h.title}</p>
                    <p className="text-sm text-gray-700 mt-1">{h.evidence}</p>
                    <p className="text-sm text-gray-900 mt-2">
                      <span className="font-semibold">Instead: </span>
                      {h.fix}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.revisit.length > 0 && (
            <div>
              <H3>Questions to study again</H3>
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl">
                {r.revisit.map((q, i) => (
                  <li key={i} className="p-4">
                    <p className="font-semibold text-gray-900">Question {q.question}</p>
                    <p className="text-sm text-gray-700 mt-1">{q.whatWentWrong}</p>
                    <p className="text-sm text-gray-900 mt-1">
                      <span className="font-semibold">Key idea: </span>
                      {q.keyIdea}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.nextTestPlan.length > 0 && (
            <div>
              <H3>Plan for your next test</H3>
              <ol className="space-y-2">
                {r.nextTestPlan.map((s, i) => (
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
          {r.practiceFocus.length > 0 && (
            <div>
              <H3 tone="good">Practise before then</H3>
              <ul className="grid sm:grid-cols-2 gap-3">
                {r.practiceFocus.map((p, i) => (
                  <li key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="font-semibold text-gray-900">{p.area}</p>
                    <p className="text-sm text-gray-700 mt-1">{p.why}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-gray-500">Written by AI from your test record and the official solutions. Ask your advisor below about any point.</p>
        </div>
      )}
    </section>
  );
}
