"use server";

// Live proctor actions. Each one checks the admin session first; errors come back as values because
// production builds hide thrown messages from the browser.
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { loadAttemptContext } from "@/server/attempts";
import { getInspectData, getLiveSnapshot, type LiveSnapshot } from "@/server/admin-data";

type Fail = { ok: false; error: string };

async function adminSession() {
  const session = await getSession();
  return session && session.role === "ADMIN" ? session : null;
}

export async function adminLiveSnapshotAction(): Promise<{ ok: true; data: LiveSnapshot } | Fail> {
  if (!(await adminSession())) return { ok: false, error: "Your admin session has expired. Please log in again." };
  return { ok: true, data: await getLiveSnapshot() };
}

export async function adminInspectAttemptAction(attemptId: string) {
  if (!(await adminSession())) return { ok: false as const, error: "Your admin session has expired. Please log in again." };
  const data = await getInspectData(attemptId);
  return data ? { ok: true as const, data } : { ok: false as const, error: "This attempt no longer exists." };
}

/**
 * Adds time to a running attempt. The clock is brought up to date first, so on sectional papers (CAT, NMAT)
 * the minutes go to the section the student is actually in, not one that has already closed.
 */
export async function adminAddTimeAction(attemptId: string, minutes: number): Promise<{ ok: true } | Fail> {
  const session = await adminSession();
  if (!session) return { ok: false, error: "Your admin session has expired. Please log in again." };
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) return { ok: false, error: "Choose between 1 and 180 minutes." };

  const ctx = await loadAttemptContext(attemptId, session);
  if (!ctx) return { ok: false, error: "This attempt no longer exists." };
  if (ctx.attempt.status !== "IN_PROGRESS") return { ok: false, error: "This attempt has already ended, so time can't be added." };
  if (ctx.attempt.mode !== "MOCK") return { ok: false, error: "Practice sessions have no time limit." };

  const extra = minutes * 60;
  const base = ctx.timing.overallDeadline ?? ctx.attempt.endsAt ?? new Date();
  const endsAt = new Date(Math.max(base.getTime(), Date.now()) + extra * 1000);
  await prisma.attempt.update({
    where: { id: attemptId },
    data: ctx.timing.sectional
      ? {
          endsAt,
          currentSection: ctx.timing.currentSection,
          sectionStartedAt: ctx.timing.sectionStartedAt,
          sectionExtraSeconds: ctx.timing.sectionExtraSeconds + extra,
        }
      : { endsAt },
  });
  return { ok: true };
}
