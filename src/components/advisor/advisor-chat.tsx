"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flag, MessageCircle, Send } from "lucide-react";
import { renderMarkdownWithMath } from "@/lib/render-markdown";
import { reportAdvisorMessageAction, requestMoreAdvisorMessagesAction } from "@/server/actions/test-advisor";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reported: boolean;
}

interface Props {
  /** Where messages are sent: one test's chat, or the general chat on the analytics tab. */
  endpoint: string;
  /** The advisor's opening words, shown before the first message (not sent to the model, not counted). */
  greeting?: string;
  /** One line under the title. */
  description?: string;
  emptyReadOnly?: string;
  messages: ChatMessage[];
  configured: boolean;
  readOnly: boolean;
  allowance: { limit: number; left: number; requested: boolean } | null;
  suggestions: string[];
}

export function AdvisorChat({ endpoint, greeting, description, emptyReadOnly, messages: initial, configured, readOnly, allowance, suggestions }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(allowance?.requested ?? false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  const left = allowance?.left ?? 0;
  const canSend = configured && !readOnly && !streaming && left > 0;

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || !canSend) return;
    setError(null);
    setInput("");
    setStreaming(true);
    setMessages((m) => [...m, { id: `local-u-${m.length}`, role: "user", content: message, reported: false }, { id: "streaming", role: "assistant", content: "", reported: false }]);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "The advisor could not answer. Please try again.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => m.map((x) => (x.id === "streaming" ? { ...x, content: acc } : x)));
      }
      // Reload from the server: message ids (for Report) and the remaining allowance.
      start(() => router.refresh());
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== "streaming"));
      setInput(message);
      setError(err instanceof Error ? err.message : "The advisor could not answer. Please try again.");
    } finally {
      setStreaming(false);
    }
  };

  const report = async (id: string) => {
    const res = await reportAdvisorMessageAction(id, note);
    if (res.ok) {
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, reported: true } : x)));
      setReporting(null);
      setNote("");
    } else setError(res.error);
  };

  const askForMore = async () => {
    const res = await requestMoreAdvisorMessagesAction();
    if (res.ok) setRequested(true);
    else setError(res.error);
  };

  return (
    <section aria-labelledby="chat" className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="chat" className="font-heading text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-gray-700" aria-hidden /> Talk to your advisor
        </h2>
        {allowance && !readOnly && (
          <span className={`text-sm font-semibold rounded-full px-3 py-1 ${left > 0 ? "bg-gray-100 text-gray-900" : "bg-amber-100 text-amber-900"}`}>
            {left} of {allowance.limit} chats left today
          </span>
        )}
      </div>
      <p className="text-sm text-gray-600 mt-1">
        {description ?? "Ask about any question in this test, your timing, your mistakes or your next test. Answers follow the official solutions."}
      </p>

      <div className="mt-5 space-y-4" aria-live="polite">
        {greeting && !readOnly && configured && (
          <div className="max-w-[95%] bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 text-gray-900">{greeting}</div>
        )}
        {messages.length === 0 && !readOnly && configured && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={!canSend}
                onClick={() => void send(s)}
                className="text-sm text-gray-800 bg-gray-50 border border-gray-200 hover:bg-gray-100 rounded-full px-3 py-1.5 text-left disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.length === 0 && readOnly && <p className="text-sm text-gray-600">{emptyReadOnly ?? "No conversation for this test yet."}</p>}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[85%] bg-gray-900 text-white rounded-2xl rounded-br-md px-4 py-2.5 whitespace-pre-wrap break-words">{m.content}</p>
            </div>
          ) : (
            <div key={m.id} className="max-w-[95%]">
              <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3">
                {m.content ? (
                  <div className="prose prose-sm max-w-none text-gray-900 break-words" dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(m.content) }} />
                ) : (
                  <p className="text-sm text-gray-500">Thinking…</p>
                )}
              </div>
              {m.id !== "streaming" && !m.id.startsWith("local-") && (
                <div className="mt-1 ml-1 text-xs">
                  {m.reported ? (
                    <span className="text-gray-500">Reported. An admin will check this answer.</span>
                  ) : readOnly ? null : reporting === m.id ? (
                    <div className="flex flex-col sm:flex-row gap-2 mt-1">
                      <label className="sr-only" htmlFor={`note-${m.id}`}>
                        What is wrong with this answer?
                      </label>
                      <input
                        id={`note-${m.id}`}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="What is wrong? (optional)"
                        className="flex-1 border border-gray-300 rounded-lg px-3 h-9 text-sm"
                        maxLength={500}
                      />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void report(m.id)} className="h-9 px-3 rounded-lg bg-gray-900 text-white text-sm font-semibold">
                          Send report
                        </button>
                        <button type="button" onClick={() => setReporting(null)} className="h-9 px-3 rounded-lg border border-gray-300 text-sm">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setReporting(m.id)} className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900">
                      <Flag className="w-3 h-3" aria-hidden /> Report this answer
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        )}
        <div ref={end} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-st-not-answered-text bg-red-50 border border-red-200 rounded-lg px-4 py-3 mt-4">
          {error}
        </p>
      )}

      {!readOnly && !configured && <p className="text-sm text-gray-600 mt-4">The advisor is not switched on yet. The admin needs to add the Anthropic API key.</p>}

      {!readOnly && configured && left <= 0 && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-gray-800 flex flex-wrap items-center justify-between gap-3">
          <span>You have no advisor chats left today. They reset at midnight.</span>
          {requested ? (
            <span className="font-semibold">Request sent to the admin.</span>
          ) : (
            <button type="button" onClick={() => void askForMore()} className="h-9 px-3 rounded-lg bg-gray-900 text-white font-semibold">
              Ask the admin for more
            </button>
          )}
        </div>
      )}

      {!readOnly && configured && left > 0 && (
        <form
          className="mt-5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <label htmlFor="advisor-input" className="sr-only">
            Your question
          </label>
          <textarea
            id="advisor-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            maxLength={1500}
            placeholder="e.g. Why is the answer to Q14 C and not B?"
            className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <button
            type="submit"
            disabled={!canSend || !input.trim()}
            className="self-end inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-gray-900 text-white font-semibold disabled:opacity-50"
          >
            <Send className="w-4 h-4" aria-hidden />
            {streaming ? "…" : "Send"}
          </button>
        </form>
      )}
    </section>
  );
}
