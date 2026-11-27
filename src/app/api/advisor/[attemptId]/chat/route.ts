// "Talk to your advisor" about one finished test, streamed back as plain text. The advisor sees the full TEST
// RECORD (questions, official answers and solutions, the student's answers and activity). Students only.
import { advisorSystem, loadTestContext } from "@/server/test-advisor";
import { chatError, readChatRequest, runAdvisorChat } from "@/server/advisor-chat";

export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const req = await readChatRequest(request);
  if (req instanceof Response) return req;

  const ctx = await loadTestContext(attemptId);
  if (!ctx || ctx.userId !== req.userId) return chatError(404, "Test not found.");
  if (!ctx.unlocked) return chatError(409, "Finish or skip the untimed phase first; the advisor opens with the solutions.");

  return runAdvisorChat({
    userId: req.userId,
    attemptId,
    message: req.message,
    system: async () => advisorSystem(ctx),
    refusalNote: "I can't help with that one. Ask me about this test, its questions or your preparation.",
  });
}
