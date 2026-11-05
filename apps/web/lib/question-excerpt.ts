import { numberBlanks } from "@/lib/fill-blank";

/** Chữ đầu của đề câu (bỏ thẻ HTML) để người soạn nhận ra câu. */
export function questionExcerpt(content: string): string {
  const text = numberBlanks(content)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 60
    ? `${text.slice(0, 60)}…`
    : text || "(câu không có chữ)";
}
