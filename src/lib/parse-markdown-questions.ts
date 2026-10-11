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

export function parseMarkdownQuestions(markdown: string): ParsedMarkdownQuestion[] {
  const normalized = markdown.replace(/\r\n/g, "\n");
  
  // Split on delimiters: `---` or blocks starting with `### Question`
  let rawBlocks = normalized
    .split(/\n\s*---\s*(?:\n|$)/g)
    .map((b) => b.trim())
    .filter(Boolean);

  // If there are no `---` separators, try splitting on `### Question`
  if (rawBlocks.length <= 1 && normalized.includes("###")) {
    const splitByHeader = normalized.split(/(?=\n\s*###\s*(?:Question|Q)\s*\d+)/i);
    if (splitByHeader.length > 1) {
      rawBlocks = splitByHeader.map((b) => b.trim()).filter(Boolean);
    }
  }

  const questions: ParsedMarkdownQuestion[] = [];
  let autoNum = 1;

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

    // Extract Question Text
    let questionText = "";
    const qTextMatch = block.match(
      /\*\*(?:Question):\*\*\s*([\s\S]*?)(?=\n\s*(?:-\s*)?(?:\*\*(?:Options):\*\*|\(?\s*[A-D]\s*[\)\.]))/i
    );
    if (qTextMatch) {
      questionText = qTextMatch[1].trim();
    } else {
      // If no explicit **Question:** header, strip metadata lines and stop at Options
      const lines = block.split("\n");
      const contentLines: string[] = [];

      for (const line of lines) {
        if (/^###\s*/i.test(line) || /^\s*-\s*\*\*(?:Section|Topic|Difficulty)/i.test(line)) {
          continue;
        }
        if (/^\s*(?:\*\*(?:Options):\*\*|[-*]?\s*\(?[A-D]\)[\s\.:])/i.test(line)) {
          break;
        }
        contentLines.push(line);
      }
      questionText = contentLines.join("\n").trim();
    }

    // Extract Options A, B, C, D
    const options = { A: "", B: "", C: "", D: "" };
    const optAMatch = block.match(
      /(?:-\s*)?\(?A\)?[\s\.:\)]+([^\n]+(?:\n(?!\s*[-*]?\s*\(?[B-D]\)?|\s*\*\*(?:Correct Answer|Explanation))[^\n]+)*)/i
    );
    const optBMatch = block.match(
      /(?:-\s*)?\(?B\)?[\s\.:\)]+([^\n]+(?:\n(?!\s*[-*]?\s*\(?[C-D]\)?|\s*\*\*(?:Correct Answer|Explanation))[^\n]+)*)/i
    );
    const optCMatch = block.match(
      /(?:-\s*)?\(?C\)?[\s\.:\)]+([^\n]+(?:\n(?!\s*[-*]?\s*\(?[D]\)?|\s*\*\*(?:Correct Answer|Explanation))[^\n]+)*)/i
    );
    const optDMatch = block.match(
      /(?:-\s*)?\(?D\)?[\s\.:\)]+([^\n]+(?:\n(?!\s*\*\*(?:Correct Answer|Explanation))[^\n]+)*)/i
    );

    if (optAMatch) options.A = optAMatch[1].trim();
    if (optBMatch) options.B = optBMatch[1].trim();
    if (optCMatch) options.C = optCMatch[1].trim();
    if (optDMatch) options.D = optDMatch[1].trim();

    // Extract Correct Answer
    const correctMatch = block.match(
      /(?:\*\*Correct Answer:\*\*|Correct Answer:|Answer:)\s*\(?([A-D])\)?/i
    );
    const correctAnswer = correctMatch ? correctMatch[1].toUpperCase() : "A";

    // Extract Explanation
    const expMatch = block.match(/(?:\*\*Explanation:\*\*|Explanation:)\s*([\s\S]*?)$/i);
    const explanation = expMatch ? expMatch[1].trim() : "";

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
