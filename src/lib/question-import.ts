import {
  OPTION_KEYS,
  parseMarkdownQuestions,
  parseQuestionOptions,
  questionFingerprint,
  stripCitations,
  type OptionKey,
} from "./parse-markdown-questions";

export type ImportFormat = "json" | "csv" | "markdown";
export type ImportMode = "append" | "replace";

export interface ImportIssue {
  questionNumber: number | null;
  level: "error" | "warning";
  message: string;
}

export interface ImportPreviewItem {
  questionNumber: number;
  section: string | null;
  questionText: string;
  options: Record<OptionKey, string>;
  correctAnswer: string;
}

export interface ImportResult {
  success: boolean;
  dryRun: boolean;
  /** Questions parsed from the input. */
  count: number;
  created: number;
  updated: number;
  deleted: number;
  error?: string;
  issues: ImportIssue[];
  preview: ImportPreviewItem[];
}

export interface NormalizedQuestion {
  questionNumber: number;
  questionText: string;
  options: Record<OptionKey, string>;
  correctAnswer: string;
  explanation: string;
  section: string | null;
  topic: string | null;
  difficulty: string;
  /** Problems found while reading the source; each becomes a blocking error. */
  problems: string[];
}

export class ImportInputError extends Error {}

function cleanText(value: unknown): string {
  return stripCitations(String(value ?? "")).trim();
}

function cleanOptional(value: unknown): string | null {
  const v = cleanText(value);
  return v ? v : null;
}

function normalizeCorrectAnswer(value: unknown): string {
  const v = String(value ?? "")
    .trim()
    .replace(/^\(|\)$/g, "")
    .toUpperCase();
  return (OPTION_KEYS as string[]).includes(v) ? v : "";
}

function positiveInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** RFC 4180 CSV: quoted fields, "" escapes and line breaks inside quotes. */
export function parseCsvRows(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"' && raw[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && raw[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim()));
}

export function normalizeImport(rawData: string, format: ImportFormat): NormalizedQuestion[] {
  if (format === "markdown") {
    return parseMarkdownQuestions(rawData).map((q) => ({
      questionNumber: q.questionNumber,
      questionText: cleanText(q.questionText),
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: cleanText(q.explanation),
      section: cleanOptional(q.section),
      topic: cleanOptional(q.topic),
      difficulty: cleanText(q.difficulty) || "Medium",
      problems: q.warnings,
    }));
  }

  if (format === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      throw new ImportInputError("Invalid JSON: the text could not be parsed.");
    }
    const list: unknown[] | null = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { questions?: unknown }).questions)
        ? (parsed as { questions: unknown[] }).questions
        : null;
    if (!list) {
      throw new ImportInputError('Expected a JSON array of questions or an object with a "questions" array.');
    }

    return list.map((item, i) => {
      const q = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const opts = parseQuestionOptions(
        (q.options as Record<string, unknown> | unknown[] | string | undefined) ?? {
          A: q.optionA ?? q.option_a ?? q.a ?? "",
          B: q.optionB ?? q.option_b ?? q.b ?? "",
          C: q.optionC ?? q.option_c ?? q.c ?? "",
          D: q.optionD ?? q.option_d ?? q.d ?? "",
        }
      );
      const correctRaw = q.correctAnswer ?? q.correct_answer ?? q.answer;
      const correctAnswer = normalizeCorrectAnswer(correctRaw);
      return {
        questionNumber: positiveInt(q.questionNumber ?? q.question_number) ?? i + 1,
        questionText: cleanText(q.questionText ?? q.question),
        options: { A: cleanText(opts.A), B: cleanText(opts.B), C: cleanText(opts.C), D: cleanText(opts.D) },
        correctAnswer,
        explanation: cleanText(q.explanation),
        section: cleanOptional(q.section),
        topic: cleanOptional(q.topic),
        difficulty: cleanText(q.difficulty) || "Medium",
        problems: correctAnswer ? [] : [`Correct answer "${String(correctRaw ?? "")}" is not one of A, B, C, D`],
      };
    });
  }

  const rows = parseCsvRows(rawData);
  if (rows.length <= 1) throw new ImportInputError("CSV has no data rows.");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (row: string[], name: string, fallbackIndex: number) => {
    const idx = header.indexOf(name);
    return (idx !== -1 ? row[idx] : row[fallbackIndex]) ?? "";
  };
  return rows.slice(1).map((row, i) => {
    const correctRaw = col(row, "correct_answer", 8);
    const correctAnswer = normalizeCorrectAnswer(correctRaw);
    return {
      questionNumber: positiveInt(col(row, "question_number", 0)) ?? i + 1,
      section: cleanOptional(col(row, "section", 1)),
      topic: cleanOptional(col(row, "topic", 2)),
      questionText: cleanText(col(row, "question", 3)),
      options: {
        A: cleanText(col(row, "option_a", 4)),
        B: cleanText(col(row, "option_b", 5)),
        C: cleanText(col(row, "option_c", 6)),
        D: cleanText(col(row, "option_d", 7)),
      },
      correctAnswer,
      explanation: cleanText(col(row, "explanation", 9)),
      difficulty: cleanText(col(row, "difficulty", 10)) || "Medium",
      problems: correctAnswer ? [] : [`Correct answer "${correctRaw}" is not one of A, B, C, D`],
    };
  });
}

