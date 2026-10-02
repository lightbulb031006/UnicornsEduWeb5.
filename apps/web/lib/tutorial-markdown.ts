/**
 * Tutorial CF được lưu từ TipTap dạng HTML (<p>, <br>, …).
 * react-markdown không render HTML thô → thẻ như <p> hiện literal trong UI.
 * Hàm này bóc HTML → chuỗi markdown-like (đoạn cách bằng \n\n) rồi mới qua remark-math + KaTeX.
 *
 * Toàn bộ quá trình chuyển đổi là thuần chuỗi (không dùng DOMParser/`document`)
 * để server và client luôn cho ra cùng một kết quả → không gây hydration
 * mismatch khi nội dung được render trong Server Component hoặc pass hydrate.
 */

const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

function decodeBasicEntities(value: string): string {
  return value.replace(
    /&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/gi,
    (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity,
  );
}

/**
 * Chuyển HTML (TipTap) sang markdown-like theo thứ tự:
 * list item → `- `, block tag đóng → xuống đoạn, còn lại strip thẻ.
 */
function htmlToMarkdownish(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/(ul|ol)>/gi, "\n\n")
      .replace(/<\/(p|div|h[1-6]|blockquote|pre|tr)>/gi, "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * @param raw Nội dung từ DB: HTML TipTap hoặc markdown thuần đã lưu trước đó.
 */
export function tutorialStoredContentToMarkdownSource(raw: string): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return "";

  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(trimmed);
  if (!looksLikeHtml) return trimmed;

  return htmlToMarkdownish(trimmed);
}
