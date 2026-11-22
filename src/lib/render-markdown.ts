import katex from "katex";
import { Marked, type Tokens } from "marked";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Only plain web links, in-page anchors and embedded images may be used as URLs. */
function safeUrl(href: string, isImage: boolean): boolean {
  const h = href.trim().toLowerCase();
  if (isImage && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);/.test(h)) return true;
  return /^(https?:|mailto:|#|\/(?!\/))/.test(h);
}

// Question content is written as Markdown + LaTeX. Raw HTML in it is shown as text, never run, and
// links or images with unsafe URLs (javascript:, etc.) are neutralised, so imported content can't run
// script in a student's or admin's browser.
const md = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(token.text);
    },
  },
  walkTokens(token) {
    if (token.type === "link" && !safeUrl(token.href, false)) token.href = "#";
    if (token.type === "image" && !safeUrl(token.href, true)) token.href = "";
  },
});

export function renderMarkdownWithMath(content: string | null | undefined): string {
  if (!content) return "";

  const mathPlaceholders: Array<{ placeholder: string; html: string }> = [];
  let placeholderCount = 0;

  const createPlaceholder = (latex: string, displayMode: boolean) => {
    const placeholder = `%%KATEX_MATH_${placeholderCount++}%%`;
    let html = "";
    try {
      html = katex.renderToString(latex.trim(), {
        displayMode,
        throwOnError: false,
      });
      if (displayMode) {
        html = `<div class="my-2 overflow-x-auto">${html}</div>`;
      }
    } catch {
      html = displayMode ? `<div class="my-2">$$${latex}$$</div>` : `$${latex}$`;
    }
    mathPlaceholders.push({ placeholder, html });
    return placeholder;
  };

  // Clean AI citation artifacts if present e.g. [cite: 77]
  let text = content.replace(/\[cite:\s*[\d,\s]+\]/gi, "");

  // 1. Display math: \[ ... \]
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
    return createPlaceholder(math, true);
  });

  // 2. Display math: $$ ... $$
  text = text.replace(/(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/g, (_, math) => {
    return createPlaceholder(math, true);
  });

  // 3. Inline math: \( ... \)
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
    return createPlaceholder(math, false);
  });

  // 4. Inline math: $ ... $
  // Supports escaped dollars (\$) inside math and avoids escaped dollars outside
  text = text.replace(/(?<!\\)\$(?!\s)((?:\\\$|[^\$\n\r])+?)(?<!\s)(?<!\\)\$/g, (_, math) => {
    return createPlaceholder(math, false);
  });

  // 5. Standalone LaTeX fractions and roots without surrounding $ if any
  text = text.replace(/(?<![\\a-zA-Z0-9])\\(frac|sqrt|binom)\{((?:[^{}]+|\{[^{}]*\})*)\}(?:\{((?:[^{}]+|\{[^{}]*\})*)\})?/g, (fullMatch) => {
    return createPlaceholder(fullMatch, false);
  });

  // 6. Parse markdown with marked (placeholders protect KaTeX HTML from being corrupted or escaped)
  let html = "";
  try {
    const parsed = md.parse(text);
    html = typeof parsed === "string" ? parsed : escapeHtml(text);
  } catch {
    html = escapeHtml(text);
  }

  // 7. Restore KaTeX HTML placeholders
  for (const { placeholder, html: mathHtml } of mathPlaceholders) {
    html = html.split(placeholder).join(mathHtml);
  }

  // 8. Unescape literal escaped dollar signs outside math: \$ -> $
  html = html.replace(/\\(\$)/g, "$1");

  return html;
}
