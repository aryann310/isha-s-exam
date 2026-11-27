import { redirect } from "next/navigation";
import { Bell, FileText, Megaphone, Users } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/admin-format";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/admin/ui";
import { AnnounceNowButton, NotificationComposer, RemoveNotificationButton } from "@/components/admin/notification-composer";
import { QUIET_MS, announceNewPapers } from "@/server/notifications";
import { daysAgo } from "@/server/test-advisor";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  // Papers that went live since anyone last looked get their announcement before the list is read.
  await announceNewPapers({ force: true }).catch((err) => console.error("announceNewPapers failed:", err));

  const [students, papers, history, pending] = await Promise.all([
    prisma.user.findMany({
      where: { role: "STUDENT", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, username: true, notificationsSeenAt: true },
    }),
    prisma.paper.findMany({
      where: { isActive: true, exam: { isActive: true }, totalQuestions: { gt: 0 } },
      orderBy: [{ exam: { name: "asc" } }, { year: "desc" }, { title: "asc" }],
      select: { id: true, title: true, exam: { select: { name: true } } },
    }),
    prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        link: true,
        audience: true,
        createdBy: true,
        createdAt: true,
        recipients: { select: { userId: true } },
        paper: { select: { isActive: true, exam: { select: { isActive: true } } } },
      },
    }),
    prisma.paper.findMany({
      where: { announcedAt: null, isActive: true, exam: { isActive: true }, totalQuestions: { gt: 0 } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true, exam: { select: { name: true } } },
    }),
  ]);

  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const seenAt = new Map(students.map((s) => [s.id, s.notificationsSeenAt?.getTime() ?? 0]));
  const rows = history.map((n) => {
    const audienceIds = n.audience === "ALL" ? students.map((s) => s.id) : n.recipients.map((r) => r.userId).filter((id) => seenAt.has(id));
    const seen = audienceIds.filter((id) => (seenAt.get(id) ?? 0) >= n.createdAt.getTime()).length;
    const hidden = n.paper ? !(n.paper.isActive && n.paper.exam.isActive) : false;
    const names = audienceIds.map((id) => nameOf.get(id) ?? "?").join(", ");
    return { ...n, reach: audienceIds.length, seen, hidden, names };
  });
  const weekAgo = daysAgo(7).getTime();
  const sentThisWeek = history.filter((n) => n.createdAt.getTime() > weekAgo).length;
  const quietMin = Math.round(QUIET_MS / 60000);

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Notifications"
        description="Students see these in the bell at the top of every page, with a pop-up for anything new. New papers are announced automatically."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Students who get them" value={students.length} icon={Users} accent="blue" />
        <StatCard label="Sent in the last 7 days" value={sentThisWeek} icon={Bell} accent="green" />
        <StatCard
          label="Papers waiting to be announced"
          value={pending.length}
          hint={pending.length ? `Sent ${quietMin} min after the last change` : "All live papers are announced"}
          icon={FileText}
          accent="saffron"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card title="Send a notification" description="Write your own message for every student or for chosen students.">
          <NotificationComposer
            students={students.map((s) => ({ id: s.id, name: s.name, username: s.username }))}
            papers={papers.map((p) => ({ id: p.id, label: p.title.toLowerCase().includes(p.exam.name.toLowerCase()) ? p.title : `${p.exam.name} · ${p.title}` }))}
          />
        </Card>

        <div className="space-y-6">
          <Card
            title="Automatic paper announcements"
            description={`When a paper is published (its exam is published and it has questions), students get "New paper released" about ${quietMin} minutes after the last change to it, so a paper still being filled isn't announced early.`}
            bodyClassName="p-0"
          >
            {pending.length === 0 ? (
              <EmptyState title="Nothing waiting">Every paper students can see has been announced.</EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-200">
                {pending.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {p.exam.name} · {p.title}
                      </p>
                      <p className="text-xs text-slate-500">Last changed {formatDateTime(p.updatedAt)}</p>
                    </div>
                    <AnnounceNowButton paperId={p.id} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Sent" description="Newest first. Seen = the student opened the bell after it was sent." bodyClassName="p-0">
            {rows.length === 0 ? (
              <EmptyState title="Nothing sent yet" />
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-200">
                {rows.map((n) => (
                  <li key={n.id} className="flex gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {n.kind === "PAPER" ? (
                          <Badge tone="blue">
                            <FileText className="size-3" aria-hidden /> New paper
                          </Badge>
                        ) : (
                          <Badge tone="violet">
                            <Megaphone className="size-3" aria-hidden /> Custom
                          </Badge>
                        )}
                        {n.hidden && <Badge tone="amber">Paper hidden, so not shown</Badge>}
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-slate-900">{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 whitespace-pre-line break-words text-xs text-slate-600">{n.body}</p>
                      <p className="mt-1.5 break-words text-xs text-slate-500 [overflow-wrap:anywhere]">
                        {formatDateTime(n.createdAt)}
                        {n.createdBy ? ` · by ${n.createdBy}` : ""}
                        {" · to "}
                        {n.audience === "ALL" ? "all students" : n.names}
                        {n.kind === "CUSTOM" && n.link ? ` · button opens ${n.link}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold tabular-nums text-slate-900" title="Students who opened the bell after it was sent">
                        {n.seen} / {n.reach} seen
                      </span>
                      <RemoveNotificationButton id={n.id} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
