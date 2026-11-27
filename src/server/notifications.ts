// Student notifications (the bell in the site header).
//
// PAPER notifications are made here, lazily: whenever the bell or the admin page loads, papers that students can
// now see and that were never announced get one message each. Doing it on read rather than in each publish
// action covers every way a paper goes live (Publish button, new paper form, bulk import, the surprise-paper
// script, publishing the exam). A paper is announced only once it has been quiet for QUIET_MS, so a paper
// being filled question by question isn't announced half-built.
//
// Read state is one timestamp per student (User.notificationsSeenAt): opening the bell marks everything read.
import { prisma } from "@/lib/prisma";
import { isSurprisePaper } from "@/lib/surprise";

export const QUIET_MS = 2 * 60 * 1000;
const FEED_DAYS = 60;
const FEED_LIMIT = 30;
let lastSweep = 0;

export const TITLE_MAX = 90;
export const BODY_MAX = 600;

/** A link a notification may carry: a path inside the portal, or an https address. */
export function cleanLink(raw: string | null | undefined): string | null {
  const link = (raw ?? "").trim();
  if (!link) return null;
  if (/^\/(?![/\\])[^\s]*$/.test(link)) return link.slice(0, 300);
  try {
    const url = new URL(link);
    if (url.protocol === "https:") return url.toString().slice(0, 500);
  } catch {
    /* not a URL */
  }
  return null;
}

function minutes(seconds: number) {
  const m = Math.round(seconds / 60);
  return m >= 60 && m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minutes`;
}

/**
 * Announce papers that went live since the last check. Cheap when there is nothing to do (one indexed query);
 * at most one sweep per server instance every 20 s. Two instances racing can't announce a paper twice: the
 * `announcedAt IS NULL` claim and the unique paperId both guard it.
 */
export async function announceNewPapers({ force = false, paperId }: { force?: boolean; paperId?: string } = {}): Promise<number> {
  const now = Date.now();
  if (!force && !paperId && now - lastSweep < 20_000) return 0;
  if (!paperId) lastSweep = now;

  const ready = await prisma.paper.findMany({
    where: {
      announcedAt: null,
      isActive: true,
      totalQuestions: { gt: 0 },
      exam: { isActive: true },
      // "Announce now" from the admin page skips the quiet wait.
      ...(paperId ? { id: paperId } : { updatedAt: { lt: new Date(now - QUIET_MS) } }),
    },
    select: {
      id: true,
      title: true,
      year: true,
      totalQuestions: true,
      durationSeconds: true,
      examPattern: true,
      exam: { select: { name: true } },
    },
    take: 20,
  });

  let made = 0;
  for (const p of ready) {
    const surprise = isSurprisePaper(p);
    const name = surprise || p.title.toLowerCase().includes(p.exam.name.toLowerCase()) ? p.title : `${p.exam.name} ${p.title}`;
    const title = `New paper released: ${name}`.slice(0, TITLE_MAX);
    const body = `${name} is now live — ${p.totalQuestions} questions, ${minutes(p.durationSeconds)}. You can give the test now.`;
    try {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.paper.updateMany({ where: { id: p.id, announcedAt: null }, data: { announcedAt: new Date() } });
        if (claimed.count !== 1) return;
        await tx.notification.create({ data: { kind: "PAPER", title, body, link: `/papers/${p.id}`, paperId: p.id } });
        made++;
      });
    } catch (err) {
      // A unique-paperId clash means another instance announced it first.
      console.warn(`announceNewPapers: ${p.id} skipped:`, err instanceof Error ? err.message : err);
    }
  }
  return made;
}

export interface FeedItem {
  id: string;
  kind: "PAPER" | "CUSTOM";
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  unread: boolean;
}

/** What a signed-in user sees in the bell: the latest notifications meant for them, newest first. */
export async function getFeed(userId: string): Promise<{ unread: number; items: FeedItem[] }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true, notificationsSeenAt: true } });
  if (!user) return { unread: 0, items: [] };
  // Messages from before the account existed are shown, but never as unread.
  const seen = user.notificationsSeenAt && user.notificationsSeenAt > user.createdAt ? user.notificationsSeenAt : user.createdAt;

  const rows = await prisma.notification.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - FEED_DAYS * 24 * 3600 * 1000) },
      AND: [
        { OR: [{ audience: "ALL" }, { recipients: { some: { userId } } }] },
        // A paper that was taken down again drops out of the bell.
        { OR: [{ paperId: null }, { paper: { isActive: true, exam: { isActive: true } } }] },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: FEED_LIMIT,
    select: { id: true, kind: true, title: true, body: true, link: true, createdAt: true },
  });
  const items = rows.map((n) => ({
    id: n.id,
    kind: n.kind === "PAPER" ? ("PAPER" as const) : ("CUSTOM" as const),
    title: n.title,
    body: n.body,
    link: n.link,
    createdAt: n.createdAt.toISOString(),
    unread: n.createdAt > seen,
  }));
  return { unread: items.filter((i) => i.unread).length, items };
}

export async function markFeedSeen(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { notificationsSeenAt: new Date() } });
}
