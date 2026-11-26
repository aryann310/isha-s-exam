import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { logoutAction } from "@/server/actions/auth";
import { SiteNav } from "@/components/site/site-nav";

/** Header for the student pages (main theme). */
export function SiteHeader({ name, isAdmin, back }: { name: string; isAdmin: boolean; back?: { href: string; label: string } }) {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 min-h-16 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-5 min-w-0">
          <Link href="/exams" className="flex items-center gap-2.5 font-semibold text-gray-900 shrink-0">
            <span className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center text-sm font-bold">M</span>
            <span className="hidden md:inline">Mock Test Portal</span>
          </Link>
          <SiteNav />
          {back && (
            <Link href={back.href} className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 truncate">
              <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden />
              {back.label}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          {isAdmin && (
            <Link href="/admin" className="font-semibold text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg">
              Admin
            </Link>
          )}
          <span className="hidden sm:flex items-center gap-2 text-gray-700">
            <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-900">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <span className="max-w-[10rem] truncate">{name}</span>
          </span>
          <form action={logoutAction}>
            <button className="text-gray-600 hover:text-gray-900 underline-offset-4 hover:underline">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
