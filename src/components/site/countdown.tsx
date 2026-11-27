"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Live countdown to `target` (ISO time). When it reaches zero the page refreshes, so whatever was waiting
 * (a scheduled test's Start button) appears without a reload.
 */
export function Countdown({ target, size = "md" }: { target: string; size?: "md" | "lg" }) {
  const router = useRouter();
  const end = new Date(target).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const done = now !== null && now >= end;
  useEffect(() => {
    if (done) {
      // Give the server a moment past the opening time, then show the opened test.
      const t = setTimeout(() => router.refresh(), 1500);
      return () => clearTimeout(t);
    }
  }, [done, router]);

  if (now === null) return <span className={size === "lg" ? "text-3xl font-bold tabular-nums" : "font-semibold tabular-nums"}>--:--:--</span>;
  if (done) return <span className="font-semibold">Opening now…</span>;

  const { d, h, m, s } = parts(end - now);
  const units = [
    ...(d ? [{ v: d, l: d === 1 ? "day" : "days" }] : []),
    { v: h, l: "hrs" },
    { v: m, l: "min" },
    { v: s, l: "sec" },
  ];
  if (size === "lg") {
    return (
      <span role="timer" aria-live="off" className="inline-flex gap-2 sm:gap-3">
        {units.map((u) => (
          <span key={u.l} className="flex flex-col items-center bg-white/10 rounded-lg px-3 py-2 min-w-[3.75rem]">
            <span className="text-3xl sm:text-4xl font-bold tabular-nums leading-none">{d && u.l.startsWith("day") ? u.v : pad(u.v)}</span>
            <span className="text-[11px] uppercase tracking-wide mt-1 opacity-80">{u.l}</span>
          </span>
        ))}
      </span>
    );
  }
  return (
    <span role="timer" aria-live="off" className="font-semibold tabular-nums">
      {d ? `${d}d ` : ""}
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}
