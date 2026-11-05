import katex from 'katex';

/**
 * Bản server của `apps/web/lib/math-render.ts#renderMathInHtml` — PDF render
 * trong Chromium không chạy bundle web, nên công thức phải thành HTML KaTeX
 * trước khi `setContent`. Giữ cùng luật nhận diện với web để bản in khớp màn
 * làm bài.
 */
function decodeMathEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** Phần tử rỗng `<span …></span>` / `<div …></div>`; giá trị attribute có thể chứa `>`. */
const EMPTY_ELEMENT_RE =
  /<(span|div)\b((?:[^>"']|"[^"]*"|'[^']*')*)>\s*<\/\1>/gi;
const MATH_NODE_TYPE_RE = /\bdata-type\s*=\s*"(inline-math|block-math)"/i;
const DATA_LATEX_RE = /\bdata-latex\s*=\s*"([^"]*)"/i;
// NUL làm dấu giữ chỗ: không bao giờ có trong HTML soạn thảo.
// eslint-disable-next-line no-control-regex
const MATH_PLACEHOLDER_RE = /\u0000(\d+)\u0000/g;
const CODE_BLOCK_RE =
  /(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>)/gi;

function renderTex(tex: string, displayMode: boolean): string {
  return katex.renderToString(decodeMathEntities(tex).trim(), {
    displayMode,
    throwOnError: false,
  });
}

/** Node công thức Tiptap Mathematics; `null` khi phần tử không phải node công thức. */
function renderTiptapMathNode(attrs: string): string | null {
  const type = MATH_NODE_TYPE_RE.exec(attrs)?.[1];
  const latex = DATA_LATEX_RE.exec(attrs)?.[1];
  if (!type || latex === undefined) return null;
  if (!decodeMathEntities(latex).trim()) return '';
  const displayMode = type === 'block-math';
  const html = renderTex(latex, displayMode);
  return displayMode ? `<div>${html}</div>` : html;
}

/**
 * Render LaTeX trong HTML bằng KaTeX: node Tiptap (`data-latex`), `$$…$$`,
 * `\[…\]`, `\(…\)`, `$…$`. Không đụng `<pre>`, `<code>`, `<script>`, `<style>`.
 */
export function renderMathInHtml(html: string): string {
  if (!html) return '';
  return html
    .split(CODE_BLOCK_RE)
    .map((part, index) => {
      if (index % 2 === 1) return part;

      // Node Tiptap → placeholder, để các pass delimiter không quét lại HTML
      // KaTeX (annotation chứa nguyên LaTeX).
      const mathNodes: string[] = [];
      let processed = part.replace(
        EMPTY_ELEMENT_RE,
        (match, _tag, attrs: string) => {
          const rendered = renderTiptapMathNode(attrs);
          if (rendered === null) return match;
          mathNodes.push(rendered);
          return `\u0000${mathNodes.length - 1}\u0000`;
        },
      );

      processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) =>
        renderTex(tex, true),
      );
      processed = processed.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex: string) =>
        renderTex(tex, true),
      );
      processed = processed.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex: string) =>
        renderTex(tex, false),
      );
      processed = processed.replace(
        /(^|[^\\])\$([^$\n]+?)\$/g,
        (match, prefix: string, tex: string) => {
          if (tex.includes('<') && !tex.includes('&lt;')) return match;
          return prefix + renderTex(tex, false);
        },
      );

      return processed.replace(
        MATH_PLACEHOLDER_RE,
        (_, i: string) => mathNodes[Number(i)] ?? '',
      );
    })
    .join('');
}
