// Exam pattern presets. Each paper picks one; the mock engine, timers and scoring follow it.
// Patterns describe the publicly documented exam rules (sections, timing, navigation, marking).

export type ExamPatternId = "CAT" | "CMAT" | "NMAT" | "SNAP" | "CUSTOM";
export type QuestionType = "MCQ" | "TITA";

export interface PatternSection {
  name: string;
  /** Lower-case fragments used to match a question's section name to this section. */
  aliases: string[];
  /** Minutes; only used by sectional patterns. */
  minutes: number;
}

export interface ExamPattern {
  id: ExamPatternId;
  label: string;
  summary: string;
  /** "overall": one clock, free movement. "sectional": each section has its own clock and is locked once left. */
  timing: "overall" | "sectional";
  /** Sectional only: "fixed" order, or the candidate chooses the order before starting. */
  sectionOrder: "fixed" | "candidate";
  /** Sectional only: may the candidate end a section before its time is up? */
  canSubmitSectionEarly: boolean;
  /** Overall only: may the candidate submit before the time is up? */
  canSubmitEarly: boolean;
  calculator: boolean;
  totalMinutes: number;
  marks: { correct: number; incorrect: number; unattempted: number; titaCorrect: number; titaIncorrect: number };
  sections: PatternSection[];
  instructions: string[];
}

const COMMON_INSTRUCTIONS = [
  "The clock is set on the server. The countdown timer at the top right of the screen shows the time remaining. When it reaches zero, the test ends by itself; you do not need to submit.",
  "The question palette on the right shows the status of every question using the symbols in the legend.",
  "Click a question number in the palette to go straight to that question. Doing so does NOT save the answer to the question you are on.",
  "Click Save & Next to save your answer and move on. Click Mark for Review & Next to save it, mark it for review and move on.",
  "A question that is answered and marked for review is still evaluated.",
  "Click Clear Response to remove the answer to the current question.",
];

