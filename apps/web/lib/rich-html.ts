import DOMPurify from "dompurify";

const CODE_BLOCK_RE = /<pre\b([^>]*)>\s*<code\b([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/gi;

/**
 * Bọc từng dòng của khối `<pre><code>` trong `<span class="code-line">` để CSS
 * đánh số dòng (counter). Nội dung code của Tiptap là text đã escape nên tách
 * theo `\n` không cắt ngang thẻ. Chạy lại nhiều lần không bọc chồng.
 */
export function addCodeLineNumbers(html: string): string {
  return html.replace(CODE_BLOCK_RE, (match, preAttrs: string, codeAttrs: string, body: string) => {
    if (body.includes('class="code-line"')) return match;
    const lines = body.replace(/\n$/, "").split("\n");
    const wrapped = lines
      .map((line) => `<span class="code-line">${line || "​"}</span>`)
      .join("");
    return `<pre${preAttrs}><code${codeAttrs}>${wrapped}</code></pre>`;
  });
}

/**
 * Lọc HTML nội dung câu hỏi/bài học trước khi render (chặn script, `on*`,
 * `javascript:`…). Giữ `data-*` (node công thức, code song song) và `class`
 * (`language-*`). Ngoài trình duyệt DOMPurify không chạy → trả nguyên văn;
 * client render lại sau hydrate nên vẫn được lọc.
 */
export function sanitizeRichHtml(html: string): string {
  if (typeof window === "undefined" || !DOMPurify.isSupported) return html;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["style", "form", "input", "button", "iframe"],
    FORBID_ATTR: ["style"],
  });
}

/** Sanitize + đánh số dòng code: dùng cho mọi HTML rich text trước khi render math. */
export function prepareRichHtml(html: string): string {
  return addCodeLineNumbers(sanitizeRichHtml(html));
}
