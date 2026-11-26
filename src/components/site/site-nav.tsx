"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Sparkles } from "lucide-react";

/** Student tabs in the site header: the exam list, the Surprise Test and the student's analytics. */
export function SiteNav() {
  const path = usePathname() ?? "";
  const surprise = path.startsWith("/surprise");
  const analytics = path.startsWith("/analytics");
  const exams = !surprise && path.startsWith("/exams");
  const tab = "inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors";
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
        <Sparkles className="w-4 h-4 hidden sm:block" aria-hidden />
        <span className="sm:hidden">Surprise</span>
        <span className="hidden sm:inline">Surprise Test</span>
      </Link>
      <Link
        href="/analytics"
        aria-current={analytics ? "page" : undefined}
        className={`${tab} ${analytics ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`}
      >
        <BarChart3 className="w-4 h-4 hidden sm:block" aria-hidden />
        <span className="sm:hidden">Analytics</span>
        <span className="hidden sm:inline">My analytics</span>
      </Link>
    </nav>
  );
}
