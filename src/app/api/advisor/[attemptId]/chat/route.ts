// "Talk to your advisor": one chat turn about a finished test, streamed back as plain text.
// The advisor sees the full TEST RECORD (questions, official answers and solutions, the student's answers and
// activity) and the conversation so far. Students only; limited per day (see chatAllowance).
import Anthropic from "@anthropic-ai/sdk";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/auth/session";
import { ADVISOR_MODEL, advisorConfigured, advisorSystem, chatAllowance, friendlyError, loadTestContext } from "@/server/test-advisor";

export const maxDuration = 120;

const MAX_MESSAGE = 1500;
const HISTORY = 40;

const json = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const session = await decrypt((await cookies()).get("session")?.value);
  const userId = session && typeof session.userId === "string" ? session.userId : null;
  if (!userId) return json(401, "Please sign in again.");

  let message = "";
  try {
    message = String(((await request.json()) as { message?: unknown }).message ?? "").trim();
  } catch {
    return json(400, "Bad request.");
  }
  if (!message) return json(400, "Type a question first.");
  if (message.length > MAX_MESSAGE) return json(400, `Please keep your message under ${MAX_MESSAGE} characters.`);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
  if (!user?.isActive) return json(401, "Please sign in again.");
  const ctx = await loadTestContext(attemptId);
  if (!ctx || ctx.userId !== userId) return json(404, "Test not found.");
  if (!ctx.unlocked) return json(409, "Finish or skip the untimed phase first; the advisor opens with the solutions.");
  if (!advisorConfigured()) return json(503, "The advisor is not switched on yet. The admin needs to add the Anthropic API key.");

  const allowance = await chatAllowance(userId);
  if (allowance.left <= 0) return json(429, `You have used all ${allowance.limit} advisor messages for today. You can ask the admin for more.`);

  const history = await prisma.coachMessage.findMany({
    where: { attemptId },
    orderBy: { createdAt: "desc" },
    take: HISTORY,
    select: { role: true, content: true },
  });
  const messages: Anthropic.MessageParam[] = history
    .reverse()
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  // The conversation must start with the student and alternate; drop a leading advisor turn if history was cut.
  while (messages.length && messages[0].role === "assistant") messages.shift();
  messages.push({ role: "user", content: message });

  const saved = await prisma.coachMessage.create({ data: { attemptId, userId, role: "user", content: message } });

  const client = new Anthropic();
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = "";
      try {
        const stream = client.messages.stream({
          model: ADVISOR_MODEL,
          max_tokens: 16000,
          output_config: { effort: "high" },
          system: advisorSystem(ctx),
          messages,
        });
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          const note = "I can't help with that one. Ask me about this test, its questions or your preparation.";
          text += (text ? "\n\n" : "") + note;
          controller.enqueue(encoder.encode((text === note ? "" : "\n\n") + note));
        } else if (!text.trim()) {
          text = "Sorry, I could not write an answer. Please ask again.";
          controller.enqueue(encoder.encode(text));
        }
        await prisma.coachMessage.create({
          data: {
            attemptId,
            userId,
            role: "assistant",
            content: text,
            inputTokens: final.usage.input_tokens + (final.usage.cache_read_input_tokens ?? 0) + (final.usage.cache_creation_input_tokens ?? 0),
            outputTokens: final.usage.output_tokens,
          },
        });
      } catch (err) {
        console.error("advisor chat failed", err);
        // A failed turn does not count against the daily limit.
        await prisma.coachMessage.delete({ where: { id: saved.id } }).catch(() => undefined);
        controller.enqueue(encoder.encode(`${text ? "\n\n" : ""}⚠ ${friendlyError(err)}`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Message-Id": saved.id } });
}
