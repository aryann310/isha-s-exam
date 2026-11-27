// "Talk to your advisor" on the analytics tab: about all of the student's tests, streamed back as plain text.
import { generalAdvisorSystem } from "@/server/general-advisor";
import { chatError, readChatRequest, runAdvisorChat } from "@/server/advisor-chat";
import { prisma } from "@/lib/prisma";

export const maxDuration = 120;

export async function POST(request: Request) {
  const req = await readChatRequest(request);
  if (req instanceof Response) return req;
  const finished = await prisma.attempt.count({ where: { userId: req.userId, status: { not: "IN_PROGRESS" } } });
  if (!finished) return chatError(409, "Finish a test first, then your advisor can look at your results.");

  return runAdvisorChat({
    userId: req.userId,
    attemptId: null,
    message: req.message,
    system: () => generalAdvisorSystem(req.userId),
    refusalNote: "I can't help with that one. Ask me about your tests, your results or your preparation.",
  });
}
