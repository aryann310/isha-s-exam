"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { renderMarkdownWithMath } from "@/lib/render-markdown";
import { parseQuestionOptions } from "@/lib/parse-markdown-questions";
import { createQuestionAction, updateQuestionAction } from "@/server/actions/admin";

interface QuestionEditorFormProps {
  paperId: string;
  currentPaperTitle?: string;
  editingQuestion?: {
    id: string;
    questionNumber: number;
    questionText: string;
    section: string | null;
    topic: string | null;
    difficulty: string | null;
    options?: string | null;
    correctAnswer: string;
    explanation: string | null;
    questionType?: string;
  } | null;
  nextQuestionNumber: number;
  initialOptions?: Record<string, string>;
}

export function QuestionEditorForm({
  paperId,
  currentPaperTitle,
  editingQuestion,
  nextQuestionNumber,
  initialOptions,
}: QuestionEditorFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Extract initial diagram if editing question already has one
  const extractInitialDiagram = () => {
    if (!editingQuestion?.questionText) return { text: "", diagram: null, caption: "Diagram" };
    const imgMatch = editingQuestion.questionText.match(/!\[(.*?)\]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/);
    if (imgMatch) {
      const caption = imgMatch[1] || "Diagram";
      const diagram = imgMatch[2];
      const textWithoutImg = editingQuestion.questionText.replace(imgMatch[0], "").trim();
      return { text: textWithoutImg, diagram, caption };
    }
    return { text: editingQuestion.questionText, diagram: null, caption: "Diagram" };
  };

  const initial = extractInitialDiagram();

  const [questionNumber, setQuestionNumber] = useState<number>(
    editingQuestion ? editingQuestion.questionNumber : nextQuestionNumber
  );
  const [difficulty, setDifficulty] = useState<string>(editingQuestion?.difficulty || "Medium");
  const [section, setSection] = useState<string>(editingQuestion?.section || "Quantitative Techniques");
  const [topic, setTopic] = useState<string>(editingQuestion?.topic || "");
  const [questionText, setQuestionText] = useState<string>(initial.text);
  const [attachedDiagram, setAttachedDiagram] = useState<string | null>(initial.diagram);
  const [diagramCaption, setDiagramCaption] = useState<string>(initial.caption);
  const [options, setOptions] = useState<Record<string, string>>(() =>
    parseQuestionOptions(editingQuestion?.options || initialOptions)
  );
  const [questionType, setQuestionType] = useState<"MCQ" | "TITA">(editingQuestion?.questionType === "TITA" ? "TITA" : "MCQ");
  const [correctAnswer, setCorrectAnswer] = useState<string>(editingQuestion?.correctAnswer || "A");
  const [explanation, setExplanation] = useState<string>(editingQuestion?.explanation || "");

  const [previewMode, setPreviewMode] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);



  // Image optimization & canvas compression
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setStatusMessage({ text: "Please select an image file (PNG, JPG, WebP, SVG).", isError: true });
      return;
    }

    setIsProcessingImage(true);
    setStatusMessage(null);
    const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    setDiagramCaption(cleanName || "Figure");

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;

      if (file.type === "image/svg+xml") {
        setAttachedDiagram(result);
        setIsProcessingImage(false);
        return;
      }

      const img = new Image();
      img.onload = () => {
        const maxWidth = 900;
        const maxHeight = 700;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/webp", 0.85);
          setAttachedDiagram(compressed);
        } else {
          setAttachedDiagram(result);
        }
        setIsProcessingImage(false);
      };
      img.onerror = () => {
        setAttachedDiagram(result);
        setIsProcessingImage(false);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveDiagram = () => {
    setAttachedDiagram(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Compile final question text including the diagram
  const getCompiledQuestionText = () => {
    let text = questionText.trim();
    if (attachedDiagram) {
      const tag = `![${diagramCaption || "Diagram"}](${attachedDiagram})`;
      if (!text.includes(attachedDiagram)) {
        text = text ? `${text}\n\n${tag}` : tag;
      }
    }
    return text;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const compiledText = getCompiledQuestionText();
    if (!compiledText) {
      setStatusMessage({ text: "Please enter a question statement or attach a diagram.", isError: true });
      return;
    }

    const formData = new FormData();
    if (editingQuestion) {
      formData.append("id", editingQuestion.id);
    } else {
      formData.append("paperId", paperId);
    }

    formData.append("questionNumber", questionNumber.toString());
    formData.append("difficulty", difficulty);
    formData.append("section", section);
    formData.append("topic", topic);
    formData.append("questionText", compiledText);
    formData.append("optionA", options.A || "");
    formData.append("optionB", options.B || "");
    formData.append("optionC", options.C || "");
    formData.append("optionD", options.D || "");
    formData.append("optionE", options.E || "");
    formData.append("questionType", questionType);
    formData.append("correctAnswer", correctAnswer.trim());
    formData.append("explanation", explanation);

    startTransition(async () => {
      try {
        if (editingQuestion) {
          const res = await updateQuestionAction(formData);
          if (!res.success) {
            setStatusMessage({ text: res.error ?? "Failed to save question.", isError: true });
            return;
          }
          setStatusMessage({ text: `Question #${questionNumber} updated successfully!`, isError: false });
        } else {
          const res = await createQuestionAction(formData);
          if (!res.success) {
            setStatusMessage({ text: res.error ?? "Failed to save question.", isError: true });
            return;
          }
          setStatusMessage({ text: `Question #${questionNumber} saved successfully!`, isError: false });
          // Reset form for next question
          setQuestionNumber((prev) => prev + 1);
          setQuestionText("");
          setAttachedDiagram(null);
          setExplanation("");
          setOptions({ A: "", B: "", C: "", D: "" });
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
        router.refresh();
      } catch (err: unknown) {
        setStatusMessage({ text: err instanceof Error ? err.message : "Failed to save question. Please try again.", isError: true });
      }
    });
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs h-fit space-y-4">
      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {editingQuestion ? `Edit Question #${editingQuestion.questionNumber}` : "Add Question"}
          </h3>
          <p className="text-xs text-slate-500">
            {editingQuestion ? "Updating question in:" : "Adding to:"}{" "}
            <span className="font-bold text-slate-800">{currentPaperTitle}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewMode(!previewMode)}
            className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
              previewMode
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200"
            }`}
          >
            {previewMode ? "✏️ Edit Mode" : "👁️ Live Preview"}
          </button>
          {editingQuestion && (
            <Link
              href={`/admin/questions?paperId=${paperId}`}
              className="text-xs text-rose-600 hover:underline font-semibold"
            >
              Cancel Edit
            </Link>
          )}
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-xl text-xs font-bold flex justify-between items-center ${
            statusMessage.isError
              ? "bg-rose-50 text-rose-800 border border-rose-200"
              : "bg-emerald-50 text-emerald-800 border border-emerald-200"
          }`}
        >
          <span>{statusMessage.text}</span>
          <button type="button" onClick={() => setStatusMessage(null)} className="ml-2 font-semibold">
            ✕
          </button>
        </div>
      )}

      {/* Live Preview Mode */}
      {previewMode ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 pb-2 border-b border-slate-200">
            <span>Student Live Preview (Question #{questionNumber})</span>
            <span className="bg-white border px-2 py-0.5 rounded text-slate-800">{difficulty}</span>
          </div>

          <div
            className="prose max-w-none text-slate-900 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(getCompiledQuestionText()) }}
          />

          {questionType === "TITA" && (
            <div className="p-2.5 rounded-lg border text-xs bg-emerald-50 border-emerald-400 font-bold text-emerald-950">
              Typed answer: <span className="font-mono">{correctAnswer || "(not set)"}</span>
            </div>
          )}

          <div className="space-y-2 pt-2">
            {questionType !== "TITA" && Object.entries(options).filter(([key, val]) => key !== "E" || val?.trim()).map(([key, val]) => (
              <div
                key={key}
                className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                  correctAnswer === key
                    ? "bg-emerald-50 border-emerald-400 font-bold text-emerald-950"
                    : "bg-white border-slate-200 text-slate-800"
                }`}
              >
                <span className="w-5 h-5 rounded bg-slate-100 font-bold flex items-center justify-center shrink-0">
                  {key}
                </span>
                <span dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(val || "(Empty)") }} />
                {correctAnswer === key && (
                  <span className="ml-auto text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                    Correct Key
                  </span>
                )}
              </div>
            ))}
          </div>

          {explanation && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-950">
              <span className="font-bold block mb-1">Explanation:</span>
              <div dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(explanation) }} />
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-semibold">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 mb-1">Question Number</label>
              <input
                type="number"
                value={questionNumber}
                onChange={(e) => setQuestionNumber(parseInt(e.target.value, 10) || 1)}
                required
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-slate-900 outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-700 mb-1">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-slate-900 outline-none"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 mb-1">Section</label>
              <input
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder="e.g. Quantitative Techniques"
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-slate-900 outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-700 mb-1">Topic</label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Geometry & Diagrams"
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-slate-900 outline-none"
              />
            </div>
          </div>

          {/* Question Textarea */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-slate-700">Question Statement (Supports Markdown & Math)</label>
            </div>
            <textarea
              rows={3}
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Enter the question text statement (e.g. In the figure below, find the area of shaded region...)"
              className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-slate-900 outline-none"
            />
          </div>

          {/* Diagram Attachment Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🖼️</span>
                <span className="font-bold text-slate-900">Question Diagram / Image</span>
                {attachedDiagram && (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                    ✓ Attached (Will be saved)
                  </span>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
                id="question-diagram-picker"
              />
              <label
                htmlFor="question-diagram-picker"
                className="cursor-pointer bg-white border border-slate-300 hover:border-slate-900 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-2xs hover:bg-slate-50"
              >
                {attachedDiagram ? "Change Image" : "+ Attach Diagram"}
              </label>
            </div>

            {isProcessingImage && (
              <div className="text-xs text-slate-500 flex items-center gap-2 py-1">
                <span className="w-3.5 h-3.5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                Optimizing and embedding diagram...
              </div>
            )}

            {attachedDiagram && !isProcessingImage && (
              <div className="space-y-2.5 pt-2 border-t border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-600 shrink-0">Caption:</span>
                  <input
                    type="text"
                    value={diagramCaption}
                    onChange={(e) => setDiagramCaption(e.target.value)}
                    placeholder="e.g. Figure 1"
                    className="text-xs border border-slate-300 rounded px-2 py-1 bg-white flex-1 focus:ring-1 focus:ring-slate-900 outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveDiagram}
                    className="text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-1 rounded hover:bg-rose-50"
                  >
                    ✕ Remove
                  </button>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-2 flex justify-center items-center max-h-40 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachedDiagram}
                    alt={diagramCaption}
                    className="max-h-36 object-contain rounded"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Question type */}
          <div>
            <label className="block text-slate-700 mb-1">Question Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["MCQ", "Multiple choice (A–D/E)"],
                  ["TITA", "Typed answer (TITA)"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setQuestionType(value);
                    if (value === "MCQ" && !["A", "B", "C", "D", "E"].includes(correctAnswer)) setCorrectAnswer("A");
                    if (value === "TITA" && ["A", "B", "C", "D", "E"].includes(correctAnswer)) setCorrectAnswer("");
                  }}
                  className={`py-2 rounded-lg border text-xs font-bold ${questionType === value ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className={`space-y-2 ${questionType === "TITA" ? "hidden" : ""}`}>
            <label className="block text-slate-700">Answer Options</label>
            {(["A", "B", "C", "D", "E"] as const).map((optKey) => (
              <div key={optKey} className="flex items-center gap-2">
                <span className="font-bold text-slate-700 w-5">{optKey}:</span>
                <input
                  value={options[optKey] || ""}
                  onChange={(e) => setOptions((prev) => ({ ...prev, [optKey]: e.target.value }))}
                  placeholder={
                    optKey === "E" ? "Option E (optional, for five-option papers such as NMAT)" : `Option ${optKey} text (supports math $...$)`
                  }
                  required={questionType === "MCQ" && optKey !== "E"}
                  className="flex-1 border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-slate-900 outline-none"
                />
              </div>
            ))}
          </div>

          {questionType === "TITA" ? (
            <div>
              <label className="block text-slate-700 mb-1">Correct Answer</label>
              <input
                value={correctAnswer}
                onChange={(e) => setCorrectAnswer(e.target.value)}
                placeholder="e.g. 42 (use | for alternatives, e.g. 0.5|1/2)"
                required
                className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-sm font-mono focus:ring-2 focus:ring-slate-900 outline-none"
              />
            </div>
          ) : (
          <div>
            <label className="block text-slate-700 mb-1">Correct Answer Key</label>
            <select
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-sm font-bold focus:ring-2 focus:ring-slate-900 outline-none"
            >
              <option value="A">Option A</option>
              <option value="B">Option B</option>
              <option value="C">Option C</option>
              <option value="D">Option D</option>
              <option value="E" disabled={!options.E?.trim()}>
                Option E
              </option>
            </select>
          </div>
          )}

          <div>
            <label className="block text-slate-700 mb-1">Detailed Solution / Explanation</label>
            <textarea
              rows={2}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Step-by-step solution shown in Practice mode and post-exam review..."
              className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-slate-900 outline-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-slate-900 text-white font-bold py-3 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors text-sm shadow-sm flex items-center justify-center gap-2"
            >
              {isPending
                ? "Saving to Database..."
                : editingQuestion
                ? "Save Changes"
                : "+ Add Question"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
