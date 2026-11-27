// Closing and auto-deleting papers. A closed paper (Paper.closedAt in the past) takes no new attempts and
// its solutions are open to every student. A paper whose Paper.deleteAt has passed is deleted together with
// its questions, attempts and notice (all cascade). Deletion is lazy: it runs when students or admins load
// the main pages or the notification bell polls (every minute), so a paper is gone within a minute or so
// of its time.
import { prisma } from "@/lib/prisma";

export function isPaperClosed(paper: { closedAt?: Date | null }, now = new Date()): boolean {
  return !!paper.closedAt && paper.closedAt.getTime() <= now.getTime();
}

/** Past its delete time (students no longer see it, even before the purge removes it). */
export function isPaperExpired(paper: { deleteAt?: Date | null }, now = new Date()): boolean {
  return !!paper.deleteAt && paper.deleteAt.getTime() <= now.getTime();
}

let lastPurge = 0;
const PURGE_EVERY_MS = 30_000;

/** Deletes papers whose deleteAt has passed. Cheap and throttled per server instance; never throws. */
export async function purgeExpiredPapers(): Promise<number> {
  const now = Date.now();
  if (now - lastPurge < PURGE_EVERY_MS) return 0;
  lastPurge = now;
  try {
    const { count } = await prisma.paper.deleteMany({ where: { deleteAt: { lte: new Date(now) } } });
    if (count) console.log(`purgeExpiredPapers: deleted ${count} paper(s) past their delete time`);
    return count;
  } catch (err) {
    console.error("purgeExpiredPapers failed:", err);
    return 0;
  }
}

/** Students never see a paper past its delete time, even before the purge has run. */
export const notExpired = () => ({ OR: [{ deleteAt: null }, { deleteAt: { gt: new Date() } }] });

/** "in 23 h", "in 40 min" — time left until a date. */
export function timeLeft(until: Date, now = new Date()): string {
  const mins = Math.max(1, Math.round((until.getTime() - now.getTime()) / 60_000));
  if (mins < 90) return `${mins} min`;
  return `${Math.round(mins / 60)} h`;
}
