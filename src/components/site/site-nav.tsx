"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

/** Student tabs in the site header: the exam list and the Surprise Test. */
export function SiteNav() {
  const path = usePathname() ?? "";
  const surprise = path.startsWith("/surprise");
  const exams = !surprise && path.startsWith("/exams");
  const tab = "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors";
  return (
    <nav aria-label="Sections" className="flex items-center gap-1">
      <Link
        href="/exams"
        aria-current={exams ? "page" : undefined}
        className={`${tab} ${exams ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`}
      >
        Exams
      </Link>
      <Link
        href="/surprise"
        aria-current={surprise ? "page" : undefined}
        data-exam-theme="surprise"
        className={`${tab} ${surprise ? "bg-exam-primary text-white" : "text-exam-primary hover:bg-exam-tint"}`}
      >
        <Sparkles className="w-4 h-4" aria-hidden />
        Surprise Test
      </Link>
    </nav>
  );
}
