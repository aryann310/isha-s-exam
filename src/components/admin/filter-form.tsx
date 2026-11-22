"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition, type ReactNode } from "react";

/**
 * A GET filter form that applies itself as soon as a select changes (text inputs apply on Enter).
 * Empty values are left out of the URL; any page number is reset.
 */
export function FilterForm({ children, className = "" }: { children: ReactNode; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  const apply = (form: HTMLFormElement) => {
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(form)) if (typeof v === "string" && v.trim() && k !== "page") params.set(k, v.trim());
    const qs = params.toString();
    start(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  };

  return (
    <form
      className={`${className} ${pending ? "opacity-60" : ""} transition-opacity`}
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
      onChange={(e) => {
        if ((e.target as HTMLElement).tagName === "SELECT") apply(e.currentTarget);
      }}
    >
      {children}
    </form>
  );
}

export const filterFieldCls = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none";
