import katex from "katex";
import { marked } from "marked";

export function renderMarkdownWithMath(content: string | null | undefined): string {
  if (!content) return "";

  // 1. Render display/block math $$...$$
  let text = content.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    try {
      return `<div class="my-2">${katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })}</div>`;
    } catch {
      return `$$${math}$$`;
    }
  });

  // 2. Render inline math $...$
  text = text.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `$${math}$`;
    }
  });

  // 3. Parse Markdown (tables, formatting, lists, line breaks)
  try {
    const html = marked.parse(text, {
      gfm: true,
      breaks: true,
      async: false,
    });
    return typeof html === "string" ? html : text;
  } catch {
    return text;
  }
}
