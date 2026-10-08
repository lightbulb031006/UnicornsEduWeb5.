import katex from "katex";

function decodeMathEntities(str: string): string {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Phần tử rỗng `<span …></span>` / `<div …></div>`; giá trị attribute có thể chứa `>`. */
const EMPTY_ELEMENT_RE = /<(span|div)\b((?:[^>"']|"[^"]*"|'[^']*')*)>\s*<\/\1>/gi;
const MATH_NODE_TYPE_RE = /\bdata-type\s*=\s*"(inline-math|block-math)"/i;
const DATA_LATEX_RE = /\bdata-latex\s*=\s*"([^"]*)"/i;
const MATH_PLACEHOLDER_RE = /\u0000(\d+)\u0000/g;

/**
 * Node công thức của Tiptap Mathematics lưu thành phần tử rỗng mang `data-latex`
 * (`<span data-type="inline-math">`, `<div data-type="block-math">`). Trả `null`
 * khi phần tử không phải node công thức.
 */
function renderTiptapMathNode(attrs: string): string | null {
  const type = MATH_NODE_TYPE_RE.exec(attrs)?.[1];
  const latex = DATA_LATEX_RE.exec(attrs)?.[1];
  if (!type || latex === undefined) return null;
  const tex = decodeMathEntities(latex).trim();
  if (!tex) return "";
  const displayMode = type === "block-math";
  const html = katex.renderToString(tex, { displayMode, throwOnError: false });
  return displayMode ? `<div>${html}</div>` : html;
}

/**
 * Parses an HTML string and renders all LaTeX math with KaTeX:
 * - Tiptap math nodes: `data-type="inline-math|block-math"` + `data-latex`
 * - Block math: `$$...$$` and `\[...\]`
 * - Inline math: `$...$` and `\(...\)`
 * Leaves `<pre>`, `<code>`, `<script>`, and `<style>` blocks intact.
 */
export function renderMathInHtml(html: string): string {
  if (!html) return "";

  // Split by code/pre/script/style tags to avoid parsing math inside code blocks
  const parts = html.split(
    /(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>)/gi,
  );

  return parts
    .map((part, index) => {
      // Odd indices are code/pre blocks
      if (index % 2 === 1) return part;

      // 0. Tiptap math nodes → placeholder, để các pass delimiter bên dưới không
      // quét lại HTML KaTeX (annotation chứa nguyên LaTeX).
      const mathNodes: string[] = [];
      let processed = part.replace(EMPTY_ELEMENT_RE, (match, _tag, attrs) => {
        const rendered = renderTiptapMathNode(attrs);
        if (rendered === null) return match;
        mathNodes.push(rendered);
        return `\u0000${mathNodes.length - 1}\u0000`;
      });

      // 1. Block math: $$ ... $$
      processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (match, tex) => {
        try {
          return katex.renderToString(decodeMathEntities(tex).trim(), {
            displayMode: true,
            throwOnError: false,
          });
        } catch {
          return match;
        }
      });

      // 1b. Block math: \[ ... \]
      processed = processed.replace(/\\\[([\s\S]+?)\\\]/g, (match, tex) => {
        try {
          return katex.renderToString(decodeMathEntities(tex).trim(), {
            displayMode: true,
            throwOnError: false,
          });
        } catch {
          return match;
        }
      });

      // 2. Inline math: \( ... \)
      processed = processed.replace(/\\\(([\s\S]+?)\\\)/g, (match, tex) => {
        try {
          return katex.renderToString(decodeMathEntities(tex).trim(), {
            displayMode: false,
            throwOnError: false,
          });
        } catch {
          return match;
        }
      });

      // 3. Inline math: $ ... $
      processed = processed.replace(
        /(^|[^\\])\$([^\$\n]+?)\$/g,
        (match, prefix, tex) => {
          if (tex.includes("<") && !tex.includes("&lt;")) {
            return match;
          }
          try {
            const rendered = katex.renderToString(
              decodeMathEntities(tex).trim(),
              {
                displayMode: false,
                throwOnError: false,
              },
            );
            return prefix + rendered;
          } catch {
            return match;
          }
        },
      );

      return processed.replace(
        MATH_PLACEHOLDER_RE,
        (_, index) => mathNodes[Number(index)] ?? "",
      );
    })
    .join("");
}

export type LatexPreview =
  | { ok: true; html: string }
  | { ok: false; message: string };

/**
 * Render một công thức LaTeX để xem trước khi chèn vào editor.
 * Trả `null` khi chưa nhập gì; lỗi cú pháp trả message KaTeX thay vì HTML đỏ.
 */
export function renderLatexPreview(
  latex: string,
  displayMode: boolean,
): LatexPreview | null {
  const tex = latex.trim();
  if (!tex) return null;
  try {
    return {
      ok: true,
      html: katex.renderToString(tex, { displayMode, throwOnError: true }),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.replace(/^KaTeX parse error:\s*/, "") : "";
    return { ok: false, message: message || "Công thức không hợp lệ." };
  }
}
