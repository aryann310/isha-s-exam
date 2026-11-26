// Small presentational building blocks shared by the admin pages. Server-safe (no client hooks).
import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, description, action, children, className = "", bodyClassName = "p-5" }: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(28,31,35,0.04)] ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, href, tone = "default" }: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "default" | "live";
}) {
  const body = (
    <>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-tight ${tone === "live" ? "text-rose-600" : "text-slate-900"}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  );
  const cls = "block rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(28,31,35,0.04)]";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-slate-300`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const BADGE_TONES = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
} as const;
export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({ tone = "gray", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "IN_PROGRESS") return <Badge tone="amber">In progress</Badge>;
  if (status === "AUTO_SUBMITTED") return <Badge tone="gray">Auto-submitted</Badge>;
  if (status === "SUBMITTED") return <Badge tone="green">Submitted</Badge>;
  return <Badge>{status}</Badge>;
}

export function ModeBadge({ mode }: { mode: string }) {
  return mode === "MOCK" ? <Badge tone="violet">Mock</Badge> : <Badge tone="blue">Practice</Badge>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function ProgressBar({ value, tone = "slate" }: { value: number; tone?: "slate" | "green" | "red" | "amber" }) {
  const color = { slate: "bg-slate-800", green: "bg-emerald-500", red: "bg-rose-500", amber: "bg-amber-500" }[tone];
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Simple vertical bar chart (SVG). Each bar shows its value on hover via <title>. */
export function BarChart({ data, height = 160, valueLabel = "" }: {
  data: { label: string; value: number; secondary?: number }[];
  height?: number;
  valueLabel?: string;
}) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.secondary ?? 0)));
  const barW = 100 / Math.max(1, data.length);
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1="0" x2="100" y1={height - f * (height - 4)} y2={height - f * (height - 4)} stroke="#efefec" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
        ))}
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 4);
          const h2 = d.secondary !== undefined ? (d.secondary / max) * (height - 4) : 0;
          const x = i * barW + barW * 0.15;
          const w = barW * 0.7;
          return (
            <g key={i}>
              <title>{`${d.label}: ${d.value}${valueLabel}${d.secondary !== undefined ? ` (${d.secondary} completed)` : ""}`}</title>
              <rect x={x} y={height - h} width={w} height={Math.max(h, d.value > 0 ? 1 : 0)} rx="0.6" fill="#d0d0ca" />
              {d.secondary !== undefined && <rect x={x} y={height - h2} width={w} height={Math.max(h2, d.secondary > 0 ? 1 : 0)} rx="0.6" fill="#1c1f23" />}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-slate-500">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export const tableCls = {
  table: "w-full text-left text-sm",
  thead: "border-b border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-500",
  th: "px-4 py-2.5 font-medium whitespace-nowrap",
  tbody: "divide-y divide-slate-100",
  tr: "hover:bg-slate-50/70",
  td: "px-4 py-3 align-middle",
};

export const btnCls = {
  primary: "inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50",
  secondary: "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50",
  danger: "inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50",
  ghost: "inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50",
};
