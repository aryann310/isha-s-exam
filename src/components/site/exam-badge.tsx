import type { ExamTheme } from "@/lib/exam-theme";

/** A small label in an exam's own colours and font (e.g. "CAT"), used in the main-theme pages. */
export function ExamBadge({ theme, children, className = "" }: { theme: ExamTheme; children: React.ReactNode; className?: string }) {
  return (
    <span
      data-exam-theme={theme}
      className={`inline-flex items-center rounded-md bg-exam-dark text-white font-exam font-bold text-xs leading-none px-2 py-1 ${className}`}
    >
      {children}
    </span>
  );
}
