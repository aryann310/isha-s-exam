"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ChartColumn,
  ClipboardList,
  ExternalLink,
  FileText,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Radio,
  Upload,
  Users,
  X,
} from "lucide-react";

const NAV = [
  { group: "Monitor", items: [
    { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/admin/live", label: "Live proctor", icon: Radio, live: true },
    { href: "/admin/analytics", label: "Analytics", icon: ChartColumn },
    { href: "/admin/results", label: "Results", icon: ClipboardList },
  ] },
  { group: "Content", items: [
    { href: "/admin/exams", label: "Exams", icon: GraduationCap },
    { href: "/admin/papers", label: "Papers", icon: FileText },
    { href: "/admin/questions", label: "Questions", icon: ListChecks },
    { href: "/admin/import", label: "Bulk import", icon: Upload },
  ] },
  { group: "People", items: [{ href: "/admin/users", label: "Students", icon: Users }] },
];

export function AdminSidebar({ adminName, liveCount, logout }: { adminName: string; liveCount: number; logout: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(href + "/"));

  const nav = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {NAV.map((g) => (
        <div key={g.group}>
          <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">{g.group}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isActive(item.href, "exact" in item ? item.exact : false);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                      active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                    <span className="flex-1">{item.label}</span>
                    {"live" in item && item.live && liveCount > 0 && (
                      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 text-[11px] font-medium tabular-nums ${active ? "bg-white/15 text-white" : "bg-rose-50 text-rose-700"}`}>
                        <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
                        {liveCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-slate-200 p-3 space-y-1">
      <Link href="/exams" className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
        <ExternalLink className="size-4" strokeWidth={1.75} /> Student view
      </Link>
      <form action={logout}>
        <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
          <LogOut className="size-4" strokeWidth={1.75} /> Log out
        </button>
      </form>
      <p className="truncate px-2 pt-1 text-xs text-slate-400">Signed in as {adminName}</p>
    </div>
  );

  const brand = (
    <Link href="/admin" className="flex items-center gap-2">
      <span className="flex size-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white">EP</span>
      <span className="text-sm font-semibold text-slate-900">Exam Portal <span className="font-normal text-slate-400">Admin</span></span>
    </Link>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-14 items-center border-b border-slate-200 px-4">{brand}</div>
        {nav}
        {footer}
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        {brand}
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/30" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
              {brand}
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}
    </>
  );
}
