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
  notVisited: "bg-gray-100 text-gray-900 border border-gray-400 rounded-[3px]",
  notAnswered: "bg-[#e5482f] text-white border border-[#c23a24] rounded-b-[14px] rounded-t-[3px]",
  answered: "bg-[#3d9b35] text-white border border-[#2f7d29] rounded-t-[14px] rounded-b-[3px]",
  marked: "bg-[#6a3fa0] text-white border border-[#57318a] rounded-full",
  answeredMarked: "bg-[#6a3fa0] text-white border border-[#57318a] rounded-full",
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
  const dims = size === "sm" ? "w-7 h-7 text-[11px]" : "w-10 h-10 text-sm";
  return (
    <span
      className={`relative inline-flex items-center justify-center font-bold shrink-0 select-none ${dims} ${SHAPES[status]} ${
        current ? "ring-2 ring-offset-1 ring-sky-500" : ""
      }`}
    >
      {label}
      {status === "answeredMarked" && (
        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#3d9b35] border border-white text-[8px] leading-none flex items-center justify-center">
          ✓
        </span>
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
