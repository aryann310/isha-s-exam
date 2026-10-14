export interface ParsedMarkdownQuestion {
  questionNumber: number;
  section: string | null;
  topic: string | null;
  difficulty: string;
  questionText: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctAnswer: string;
  explanation: string;
}

export function parseQuestionOptions(raw?: string | Record<string, any> | any[] | null): Record<string, string> {
  const fallback: Record<string, string> = { A: "", B: "", C: "", D: "" };
  if (!raw) return fallback;

  let parsed: any = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  if (Array.isArray(parsed)) {
    return {
      A: String(parsed[0] ?? ""),
      B: String(parsed[1] ?? ""),
      C: String(parsed[2] ?? ""),
      D: String(parsed[3] ?? ""),
    };
  }

  if (typeof parsed === "object" && parsed !== null) {
    return {
      A: String(parsed.A ?? parsed.a ?? parsed.optionA ?? parsed["1"] ?? ""),
      B: String(parsed.B ?? parsed.b ?? parsed.optionB ?? parsed["2"] ?? ""),
      C: String(parsed.C ?? parsed.c ?? parsed.optionC ?? parsed["3"] ?? ""),
      D: String(parsed.D ?? parsed.d ?? parsed.optionD ?? parsed["4"] ?? ""),
    };
  }

  return fallback;
}


export function parseMarkdownQuestions(markdown: string): ParsedMarkdownQuestion[] {
  const normalized = markdown.replace(/\r\n/g, "\n");

  let rawBlocks = normalized
    .split(/\n\s*---\s*(?:\n|$)/g)
    .map((b) => b.trim())
    .filter(Boolean);

  if (rawBlocks.length <= 1 && normalized.includes("###")) {
    const splitByHeader = normalized.split(/(?=\n\s*###\s*(?:Question|Q)\s*\d+)/i);
    if (splitByHeader.length > 1) {
      rawBlocks = splitByHeader.map((b) => b.trim()).filter(Boolean);
    }
  }

  const questions: ParsedMarkdownQuestion[] = [];
  let autoNum = 1;

  const optionLineRegex = /^[ \t]*(?:[-*+]|[0-9]+\.)?[ \t]*(?:\*\*|__)?(?:Option\s+)?\(?([A-Da-d])\)?(?:\*\*|__)?(?:\s*(?:[\.:\)\-–—]|(?:\*\*|__))|\s+)[ \t]*(.*)$/;

  for (const block of rawBlocks) {
    const qNumMatch = block.match(/###\s*(?:Question|Q)\s*(\d+)/i);
    const questionNumber = qNumMatch ? parseInt(qNumMatch[1], 10) : autoNum;

    // Extract metadata
    const sectionMatch =
      block.match(/(?:-\s*)?\*\*(?:Section)\*\*:\s*([^\n]+)/i) ||
      block.match(/^Section:\s*([^\n]+)/im);
    const topicMatch =
      block.match(/(?:-\s*)?\*\*(?:Topic)\*\*:\s*([^\n]+)/i) ||
      block.match(/^Topic:\s*([^\n]+)/im);
    const diffMatch =
      block.match(/(?:-\s*)?\*\*(?:Difficulty)\*\*:\s*([^\n]+)/i) ||
      block.match(/^Difficulty:\s*([^\n]+)/im);

    const section = sectionMatch ? sectionMatch[1].trim() : null;
    const topic = topicMatch ? topicMatch[1].trim() : null;
    const difficulty = diffMatch ? diffMatch[1].trim() : "Medium";

    // Parse lines cleanly into questionText, options, and explanation
    const lines = block.split(/\r?\n/);
    const questionLines: string[] = [];
    const options = { A: "", B: "", C: "", D: "" };
    let currentOptionKey: "A" | "B" | "C" | "D" | null = null;
    let sectionState: "QUESTION" | "OPTIONS" | "EXPLANATION" = "QUESTION";
    const explanationLines: string[] = [];
    let correctAnswer = "A";

    // Extract explicit correct answer if present
    const correctMatch = block.match(
      /(?:\*\*Correct Answer:\*\*|Correct Answer:|Answer:)\s*\(?([A-Da-d])\)?/i
    );
    if (correctMatch) {
      correctAnswer = correctMatch[1].toUpperCase();
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip header line (### Question X)
      if (/^###\s*/i.test(trimmed)) continue;

      // Skip metadata lines
      if (/^[-*+]?\s*\*\*(?:Section|Topic|Difficulty)\*\*:/i.test(trimmed) ||
          /^(?:Section|Topic|Difficulty):/i.test(trimmed)) {
        continue;
      }

      // Check for Explanation header
      const expHeaderMatch = trimmed.match(/^(?:\*\*)?(?:Explanation|Solution):?(?:\*\*)?\s*(.*)$/i);
      if (expHeaderMatch) {
        sectionState = "EXPLANATION";
        currentOptionKey = null;
        if (expHeaderMatch[1]) explanationLines.push(expHeaderMatch[1].trim());
        continue;
      }

      // Check for Correct Answer header
      if (/^(?:\*\*)?(?:Correct Answer|Answer):/i.test(trimmed)) {
        sectionState = "OPTIONS";
        currentOptionKey = null;
        continue;
      }

      // Check for Options header
      if (/^(?:\*\*)?Options:?(?:\*\*)?$/i.test(trimmed)) {
        sectionState = "OPTIONS";
        currentOptionKey = null;
        continue;
      }

      // Check if line is an Option line
      const optMatch = line.match(optionLineRegex);
      if (optMatch) {
        const key = optMatch[1].toUpperCase() as "A" | "B" | "C" | "D";
        const hasBulletOrParen = /^[ \t]*(?:[-*+]|[0-9]+\.)|\([A-Da-d]\)|(?:\*\*|__)[\(\[]?[A-Da-d]|Option\s+[A-D]/i.test(line);
        const hasDelimiter = /^[ \t]*(?:[-*+]|[0-9]+\.)?[ \t]*(?:\*\*|__)?\(?[A-Da-d]\)?(?:\*\*|__)?[\.:\)\-–—]/i.test(line);

        if (sectionState === "OPTIONS" || hasBulletOrParen || hasDelimiter) {
          sectionState = "OPTIONS";
          currentOptionKey = key;
          options[key] = optMatch[2].trim();
          continue;
        }
      }

      // Route line according to sectionState
      if (sectionState === "EXPLANATION") {
        explanationLines.push(line);
      } else if (sectionState === "OPTIONS") {
        if (currentOptionKey && trimmed) {
          options[currentOptionKey] = options[currentOptionKey]
            ? `${options[currentOptionKey]}\n${trimmed}`
            : trimmed;
        }
      } else {
        // QUESTION state
        const qHeaderMatch = trimmed.match(/^\*\*(?:Question):\*\*\s*(.*)$/i);
        if (qHeaderMatch) {
          if (qHeaderMatch[1]) questionLines.push(qHeaderMatch[1].trim());
        } else {
          questionLines.push(line);
        }
      }
    }

    const questionText = questionLines.join("\n").trim();
    const explanation = explanationLines.join("\n").trim();

    if (questionText || options.A) {
      questions.push({
        questionNumber,
        section,
        topic,
        difficulty,
        questionText,
        options,
        correctAnswer,
        explanation,
      });
      autoNum++;
    }
  }

  return questions;
}
