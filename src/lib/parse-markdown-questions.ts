export type OptionKey = "A" | "B" | "C" | "D" | "E";
/** Every option letter a question may have. A-D are always required; E is optional (NMAT has five options). */
export const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D", "E"];
export const REQUIRED_OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];

export function emptyOptions(): Record<OptionKey, string> {
  return { A: "", B: "", C: "", D: "", E: "" };
}

/** Options as stored and shown: A-D always, E only when it has text. */
export function compactOptions(options: Partial<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = { A: options.A ?? "", B: options.B ?? "", C: options.C ?? "", D: options.D ?? "" };
  if (options.E && options.E.trim()) out.E = options.E;
  return out;
}

/** The option letters a question actually offers (with text), in order. */
export function availableOptionKeys(options: Partial<Record<string, string>>): OptionKey[] {
  return OPTION_KEYS.filter((k) => !!options[k]?.trim());
}

export interface ParsedMarkdownQuestion {
  questionNumber: number;
  section: string | null;
  topic: string | null;
  difficulty: string;
  questionText: string;
  options: Record<OptionKey, string>;
  /** MCQ: "A"-"E". TITA: the typed answer. "" when the source has no recognisable answer line. Never guessed. */
  correctAnswer: string;
  /** "TITA" when declared with "- **Type**: TITA", or when the block has no options but has an answer value. */
  questionType: "MCQ" | "TITA";
  explanation: string;
  /** Problems the parser noticed in this block (missing answer, empty option, ...). */
  warnings: string[];
}

export function parseQuestionOptions(raw?: string | Record<string, unknown> | unknown[] | null): Record<string, string> {
  const fallback: Record<string, string> = { A: "", B: "", C: "", D: "" };
  if (!raw) return fallback;

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  if (Array.isArray(parsed)) {
    return compactOptions({
      A: String(parsed[0] ?? ""),
      B: String(parsed[1] ?? ""),
      C: String(parsed[2] ?? ""),
      D: String(parsed[3] ?? ""),
      E: String(parsed[4] ?? ""),
    });
  }

  if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    return compactOptions({
      A: String(obj.A ?? obj.a ?? obj.optionA ?? obj["1"] ?? ""),
      B: String(obj.B ?? obj.b ?? obj.optionB ?? obj["2"] ?? ""),
      C: String(obj.C ?? obj.c ?? obj.optionC ?? obj["3"] ?? ""),
      D: String(obj.D ?? obj.d ?? obj.optionD ?? obj["4"] ?? ""),
      E: String(obj.E ?? obj.e ?? obj.optionE ?? obj["5"] ?? ""),
    });
  }

  return fallback;
}

/** Removes AI citation artifacts such as "[cite: 69]" or "[cite: 12, 13]". */
export function stripCitations(text: string): string {
  return text.replace(/[ \t]*\[cite(?:_start|_end)?(?::[^\]\n]*)?\]/gi, "");
}

/** Normalised form of a question stem, used to spot repeated questions. */
export function questionFingerprint(text: string): string {
  return stripCitations(text)
    .toLowerCase()
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 160);
}

// ---------------------------------------------------------------------------
// Line classifiers
// ---------------------------------------------------------------------------

