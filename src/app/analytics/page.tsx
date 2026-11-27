import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BarChart3, MessageCircle } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/site/site-header";
import { TrendChart } from "@/components/analytics/trend-chart";
import { AdvicePanel } from "@/components/analytics/advice-panel";
import { AdvisorChat } from "@/components/advisor/advisor-chat";
import { chatAllowance } from "@/server/test-advisor";
import { untimedPending } from "@/server/untimed";
import { advisorConfigured, getStoredAdvice } from "@/server/advisor";
import {
  accuracyOf,
  attemptRateOf,
  getStudentAnalytics,
  KIND_LABEL,
  strongestTopics,
  TEST_KINDS,
  weakestTopics,
  type Bucket,
  type TestKind,
} from "@/server/student-analytics";

export const dynamic = "force-dynamic";
// Writing the AI advice can take up to a minute.
export const maxDuration = 120;

const fmtPct = (n: number | null) => (n === null ? "–" : `${Math.round(n)}%`);

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const isAdmin = session.role === "ADMIN";
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);

  // Admins can open any student's analytics (?student=<id>); students see their own.
  const studentParam = isAdmin ? one("student") : null;
  const student = studentParam
    ? await prisma.user.findUnique({ where: { id: studentParam }, select: { id: true, name: true, username: true } })
    : null;
  if (studentParam && !student) return notFound();
  const userId = student?.id ?? (session.userId as string);

  const kindParam = one("type");
  const kind = TEST_KINDS.includes(kindParam as TestKind) ? (kindParam as TestKind) : null;
  const examParam = one("exam");

  const unfiltered = await getStudentAnalytics(userId, { exam: null, kind: null });
  const exam = unfiltered.exams.find((e) => e.slug === examParam) ?? null;
  const a = exam || kind ? await getStudentAnalytics(userId, { exam: exam?.slug ?? null, kind }) : unfiltered;

  // Advice covers every test type of the chosen exam (or all exams); the type filter only changes the numbers.
  const scope = exam?.slug ?? "all";
  const scopeBasis = exam ? (kind ? (await getStudentAnalytics(userId, { exam: exam.slug, kind: null })).basis : a.basis) : unfiltered.basis;
  const stored = await getStoredAdvice(userId, scope, scopeBasis);

  const viewerName = (session.username as string) || (session.name as string) || "Student";

  // Advisor chat about all tests (attemptId null), the chats left today, and each test's own advisor.
  const own = !student;
  const [generalMessages, allowance, unlocked] = await Promise.all([
    prisma.coachMessage.findMany({
      where: { userId, attemptId: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, reported: true },
    }),
    own ? chatAllowance(userId) : Promise.resolve(null),
    prisma.attempt.findMany({
      where: { id: { in: unfiltered.tests.map((t) => t.attemptId) } },
      select: { id: true, mode: true, status: true, unattempted: true, untimedEndedAt: true },
    }),
  ]);
  const openForAdvisor = new Set(unlocked.filter((x) => !untimedPending(x)).map((x) => x.id));
  const testAdvisors = [...unfiltered.tests].reverse().filter((t) => openForAdvisor.has(t.attemptId)).slice(0, 8);
  const firstName = ((session.name as string) || (session.username as string) || "").split(" ")[0] || "there";
  const lastGeneral = generalMessages[generalMessages.length - 1];
  const who = student ? student.name || student.username || "Student" : null;
  const href = (p: { exam?: string | null; type?: string | null }) => {
    const q = new URLSearchParams();
    if (student) q.set("student", student.id);
    const e = p.exam === undefined ? exam?.slug : p.exam;
    const t = p.type === undefined ? kind : p.type;
    if (e) q.set("exam", e);
    if (t) q.set("type", t);
    const s = q.toString();
    return `/analytics${s ? `?${s}` : ""}`;
  };
  const pill = (active: boolean) =>
    `inline-flex items-center h-9 px-3 rounded-lg text-sm font-semibold border ${active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-100"}`;

  const o = a.overall;
  const easy = a.difficulty.find((d) => d.key === "Easy");
  const weak = weakestTopics(a.topics);
  const strong = strongestTopics(a.topics);
  const recent = [...a.tests].reverse();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <SiteHeader name={viewerName} isAdmin={isAdmin} back={student ? { href: "/admin/users", label: "Students" } : undefined} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-10 space-y-6">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-semibold text-gray-900">{who ? `${who}'s performance` : "Your performance"}</h1>
          <p className="text-gray-600 mt-1">Every finished test, with what is costing you marks and how to improve.</p>
        </div>

        {unfiltered.tests.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center space-y-3">
            <BarChart3 className="w-8 h-8 mx-auto text-gray-400" aria-hidden />
            <p className="font-semibold text-gray-900">No finished tests yet.</p>
            <p className="text-sm text-gray-600">Take a mock or practice test and your analytics and coaching will appear here.</p>
            {!student && (
              <Link href="/exams" className="inline-flex bg-gray-900 text-white text-sm font-semibold px-4 h-10 items-center rounded-lg hover:bg-gray-800">
                Choose an exam
              </Link>
            )}
          </div>
        ) : (
          <>
            <nav aria-label="Filters" className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Link href={href({ exam: null })} className={pill(!exam)} aria-current={!exam ? "page" : undefined}>
                  All exams
                </Link>
                {unfiltered.exams.map((e) => (
                  <Link key={e.slug} href={href({ exam: e.slug })} className={pill(exam?.slug === e.slug)} aria-current={exam?.slug === e.slug ? "page" : undefined}>
                    {e.name}
                  </Link>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={href({ type: null })} className={pill(!kind)}>
                  All test types
                </Link>
                {TEST_KINDS.map((k) => (
                  <Link key={k} href={href({ type: k })} className={pill(kind === k)}>
                    {KIND_LABEL[k]}
                  </Link>
                ))}
              </div>
            </nav>

            {own && advisorConfigured() && allowance && (
              <a
                href="#chat"
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-900 text-white rounded-2xl px-5 py-4 hover:bg-gray-800"
              >
                <span className="flex items-center gap-3">
                  <MessageCircle className="w-5 h-5 shrink-0" aria-hidden />
                  <span>
                    <span className="font-semibold">Chat with your advisor</span>
                    <span className="block text-sm text-gray-300">Ask about your results, your mistakes or your next test.</span>
                  </span>
                </span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-sm bg-white/15 rounded-full px-3 py-1">
                    <span className="font-bold">{allowance.left}</span> of {allowance.limit} chats left today
                  </span>
                  <span className="font-semibold">Start chatting &rarr;</span>
                </span>
              </a>
            )}

            {a.tests.length === 0 ? (
              <p className="bg-white border border-gray-200 rounded-2xl p-6 text-gray-700">No finished tests match these filters.</p>
            ) : (
              <>
                <section aria-label="Summary" className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  <Stat label="Tests finished" value={String(a.tests.length)} />
                  <Stat label="Average score" value={fmtPct(o.avgPercent)} note={`of the maximum marks · best ${fmtPct(o.bestPercent)}`} />
                  <Stat label="Accuracy" value={fmtPct(o.accuracy)} note={`${o.correct} right of ${o.attempted} attempted`} />
                  <Stat label="Questions attempted" value={fmtPct(o.attemptRate)} note={`${o.attempted} of ${o.total}`} />
                  <Stat label="Marks lost to wrong answers" value={o.lost ? `−${o.lost}` : "0"} note={`${o.wrong} wrong answers`} tone={o.lost ? "bad" : undefined} />
                  <Stat
                    label="Easy questions wrong"
                    value={easy ? String(easy.wrong) : "–"}
                    note={easy ? `of ${easy.attempted} easy ones attempted` : "difficulty not tagged"}
                    tone={easy?.wrong ? "bad" : undefined}
                  />
                </section>

                <AdvicePanel
                  key={`${scope}:${stored?.createdAt.toISOString() ?? "none"}`}
                  scope={scope}
                  scopeLabel={exam ? `${exam.name} tests` : "All tests"}
                  studentId={student?.id ?? null}
                  configured={advisorConfigured()}
                  hasTests={a.tests.length > 0}
                  initial={stored ? { advice: stored.advice, createdAt: stored.createdAt.toISOString(), stale: stored.stale } : null}
                />

                <div className="scroll-mt-6" id="advisor-chat">
                  <AdvisorChat
                    key={lastGeneral?.id ?? "empty"}
                    endpoint="/api/advisor/general/chat"
                    description="Your advisor sees all your finished tests: scores, sections, topics, habits and recent mistakes. For one particular question, open that test's advisor below."
                    greeting={`Hi ${firstName}! I have all ${unfiltered.tests.length} of your finished tests in front of me. Ask me what is costing you marks, which section to work on, or how to plan your next test.`}
                    emptyReadOnly="No general conversation yet."
                    messages={generalMessages.map((m) => ({ id: m.id, role: m.role === "assistant" ? "assistant" : "user", content: m.content, reported: m.reported }))}
                    configured={advisorConfigured()}
                    readOnly={!own}
                    allowance={allowance ? { limit: allowance.limit, left: allowance.left, requested: !!allowance.requestedAt } : null}
                    suggestions={[
                      "What is costing me the most marks?",
                      "Which section should I work on first?",
                      "What habits should I change in my next test?",
                      "Make me a plan for my next mock test.",
                    ]}
                  />
                  {testAdvisors.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:px-8 mt-3">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-900 mb-2">Talk about one test</h3>
                      <ul className="flex flex-wrap gap-2">
                        {testAdvisors.map((t) => (
                          <li key={t.attemptId}>
                            <Link
                              href={`/results/${t.attemptId}/advisor`}
                              className="inline-flex items-center gap-1.5 text-sm border border-gray-200 bg-gray-50 hover:bg-gray-100 rounded-full px-3 py-1.5"
                            >
                              {t.paperTitle}
                              <span className="text-gray-500">· {t.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <section aria-labelledby="trend" className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8">
                  <h2 id="trend" className="font-heading text-2xl font-semibold text-gray-900 mb-4">Score trend</h2>
                  <TrendChart tests={a.tests} />
                  <div className="overflow-x-auto mt-6">
                    <table className="w-full text-sm min-w-[560px]">
                      <thead>
                        <tr className="text-left text-gray-600 border-b border-gray-200">
                          <th className="py-2 pr-3 font-medium">Test</th>
                          <th className="py-2 px-3 font-medium">Date</th>
                          <th className="py-2 px-3 font-medium text-right">Score</th>
                          <th className="py-2 px-3 font-medium text-right">Accuracy</th>
                          <th className="py-2 pl-3 font-medium text-right">Attempted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recent.slice(0, 10).map((t) => (
                          <tr key={t.attemptId} className="border-b border-gray-100 last:border-0">
                            <td className="py-2.5 pr-3">
                              <Link href={`/results/${t.attemptId}`} className="font-semibold text-gray-900 hover:underline">
                                {t.paperTitle}
                              </Link>
                              <span className="block text-xs text-gray-500">
                                {t.examName} · {KIND_LABEL[t.kind]}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">
                              {t.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums">
                              <span className="font-semibold">{t.score}</span>
                              <span className="text-gray-500"> / {t.maxMarks}</span>
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums">{fmtPct(t.accuracy)}</td>
                            <td className="py-2.5 pl-3 text-right tabular-nums">
                              {t.attempted}/{t.total}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {a.untimed.answered > 0 && (
                  <section aria-labelledby="time" className="bg-amber-50 border border-amber-200 rounded-2xl p-6 sm:p-8">
                    <h2 id="time" className="font-heading text-2xl font-semibold text-gray-900">Time cost you marks</h2>
                    <p className="text-gray-800 mt-2">
                      You skipped questions in your tests, then answered {a.untimed.answered} of them afterwards with no time limit and got{" "}
                      <strong>{a.untimed.correct} right</strong>. That is <strong>+{a.untimed.marksMissed} marks</strong> you knew but did not have time
                      for. Better pacing would win these back.
                    </p>
                  </section>
                )}

                <BucketTable id="sections" title="By section" first="Section" rows={a.sections} />
                <div className="grid lg:grid-cols-2 gap-6">
                  {a.difficulty.length > 0 && <BucketTable id="difficulty" title="By difficulty" first="Level" rows={a.difficulty} compact />}
                  <BucketTable id="types" title="By question type" first="Type" rows={a.types} compact />
                </div>

                <section aria-labelledby="topics" className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8">
                  <h2 id="topics" className="font-heading text-2xl font-semibold text-gray-900 mb-1">Topics</h2>
                  {weak.length + strong.length === 0 ? (
                    <p className="text-sm text-gray-600">
                      {a.topics.length === 0
                        ? "These papers are not tagged by topic (CAT papers are grouped by section only)."
                        : "Not enough answers per topic yet. Topics show once you have attempted at least 3 questions in them."}
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-600 mb-4">Topics where you attempted at least 3 questions: under 60% accuracy needs work.</p>
                      <div className="grid sm:grid-cols-2 gap-6">
                        <TopicList title="Needs work" tone="bad" rows={weak} />
                        <TopicList title="Strongest" tone="good" rows={strong} />
                      </div>
                    </>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "bad" }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5">
      <p className="text-sm text-gray-600">{label}</p>
      <p className={`text-2xl sm:text-3xl font-bold tabular-nums mt-1 ${tone === "bad" ? "text-st-not-answered" : "text-gray-900"}`}>{value}</p>
      {note && <p className="text-xs text-gray-500 mt-1">{note}</p>}
    </div>
  );
}

function AccuracyBar({ value }: { value: number | null }) {
  const v = value ?? 0;
  const color = v >= 70 ? "bg-st-answered" : v >= 45 ? "bg-amber-500" : "bg-st-not-answered";
  return (
    <span className="inline-flex items-center gap-2 justify-end w-full">
      <span className="hidden sm:block w-20 h-2 rounded-full bg-gray-100 overflow-hidden" aria-hidden>
        <span className={`block h-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
      </span>
      <span className="tabular-nums w-10 text-right">{fmtPct(value)}</span>
    </span>
  );
}

function BucketTable({ id, title, first, rows, compact }: { id: string; title: string; first: string; rows: Bucket[]; compact?: boolean }) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby={id} className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8">
      <h2 id={id} className="font-heading text-2xl font-semibold text-gray-900 mb-4">
        {title}
      </h2>
      <div className="overflow-x-auto">
        <table className={`w-full text-sm ${compact ? "" : "min-w-[600px]"}`}>
          <thead>
            <tr className="text-left text-gray-600 border-b border-gray-200">
              <th className="py-2 pr-3 font-medium">{first}</th>
              <th className="py-2 px-3 font-medium text-right">Accuracy</th>
              <th className="py-2 px-3 font-medium text-right">Attempted</th>
              {!compact && <th className="py-2 px-3 font-medium text-right">Right / wrong</th>}
              <th className="py-2 px-3 font-medium text-right">Net marks</th>
              {!compact && <th className="py-2 pl-3 font-medium text-right">Lost to wrong</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.key} className="border-b border-gray-100 last:border-0">
                <td className="py-2.5 pr-3 font-semibold text-gray-900">{b.key}</td>
                <td className="py-2.5 px-3">
                  <AccuracyBar value={accuracyOf(b)} />
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums">
                  {fmtPct(attemptRateOf(b))} <span className="text-gray-500 text-xs">({b.attempted}/{b.total})</span>
                </td>
                {!compact && (
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    <span className="text-st-answered">{b.correct}</span> / <span className="text-st-not-answered">{b.wrong}</span>
                  </td>
                )}
                <td className="py-2.5 px-3 text-right tabular-nums font-semibold">{b.marks}</td>
                {!compact && <td className="py-2.5 pl-3 text-right tabular-nums text-st-not-answered">{b.lost ? `−${b.lost}` : "0"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TopicList({ title, tone, rows }: { title: string; tone: "good" | "bad"; rows: Bucket[] }) {
  return (
    <div>
      <h3 className={`text-sm font-bold uppercase tracking-wide mb-2 ${tone === "good" ? "text-st-answered" : "text-st-not-answered"}`}>{title}</h3>
      {rows.length === 0 && <p className="text-sm text-gray-600">{tone === "good" ? "None at 60% accuracy yet." : "None below 60% accuracy."}</p>}
      <ul className="space-y-2">
        {rows.map((t) => (
          <li key={t.key} className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2">
            <span className="text-gray-900 font-medium min-w-0 truncate" title={t.key}>
              {t.key}
            </span>
            <span className="text-sm tabular-nums text-gray-700 shrink-0">
              {fmtPct(accuracyOf(t))} <span className="text-gray-500 text-xs">({t.correct}/{t.attempted})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
