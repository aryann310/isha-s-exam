"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { BODY_MAX, TITLE_MAX, announceNewPapers, cleanLink } from "@/server/notifications";

type Result = { ok: true; sentTo?: number } | { ok: false; error: string };

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Unauthorized: Admin access required");
  return session;
}

function refresh() {
  try {
    revalidatePath("/admin/notifications");
  } catch {
    /* called outside a request (tests) */
  }
}

/** Send an admin-written message to every student, or to the chosen ones. */
export async function sendNotificationAction(input: {
  title: string;
  body: string;
  link?: string | null;
  audience: "ALL" | "SELECTED";
  userIds?: string[];
}): Promise<Result> {
  const session = await requireAdmin();
  const title = (input.title ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!title) return { ok: false, error: "Write a title." };
  if (title.length > TITLE_MAX) return { ok: false, error: `Keep the title under ${TITLE_MAX} characters.` };
  if (!body) return { ok: false, error: "Write the message." };
  if (body.length > BODY_MAX) return { ok: false, error: `Keep the message under ${BODY_MAX} characters.` };
  const rawLink = (input.link ?? "").trim();
  const link = cleanLink(rawLink);
  if (rawLink && !link) return { ok: false, error: "The link must be a page of this site (starting with /) or an https:// address." };

  const audience = input.audience === "SELECTED" ? "SELECTED" : "ALL";
  let userIds: string[] = [];
  if (audience === "SELECTED") {
    const wanted = [...new Set(input.userIds ?? [])];
    if (wanted.length === 0) return { ok: false, error: "Choose at least one student." };
    const found = await prisma.user.findMany({ where: { id: { in: wanted }, role: "STUDENT", isActive: true }, select: { id: true } });
    userIds = found.map((u) => u.id);
    if (userIds.length === 0) return { ok: false, error: "None of the chosen students can sign in any more." };
  }

  await prisma.notification.create({
    data: {
      kind: "CUSTOM",
      title,
      body,
      link,
      audience,
      createdBy: (session.username as string) || (session.name as string) || "Admin",
      ...(audience === "SELECTED" ? { recipients: { create: userIds.map((userId) => ({ userId })) } } : {}),
    },
  });
  const sentTo = audience === "ALL" ? await prisma.user.count({ where: { role: "STUDENT", isActive: true } }) : userIds.length;
  refresh();
  return { ok: true, sentTo };
}

/** Take a notification back: it disappears from every student's bell. A paper stays announced (no resend). */
export async function deleteNotificationAction(id: string): Promise<Result> {
  await requireAdmin();
  await prisma.notification.deleteMany({ where: { id } });
  refresh();
  return { ok: true };
}

/** Announce a live paper now instead of waiting for the quiet period. */
export async function announcePaperNowAction(paperId: string): Promise<Result> {
  await requireAdmin();
  const made = await announceNewPapers({ paperId });
  refresh();
  return made ? { ok: true } : { ok: false, error: "This paper is already announced, or students can't see it yet." };
}