const QUESTION_HEADER = /^#{1,6}\s*(?:Question|Q)\s*\.?\s*(\d+)\b/i;
const SEPARATOR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const METADATA = /^[-*+]?\s*(?:\*\*|__)?\s*(Section|Topic|Sub-?topic|Difficulty|Question\s*Type|Type)\s*(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*(.*?)\s*(?:\*\*|__)?\s*$/i;
// "**Question:** text", "Question 3: text" or a bare "**Question**" line.
const QUESTION_LABEL = /^(?:\*\*|__)?\s*Question\s*\d*\s*(?:(?:\*\*|__)?\s*:\s*(?:\*\*|__)?|(?:\*\*|__)\s*$)\s*(.*)$/i;
const OPTIONS_HEADER = /^(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:Options|Choices|Answer Choices)\s*:?\s*(?:\*\*|__)?\s*:?\s*$/i;
// Needs a colon ("**Explanation:** ...") or to stand alone, so "Solution of x is ..." stays text.
const EXPLANATION_HEADER = /^(?:#{1,6}\s*)?[-*+]?\s*(?:\*\*|__)?\s*(?:Explanation|Solution|Detailed Solution)\s*(?:(?:\*\*|__)?\s*:\s*(?:\*\*|__)?|(?:\*\*|__)?\s*$)\s*(.*)$/i;
// "Answer: C", "**Correct Answer:** (C) threatened", "Ans. B" — but not "Answer: Both A and B".
const ANSWER_LABEL = String.raw`^[-*+]?\s*(?:\*\*|__)?\s*(?:(?:Correct\s+(?:Answer|Option)|Answer|Ans)\s*(?:\*\*|__)?\s*[:\-–—]|Ans\.\s*(?:\*\*|__)?\s*:?)\s*(?:\*\*|__)?\s*`;
const ANSWER_LINE = new RegExp(ANSWER_LABEL + String.raw`(?:Option\s*)?[(\[]?([A-Ea-e])[)\]]?(?![A-Za-z0-9])`, "i");
const ANSWER_LABEL_ONLY = new RegExp(ANSWER_LABEL + "$", "i");
// Any other "Answer: ..." line — it still ends the options, but the letter can't be trusted.
const ANSWER_UNPARSED = new RegExp(ANSWER_LABEL, "i");
// The whole value after an answer label, for typed (TITA) answers like "**Correct Answer:** 42".
const ANSWER_VALUE = new RegExp(ANSWER_LABEL + String.raw`(.+?)\s*$`, "i");

function cleanTypedAnswer(value: string): string {
  return value.replace(/^(?:\*\*|__)|(?:\*\*|__)$/g, "").replace(/[.;]+$/, "").trim();
}

// An option line with an explicit marker: "(A) x", "- (a) x", "A) x", "A. x", "A: x", "[A] x",
// "Option A: x", "**A.** x", "**(A)** x". Lowercase is only accepted with "(a)" or "a)". E is an optional fifth option.
const STRONG_OPTION =
  /^\s*(?:[-*+]\s+|\d+\.\s+)?(?:\*\*|__)?\s*(?:Option\s+([A-Ea-e])\s*[.:)\-–—]?|\(([A-Ea-e])\)|\[([A-E])\]|([A-E])\s*[.):]|([a-e])\))\s*(?:\*\*|__)?\s*(.*)$/;
// "A 12" — only trusted right after an explicit Options header.
const WEAK_OPTION = /^\s*(?:[-*+]\s+)?([A-E])\s+(.+)$/;
// "(A) one (B) two (C) three (D) four" on a single line.
const INLINE_OPTIONS = /^\s*(?:[-*+]\s+)?\(?A\)\s*(.+?)\s+\(?B\)\s*(.+?)\s+\(?C\)\s*(.+?)\s+\(?D\)\s*(.+?)\s*$/;

function matchStrongOption(line: string): { key: OptionKey; text: string } | null {
  const m = line.match(STRONG_OPTION);
  if (!m) return null;
  const letter = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5];
  if (!letter) return null;
  return { key: letter.toUpperCase() as OptionKey, text: cleanOptionText(m[6] ?? "") };
}

function matchInlineOptions(line: string): Record<OptionKey, string> | null {
  if (!/\(A\)/.test(line) || !/\(D\)/.test(line)) return null;
  const m = line.match(INLINE_OPTIONS);
  if (!m) return null;
  return { A: cleanOptionText(m[1]), B: cleanOptionText(m[2]), C: cleanOptionText(m[3]), D: cleanOptionText(m[4]), E: "" };
}

