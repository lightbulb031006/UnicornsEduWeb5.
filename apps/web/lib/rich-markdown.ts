import { marked } from "marked";

/**
 * Markdown gõ / dán raw trong TipTap: ProseMirror tách text/plain thành mỗi dòng
 * một `<p>` (bỏ dòng trống), nên HTML lưu là `<p># Tiêu đề</p><p>| a | b |</p>…`.
 * Lúc hiển thị, ghép các `<p>` liền nhau lại thành markdown rồi render.
 */

const STRONG_BLOCK_PATTERNS = [
  /^#{1,6}\s+\S/, // heading
  /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/, // dòng phân cách bảng
  /^>\s?/, // blockquote
  /^```/, // khối code
];
const LIST_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\S/;
const BOLD = /\*\*[^*\n]+\*\*/;

/** Có dấu hiệu khối markdown rõ ràng; văn bản thường giữ nguyên HTML. */
export function looksLikeMarkdown(text: string): boolean {
  const lines = text.split(/\r?\n/);
  if (lines.some((line) => STRONG_BLOCK_PATTERNS.some((re) => re.test(line)))) {
    return true;
  }
  const listLines = lines.filter((line) => LIST_LINE.test(line)).length;
  return listLines >= 2 || (listLines >= 1 && BOLD.test(text));
}

/**
 * Bảng GFM cần các dòng `|` liền nhau, blockquote có dòng trống xen giữa bị tách
 * thành nhiều khối → nối lại.
 */
export function normalizeMarkdownSpacing(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" && out.length > 0) {
      let next = i + 1;
      while (next < lines.length && lines[next].trim() === "") next++;
      const prev = out[out.length - 1].trim();
      const after = lines[next]?.trim() ?? "";
      if (prev.startsWith("|") && after.startsWith("|")) continue;
      if (prev.startsWith(">") && after.startsWith(">")) {
        // Giữ ngắt đoạn bên trong cùng một blockquote.
        out.push(">");
        i = next - 1;
        continue;
      }
    }
    out.push(line);
  }
  return out.join("\n");
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Code giữ nguyên; `$$…$$` khối; `$…$` cùng dòng, không mở/đóng bằng khoảng trắng;
// `<` ngoài code là chữ (vd `a<b`), không phải thẻ HTML.
const MATH_CODE_OR_LT =
  /(```[\s\S]*?```|`[^`\n]*`)|\$\$([\s\S]+?)\$\$|\$([^\s$](?:[^$\n]*[^\s$])?)\$|</g;

/** Markdown → HTML; công thức thành node math TipTap (`renderMathInHtml` render). */
export function markdownToHtml(markdown: string): string {
  const math: { latex: string; block: boolean }[] = [];
  const protectedSource = normalizeMarkdownSpacing(markdown).replace(
    MATH_CODE_OR_LT,
    (match, code: string | undefined, block: string | undefined, inline: string | undefined) => {
      if (code !== undefined) return match;
      if (match === "<") return "\\<";
      math.push({ latex: (block ?? inline ?? "").trim(), block: block !== undefined });
      return `MATHTOKEN${math.length - 1}END`;
    },
  );

  const html = marked.parse(protectedSource, { gfm: true, async: false });

  const blockHtml = (i: number) =>
    `<div data-type="block-math" data-latex="${escapeAttr(math[i].latex)}"></div>`;
  return html
    .replace(/<p>MATHTOKEN(\d+)END<\/p>/g, (match, i: string) =>
      math[Number(i)].block ? blockHtml(Number(i)) : match,
    )
    .replace(/MATHTOKEN(\d+)END/g, (_match, i: string) => {
      const { latex } = math[Number(i)];
      return `<span data-type="inline-math" data-latex="${escapeAttr(latex)}"></span>`;
    });
}

/** Một `<p>` → một dòng markdown; thẻ inline (đậm, link, công thức…) giữ nguyên qua token. */
function paragraphToLine(p: Element, tokens: string[]): string {
  let line = "";
  for (const child of Array.from(p.childNodes)) {
    if (child.nodeType === 3) {
      line += (child.textContent ?? "").replace(/ /g, " ");
    } else if (child.nodeName === "BR") {
      line += "\n";
    } else if (child.nodeType === 1) {
      tokens.push((child as Element).outerHTML);
      line += `HTMLTOKEN${tokens.length - 1}END`;
    }
  }
  return line;
}

/** Mỗi `<p>` là một khối → nối bằng dòng trống, trừ trong khối ``` giữ từng dòng. */
function joinLines(lines: string[]): string {
  let source = "";
  let inFence = false;
  lines.forEach((line, i) => {
    if (i > 0) source += inFence ? "\n" : "\n\n";
    source += line;
    if (line.trimStart().startsWith("```")) inFence = !inFence;
  });
  return source;
}

/**
 * Render markdown nằm trong HTML TipTap: mỗi dãy `<p>` liền nhau có dấu hiệu markdown
 * được thay bằng HTML đã render; bảng / ảnh / code TipTap và đoạn văn thường giữ nguyên.
 * Ngoài trình duyệt (SSR) không có DOMParser → trả nguyên văn.
 */
export function expandMarkdownInRichHtml(html: string): string {
  if (typeof DOMParser === "undefined" || !/<p[\s>]/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  let run: Element[] = [];
  let changed = false;

  const flush = () => {
    const paragraphs = run;
    run = [];
    if (paragraphs.length === 0) return;
    const tokens: string[] = [];
    const source = joinLines(paragraphs.map((p) => paragraphToLine(p, tokens)));
    if (!looksLikeMarkdown(source)) return;
    const template = doc.createElement("template");
    template.innerHTML = markdownToHtml(source).replace(
      /HTMLTOKEN(\d+)END/g,
      (_match, i: string) => tokens[Number(i)],
    );
    paragraphs[0].before(template.content);
    paragraphs.forEach((p) => p.remove());
    changed = true;
  };

  for (const node of Array.from(doc.body.childNodes)) {
    if (node.nodeName === "P") run.push(node as Element);
    else if (node.nodeType === 3 && !node.textContent?.trim()) continue;
    else flush();
  }
  flush();
  return changed ? doc.body.innerHTML : html;
}
