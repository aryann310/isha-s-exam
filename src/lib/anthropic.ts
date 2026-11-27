import Anthropic from "@anthropic-ai/sdk";

/**
 * The Anthropic API key for the AI advisor. Read from ANTHROPIC_API_KEY, or from "claudeexam", the name it was
 * saved under in Vercel (a saved secret's name can't be changed there).
 */
export function anthropicKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || process.env.claudeexam || undefined;
}

export function advisorKeyConfigured(): boolean {
  return !!anthropicKey();
}

export function anthropicClient(): Anthropic {
  return new Anthropic({ apiKey: anthropicKey() });
}
