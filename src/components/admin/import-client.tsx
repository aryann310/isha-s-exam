"use client";

import { useState } from "react";
import { bulkImportQuestionsAction } from "@/server/actions/admin";
import { useRouter } from "next/navigation";

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
- **Section**: General English
- **Topic**: Vocabulary
- **Difficulty**: Easy

**Question:**
Choose the word which is closest in meaning to **'Ephemeral'**:

**Options:**
- (A) Permanent
- (B) Transient
- (C) Celestial
- (D) Subtle

**Correct Answer:** B

**Explanation:**
**'Ephemeral'** means lasting for a very short time. **Transient** is the closest synonym.
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
1,Quantitative, Data Interpretation & Data Sufficiency,Percentages,"What is 20% of 25% of 300?",12,15,18,20,B,"25% of 300 = 75. 20% of 75 = 15. Hence B.",Easy
2,General English,Vocabulary,"Choose the synonym of 'Ephemeral':",Permanent,Transient,Celestial,Subtle,B,"Ephemeral means lasting for a very short time. Transient is the synonym.",Easy`;

export function ImportClient({ papers }: { papers: Array<{ id: string; title: string; exam: { name: string } }> }) {
  const router = useRouter();
  const [selectedPaperId, setSelectedPaperId] = useState(papers[0]?.id || "");
  const [format, setFormat] = useState<"markdown" | "json" | "csv">("markdown");
  const [rawData, setRawData] = useState(SAMPLE_MARKDOWN);
  const [status, setStatus] = useState<{ message: string; isError: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

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

  const handleImport = async () => {
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
      const res = await bulkImportQuestionsAction(selectedPaperId, rawData, format);
      if (res.success) {
        setStatus({
          message: `Successfully imported ${res.count} questions into the paper!`,
          isError: false,
        });
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to import questions";
      setStatus({ message: msg, isError: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 md:p-8 rounded-2xl border border-gray-200 shadow-xs space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
            Target Paper
          </label>
          <select
            value={selectedPaperId}
            onChange={(e) => setSelectedPaperId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-2.5 bg-white text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-gray-900 outline-none"
          >
            {papers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.exam.name} — {p.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
            Data Format
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleFormatChange("markdown")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-colors ${
                format === "markdown"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              Markdown (.md)
            </button>
            <button
              type="button"
              onClick={() => handleFormatChange("json")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-colors ${
                format === "json"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              JSON
            </button>
            <button
              type="button"
              onClick={() => handleFormatChange("csv")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-colors ${
                format === "csv"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              CSV
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap justify-between items-center gap-2 mb-1">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-700">
            Paste or Upload PYQ Data ({format.toUpperCase()})
          </label>
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-600 hover:text-gray-950 font-semibold cursor-pointer border border-gray-300 px-2.5 py-1 rounded bg-gray-50 hover:bg-gray-100 transition-colors">
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
          className="w-full font-mono text-xs border border-gray-300 rounded-xl p-3.5 bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-gray-900 outline-none"
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

      <div className="flex justify-between items-center pt-2">
        <p className="text-xs text-gray-500">
          Supports LaTeX formulas (<code className="bg-gray-100 px-1 py-0.5 rounded text-gray-700">$...$</code>), Markdown tables, options, and step-by-step explanations.
        </p>
        <button
          onClick={handleImport}
          disabled={loading}
          className="bg-gray-900 text-white font-bold text-sm px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50"
        >
          {loading ? "Validating & Ingesting..." : "Validate & Import Questions"}
        </button>
      </div>
    </div>
  );
}
