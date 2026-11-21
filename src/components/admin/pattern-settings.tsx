"use client";

import { useRef, useState } from "react";
import { EXAM_PATTERNS, PATTERN_IDS, resolvePaperSections, type ExamPatternId } from "@/lib/exam-patterns";

interface SectionRow {
  name: string;
  minutes: number | null;
}

function sectionsFor(pattern: ExamPatternId, names: string[], durationMinutes: number): SectionRow[] {
  const resolved = resolvePaperSections(
    { examPattern: pattern, sectionConfig: null, durationSeconds: durationMinutes * 60 },
    names.map((section, i) => ({ section, questionNumber: i + 1 }))
  );
  return resolved.map((s) => ({ name: s.name, minutes: s.durationSeconds ? Math.round(s.durationSeconds / 60) : null }));
}

/**
 * Exam pattern fields for the paper forms. Writes examPattern, titaCorrectMarks, titaIncorrectMarks
 * and sectionConfig into the surrounding form; "Apply preset" also fills that form's marks and duration.
 */
export function PatternSettings({
  defaultPattern = "CUSTOM",
  defaultTitaCorrect = null,
  defaultTitaIncorrect = 0,
  initialSections = null,
  questionSections = [],
  durationMinutes = 60,
}: {
  defaultPattern?: string;
  defaultTitaCorrect?: number | null;
  defaultTitaIncorrect?: number;
  /** Current resolved sections of the paper (edit form). */
  initialSections?: SectionRow[] | null;
  /** Distinct question sections in question order (edit form). */
  questionSections?: string[];
  durationMinutes?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pattern, setPattern] = useState<ExamPatternId>((PATTERN_IDS as string[]).includes(defaultPattern) ? (defaultPattern as ExamPatternId) : "CUSTOM");
  const [rows, setRows] = useState<SectionRow[]>(
    () => initialSections ?? (questionSections.length ? sectionsFor(pattern, questionSections, durationMinutes) : [])
  );
  const [titaCorrect, setTitaCorrect] = useState<string>(defaultTitaCorrect === null ? "" : String(defaultTitaCorrect));
  const [titaIncorrect, setTitaIncorrect] = useState<string>(String(defaultTitaIncorrect));
  const preset = EXAM_PATTERNS[pattern];
  const sectional = preset.timing === "sectional";

  const setField = (name: string, value: string | number) => {
    const form = ref.current?.closest("form");
    const el = form?.elements.namedItem(name);
    if (el instanceof HTMLInputElement) el.value = String(value);
  };

  const applyPreset = () => {
    setField("correctMarks", preset.marks.correct);
    setField("incorrectMarks", preset.marks.incorrect);
    setField("unattemptedMarks", preset.marks.unattempted);
    setField("durationMinutes", preset.totalMinutes);
    setTitaCorrect(String(preset.marks.titaCorrect));
    setTitaIncorrect(String(preset.marks.titaIncorrect));
    if (questionSections.length) setRows(sectionsFor(pattern, questionSections, preset.totalMinutes));
  };

  const changePattern = (next: ExamPatternId) => {
    setPattern(next);
    if (questionSections.length) {
      const names = rows.length ? rows.map((r) => r.name) : questionSections;
      setRows(sectionsFor(next, names, EXAM_PATTERNS[next].totalMinutes));
    }
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };

  const sectionConfig = rows.length
    ? JSON.stringify(rows.map((r) => ({ name: r.name, durationSeconds: sectional && r.minutes ? r.minutes * 60 : null })))
    : "";
  const totalSectionMinutes = rows.reduce((t, r) => t + (r.minutes ?? 0), 0);

  return (
    <div ref={ref} className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50">
      <input type="hidden" name="examPattern" value={pattern} />
      <input type="hidden" name="sectionConfig" value={sectionConfig} />

      <div>
        <label className="block text-gray-700 mb-1">Exam Pattern</label>
        <div className="flex gap-2">
          <select
            value={pattern}
            onChange={(e) => changePattern(e.target.value as ExamPatternId)}
            className="flex-1 border border-gray-300 rounded-lg p-2.5 bg-white text-sm font-semibold"
          >
            {PATTERN_IDS.map((id) => (
              <option key={id} value={id}>
                {EXAM_PATTERNS[id].label}
              </option>
            ))}
          </select>
          <button type="button" onClick={applyPreset} className="px-3 rounded-lg border border-gray-900 bg-white text-gray-900 text-xs font-bold hover:bg-gray-100">
            Apply preset marks &amp; time
          </button>
        </div>
        <p className="text-[11px] font-normal text-gray-500 mt-1">{preset.summary}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-gray-700 mb-1">TITA correct marks</label>
          <input
            name="titaCorrectMarks"
            type="number"
            step="0.01"
            value={titaCorrect}
            onChange={(e) => setTitaCorrect(e.target.value)}
            placeholder="Same as MCQ"
            className="w-full border border-gray-300 rounded-lg p-2.5 bg-white"
          />
        </div>
        <div>
          <label className="block text-gray-700 mb-1">TITA wrong marks</label>
          <input
            name="titaIncorrectMarks"
            type="number"
            step="0.01"
            value={titaIncorrect}
            onChange={(e) => setTitaIncorrect(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-2.5 bg-white"
          />
        </div>
      </div>

      {rows.length > 0 && (
        <div>
          <label className="block text-gray-700 mb-1">Section order{sectional ? " and time" : ""}</label>
          <ul className="space-y-1.5">
            {rows.map((r, i) => (
              <li key={r.name} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1.5">
                <div className="flex flex-col">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-[10px] leading-none px-1 disabled:opacity-30">▲</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="text-[10px] leading-none px-1 disabled:opacity-30">▼</button>
                </div>
                <span className="flex-1 truncate font-normal text-gray-800">{r.name}</span>
                {sectional && (
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      value={r.minutes ?? ""}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setRows(rows.map((x, j) => (j === i ? { ...x, minutes: Number.isFinite(v) && v > 0 ? v : null } : x)));
                      }}
                      className="w-16 border border-gray-300 rounded p-1 text-right"
                    />
                    <span className="font-normal text-gray-500">min</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {sectional && <p className="text-[11px] font-normal text-gray-500 mt-1">Total {totalSectionMinutes} minutes. Each section is timed separately.</p>}
        </div>
      )}
    </div>
  );
}
