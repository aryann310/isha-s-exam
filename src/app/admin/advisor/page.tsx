import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/admin-format";
import { Card, EmptyState, PageHeader, StatCard, tableCls } from "@/components/admin/ui";
import { AdvisorLimitForm, ReportedAnswer } from "@/components/admin/advisor-admin";
import { daysAgo, startOfIndianDay } from "@/server/test-advisor";

export const dynamic = "force-dynamic";

// Claude Haiku 5.5 list prices (USD per million tokens, prompts up to 100K tokens). Cached reads cost less, so
// this is an upper estimate.
const IN_PER_M = 0.1;
const OUT_PER_M = 0.5;

export default async function AdminAdvisorPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");
  const today = startOfIndianDay();
  const monthAgo = daysAgo(30);

  const [requests, reported, todayCount, monthUsage, reviews, students] = await Promise.all([
    prisma.user.findMany({
      where: { advisorLimitRequestedAt: { not: null } },
      orderBy: { advisorLimitRequestedAt: "asc" },
      select: { id: true, name: true, username: true, advisorDailyLimit: true, advisorLimitRequestedAt: true },
    }),
    prisma.coachMessage.findMany({
      where: { reported: true, reviewedAt: null },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: {
        id: true,
        content: true,
        reportNote: true,
        createdAt: true,
        attemptId: true,
        user: { select: { name: true, username: true } },
        attempt: { select: { paper: { select: { title: true } } } },
      },
    }),
    prisma.coachMessage.count({ where: { role: "user", createdAt: { gte: today } } }),
    prisma.coachMessage.aggregate({ where: { role: "assistant", createdAt: { gte: monthAgo } }, _sum: { inputTokens: true, outputTokens: true }, _count: { _all: true } }),
    prisma.advisory.aggregate({ where: { createdAt: { gte: monthAgo } }, _sum: { inputTokens: true, outputTokens: true }, _count: { _all: true } }),
    prisma.user.findMany({
      where: { role: "STUDENT" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, username: true, advisorDailyLimit: true },
    }),
  ]);

  // The student's question just before each reported answer.
  const asked = await Promise.all(
    reported.map((r) =>
      prisma.coachMessage.findFirst({
        where: { attemptId: r.attemptId, role: "user", createdAt: { lte: r.createdAt } },
        orderBy: { createdAt: "desc" },
        select: { content: true },
      })
    )
  );

  const inTok = (monthUsage._sum.inputTokens ?? 0) + (reviews._sum.inputTokens ?? 0);
  const outTok = (monthUsage._sum.outputTokens ?? 0) + (reviews._sum.outputTokens ?? 0);
  const cost = (inTok * IN_PER_M + outTok * OUT_PER_M) / 1_000_000;
  const who = (u: { name: string; username: string | null }) => u.name || u.username || "Student";

  return (
    <>
      <PageHeader title="AI advisor" description="Students' requests for more advisor messages, answers they reported as wrong, and what the advisor costs." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Questions asked today" value={todayCount} />
        <StatCard label="Chat answers (30 days)" value={monthUsage._count._all} />
        <StatCard label="Reviews written (30 days)" value={reviews._count._all} />
        <StatCard label="Estimated cost (30 days)" value={`$${cost.toFixed(2)}`} hint="Claude Haiku 5.5, upper estimate" />
      </div>

      <div className="space-y-6">
        <Card title="Requests for more messages" description="Students who used their daily messages and asked for more. Saving a new limit clears the request.">
          {requests.length === 0 ? (
            <EmptyState title="No requests right now." />
          ) : (
            <table className={tableCls.table}>
              <thead className={tableCls.thead}>
                <tr>
                  <th className={tableCls.th}>Student</th>
                  <th className={tableCls.th}>Asked</th>
                  <th className={tableCls.th}>Daily limit</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100">
                    <td className={tableCls.td}>{who(u)}</td>
                    <td className={`${tableCls.td} text-slate-500`}>{u.advisorLimitRequestedAt ? formatDate(u.advisorLimitRequestedAt) : ""}</td>
                    <td className={tableCls.td}>
                      <AdvisorLimitForm userId={u.id} limit={u.advisorDailyLimit} suggested={u.advisorDailyLimit + 20} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Reported answers" description="Advisor answers a student flagged as wrong or unhelpful. Check them against the official solution.">
          {reported.length === 0 ? (
            <EmptyState title="Nothing reported." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {reported.map((r, i) => (
                <ReportedAnswer
                  key={r.id}
                  item={{
                    id: r.id,
                    student: who(r.user),
                    paper: r.attempt.paper.title,
                    attemptId: r.attemptId,
                    question: asked[i]?.content ?? null,
                    answer: r.content,
                    note: r.reportNote,
                    when: formatDate(r.createdAt),
                  }}
                />
              ))}
            </ul>
          )}
        </Card>

        <Card title="Daily message limits" description="Messages each student may send to the advisor per day (new students get 40).">
          {students.length === 0 ? (
            <EmptyState title="No students yet." />
          ) : (
            <table className={tableCls.table}>
              <thead className={tableCls.thead}>
                <tr>
                  <th className={tableCls.th}>Student</th>
                  <th className={tableCls.th}>Daily limit</th>
                </tr>
              </thead>
              <tbody>
                {students.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100">
                    <td className={tableCls.td}>{who(u)}</td>
                    <td className={tableCls.td}>
                      <AdvisorLimitForm userId={u.id} limit={u.advisorDailyLimit} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
