// The bell's data: GET = latest notifications for the signed-in user (also announces papers that just went
// live), POST = mark them all read.
import { getSession } from "@/lib/auth/session";
import { announceNewPapers, getFeed, markFeedSeen } from "@/server/notifications";
import { purgeExpiredPapers } from "@/server/paper-expiry";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Please sign in again." }, { status: 401, headers: noStore });
  await purgeExpiredPapers();
  try {
    await announceNewPapers();
  } catch (err) {
    // The feed still works if announcing fails; it is retried on the next check.
    console.error("announceNewPapers failed:", err);
  }
  return Response.json(await getFeed(session.userId), { headers: noStore });
}

export async function POST() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Please sign in again." }, { status: 401, headers: noStore });
  await markFeedSeen(session.userId);
  return new Response(null, { status: 204, headers: noStore });
}
