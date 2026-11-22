import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getAnalytics, type AnalyticsFilter } from "@/server/admin-data";
import { formatDate, formatDuration, formatMarks, formatPercent } from "@/lib/admin-format";
import { Badge, BarChart, Card, EmptyState, PageHeader, ProgressBar, StatCard, tableCls } from "@/components/admin/ui";
import { FilterForm, filterFieldCls } from "@/components/admin/filter-form";

export const dynamic = "force-dynamic";

type Search = { paper?: string; mode?: string; days?: string };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const sp = await searchParams;
  const filter: AnalyticsFilter = {
    paperId: sp.paper || undefined,
    mode: sp.mode === "PRACTICE" || sp.mode === "ALL" ? sp.mode : "MOCK",
    days: ["7", "30", "90"].includes(sp.days ?? "") ? Number(sp.days) : 0,
  };
  const a = await getAnalytics(filter);
  const d = a.detail;
  const scope = `${filter.mode === "ALL" ? "Mock and practice" : filter.mode === "MOCK" ? "Mock tests" : "Practice"} · ${filter.days ? `last ${filter.days} days` : "all time"}`;

  return (
    <>
      <PageHeader title="Analytics" description="Student accounts only (admin test runs are left out). Scores are percentages of each paper's maximum marks; only completed attempts count." />

      <FilterForm className="mb-6 flex flex-wrap items-center gap-2">
        <select name="paper" defaultValue={filter.paperId ?? ""} className={`${filterFieldCls} min-w-64`}>
          <option value="">All papers</option>
          {a.paperOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <select name="mode" defaultValue={filter.mode} className={filterFieldCls}>
          <option value="MOCK">Mock tests</option>
          <option value="PRACTICE">Practice</option>
          <option value="ALL">Mock and practice</option>
        </select>
        <select name="days" defaultValue={String(filter.days || "")} className={filterFieldCls}>
          <option value="">All time</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        {Boolean(filter.paperId || filter.mode !== "MOCK" || filter.days) && (
          <Link href="/admin/analytics" className="text-sm text-slate-500 hover:text-slate-900">Clear</Link>
        )}
      </FilterForm>

      {d ? (
        <PaperDetail d={d} scope={scope} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Completed attempts" value={a.summary.completed} hint={`${a.summary.started} started · ${a.summary.started ? Math.round((a.summary.completed / a.summary.started) * 100) : 0}% finished`} />
            <StatCard label="Students" value={a.summary.students} hint="With a completed attempt" />
            <StatCard label="Average score" value={formatPercent(a.summary.avgPercent, 1)} hint="of max marks" />
            <StatCard label="Average accuracy" value={formatPercent(a.summary.avgAccuracy, 1)} hint={`Avg time ${formatDuration(a.summary.avgTime)}`} />
          </div>

          <Card className="mt-6" title="Papers" description={`${scope} · click a paper for section and question analysis`} bodyClassName="p-0">
            {a.papers.length === 0 ? (
              <EmptyState title="No attempts match these filters" />
            ) : (
              <div className="overflow-x-auto">
                <table className={tableCls.table}>
                  <thead className={tableCls.thead}>
                    <tr>
                      <th className={tableCls.th}>Paper</th>
                      <th className={`${tableCls.th} text-right`}>Completed</th>
                      <th className={`${tableCls.th} text-right`}>Students</th>
                      <th className={tableCls.th}>Average score</th>
                      <th className={`${tableCls.th} text-right`}>Best</th>
                      <th className={`${tableCls.th} text-right`}>Accuracy</th>
                      <th className={`${tableCls.th} text-right`}>Avg time</th>
                    </tr>
                  </thead>
                  <tbody className={tableCls.tbody}>
                    {a.papers.map((p) => (
                      <tr key={p.id} className={tableCls.tr}>
                        <td className={tableCls.td}>
                          <Link href={`/admin/analytics?paper=${p.id}${filter.mode !== "MOCK" ? `&mode=${filter.mode}` : ""}${filter.days ? `&days=${filter.days}` : ""}`} className="font-medium text-slate-900 hover:underline">
                            {p.title}
                          </Link>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                            {p.exam && <span>{p.exam}</span>}
                            {!p.published && <Badge>Hidden</Badge>}
                            {p.started > p.completed && <span>· {p.started - p.completed} unfinished</span>}
                          </div>
                        </td>
                        <td className={`${tableCls.td} text-right tabular-nums`}>{p.completed}</td>
                        <td className={`${tableCls.td} text-right tabular-nums`}>{p.students}</td>
                        <td className={`${tableCls.td} min-w-44`}>
                          <div className="flex items-center gap-3">
                            <ProgressBar value={p.avgPercent ?? 0} />
                            <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-700">
                              {formatPercent(p.avgPercent)} <span className="text-slate-400">({formatMarks(p.avgScore)}/{formatMarks(p.maxMarks)})</span>
                            </span>
                          </div>
                        </td>
                        <td className={`${tableCls.td} text-right tabular-nums`}>{formatPercent(p.bestPercent)}</td>
                        <td className={`${tableCls.td} text-right tabular-nums`}>{formatPercent(p.avgAccuracy)}</td>
                        <td className={`${tableCls.td} text-right tabular-nums`}>{formatDuration(p.avgTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="mt-6" title="Students" description={`${scope} · sorted by average score`} bodyClassName="p-0">
            {a.students.length === 0 ? (
              <EmptyState title="No completed attempts yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className={tableCls.table}>
                  <thead className={tableCls.thead}>
                    <tr>
                      <th className={tableCls.th}>Student</th>
                      <th className={`${tableCls.th} text-right`}>Attempts</th>
                      <th className={`${tableCls.th} text-right`}>Papers</th>
                      <th className={`${tableCls.th} text-right`}>Average score</th>
                      <th className={`${tableCls.th} text-right`}>Best</th>
                      <th className={`${tableCls.th} text-right`}>Accuracy</th>
                      <th className={tableCls.th}>Last active</th>
                    </tr>
                  </thead>
                  <tbody className={tableCls.tbody}>
                    {a.students.map((s) => (
                      <tr key={s.id} className={tableCls.tr}>
                        <td className={tableCls.td}>
                          <Link href={`/admin/results?q=${encodeURIComponent(s.email)}`} className="font-medium text-slate-900 hover:underline">{s.name}</Link>
                          <p className="text-xs text-slate-500">{s.email}</p>
                        </td>
                        <td className={`${tableCls.td} text-right tabular-nums`}>{s.attempts}</td>
                        <td className={`${tableCls.td} text-right tabular-nums`}>{s.papers}</td>
                        <td className={`${tableCls.td} text-right tabular-nums`}>{formatPercent(s.avgPercent, 1)}</td>
                        <td className={`${tableCls.td} text-right tabular-nums`}>{formatPercent(s.bestPercent, 1)}</td>
                        <td className={`${tableCls.td} text-right tabular-nums`}>{formatPercent(s.avgAccuracy)}</td>
                        <td className={`${tableCls.td} text-slate-500`}>{s.lastActive ? formatDate(s.lastActive) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}

type Detail = NonNullable<Awaited<ReturnType<typeof getAnalytics>>["detail"]>;

function PaperDetail({ d, scope }: { d: Detail; scope: string }) {
  // Lowest share answering correctly; among ties, the one most students tried (and got wrong) is harder.
  const hardest = [...d.questions]
    .filter((q) => q.correctRate !== null && (q.attemptRate ?? 0) > 0)
    .sort((x, y) => (x.correctRate ?? 0) - (y.correctRate ?? 0) || (y.attemptRate ?? 0) - (x.attemptRate ?? 0))
    .slice(0, 5);
  return (
    <>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">{d.paper.title}</h2>
        <p className="text-sm text-slate-500">{d.paper.exam} · {d.paper.questions} questions · max {formatMarks(d.paper.maxMarks)} marks · {scope}</p>
      </div>

      {d.attempts === 0 ? (
        <Card><EmptyState title="No completed attempts for this paper yet">Try including practice or a longer time range.</EmptyState></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Completed attempts" value={d.attempts} />
            <StatCard label="Students" value={d.leaderboard.length} />
            <StatCard label="Top score" value={formatPercent(d.leaderboard[0]?.percent, 1)} hint={d.leaderboard[0] ? `${d.leaderboard[0].name} · ${formatMarks(d.leaderboard[0].score)} marks` : undefined} />
            <StatCard label="Hardest question" value={hardest[0] ? `Q${hardest[0].number}` : "—"} hint={hardest[0] ? `${formatPercent(hardest[0].correctRate)} got it right` : undefined} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title="Sections" bodyClassName="p-0">
              <table className={tableCls.table}>
                <thead className={tableCls.thead}>
                  <tr>
                    <th className={tableCls.th}>Section</th>
                    <th className={`${tableCls.th} text-right`}>Attempted</th>
                    <th className={`${tableCls.th} text-right`}>Accuracy</th>
                    <th className={`${tableCls.th} text-right`}>Avg marks</th>
                  </tr>
                </thead>
                <tbody className={tableCls.tbody}>
                  {d.sections.map((s) => (
                    <tr key={s.name}>
                      <td className={tableCls.td}><p className="font-medium text-slate-800">{s.name}</p><p className="text-xs text-slate-500">{s.questions} questions</p></td>
                      <td className={`${tableCls.td} text-right tabular-nums`}>{formatPercent(s.attemptRate)}</td>
                      <td className={`${tableCls.td} text-right tabular-nums`}>{formatPercent(s.accuracy)}</td>
                      <td className={`${tableCls.td} text-right tabular-nums`}>{formatMarks(s.avgMarks === null ? null : Math.round(s.avgMarks * 10) / 10)} / {formatMarks(s.maxMarks)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title="Score distribution" description="Number of attempts in each band">
              <BarChart data={d.distribution} height={140} valueLabel=" attempts" />
            </Card>
          </div>

          <Card className="mt-6" title="Leaderboard" description="Each student's best attempt" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className={tableCls.table}>
                <thead className={tableCls.thead}>
                  <tr>
                    <th className={tableCls.th}>#</th>
                    <th className={tableCls.th}>Student</th>
                    <th className={`${tableCls.th} text-right`}>Score</th>
                    <th className={`${tableCls.th} text-right`}>Accuracy</th>
                    <th className={`${tableCls.th} text-right`}>Time</th>
                    <th className={tableCls.th}>Date</th>
                    <th className={tableCls.th} />
                  </tr>
                </thead>
                <tbody className={tableCls.tbody}>
                  {d.leaderboard.map((r, i) => (
                    <tr key={r.attemptId} className={tableCls.tr}>
                      <td className={`${tableCls.td} tabular-nums text-slate-500`}>{i + 1}</td>
                      <td className={`${tableCls.td} font-medium text-slate-900`}>{r.name}</td>
                      <td className={`${tableCls.td} text-right tabular-nums`}>{formatMarks(r.score)} <span className="text-xs text-slate-500">({formatPercent(r.percent, 1)})</span></td>
                      <td className={`${tableCls.td} text-right tabular-nums`}>{formatPercent(r.accuracy)}</td>
                      <td className={`${tableCls.td} text-right tabular-nums`}>{formatDuration(r.timeTaken)}</td>
                      <td className={`${tableCls.td} text-slate-500`}>{formatDate(r.date)}</td>
                      <td className={`${tableCls.td} text-right`}><Link href={`/solutions/${r.attemptId}`} className="text-sm text-slate-600 hover:text-slate-900">Review →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="mt-6" title="Questions" description="Right = share of all attempts that answered correctly; accuracy = right out of those who answered" bodyClassName="p-0">
            <div className="max-h-[560px] overflow-auto">
              <table className={tableCls.table}>
                <thead className={`${tableCls.thead} sticky top-0 bg-slate-50`}>
                  <tr>
                    <th className={tableCls.th}>Q</th>
                    <th className={tableCls.th}>Section</th>
                    <th className={tableCls.th}>Key</th>
                    <th className={`${tableCls.th} text-right`}>Answered</th>
                    <th className={tableCls.th}>Got it right</th>
                    <th className={`${tableCls.th} text-right`}>Accuracy</th>
                    <th className={tableCls.th}>Most common wrong answer</th>
                  </tr>
                </thead>
                <tbody className={tableCls.tbody}>
                  {d.questions.map((q) => (
                    <tr key={q.id} className={tableCls.tr}>
                      <td className={`${tableCls.td} tabular-nums font-medium text-slate-900`}>{q.number}</td>
                      <td className={`${tableCls.td} text-xs text-slate-600`}>{q.section}</td>
                      <td className={`${tableCls.td} font-mono text-xs`}>{q.answer.split("|").join(" / ")}{q.type === "TITA" && <span className="ml-1 font-sans text-slate-400">(typed)</span>}</td>
                      <td className={`${tableCls.td} text-right tabular-nums`}>{formatPercent(q.attemptRate)}</td>
                      <td className={`${tableCls.td} min-w-36`}>
                        <div className="flex items-center gap-2">
                          <ProgressBar value={q.correctRate ?? 0} tone={(q.correctRate ?? 0) < 30 ? "red" : (q.correctRate ?? 0) < 60 ? "amber" : "green"} />
                          <span className="w-10 shrink-0 text-right text-xs tabular-nums">{formatPercent(q.correctRate)}</span>
                        </div>
                      </td>
                      <td className={`${tableCls.td} text-right tabular-nums`}>{formatPercent(q.accuracy)}</td>
                      <td className={`${tableCls.td} text-xs text-slate-600`}>{q.topWrong ? `${q.topWrong.answer} (${q.topWrong.count})` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
