// Each exam has its own look on its test screens (colours + font, defined in globals.css under
// [data-exam-theme]). Everything else in the portal uses the neutral main theme.

export type ExamTheme = "main" | "cat" | "nmat" | "snap" | "cmat" | "surprise";

const BY_PATTERN: Record<string, ExamTheme> = { CAT: "cat", NMAT: "nmat", SNAP: "snap", CMAT: "cmat", SURPRISE: "surprise" };

/** Theme for a paper, from its exam pattern; CUSTOM papers fall back to the exam's name. */
export function themeForPaper(paper: { examPattern?: string | null }, examName?: string | null): ExamTheme {
  return BY_PATTERN[(paper.examPattern ?? "").toUpperCase()] ?? themeForName(examName);
}

/** Theme for an exam: the pattern its papers use, else a CAT/NMAT/SNAP/CMAT word in its name. */
export function themeForExam(exam: { name: string; papers?: { examPattern?: string | null }[] }): ExamTheme {
  for (const p of exam.papers ?? []) {
    const t = BY_PATTERN[(p.examPattern ?? "").toUpperCase()];
    if (t) return t;
  }
  return themeForName(exam.name);
}

function themeForName(name: string | null | undefined): ExamTheme {
  const words = (name ?? "").toUpperCase().split(/[^A-Z]+/);
  // NMAT and CMAT first: "CAT" is not a substring match, but keep the order explicit anyway.
  for (const [word, theme] of [["NMAT", "nmat"], ["CMAT", "cmat"], ["SNAP", "snap"], ["CAT", "cat"]] as const) {
    if (words.includes(word)) return theme;
  }
  return "main";
}