// Signs that source-file structure leaked into an option (the bug that corrupted earlier imports).
const LEAKED_METADATA =
  /(?:\*\*|__)\s*(?:Section|Topic|Difficulty|Options|Correct Answer|Explanation)\s*:?\s*(?:\*\*|__)|^#{1,6}\s|^\s*[-*]\s*(?:\*\*)?(?:Difficulty|Topic|Section)(?:\*\*)?\s*:/im;

/** Checks that need no database: completeness, numbering, leaked formatting. */
export function validateQuestions(questions: NormalizedQuestion[]): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const seenNumbers = new Set<number>();
  const seenStems = new Map<string, number>();

  for (const q of questions) {
    const n = q.questionNumber;
    const reported = new Set<string>();
    const err = (message: string) => {
      if (reported.has(message)) return;
      reported.add(message);
      issues.push({ questionNumber: n, level: "error", message });
    };
    const warn = (message: string) => issues.push({ questionNumber: n, level: "warning", message });

    // Anything the reader could not resolve blocks the import: it would show students a broken question.
    q.problems.forEach(err);
    if (!q.questionText) err("Question text is empty");
    for (const k of OPTION_KEYS) if (!q.options[k]) err(`Option ${k} is empty`);
    if (!q.correctAnswer && q.problems.length === 0) err("Correct answer must be A, B, C or D");

    if (seenNumbers.has(n)) err(`Question number ${n} appears more than once in this import`);
    seenNumbers.add(n);

    const stem = questionFingerprint(q.questionText);
    if (stem.length >= 25) {
      const prev = seenStems.get(stem);
      if (prev !== undefined) warn(`Same question text as Q${prev} in this import`);
      else seenStems.set(stem, n);
    }

    const values = OPTION_KEYS.map((k) => q.options[k].trim().toLowerCase()).filter(Boolean);
    if (new Set(values).size < values.length) warn("Two or more options have identical text");
    for (const k of OPTION_KEYS) {
      if (LEAKED_METADATA.test(q.options[k])) err(`Option ${k} contains formatting/metadata from the source file`);
      else if (q.options[k].length > 300) warn(`Option ${k} is unusually long (${q.options[k].length} characters)`);
    }
  }
  return issues;
}

export function toPreview(q: NormalizedQuestion): ImportPreviewItem {
  return {
    questionNumber: q.questionNumber,
    section: q.section,
    questionText: q.questionText.length > 220 ? `${q.questionText.slice(0, 220)}…` : q.questionText,
    options: q.options,
    correctAnswer: q.correctAnswer,
  };
}