function cleanOptionText(text: string): string {
  let t = text.trim();
  // Unwrap a dangling bold marker left over from "**(A) text**".
  if (/^(?:\*\*|__)/.test(t) && !/(?:\*\*|__).+(?:\*\*|__)/.test(t)) t = t.replace(/^(?:\*\*|__)\s*/, "");
  if (/(?:\*\*|__)$/.test(t) && !/(?:\*\*|__).+(?:\*\*|__)$/.test(t)) t = t.replace(/\s*(?:\*\*|__)$/, "");
  return t.trim();
}

// ---------------------------------------------------------------------------
// Block splitting
// ---------------------------------------------------------------------------

function splitIntoBlocks(text: string): Array<{ number: number | null; lines: string[] }> {
  const lines = text.split("\n");
  const hasQuestionHeaders = lines.some((l) => QUESTION_HEADER.test(l.trim()));

  const blocks: Array<{ number: number | null; lines: string[] }> = [];

  if (hasQuestionHeaders) {
    // Every "### Question N" starts a block; anything before the first one (titles, notes) is ignored.
    let current: { number: number | null; lines: string[] } | null = null;
    for (const line of lines) {
      const h = line.trim().match(QUESTION_HEADER);
      if (h) {
        current = { number: parseInt(h[1], 10), lines: [] };
        blocks.push(current);
        continue;
      }
      if (current && !SEPARATOR.test(line)) current.lines.push(line);
    }
    return blocks;
  }

  let current: string[] = [];
  for (const line of lines) {
    if (SEPARATOR.test(line)) {
      blocks.push({ number: null, lines: current });
      current = [];
    } else {
      current.push(line);
    }
  }
  blocks.push({ number: null, lines: current });
  return blocks.filter((b) => b.lines.some((l) => l.trim()));
}

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

type LineKind =
  | { kind: "blank" }
  | { kind: "meta"; field: string; value: string }
  | { kind: "optionsHeader" }
  | { kind: "answer"; key: OptionKey }
  | { kind: "answerLabel" }
  | { kind: "answerUnparsed"; value: string }
  | { kind: "explanation"; rest: string }
  | { kind: "text"; line: string };

function classify(line: string): LineKind {
  const t = line.trim();
  if (!t) return { kind: "blank" };
  const meta = t.match(METADATA);
  if (meta) return { kind: "meta", field: meta[1].toLowerCase(), value: meta[2].trim() };
  if (OPTIONS_HEADER.test(t)) return { kind: "optionsHeader" };
  const ans = t.match(ANSWER_LINE);
  if (ans) return { kind: "answer", key: ans[1].toUpperCase() as OptionKey };
  if (ANSWER_LABEL_ONLY.test(t)) return { kind: "answerLabel" };
  if (ANSWER_UNPARSED.test(t)) return { kind: "answerUnparsed", value: cleanTypedAnswer(t.match(ANSWER_VALUE)?.[1] ?? "") };
  const exp = t.match(EXPLANATION_HEADER);
  if (exp) return { kind: "explanation", rest: exp[1].trim() };
  return { kind: "text", line };
}

