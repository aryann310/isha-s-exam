"use client";

import { useState, useRef } from "react";

interface DiagramUploaderProps {
  onInsert?: (snippet: string) => void;
  label?: string;
  compact?: boolean;
}

export function DiagramUploader({ onInsert, label = "Upload Diagram", compact = false }: DiagramUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [diagramName, setDiagramName] = useState("Diagram");
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resize and optimize image on client canvas
  const processImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file (PNG, JPG, WebP, SVG).");
      return;
    }

    setIsProcessing(true);
    const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    setDiagramName(cleanName || "Diagram");

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;

      // For SVG, keep as is
      if (file.type === "image/svg+xml") {
        setPreview(result);
        setFileSize(`${Math.round(file.size / 1024)} KB`);
        setIsProcessing(false);
        return;
      }

      // For raster images (PNG, JPG, etc.), compress to max 900px width
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
          // Convert to WebP if supported, fallback to JPEG
          const optimizedDataUrl = canvas.toDataURL("image/webp", 0.88);
          setPreview(optimizedDataUrl);
          const approxKb = Math.round((optimizedDataUrl.length * 3) / 4 / 1024);
          setFileSize(`${approxKb} KB`);
        } else {
          setPreview(result);
          setFileSize(`${Math.round(file.size / 1024)} KB`);
        }
        setIsProcessing(false);
      };
      img.onerror = () => {
        setPreview(result);
        setIsProcessing(false);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  };

  const getMarkdownTag = () => {
    if (!preview) return "";
    return `\n\n![${diagramName}](${preview})\n\n`;
  };

  const handleCopy = async () => {
    const tag = getMarkdownTag();
    if (!tag) return;
    try {
      await navigator.clipboard.writeText(tag);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Failed to copy. Please copy manually from the preview.");
    }
  };

  const handleInsert = () => {
    const tag = getMarkdownTag();
    if (tag && onInsert) {
      onInsert(tag);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClear = () => {
    setPreview(null);
    setFileSize(null);
    setCopied(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className={`bg-gray-50 border border-gray-200 rounded-xl ${compact ? "p-3" : "p-4"} space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🖼️</span>
          <span className="text-xs font-black text-gray-900 tracking-tight">
            {label}
          </span>
          <span className="text-[10px] text-gray-500 bg-white border border-gray-200 px-1.5 py-0.5 rounded font-medium">
            Zero-Hosting • Stored in DB
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          id={`diagram-upload-${label.replace(/\s+/g, "-")}`}
        />
        <label
          htmlFor={`diagram-upload-${label.replace(/\s+/g, "-")}`}
          className="cursor-pointer bg-white border border-gray-300 hover:border-gray-900 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-2xs hover:bg-gray-50"
        >
          {preview ? "Change Image" : "+ Select Diagram Image"}
        </label>
      </div>

      {isProcessing && (
        <div className="text-xs text-gray-500 flex items-center gap-2 py-2">
          <span className="w-3.5 h-3.5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
          Optimizing diagram resolution and size...
        </div>
      )}

      {preview && !isProcessing && (
        <div className="space-y-3 pt-1 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 w-full">
              <span className="text-[11px] font-bold text-gray-600 shrink-0">Caption:</span>
              <input
                type="text"
                value={diagramName}
                onChange={(e) => setDiagramName(e.target.value)}
                placeholder="Figure title, e.g., Triangle ABC"
                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white flex-1 focus:ring-1 focus:ring-gray-900 outline-none"
              />
              {fileSize && (
                <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                  {fileSize}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
              {onInsert && (
                <button
                  type="button"
                  onClick={handleInsert}
                  className="bg-gray-950 hover:bg-gray-800 text-white text-xs font-black px-3 py-1.5 rounded-lg transition-colors shadow-2xs flex items-center gap-1"
                >
                  {copied ? "✓ Inserted!" : "↵ Insert in Question"}
                </button>
              )}

              <button
                type="button"
                onClick={handleCopy}
                className="bg-white border border-gray-300 hover:bg-gray-100 text-gray-800 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors shadow-2xs"
              >
                {copied ? "✓ Copied!" : "📋 Copy Tag"}
              </button>

              <button
                type="button"
                onClick={handleClear}
                className="text-gray-400 hover:text-rose-600 text-xs px-1.5 py-1"
                title="Remove image"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Diagram Preview Thumbnail */}
          <div className="relative bg-white border border-gray-200 rounded-lg p-2 flex justify-center items-center max-h-48 overflow-hidden group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt={diagramName}
              className="max-h-44 object-contain rounded"
            />
          </div>
        </div>
      )}
    </div>
  );
}
