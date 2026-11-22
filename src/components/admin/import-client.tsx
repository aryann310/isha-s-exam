"use client";

import { useState } from "react";
import { bulkImportQuestionsAction } from "@/server/actions/admin";
import { useRouter } from "next/navigation";
import { DiagramUploader } from "@/components/admin/diagram-uploader";
import type { ImportMode, ImportResult } from "@/lib/question-import";

const SAMPLE_MARKDOWN = `### Question 1
- **Section**: Quantitative, Data Interpretation & Data Sufficiency
- **Topic**: Percentages
- **Difficulty**: Medium

**Question:**
A shopkeeper marks an article at $40\\%$ above the cost price and allows a discount of $25\\%$ on the marked price. What is his profit percentage?

| Item | Calculation |
| :--- | :--- |
| Cost Price | $100$ |
| Marked Price | $140$ |

**Options:**
- (A) $5\\%$
- (B) $10\\%$
- (C) $12\\%$
- (D) $15\\%$

**Correct Answer:** A

**Explanation:**
Let Cost Price $= 100$.
Marked Price $= 140$.
Selling Price $= 140 - (0.25 \\times 140) = 105$.
Profit percentage $= \\frac{105 - 100}{100} \\times 100 = 5\\%$.
Hence, option **(A)** is correct.

---

### Question 2
- **Section**: Quantitative Techniques & Data Interpretation
- **Topic**: Geometry & Diagrams
- **Difficulty**: Medium

**Question:**
In the given figure below, $ABCD$ is a cyclic quadrilateral. If $\\angle ABC = 70^\\circ$, find the measure of $\\angle ADC$.

![Cyclic Quadrilateral Diagram](https://placehold.co/600x260/f3f4f6/111827?text=Figure:+Cyclic+Quadrilateral+ABCD)

**Options:**
- (A) $70^\\circ$
- (B) $110^\\circ$
- (C) $120^\\circ$
- (D) $140^\\circ$

**Correct Answer:** B

**Explanation:**
Opposite angles in a cyclic quadrilateral sum to $180^\\circ$.
$\\angle ADC = 180^\\circ - 70^\\circ = 110^\\circ$.
`;


const SAMPLE_JSON = JSON.stringify(
  [
    {
      questionNumber: 1,
      question: "A shopkeeper marks an article at 40% above the cost price and allows a discount of 25% on the marked price. What is his profit percentage?",
      options: {
        A: "5%",
        B: "10%",
        C: "12%",
        D: "15%",
      },
      correctAnswer: "A",
      explanation: "Let Cost Price = 100. Marked Price = 140. Selling Price = 140 - (25% of 140) = 140 - 35 = 105. Profit = 105 - 100 = 5%. Hence, correct answer is A.",
      section: "Quantitative, Data Interpretation & Data Sufficiency",
      topic: "Percentages",
      difficulty: "Medium",
    },
  ],
  null,
  2
);

const SAMPLE_CSV = `question_number,section,topic,question,option_a,option_b,option_c,option_d,correct_answer,explanation,difficulty
1,"Quantitative, Data Interpretation & Data Sufficiency",Percentages,"What is 20% of 25% of 300?",12,15,18,20,B,"25% of 300 = 75. 20% of 75 = 15. Hence B.",Easy
2,General English,Vocabulary,"Choose the synonym of 'Ephemeral':",Permanent,Transient,Celestial,Subtle,B,"Ephemeral means lasting for a very short time. Transient is the synonym.",Easy`;

