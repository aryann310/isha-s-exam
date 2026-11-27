// Shared by the advisor chats (one test, or all of a student's tests on the analytics tab): reads the request,
// checks the daily limit, keeps the conversation, streams the reply back as plain text and saves both turns.
import Anthropic from "@anthropic-ai/sdk";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/auth/session";
import { anthropicClient } from "@/lib/anthropic";
import { ADVISOR_MODEL, advisorConfigured, chatAllowance, friendlyError } from "@/server/test-advisor";

const MAX_MESSAGE = 1500;
const HISTORY = 40;

export const chatError = (status: number, error: string) => Response.json({ error }, { status });

/** The signed-in, active student and their message, or an error response. */
export async function readChatRequest(request: Request): Promise<{ userId: string; message: string } | Response> {
  const session = await decrypt((await cookies()).get("session")?.value);
  const userId = session && typeof session.userId === "string" ? session.userId : null;
  if (!userId) return chatError(401, "Please sign in again.");
  let message = "";
  try {
    message = String(((await request.json()) as { message?: unknown }).message ?? "").trim();
  } catch {
    return chatError(400, "Bad request.");
  }
  if (!message) return chatError(400, "Type a question first.");
  if (message.length > MAX_MESSAGE) return chatError(400, `Please keep your message under ${MAX_MESSAGE} characters.`);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
  if (!user?.isActive) return chatError(401, "Please sign in again.");
  return { userId, message };
}

/**
 * One chat turn. `attemptId` null is the general chat (all tests). `system` builds the advisor's instructions and
 * record (only called once the limit check has passed, since building it reads the database).
 */
export async function runAdvisorChat(opts: {
  userId: string;
  attemptId: string | null;
  message: string;
  system: () => Promise<Anthropic.TextBlockParam[]>;
  refusalNote: string;
}): Promise<Response> {
  const { userId, attemptId, message } = opts;
  if (!advisorConfigured()) return chatError(503, "The advisor is not switched on yet. The admin needs to add the Anthropic API key.");
  const allowance = await chatAllowance(userId);
  if (allowance.left <= 0) return chatError(429, `You have used all ${allowance.limit} advisor chats for today. You can ask the admin for more.`);

  const [system, history] = await Promise.all([
    opts.system(),
    prisma.coachMessage.findMany({
      where: { userId, attemptId },
      orderBy: { createdAt: "desc" },
      take: HISTORY,
      select: { role: true, content: true },
    }),
  ]);
  const messages: Anthropic.MessageParam[] = history
    .reverse()
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  // The conversation must start with the student and alternate; drop a leading advisor turn if history was cut.
  while (messages.length && messages[0].role === "assistant") messages.shift();
  messages.push({ role: "user", content: message });

  const saved = await prisma.coachMessage.create({ data: { attemptId, userId, role: "user", content: message } });
  const client = anthropicClient();
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = "";
      try {
        const stream = client.messages.stream({ model: ADVISOR_MODEL, max_tokens: 16000, output_config: { effort: "high" }, system, messages });
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode((text ? "\n\n" : "") + opts.refusalNote));
          text += (text ? "\n\n" : "") + opts.refusalNote;
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
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