function parseBlock(blockLines: string[], questionNumber: number): ParsedMarkdownQuestion | null {
  const warnings: string[] = [];
  let section: string | null = null;
  let topic: string | null = null;
  let difficulty = "Medium";
  let correctAnswer = "";
  let awaitingAnswerValue = false;
  let declaredType: "MCQ" | "TITA" | null = null;
  let rawAnswer: string | null = null;
  const applyMeta = (field: string, value: string) => {
    if (field.includes("type")) declaredType = /tita|type in|typed|numeric|non[- ]?mcq/i.test(value) ? "TITA" : "MCQ";
    else if (field === "section") section = value || section;
    else if (field === "difficulty") difficulty = value || difficulty;
    else topic = value || topic;
  };

  const kinds = blockLines.map(classify);

  // The body (question + options) ends at the first answer or explanation line.
  // Everything after it is explanation, so options are never read from there.
  let bodyEnd = kinds.findIndex((k) => k.kind === "answer" || k.kind === "answerLabel" || k.kind === "answerUnparsed" || k.kind === "explanation");
  if (bodyEnd === -1) bodyEnd = kinds.length;

  const explanationLines: string[] = [];
  for (let i = bodyEnd; i < kinds.length; i++) {
    const k = kinds[i];
    if (k.kind === "answer") {
      if (!correctAnswer) correctAnswer = k.key;
      else explanationLines.push(blockLines[i]);
      awaitingAnswerValue = false;
    } else if (k.kind === "answerLabel") {
      awaitingAnswerValue = true;
    } else if (k.kind === "answerUnparsed") {
      if (rawAnswer === null && k.value) rawAnswer = k.value;
      else explanationLines.push(blockLines[i]);
      awaitingAnswerValue = false;
    } else if (k.kind === "explanation") {
      awaitingAnswerValue = false;
      if (k.rest) explanationLines.push(k.rest);
    } else if (k.kind === "meta") {
      applyMeta(k.field, k.value);
    } else if (awaitingAnswerValue && k.kind === "text") {
      // "**Correct Answer:**" on one line and "C" on the next.
      const m = k.line.trim().match(/^(?:\*\*|__)?\s*(?:Option\s*)?[(\[]?([A-Ea-e])[)\]]?(?![A-Za-z0-9])/);
      if (m && !correctAnswer) correctAnswer = m[1].toUpperCase();
      else if (rawAnswer === null) rawAnswer = cleanTypedAnswer(k.line.trim());
      else explanationLines.push(blockLines[i]);
      awaitingAnswerValue = false;
    } else if (k.kind !== "blank" || explanationLines.length) {
      explanationLines.push(blockLines[i]);
    }
  }

  // Collect body lines, pulling metadata out wherever it sits.
  const body: Array<{ raw: string; kind: LineKind }> = [];
  for (let i = 0; i < bodyEnd; i++) {
    const k = kinds[i];
    if (k.kind === "meta") {
      applyMeta(k.field, k.value);
      continue;
    }
    body.push({ raw: blockLines[i], kind: k });
  }

  // Decide where the options start.
  const options: Record<OptionKey, string> = emptyOptions();
  const headerIdx = body.findIndex((b) => b.kind.kind === "optionsHeader");
  let questionPart: string[];
  let optionPart: string[];
  let weakAllowed = false;

  if (declaredType === "TITA") {
    questionPart = body.map((b) => b.raw);
    optionPart = [];
  } else if (headerIdx !== -1) {
    // Explicit "**Options:**" — everything above it is question text, including
    // lettered statements like "A) ... E) ..." that belong to the question.
    questionPart = body.slice(0, headerIdx).map((b) => b.raw);
    optionPart = body.slice(headerIdx + 1).map((b) => b.raw);
    weakAllowed = true;
  } else {
    // No header: options start at the last "A" marker whose run reaches D,
    // so lettered statements earlier in the question stay in the question.
    const raws = body.map((b) => b.raw);
    let start = -1;
    for (let i = raws.length - 1; i >= 0; i--) {
      if (matchInlineOptions(raws[i])) {
        start = i;
        break;
      }
      const opt = matchStrongOption(raws[i]);
      if (opt?.key === "A" && runReachesD(raws, i)) {
        start = i;
        break;
      }
    }
    if (start === -1) {
      for (let i = 0; i < raws.length; i++) {
        if (matchStrongOption(raws[i])?.key === "A") {
          start = i;
          break;
        }
      }
    }
    questionPart = start === -1 ? raws : raws.slice(0, start);
    optionPart = start === -1 ? [] : raws.slice(start);
  }

  // Read options strictly in order A, B, C, D. A line that is not the next expected
  // letter is a continuation of the current option, never an overwrite.
  let current: OptionKey | null = null;
  for (const raw of optionPart) {
    const t = raw.trim();
    if (!t) continue;

    if (current === null) {
      const inline = matchInlineOptions(raw);
      if (inline) {
        Object.assign(options, inline);
        current = "D";
        continue;
      }
    }

    const nextKey: OptionKey | undefined = current === null ? "A" : OPTION_KEYS[OPTION_KEYS.indexOf(current) + 1];
    const strong = matchStrongOption(raw);
    if (nextKey && strong && strong.key === nextKey) {
      options[nextKey] = strong.text;
      current = nextKey;
      continue;
    }
    if (nextKey && weakAllowed && !strong) {
      const weak = raw.match(WEAK_OPTION);
      if (weak && weak[1] === nextKey) {
        options[nextKey] = cleanOptionText(weak[2]);
        current = nextKey;
        continue;
      }
    }

    if (current) {
      options[current] = options[current] ? `${options[current]}\n${t}` : t;
    } else {
      questionPart.push(raw);
    }
  }

  // Question text, without a leading "**Question:**" label.
  const qLines = [...questionPart];
  const firstIdx = qLines.findIndex((l) => l.trim());
  if (firstIdx !== -1) {
    const m = qLines[firstIdx].trim().match(QUESTION_LABEL);
    if (m) qLines[firstIdx] = m[1];
  }
  const questionText = qLines.join("\n").trim();
  const explanation = explanationLines.join("\n").trim();

  const noOptions = OPTION_KEYS.every((k) => !options[k]);
  const typedAnswer = rawAnswer ?? (declaredType === "TITA" ? correctAnswer : "");
  const questionType: "MCQ" | "TITA" = declaredType ?? (noOptions && typedAnswer ? "TITA" : "MCQ");

  if (questionType === "TITA") {
    if (!questionText) warnings.push("Question text is empty");
    if (!typedAnswer) warnings.push('No answer found for this typed-answer (TITA) question (expected "**Correct Answer:** 42")');
    return {
      questionNumber, section, topic, difficulty, questionText,
      options: emptyOptions(),
      correctAnswer: typedAnswer, questionType, explanation, warnings,
    };
  }

  // Titles, notes and other stray blocks: no options and no answer means it is not a question.
  if (noOptions && !correctAnswer) return null;

  if (!questionText) warnings.push("Question text is empty");
  for (const k of REQUIRED_OPTION_KEYS) {
    if (!options[k]) warnings.push(`Option ${k} is empty`);
  }
  if (correctAnswer && !options[correctAnswer as OptionKey]) {
    warnings.push(`The correct answer is ${correctAnswer}, but the question has no option ${correctAnswer}`);
  }
  if (!correctAnswer) {
    warnings.push(
      kinds.some((k) => k.kind === "answerUnparsed")
        ? "Answer line does not name a single option A-E"
        : "No correct answer found (expected a line like \"**Correct Answer:** C\")"
    );
  }

  return { questionNumber, section, topic, difficulty, questionText, options, correctAnswer, questionType, explanation, warnings };
}

function runReachesD(lines: string[], start: number): boolean {
  let expected = 0;
  for (let i = start; i < lines.length; i++) {
    const opt = matchStrongOption(lines[i]);
    if (opt && opt.key === OPTION_KEYS[expected]) {
      expected++;
      if (expected === 4) return true;
    }
  }
  return false;
}

export function parseMarkdownQuestions(markdown: string): ParsedMarkdownQuestion[] {
  const normalized = stripCitations(markdown.replace(/\r\n?/g, "\n"));
  const blocks = splitIntoBlocks(normalized);

  const questions: ParsedMarkdownQuestion[] = [];
  for (const block of blocks) {
    const number = block.number ?? questions.length + 1;
    const q = parseBlock(block.lines, number);
    if (q) questions.push(q);
  }
  return questions;
}
