// Receives batches of exam activity from the test screen (see src/components/exam/use-activity-log.ts).
// Only the signed-in candidate's own running mock (or one that ended moments ago, for the last batch) is accepted.
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/auth/session";

const KINDS = new Set(["start", "view", "pick", "key", "save", "hide", "show", "blur", "focus", "act", "calc", "submit", "palette"]);
const LATE_BATCH_MS = 5 * 60 * 1000;
const MAX_EVENTS = 500;

export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const session = await decrypt((await cookies()).get("session")?.value);
  const userId = session && typeof session.userId === "string" ? session.userId : null;
  if (!userId) return new Response(null, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const raw = (body as { events?: unknown })?.events;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_EVENTS) return new Response(null, { status: 400 });

  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, userId, mode: "MOCK" },
    select: { status: true, submittedAt: true },
  });
  if (!attempt) return new Response(null, { status: 404 });
  const open = attempt.status === "IN_PROGRESS" || (attempt.submittedAt && Date.now() - attempt.submittedAt.getTime() < LATE_BATCH_MS);
  if (!open) return new Response(null, { status: 409 });

  const now = Date.now();
  const events = raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .filter((e) => typeof e.t === "number" && Math.abs(now - (e.t as number)) < 7 * 24 * 3600 * 1000 && KINDS.has(String(e.k)))
    .map((e) => {
      const out: Record<string, unknown> = { t: Math.round(e.t as number), k: String(e.k) };
      if (typeof e.q === "string" && e.q.length <= 40) out.q = e.q;
      if (typeof e.v === "string") out.v = e.v.slice(0, 40);
      if (e.m === true) out.m = true;
      return out;
    });
  if (events.length) await prisma.attemptActivity.create({ data: { attemptId, events: JSON.stringify(events) } });
  return new Response(null, { status: 204 });
}
