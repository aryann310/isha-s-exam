"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, FileText, Megaphone, X } from "lucide-react";

interface Item {
  id: string;
  kind: "PAPER" | "CUSTOM";
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  unread: boolean;
}

const POLL_MS = 60_000;
const TOASTED_KEY = "notif-toasted";
const TOAST_MS = 15_000;

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

function readToasted() {
  try {
    return localStorage.getItem(TOASTED_KEY);
  } catch {
    return null;
  }
}
function writeToasted(id: string) {
  try {
    localStorage.setItem(TOASTED_KEY, id);
  } catch {
    /* private mode: the toast may show again, which is harmless */
  }
}

/** Opens a notification's link: portal paths in the same tab, outside addresses in a new one. */
function ItemLink({ item, className, children, onClick }: { item: Item; className: string; children: React.ReactNode; onClick?: () => void }) {
  if (!item.link) return null;
  if (item.link.startsWith("/")) {
    return (
      <Link href={item.link} className={className} onClick={onClick}>
        {children}
      </Link>
    );
  }
  return (
    <a href={item.link} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
      {children}
    </a>
  );
}

const cta = (item: Item) => (item.kind === "PAPER" ? "Give test →" : "Open →");

/** The bell in the site header: unread count, a panel with the latest messages, and a toast for a new one. */
export function NotificationBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<Item | null>(null);
  // On phones the panel is fixed to the screen, just under the bell (the header may wrap onto two rows).
  const [phoneTop, setPhoneTop] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number; items: Item[] };
      setLoaded(true);
      // While the panel is open the list stays as it is, so nothing jumps under the reader.
      if (openRef.current) return;
      setItems(data.items);
      setUnread(data.unread);
      const newest = data.items.find((i) => i.unread);
      if (newest && readToasted() !== newest.id) {
        writeToasted(newest.id);
        setToast(newest);
      }
    } catch {
      /* offline: try again on the next tick */
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    if (next && wrap.current) setPhoneTop(window.innerWidth < 640 ? wrap.current.getBoundingClientRect().bottom + 8 : null);
    setOpen(next);
    setToast(null);
    if (next && unread > 0) {
      setUnread(0);
      fetch("/api/notifications", { method: "POST" }).catch(() => {});
    }
    // Closing clears the "new" dots on what was just read.
    if (!next) setItems((list) => list.map((i) => (i.unread ? { ...i, unread: false } : i)));
  }

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
        className={`relative w-9 h-9 inline-flex items-center justify-center rounded-lg transition-colors ${open ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`}
      >
        <Bell className="w-[18px] h-[18px]" aria-hidden />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-st-not-answered text-white text-[10px] font-bold leading-[18px] text-center tabular-nums ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={phoneTop !== null ? { top: phoneTop } : undefined}
          className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-16 sm:top-full sm:mt-2 sm:w-96 z-50 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <p className="font-semibold text-gray-900">Notifications</p>
            <button type="button" onClick={toggle} className="text-gray-500 hover:text-gray-900" aria-label="Close notifications">
              <X className="w-4 h-4" aria-hidden />
            </button>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-600">
              {loaded ? "No notifications yet. You'll hear here when a new paper is released." : "Loading…"}
            </p>
          ) : (
            <ul className="max-h-[min(65vh,28rem)] overflow-y-auto divide-y divide-gray-100">
              {items.map((item) => {
                const Icon = item.kind === "PAPER" ? FileText : Megaphone;
                return (
                  <li key={item.id} className={`px-4 py-3.5 flex gap-3 ${item.unread ? "bg-gray-50" : ""}`}>
                    <span
                      className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${item.kind === "PAPER" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-800"}`}
                    >
                      <Icon className="w-4 h-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 flex items-start gap-1.5">
                        <span className="flex-1">{item.title}</span>
                        {item.unread && <span className="mt-1.5 w-2 h-2 shrink-0 rounded-full bg-st-not-answered" aria-label="New" />}
                      </p>
                      <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-line break-words">{item.body}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-3">
                        <span className="text-xs text-gray-500">{ago(item.createdAt)}</span>
                        <ItemLink item={item} onClick={() => setOpen(false)} className="text-sm font-semibold text-gray-900 hover:underline underline-offset-4">
                          {cta(item)}
                        </ItemLink>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {toast && !open && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:w-96 z-50 bg-gray-900 text-white rounded-2xl shadow-2xl p-4 flex gap-3"
        >
          <span className="w-9 h-9 shrink-0 rounded-full bg-white/15 flex items-center justify-center">
            {toast.kind === "PAPER" ? <FileText className="w-4 h-4" aria-hidden /> : <Megaphone className="w-4 h-4" aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{toast.title}</p>
            <p className="text-sm text-white/75 mt-0.5 line-clamp-3 break-words">{toast.body}</p>
            <div className="mt-2.5 flex items-center gap-2">
              <ItemLink item={toast} onClick={() => setToast(null)} className="text-sm font-semibold bg-white text-gray-900 hover:bg-gray-100 px-3 h-8 inline-flex items-center rounded-lg">
                {cta(toast)}
              </ItemLink>
              <button type="button" onClick={toggle} className="text-sm font-medium text-white/80 hover:text-white px-2 h-8">
                See all
              </button>
            </div>
          </div>
          <button type="button" onClick={() => setToast(null)} className="self-start text-white/60 hover:text-white" aria-label="Dismiss">
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
