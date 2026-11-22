import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getResults, RESULTS_PAGE_SIZE, type ResultsFilter } from "@/server/admin-data";
import { formatDateTime, formatDuration, formatMarks, formatPercent, isCompleted } from "@/lib/admin-format";
import { Card, EmptyState, ModeBadge, PageHeader, StatusBadge, btnCls, tableCls } from "@/components/admin/ui";
import { FilterForm, filterFieldCls } from "@/components/admin/filter-form";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; paper?: string; status?: string; mode?: string; page?: string };

export default async function AdminResultsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const sp = await searchParams;
  const filter: ResultsFilter = {
    q: sp.q?.trim() || undefined,
    paperId: sp.paper || undefined,
    status: sp.status === "COMPLETED" || sp.status === "IN_PROGRESS" ? sp.status : "ALL",
    mode: sp.mode === "MOCK" || sp.mode === "PRACTICE" ? sp.mode : "ALL",
    page: Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1),
  };
  const r = await getResults(filter);
  const from = r.total ? (r.page - 1) * RESULTS_PAGE_SIZE + 1 : 0;
  const to = Math.min(r.total, r.page * RESULTS_PAGE_SIZE);

  const pageHref = (page: number) => {
    const p = new URLSearchParams();
    if (filter.q) p.set("q", filter.q);
    if (filter.paperId) p.set("paper", filter.paperId);
    if (filter.status !== "ALL") p.set("status", filter.status!);
    if (filter.mode !== "ALL") p.set("mode", filter.mode!);
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    return qs ? `/admin/results?${qs}` : "/admin/results";
  };
  const filtered = filter.q || filter.paperId || filter.status !== "ALL" || filter.mode !== "ALL";

  return (
    <>
      <PageHeader title="Results" description="Every test attempt, newest first. Percentages are of the paper's maximum marks." />

      <FilterForm className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input name="q" defaultValue={filter.q ?? ""} placeholder="Search student name or email" className={`${filterFieldCls} w-72 pl-9`} />
        </label>
        <select name="paper" defaultValue={filter.paperId ?? ""} className={`${filterFieldCls} max-w-64`}>
          <option value="">All papers</option>
          {r.paperOptions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <select name="status" defaultValue={filter.status === "ALL" ? "" : filter.status} className={filterFieldCls}>
          <option value="">Any status</option>
          <option value="COMPLETED">Completed</option>
          <option value="IN_PROGRESS">In progress</option>
        </select>
        <select name="mode" defaultValue={filter.mode === "ALL" ? "" : filter.mode} className={filterFieldCls}>
          <option value="">Mock and practice</option>
          <option value="MOCK">Mock</option>
          <option value="PRACTICE">Practice</option>
        </select>
        {filtered && <Link href="/admin/results" className="text-sm text-slate-500 hover:text-slate-900">Clear</Link>}
      </FilterForm>

      <Card bodyClassName="p-0">
        {r.rows.length === 0 ? (
          <EmptyState title={filtered ? "No attempts match these filters" : "No attempts yet"} />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableCls.table}>
              <thead className={tableCls.thead}>
                <tr>
                  <th className={tableCls.th}>Student</th>
                  <th className={tableCls.th}>Paper</th>
                  <th className={`${tableCls.th} text-right`}>Score</th>
                  <th className={`${tableCls.th} text-right`}>Right / wrong / skipped</th>
                  <th className={`${tableCls.th} text-right`}>Accuracy</th>
                  <th className={`${tableCls.th} text-right`}>Time</th>
                  <th className={tableCls.th}>Status</th>
                  <th className={tableCls.th}>Started</th>
                  <th className={tableCls.th} />
                </tr>
              </thead>
              <tbody className={tableCls.tbody}>
                {r.rows.map((a) => {
                  const done = isCompleted(a.status);
                  return (
                    <tr key={a.id} className={tableCls.tr}>
                      <td className={tableCls.td}>
                        <p className="font-medium text-slate-900">{a.user.name}</p>
                        <p className="text-xs text-slate-500">{a.user.email}</p>
                      </td>
                      <td className={tableCls.td}>
                        <p className="text-slate-800">{a.paper.title}</p>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500"><ModeBadge mode={a.mode} />{a.paper.exam.name}</div>
                      </td>
                      <td className={`${tableCls.td} text-right tabular-nums`}>
                        {done ? (
                          <>
                            <span className="font-medium text-slate-900">{formatMarks(a.score)}</span>
                            <span className="text-slate-400"> / {formatMarks(a.maxMarks)}</span>
                            <p className="text-xs text-slate-500">{formatPercent(a.percent, 1)}</p>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className={`${tableCls.td} text-right tabular-nums`}>
                        {done ? (
                          <>
                            <span className="text-emerald-700">{a.correct ?? 0}</span>
                            <span className="text-slate-300"> / </span>
                            <span className="text-rose-700">{a.incorrect ?? 0}</span>
                            <span className="text-slate-300"> / </span>
                            <span className="text-slate-500">{a.unattempted ?? 0}</span>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className={`${tableCls.td} text-right tabular-nums`}>{done ? formatPercent(a.accuracy) : "—"}</td>
                      <td className={`${tableCls.td} text-right tabular-nums`}>{done ? formatDuration(a.timeTaken) : "—"}</td>
                      <td className={tableCls.td}><StatusBadge status={a.status} /></td>
                      <td className={`${tableCls.td} whitespace-nowrap text-slate-500`}>{formatDateTime(a.startedAt)}</td>
                      <td className={`${tableCls.td} text-right`}>
                        {done ? (
                          <Link href={`/solutions/${a.id}`} className="text-sm text-slate-600 hover:text-slate-900">Review →</Link>
                        ) : (
                          <Link href="/admin/live" className="text-sm text-slate-600 hover:text-slate-900">Live →</Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
          <span className="tabular-nums">{r.total ? `${from}–${to} of ${r.total}` : "0 attempts"}</span>
          <div className="flex gap-2">
            {r.page > 1 ? <Link href={pageHref(r.page - 1)} className={btnCls.secondary}><ChevronLeft className="size-4" /> Previous</Link> : null}
            {r.page < r.pages ? <Link href={pageHref(r.page + 1)} className={btnCls.secondary}>Next <ChevronRight className="size-4" /></Link> : null}
          </div>
        </div>
      </Card>
    </>
  );
}
