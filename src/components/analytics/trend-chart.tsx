import type { TestRow } from "@/server/student-analytics";
import { KIND_LABEL } from "@/server/student-analytics";

// Score as % of the paper's maximum, test by test (oldest on the left). Plain SVG, no client code.
const KIND_COLOR = { mock: "#1c1f23", practice: "#8e9094", surprise: "#b45309" } as const;

export function TrendChart({ tests }: { tests: TestRow[] }) {
  const points = tests.filter((t) => t.percent !== null);
  if (points.length < 2) {
    return <p className="text-sm text-gray-600">Finish one more test to see your trend.</p>;
  }
  const W = 640;
  const H = 220;
  const pad = { l: 40, r: 12, t: 12, b: 28 };
  const lo = Math.min(0, Math.floor(Math.min(...points.map((p) => p.percent!)) / 10) * 10);
  const hi = Math.max(50, Math.ceil(Math.max(...points.map((p) => p.percent!)) / 10) * 10);
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, points.length - 1);
  const y = (v: number) => pad.t + ((hi - v) * (H - pad.t - pad.b)) / (hi - lo || 1);
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.percent!).toFixed(1)}`).join(" ");
  const kinds = [...new Set(points.map((p) => p.kind))];

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-labelledby="trend-title">
        <title id="trend-title">{`Score as a percentage of the maximum, for your last ${points.length} tests: ${points.map((p) => `${Math.round(p.percent!)}%`).join(", ")}`}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e2e2dd" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#6b6d72">
              {Math.round(t)}%
            </text>
          </g>
        ))}
        {lo < 0 && <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#8e9094" strokeWidth={1} />}
        <path d={line} fill="none" stroke="#1c1f23" strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={p.attemptId}>
            <circle cx={x(i)} cy={y(p.percent!)} r={5} fill={KIND_COLOR[p.kind]} stroke="#fff" strokeWidth={1.5}>
              <title>{`${p.paperTitle} (${KIND_LABEL[p.kind]}), ${p.date.toISOString().slice(0, 10)}: ${p.score} / ${p.maxMarks} (${Math.round(p.percent!)}%)`}</title>
            </circle>
            {(points.length <= 12 || i % Math.ceil(points.length / 12) === 0) && (
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#6b6d72">
                {i + 1}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-4 text-xs text-gray-600 mt-2">
        <span>Test number (oldest first) · score as % of the maximum marks</span>
        {kinds.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} aria-hidden />
            {KIND_LABEL[k]}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
