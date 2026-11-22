// Display helpers for the admin panel. Dates are always shown in Indian time so the server (UTC on Vercel)
// and the browser render the same text.
export const ADMIN_TIME_ZONE = "Asia/Kolkata";

const dateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: ADMIN_TIME_ZONE, day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: ADMIN_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: ADMIN_TIME_ZONE, hour: "numeric", minute: "2-digit" });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: ADMIN_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const shortDayFmt = new Intl.DateTimeFormat("en-IN", { timeZone: ADMIN_TIME_ZONE, day: "numeric", month: "short" });

type DateLike = Date | string | number;
const toDate = (d: DateLike) => (d instanceof Date ? d : new Date(d));

export const formatDate = (d: DateLike) => dateFmt.format(toDate(d));
export const formatDateTime = (d: DateLike) => dateTimeFmt.format(toDate(d));
export const formatTime = (d: DateLike) => timeFmt.format(toDate(d));
export const formatShortDay = (d: DateLike) => shortDayFmt.format(toDate(d));
/** YYYY-MM-DD of the day in Indian time. */
export const dayKey = (d: DateLike) => dayKeyFmt.format(toDate(d));

/** 1h 05m, 12m 30s, 45s */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds)) return "—";
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

/** Countdown text for a deadline: 12:05 or 1:02:05. */
export function formatClock(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** "just now", "3 min ago", "2 h ago" */
export function formatAgo(from: DateLike, now: number): string {
  const sec = Math.max(0, Math.floor((now - toDate(from).getTime()) / 1000));
  if (sec < 30) return "just now";
  if (sec < 3600) return `${Math.max(1, Math.floor(sec / 60))} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  return `${Math.floor(sec / 86400)} d ago`;
}

export const formatPercent = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v.toFixed(digits)}%`;

/** Marks: drops trailing .0 and shows at most two decimals. */
export const formatMarks = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : String(Math.round(v * 100) / 100);

export const isCompleted = (status: string) => status === "SUBMITTED" || status === "AUTO_SUBMITTED";
