import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOverview } from "@/server/admin-data";
import { ADMIN_TIME_ZONE, formatDateTime, formatDuration, formatMarks, formatPercent, isCompleted } from "@/lib/admin-format";
import { BarChart, Card, EmptyState, ModeBadge, PageHeader, ProgressBar, StatCard, StatusBadge, btnCls, tableCls } from "@/components/admin/ui";
import { ExamBadge } from "@/components/site/exam-badge";
import { Activity, ArrowRight, CircleCheck, Plus, Radio, Target, Upload, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const o = await getOverview();
  const { counts, trend } = o;
  const change = trend.startedPrev7 ? Math.round(((trend.started7 - trend.startedPrev7) / trend.startedPrev7) * 100) : null;
  const last30 = o.daily.reduce((t, d) => t + d.started, 0);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: ADMIN_TIME_ZONE });

  return (
    <>
      <PageHeader
        eyebrow={today}
        title="Overview"
        description="How students are using the portal. Admin test runs are left out of the numbers."
        actions={
          <>
            <Link href="/admin/papers" className={btnCls.secondary}><Plus className="size-4" /> New paper</Link>
            <Link href="/admin/import" className={btnCls.secondary}><Upload className="size-4" /> Import questions</Link>
            <Link href="/admin/live" className={btnCls.primary}><Radio className="size-4" /> Live proctor</Link>
          </>
        }
      />

      {counts.live > 0 && (
        <Link
          href="/admin/live"
          className="mb-6 flex items-center justify-between gap-3 rounded-2xl bg-slate-900 px-5 py-4 text-sm text-white hover:bg-slate-800"
        >
          <span className="flex items-center gap-3">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-rose-500" />
            </span>
            <span>
              <strong className="font-semibold">{counts.live}</strong> test{counts.live > 1 ? "s are" : " is"} in progress right now
            </span>
          </span>
          <span className="flex items-center gap-1 font-semibold">
            Open live proctor <ArrowRight className="size-4" aria-hidden />
          </span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Users}
          accent="blue"
          label="Students"
          value={counts.students}
          hint={`${counts.activeStudents30} active in last 30 days`}
          href="/admin/users"
        />
        <StatCard
          icon={Activity}
          accent="green"
          label="Tests started (7 days)"
          value={trend.started7}
          hint={change === null ? `${trend.startedPrev7} the week before` : `${change >= 0 ? "+" : ""}${change}% vs the week before`}
          href="/admin/results"
        />
        <StatCard
          icon={Target}
          accent="crimson"
          label="Average mock score"
          value={formatPercent(o.mocks.avgPercent, 1)}
          hint={`of max marks · ${o.mocks.count} completed mocks`}
          href="/admin/analytics"
        />
        <StatCard
          icon={CircleCheck}
          accent="saffron"
          label="Average accuracy"
          value={formatPercent(o.mocks.avgAccuracy, 1)}
          hint={`Avg time ${formatDuration(o.mocks.avgTime)}`}
          href="/admin/analytics"
        />
      </div>

      {o.exams.length > 0 && (
        <section aria-labelledby="exams-heading" className="mt-8">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="exams-heading" className="font-heading text-xl font-semibold text-slate-900">
              Exams
            </h2>
            <Link href="/admin/exams" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Manage exams →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {o.exams.map((e) => (
              <Link
                key={e.id}
                href={`/admin/papers?examId=${e.id}`}
                data-exam-theme={e.theme}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center justify-between bg-exam-dark px-4 py-4 text-white">
                  <span className="font-exam text-2xl font-bold leading-none">{e.name}</span>
                  <ArrowRight className="size-4 opacity-60 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </div>
                <dl className="grid grid-cols-2 gap-2 px-4 py-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Published</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">
                      {e.published} <span className="font-normal text-slate-500">of {e.papers}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Mocks done</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">{e.mocks}</dd>
                  </div>
                </dl>
                {e.published === 0 && (
                  <p className="border-t border-slate-100 px-4 py-2 text-xs font-medium text-amber-800 bg-amber-50">Hidden from students</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Activity, last 30 days"
          description={`${last30} tests started`}
          action={
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#c9d6e3]" /> Started</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#1f5fa8]" /> Completed</span>
              <Link href="/admin/analytics" className="font-medium text-slate-700 hover:text-slate-900">Analytics →</Link>
            </div>
          }
        >
          <BarChart data={o.daily.map((d) => ({ label: d.label, value: d.started, secondary: d.completed }))} />
        </Card>

        <Card title="Content">
          <dl className="space-y-3.5 text-sm">
            <Row label="Published papers" value={`${counts.publishedPapers} of ${counts.papers}`} href="/admin/papers" />
            <Row label="Questions" value={counts.questions.toLocaleString("en-IN")} href="/admin/questions" />
            <Row label="Exams" value={counts.exams} href="/admin/exams" />
            <Row label="Attempts recorded" value={`${counts.attempts} (${counts.completed} completed)`} href="/admin/results" />
            <Row label="Student accounts" value={`${counts.activeStudents} active of ${counts.students}`} href="/admin/users" />
          </dl>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Most-taken papers" description="Completed mocks and their average score" bodyClassName="p-0">
          {o.topPapers.length === 0 ? (
            <EmptyState title="No completed mocks yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {o.topPapers.map((p) => (
                <li key={p.id} data-exam-theme={p.theme}>
                  <Link href={`/admin/analytics?paper=${p.id}`} className="block px-5 py-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        {p.examName && <ExamBadge theme={p.theme}>{p.examName}</ExamBadge>}
                        <span className="truncate font-medium text-slate-800">{p.title}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-500">{p.attempts} taken</span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <ProgressBar value={p.avgPercent ?? 0} tone="exam" />
                      <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-slate-700">{formatPercent(p.avgPercent)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          className="lg:col-span-2"
          title="Recent attempts"
          action={<Link href="/admin/results" className="text-sm font-medium text-slate-700 hover:text-slate-900">All results →</Link>}
          bodyClassName="p-0"
        >
          {o.recent.length === 0 ? (
            <EmptyState title="No attempts yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className={tableCls.table}>
                <thead className={tableCls.thead}>
                  <tr>
                    <th className={tableCls.th}>Student</th>
                    <th className={tableCls.th}>Paper</th>
                    <th className={tableCls.th}>Score</th>
                    <th className={tableCls.th}>Status</th>
                    <th className={tableCls.th}>Started</th>
                  </tr>
                </thead>
                <tbody className={tableCls.tbody}>
                  {o.recent.map((a) => (
                    <tr key={a.id} className={tableCls.tr}>
                      <td className={tableCls.td}>
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                            {a.user.name.slice(0, 1).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">{a.user.name}</p>
                            <p className="text-xs text-slate-500">{a.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className={tableCls.td}>
                        <div className="flex min-w-[220px] flex-wrap items-center gap-1.5">
                          <ExamBadge theme={a.theme}>{a.paper.exam.name}</ExamBadge>
                          <span className="whitespace-nowrap text-slate-800">{a.paper.title}</span>
                          <ModeBadge mode={a.mode} />
                        </div>
                      </td>
                      <td className={`${tableCls.td} tabular-nums`}>
                        {isCompleted(a.status) ? (
                          <>
                            <span className="font-semibold">{formatMarks(a.score)}</span>{" "}
                            <span className="text-xs text-slate-500">({formatPercent(a.percent)})</span>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className={tableCls.td}><StatusBadge status={a.status} /></td>
                      <td className={`${tableCls.td} whitespace-nowrap text-slate-500`}>{formatDateTime(a.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function Row({ label, value, href }: { label: string; value: React.ReactNode; href: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd><Link href={href} className="font-semibold tabular-nums text-slate-900 hover:underline">{value}</Link></dd>
    </div>
  );
}