export function ImportClient({ papers }: { papers: Array<{ id: string; title: string; exam: { name: string } }> }) {
  const router = useRouter();
  const [selectedPaperId, setSelectedPaperId] = useState(papers[0]?.id || "");
  const [format, setFormat] = useState<"markdown" | "json" | "csv">("markdown");
  const [rawData, setRawData] = useState(SAMPLE_MARKDOWN);
  const [mode, setMode] = useState<ImportMode>("append");
  const [status, setStatus] = useState<{ message: string; isError: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  // Result of the last dry run; the import button only unlocks for exactly these inputs.
  const [preview, setPreview] = useState<{ key: string; result: ImportResult } | null>(null);
  const inputKey = `${selectedPaperId}|${format}|${mode}|${rawData}`;
  const previewIsCurrent = preview?.key === inputKey;
  const selectedPaper = papers.find((p) => p.id === selectedPaperId);

  const getSample = (fmt: "markdown" | "json" | "csv") => {
    if (fmt === "markdown") return SAMPLE_MARKDOWN;
    if (fmt === "json") return SAMPLE_JSON;
    return SAMPLE_CSV;
  };

  const handleFormatChange = (newFormat: "markdown" | "json" | "csv") => {
    setFormat(newFormat);
    setRawData(getSample(newFormat));
    setStatus(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawData(content);
        if (file.name.endsWith(".json")) setFormat("json");
        else if (file.name.endsWith(".csv")) setFormat("csv");
        else setFormat("markdown");
      }
    };
    reader.readAsText(file);
  };

  const runImport = async (dryRun: boolean) => {
    if (!selectedPaperId) {
      setStatus({ message: "Please select a target paper.", isError: true });
      return;
    }

    if (!rawData.trim()) {
      setStatus({ message: "Please paste or upload questions data.", isError: true });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const res = await bulkImportQuestionsAction(selectedPaperId, rawData, format, { mode, dryRun });
      if (dryRun) {
        setPreview({ key: inputKey, result: res });
        setStatus(
          res.success
            ? { message: `Checked ${res.count} questions. Review the preview below, then confirm.`, isError: false }
            : { message: res.error ?? "Validation failed.", isError: true }
        );
      } else if (res.success) {
        setPreview(null);
        setStatus({
          message: `Imported into "${selectedPaper?.title ?? "paper"}": ${res.created} added, ${res.updated} replaced, ${res.deleted} removed.`,
          isError: false,
        });
        router.refresh();
      } else {
        setPreview({ key: inputKey, result: res });
        setStatus({ message: res.error ?? "Import failed.", isError: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to import questions";
      setStatus({ message: msg, isError: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 md:p-8 rounded-xl border border-slate-200 shadow-xs space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
            Target Paper
          </label>
          <select
            value={selectedPaperId}
            onChange={(e) => setSelectedPaperId(e.target.value)}
            className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-slate-900 outline-none"
          >
            {papers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.exam.name} — {p.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
            Data Format
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleFormatChange("markdown")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-colors ${
                format === "markdown"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              Markdown (.md)
            </button>
            <button
              type="button"
              onClick={() => handleFormatChange("json")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-colors ${
                format === "json"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              JSON
            </button>
            <button
              type="button"
              onClick={() => handleFormatChange("csv")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-colors ${
                format === "csv"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              CSV
            </button>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Import Mode</label>
        <div className="flex gap-2">
          {(
            [
              ["append", "Add to paper", "Adds new questions. Blocked if a question number or question already exists in the paper."],
              ["replace", "Replace paper's questions", "Makes the paper match this file exactly: same-numbered questions are overwritten, missing ones are deleted."],
            ] as const
          ).map(([value, label, help]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg border text-left transition-colors ${
                mode === value ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {label}
              <span className={`block font-normal mt-0.5 ${mode === value ? "text-slate-300" : "text-slate-500"}`}>{help}</span>
            </button>
          ))}
        </div>
        {mode === "replace" && (
          <p className="mt-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            Questions in &quot;{selectedPaper?.title}&quot; that are not in this file will be deleted, along with any student answers to them.
          </p>
        )}
      </div>

      {/* Instant Diagram / Image Uploader for Questions */}
      <DiagramUploader
        label="Question Diagram / Image Converter"
        onInsert={(snippet) => setRawData((prev) => prev + snippet)}
      />

      <div>
        <div className="flex flex-wrap justify-between items-center gap-2 mb-1">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Paste or Upload PYQ Data ({format.toUpperCase()})
          </label>
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-600 hover:text-slate-900 font-semibold cursor-pointer border border-slate-300 px-2.5 py-1 rounded bg-slate-50 hover:bg-slate-100 transition-colors">
              📁 Upload File (.md, .json, .csv)
              <input
                type="file"
                accept=".md,.txt,.json,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={() => setRawData(getSample(format))}
              className="text-xs text-blue-600 hover:underline font-semibold"
            >
              Load Sample Template
            </button>
          </div>
        </div>
        <textarea
          rows={15}
          value={rawData}
          onChange={(e) => setRawData(e.target.value)}
          className="w-full font-mono text-xs border border-slate-300 rounded-xl p-3.5 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-slate-900 outline-none"
          placeholder={`Paste ${format.toUpperCase()} questions here...`}
        />
      </div>

      {status && (
        <div
          className={`p-4 rounded-xl text-sm font-semibold ${
            status.isError
              ? "bg-rose-50 text-rose-800 border border-rose-200"
              : "bg-emerald-50 text-emerald-800 border border-emerald-200"
          }`}
        >
          {status.isError ? "✕ " : "✓ "} {status.message}
        </div>
      )}

      {preview && <ImportPreview result={preview.result} stale={!previewIsCurrent} />}

      <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
        <p className="text-xs text-slate-500">
          Supports LaTeX formulas (<code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">$...$</code>), Markdown tables, options, and step-by-step explanations.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => runImport(true)}
            disabled={loading}
            className="bg-white text-slate-900 border border-slate-300 font-bold text-sm px-5 py-3 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {loading ? "Checking..." : "1. Check & Preview"}
          </button>
          <button
            onClick={() => runImport(false)}
            disabled={loading || !previewIsCurrent || !preview?.result.success}
            title={!previewIsCurrent ? "Run Check & Preview on the current input first" : undefined}
            className="bg-slate-900 text-white font-bold text-sm px-5 py-3 rounded-lg hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-40"
          >
            {loading ? "Working..." : `2. Import ${previewIsCurrent && preview ? preview.result.count : ""} Questions`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportPreview({ result, stale }: { result: ImportResult; stale: boolean }) {
  const issues = [
    ...result.issues.filter((i) => i.level === "error"),
    ...result.issues.filter((i) => i.level === "warning"),
  ];
  return (
    <div className={`space-y-4 ${stale ? "opacity-50" : ""}`}>
      {stale && (
        <p className="text-xs font-semibold text-amber-800">The input changed since this check. Run Check &amp; Preview again.</p>
      )}
      {result.success && (
        <div className="grid grid-cols-3 gap-3 text-center">
          {(
            [
              ["Will add", result.created],
              ["Will replace", result.updated],
              ["Will delete", result.deleted],
            ] as const
          ).map(([label, n]) => (
            <div key={label} className="border border-slate-200 rounded-xl p-3">
              <div className="text-2xl font-semibold text-slate-900">{n}</div>
              <div className="text-xs font-semibold text-slate-500">{label}</div>
            </div>
          ))}
        </div>
      )}
      {issues.length > 0 && (
        <div className="border border-slate-200 rounded-xl max-h-72 overflow-y-auto divide-y divide-slate-100">
          {issues.map((issue, i) => (
            <div key={i} className="px-3 py-2 text-xs flex gap-2">
              <span className={`font-semibold shrink-0 ${issue.level === "error" ? "text-rose-700" : "text-amber-700"}`}>
                {issue.level === "error" ? "ERROR" : "WARN"}
              </span>
              <span className="font-bold text-slate-700 shrink-0">
                {issue.questionNumber !== null ? `Q${issue.questionNumber}` : "Paper"}
              </span>
              <span className="text-slate-700">{issue.message}</span>
            </div>
          ))}
        </div>
      )}
      {result.preview.length > 0 && (
        <details className="border border-slate-200 rounded-xl">
          <summary className="px-3 py-2 text-xs font-bold text-slate-700 cursor-pointer">
            Preview parsed questions ({result.preview.length})
          </summary>
          <div className="max-h-[28rem] overflow-y-auto divide-y divide-slate-100">
            {result.preview.map((q, i) => (
              <div key={i} className="p-3 text-xs space-y-1.5">
                <div className="font-bold text-slate-900">
                  Q{q.questionNumber}
                  {q.section && <span className="ml-2 font-normal text-slate-500">{q.section}</span>}
                </div>
                <p className="whitespace-pre-wrap text-slate-800">{q.questionText}</p>
                {q.questionType === "TITA" ? (
                  <p className="rounded px-2 py-1 border border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold">
                    Typed answer (TITA): <span className="font-mono">{q.correctAnswer}</span>
                  </p>
                ) : (
                <ul className="grid sm:grid-cols-2 gap-1">
                  {(["A", "B", "C", "D"] as const).map((k) => (
                    <li
                      key={k}
                      className={`whitespace-pre-wrap rounded px-2 py-1 border ${
                        q.correctAnswer === k
                          ? "border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold"
                          : "border-slate-200 text-slate-700"
                      }`}
                    >
                      <span className="font-semibold mr-1">{k}.</span>
                      {q.options[k] || <em className="text-rose-600">empty</em>}
                    </li>
                  ))}
                </ul>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
