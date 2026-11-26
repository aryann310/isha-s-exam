// The five question statuses used by computer-based entrance exams, drawn the same way everywhere.

export type PaletteStatus = "notVisited" | "notAnswered" | "answered" | "marked" | "answeredMarked";

export const PALETTE_LABELS: Record<PaletteStatus, string> = {
  notVisited: "Not Visited",
  notAnswered: "Not Answered",
  answered: "Answered",
  marked: "Marked for Review",
  answeredMarked: "Answered & Marked for Review (will be considered for evaluation)",
};

export const PALETTE_ORDER: PaletteStatus[] = ["answered", "notAnswered", "notVisited", "marked", "answeredMarked"];

const SHAPES: Record<PaletteStatus, string> = {
  notVisited: "bg-st-not-visited text-gray-900 border border-st-not-visited-line rounded-[4px]",
  notAnswered: "bg-white text-st-not-answered-text border-2 border-st-not-answered rounded-t-[14px] rounded-b-[4px]",
  answered: "bg-st-answered text-white border-2 border-st-answered rounded-t-[4px] rounded-b-[14px]",
  marked: "bg-st-marked text-white border-2 border-st-marked rounded-full",
  answeredMarked: "bg-st-marked text-white border-2 border-st-marked rounded-full",
};

export function PaletteSymbol({
  status,
  label,
  size = "md",
  current = false,
}: {
  status: PaletteStatus;
  label?: string | number;
  size?: "sm" | "md";
  current?: boolean;
}) {
  const dims = size === "sm" ? "w-7 h-7 text-[11px]" : "w-10 h-10 text-[13px]";
  return (
    <span
      className={`relative inline-flex items-center justify-center font-bold shrink-0 select-none ${dims} ${SHAPES[status]} ${
        current ? "ring-[3px] ring-offset-2 ring-exam-primary" : ""
      }`}
    >
      {label}
      {status === "answeredMarked" && (
        <span aria-hidden className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-st-answered border-2 border-white" />
      )}
    </span>
  );
}

export function paletteStatus(r: { visited: boolean; answer: string | null; markedForReview: boolean } | undefined): PaletteStatus {
  if (!r || !r.visited) return "notVisited";
  const answered = r.answer !== null && r.answer !== "";
  if (answered && r.markedForReview) return "answeredMarked";
  if (r.markedForReview) return "marked";
  if (answered) return "answered";
  return "notAnswered";
}
