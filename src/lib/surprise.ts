// Surprise Test: short mixed papers (30 questions, 60 minutes) drawn from every subject and exam style.
// They live in their own exam (slug "surprise") and use the SURPRISE pattern; students reach them from the
// Surprise Test tab, not the exam list.

export const SURPRISE_EXAM_SLUG = "surprise";
export const SURPRISE_PATTERN = "SURPRISE";

export function isSurprisePaper(paper: { examPattern?: string | null }): boolean {
  return (paper.examPattern ?? "").toUpperCase() === SURPRISE_PATTERN;
}