export const EXAM_PATTERNS: Record<ExamPatternId, ExamPattern> = {
  CAT: {
    id: "CAT",
    label: "CAT",
    summary: "3 sections (VARC, DILR, QA), 40 minutes each, fixed order, no switching between sections. +3 / −1 for MCQs, no negative marking for TITA.",
    timing: "sectional",
    sectionOrder: "fixed",
    canSubmitSectionEarly: false,
    canSubmitEarly: false,
    calculator: true,
    totalMinutes: 120,
    marks: { correct: 3, incorrect: -1, unattempted: 0, titaCorrect: 3, titaIncorrect: 0 },
    sections: [
      { name: "Verbal Ability and Reading Comprehension", aliases: ["varc", "verbal", "reading"], minutes: 40 },
      { name: "Data Interpretation and Logical Reasoning", aliases: ["dilr", "data interpretation and logical", "logical reasoning", "di & lr", "di/lr"], minutes: 40 },
      { name: "Quantitative Ability", aliases: ["qa", "quant"], minutes: 40 },
    ],
    instructions: [
      "The sections are taken in the fixed order shown above, each with its own time limit (40 minutes each in the actual CAT).",
      "You cannot move to the next section before the current section's time is over, and you cannot return to a section once it ends.",
      "Some questions are multiple choice; others need you to type the answer (TITA) using the on-screen keypad.",
      "Each correct answer earns 3 marks. A wrong multiple-choice answer loses 1 mark. There is no negative marking for TITA questions.",
      "An on-screen calculator is available from the top bar.",
    ],
  },
  NMAT: {
    id: "NMAT",
    label: "NMAT",
    summary: "3 sections, 36 questions each, separately timed (Language 28, Quant 52, LR 40 minutes). Candidate chooses the section order. No negative marking.",
    timing: "sectional",
    sectionOrder: "candidate",
    canSubmitSectionEarly: true,
    canSubmitEarly: false,
    calculator: false,
    totalMinutes: 120,
    marks: { correct: 3, incorrect: 0, unattempted: 0, titaCorrect: 3, titaIncorrect: 0 },
    sections: [
      { name: "Language Skills", aliases: ["language", "english", "verbal"], minutes: 28 },
      { name: "Quantitative Skills", aliases: ["quant", "quantitative"], minutes: 52 },
      { name: "Logical Reasoning", aliases: ["logical", "reasoning"], minutes: 40 },
    ],
    instructions: [
      "Each section is timed separately (see the table above). Before you start, choose the order in which you will take them; the order cannot be changed later.",
      "You may end a section before its time is up. Unused time is not carried over to the next section.",
      "Once you leave a section you cannot return to it.",
      "Each correct answer earns 3 marks. There is no negative marking.",
    ],
  },
  CMAT: {
    id: "CMAT",
    label: "CMAT",
    summary: "5 sections × 20 questions, 180 minutes in total, move freely between sections. +4 / −1.",
    timing: "overall",
    sectionOrder: "fixed",
    canSubmitSectionEarly: true,
    canSubmitEarly: true,
    calculator: false,
    totalMinutes: 180,
    marks: { correct: 4, incorrect: -1, unattempted: 0, titaCorrect: 4, titaIncorrect: 0 },
    sections: [
      { name: "Quantitative Techniques and Data Interpretation", aliases: ["quant", "data interpretation"], minutes: 0 },
      { name: "Logical Reasoning", aliases: ["logical", "reasoning"], minutes: 0 },
      { name: "Language Comprehension", aliases: ["language", "english", "comprehension"], minutes: 0 },
      { name: "General Awareness", aliases: ["general awareness", "awareness", "gk"], minutes: 0 },
      { name: "Innovation and Entrepreneurship", aliases: ["innovation", "entrepreneurship"], minutes: 0 },
    ],
    instructions: [
      "There is one timer for the whole test and no time limit per section (180 minutes for 100 questions in the actual CMAT).",
      "Use the section tabs at the top to move between sections at any time.",
      "Each correct answer earns 4 marks. Each wrong answer loses 1 mark. Unanswered questions score 0.",
    ],
  },
  SNAP: {
    id: "SNAP",
    label: "SNAP",
    summary: "60 questions in 3 sections, 60 minutes in total, move freely between sections. +1 / −0.25.",
    timing: "overall",
    sectionOrder: "fixed",
    canSubmitSectionEarly: true,
    canSubmitEarly: true,
    calculator: false,
    totalMinutes: 60,
    marks: { correct: 1, incorrect: -0.25, unattempted: 0, titaCorrect: 1, titaIncorrect: 0 },
    sections: [
      { name: "General English", aliases: ["english", "verbal"], minutes: 0 },
      { name: "Analytical & Logical Reasoning", aliases: ["analytical", "logical", "reasoning"], minutes: 0 },
      { name: "Quantitative, Data Interpretation & Data Sufficiency", aliases: ["quant", "data interpretation", "data sufficiency"], minutes: 0 },
    ],
    instructions: [
      "There is one timer for the whole test and no time limit per section (60 minutes for 60 questions in the actual SNAP).",
      "Use the section tabs at the top to move between sections at any time.",
      "Each correct answer earns 1 mark. Each wrong answer loses 0.25 marks. Unanswered questions score 0.",
    ],
  },
  CUSTOM: {
    id: "CUSTOM",
    label: "Custom",
    summary: "One timer for the whole paper, free movement, marking as set on the paper.",
    timing: "overall",
    sectionOrder: "fixed",
    canSubmitSectionEarly: true,
    canSubmitEarly: true,
    calculator: false,
    totalMinutes: 60,
    marks: { correct: 4, incorrect: -1, unattempted: 0, titaCorrect: 4, titaIncorrect: 0 },
    sections: [],
    instructions: ["Use the section tabs, if any, to move between sections at any time."],
  },
};

export const PATTERN_IDS = Object.keys(EXAM_PATTERNS) as ExamPatternId[];

export function getPattern(id: string | null | undefined): ExamPattern {
  return EXAM_PATTERNS[(id ?? "CUSTOM") as ExamPatternId] ?? EXAM_PATTERNS.CUSTOM;
}

export function patternInstructions(p: ExamPattern): string[] {
  return [...p.instructions, ...COMMON_INSTRUCTIONS];
}

// ---------------------------------------------------------------------------
// Sections of a specific paper
// ---------------------------------------------------------------------------

export interface PaperSection {
  name: string;
  /** Seconds; null for overall-timed patterns. */
  durationSeconds: number | null;
}

