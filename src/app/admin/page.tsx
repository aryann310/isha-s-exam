import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOverview } from "@/server/admin-data";
import { formatDateTime, formatDuration, formatMarks, formatPercent, isCompleted } from "@/lib/admin-format";
import { BarChart, Card, EmptyState, ModeBadge, PageHeader, ProgressBar, StatCard, StatusBadge, btnCls, tableCls } from "@/components/admin/ui";
import { Radio, Plus, Upload } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const o = await getOverview();
  const { counts, trend } = o;
  const change = trend.startedPrev7 ? Math.round(((trend.started7 - trend.startedPrev7) / trend.startedPrev7) * 100) : null;
  const last30 = o.daily.reduce((t, d) => t + d.started, 0);

  return (
    <>
      <PageHeader
        title="Overview"
        description="How the portal is being used, at a glance."
        actions={
          <>
            <Link href="/admin/papers" className={btnCls.secondary}><Plus className="size-4" /> New paper</Link>
            <Link href="/admin/import" className={btnCls.secondary}><Upload className="size-4" /> Import questions</Link>
            <Link href="/admin/live" className={btnCls.primary}><Radio className="size-4" /> Live proctor</Link>
          </>
        }
      />

      {counts.live > 0 && (
        <Link href="/admin/live" className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 hover:bg-rose-100/70">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-rose-500 animate-pulse" />
            {counts.live} test{counts.live > 1 ? "s are" : " is"} in progress right now
          </span>
          <span className="font-medium">Open live proctor →</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Students" value={counts.students} hint={`${counts.activeStudents30} active in last 30 days`} href="/admin/users" />
        <StatCard
          label="Tests started (7 days)"
          value={trend.started7}
          hint={change === null ? `${trend.startedPrev7} the week before` : `${change >= 0 ? "+" : ""}${change}% vs the week before`}
          href="/admin/results"
        />
        <StatCard label="Average mock score" value={formatPercent(o.mocks.avgPercent, 1)} hint={`of max marks · ${o.mocks.count} completed mocks`} href="/admin/analytics" />
        <StatCard label="Average accuracy" value={formatPercent(o.mocks.avgAccuracy, 1)} hint={`Avg time ${formatDuration(o.mocks.avgTime)}`} href="/admin/analytics" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Activity, last 30 days"
          description={`${last30} tests started · grey = started, dark = completed`}
          action={<Link href="/admin/analytics" className="text-sm text-slate-600 hover:text-slate-900">Analytics →</Link>}
        >
          <BarChart data={o.daily.map((d) => ({ label: d.label, value: d.started, secondary: d.completed }))} />
        </Card>

        <Card title="Content">
          <dl className="space-y-3 text-sm">
            <Row label="Published papers" value={`${counts.publishedPapers} of ${counts.papers}`} href="/admin/papers" />
            <Row label="Questions" value={counts.questions.toLocaleString("en-IN")} href="/admin/questions" />
            <Row label="Exams" value={counts.exams} href="/admin/exams" />
            <Row label="Attempts recorded" value={`${counts.attempts} (${counts.completed} completed)`} href="/admin/results" />
            <Row label="Student accounts" value={`${counts.activeStudents} active of ${counts.students}`} href="/admin/users" />
          </dl>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Most-taken papers" description="Completed mocks" bodyClassName="p-0">
          {o.topPapers.length === 0 ? (
            <EmptyState title="No completed mocks yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {o.topPapers.map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/analytics?paper=${p.id}`} className="block px-5 py-3 hover:bg-slate-50">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-medium text-slate-800">{p.title}</span>
                      <span className="shrink-0 tabular-nums text-slate-500">{p.attempts} taken</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <ProgressBar value={p.avgPercent ?? 0} />
                      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-slate-600">{formatPercent(p.avgPercent)}</span>
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
          action={<Link href="/admin/results" className="text-sm text-slate-600 hover:text-slate-900">All results →</Link>}
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
                        <p className="font-medium text-slate-900">{a.user.name}</p>
                        <p className="text-xs text-slate-500">{a.user.email}</p>
                      </td>
                      <td className={tableCls.td}>
                        <p className="text-slate-800">{a.paper.title}</p>
                        <div className="mt-0.5"><ModeBadge mode={a.mode} /></div>
                      </td>
                      <td className={`${tableCls.td} tabular-nums`}>
                        {isCompleted(a.status) ? (
                          <>
                            {formatMarks(a.score)} <span className="text-xs text-slate-500">({formatPercent(a.percent)})</span>
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
      <dt className="text-slate-500">{label}</dt>
      <dd><Link href={href} className="font-medium tabular-nums text-slate-900 hover:underline">{value}</Link></dd>
    </div>
  );
}