/** Parses Paper.sectionConfig; returns null when absent or malformed. */
export function parseSectionConfig(raw: string | null | undefined): PaperSection[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const out: PaperSection[] = [];
    for (const s of parsed) {
      if (!s || typeof s.name !== "string" || !s.name.trim()) return null;
      const d = s.durationSeconds;
      out.push({ name: s.name.trim(), durationSeconds: typeof d === "number" && d > 0 ? Math.round(d) : null });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

function presetMinutesFor(pattern: ExamPattern, sectionName: string, index: number): number | null {
  if (pattern.timing !== "sectional") return null;
  const lower = sectionName.toLowerCase();
  const byName =
    pattern.sections.find((s) => s.name.toLowerCase() === lower) ??
    pattern.sections.find((s) => s.aliases.some((a) => lower.includes(a)));
  const preset = byName ?? pattern.sections[index];
  return preset ? preset.minutes : null;
}

/**
 * The sections of a paper, in exam order, with durations.
 * Uses Paper.sectionConfig when set; otherwise the sections found on the questions
 * (in question-number order), timed from the pattern preset.
 * Any section that has questions but is missing from the config is appended so no question is ever unreachable.
 */
export function resolvePaperSections(
  paper: { examPattern: string; sectionConfig: string | null; durationSeconds: number },
  questions: Array<{ section: string | null; questionNumber: number }>
): PaperSection[] {
  const pattern = getPattern(paper.examPattern);
  const sectional = pattern.timing === "sectional";
  const questionSections: string[] = [];
  for (const q of [...questions].sort((a, b) => a.questionNumber - b.questionNumber)) {
    const name = sectionKey(q.section);
    if (!questionSections.includes(name)) questionSections.push(name);
  }

  const configured = parseSectionConfig(paper.sectionConfig);
  const base: PaperSection[] = configured
    ? configured.map((s, i) => ({
        name: s.name,
        durationSeconds: sectional ? (s.durationSeconds ?? (presetMinutesFor(pattern, s.name, i) ?? 0) * 60) : null,
      }))
    : questionSections.map((name, i) => ({
        name,
        durationSeconds: sectional ? (presetMinutesFor(pattern, name, i) ?? 0) * 60 : null,
      }));

  const names = new Set(base.map((s) => s.name));
  for (const name of questionSections) {
    if (!names.has(name)) base.push({ name, durationSeconds: sectional ? 0 : null });
  }

  // Only sections that actually have questions take part in the exam.
  const sections = base.filter((s) => questionSections.includes(s.name));

  if (sectional) {
    // Sections without a usable duration share whatever is left of the paper's total time.
    const missing = sections.filter((s) => !s.durationSeconds);
    if (missing.length) {
      const used = sections.reduce((t, s) => t + (s.durationSeconds ?? 0), 0);
      const total = paper.durationSeconds || pattern.totalMinutes * 60;
      const share = Math.max(300, Math.floor(Math.max(0, total - used) / missing.length));
      for (const s of missing) s.durationSeconds = share;
    }
  }

  return sections;
}

export const GENERAL_SECTION = "General";

export function sectionKey(section: string | null | undefined): string {
  return section && section.trim() ? section.trim() : GENERAL_SECTION;
}

// ---------------------------------------------------------------------------
// Answers and marks
// ---------------------------------------------------------------------------

function normalizeTyped(value: string): string {
  return value.trim().replace(/\s+/g, "").replace(/,/g, "").toLowerCase();
}

/** TITA keys may list alternatives separated by "|", e.g. "12|12.0". Numbers compare by value. */
export function isAnswerCorrect(questionType: string, correctAnswer: string, selected: string | null | undefined): boolean {
  if (selected === null || selected === undefined || !String(selected).trim()) return false;
  if (questionType !== "TITA") return correctAnswer.trim().toUpperCase() === String(selected).trim().toUpperCase();
  const given = normalizeTyped(String(selected));
  return correctAnswer.split("|").some((alt) => {
    const want = normalizeTyped(alt);
    if (!want) return false;
    const a = Number(given);
    const b = Number(want);
    if (given !== "" && want !== "" && Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) < 1e-9;
    return given === want;
  });
}

export interface PaperMarks {
  correctMarks: number;
  incorrectMarks: number;
  unattemptedMarks: number;
  titaCorrectMarks: number | null;
  titaIncorrectMarks: number;
}

export function marksFor(paper: PaperMarks, questionType: string): { correct: number; incorrect: number } {
  if (questionType === "TITA") {
    return { correct: paper.titaCorrectMarks ?? paper.correctMarks, incorrect: paper.titaIncorrectMarks };
  }
  return { correct: paper.correctMarks, incorrect: paper.incorrectMarks };
}

export function parseQuestionTypeSafe(value: string | null | undefined): QuestionType {
  return value === "TITA" ? "TITA" : "MCQ";
}

export function isAnswered(selected: string | null | undefined): boolean {
  return selected !== null && selected !== undefined && String(selected).trim() !== "";
}
