import { QuestionType } from 'generated/enums';

/**
 * Câu điền vào ô trống (hồ sơ JP) — hàm thuần: đếm ô trong đề, chuẩn hoá chữ
 * học sinh gõ, chấm từng ô.
 */

/** Dấu ô trống người soạn chèn vào đề bài. Thứ tự xuất hiện = số ô. */
export const BLANK_MARKER = '[[___]]';
const BLANK_MARKER_RE = /\[\[___\]\]/g;

/** Số ô trống tối đa một câu; số đáp án hợp lệ tối đa một ô. */
export const MAX_BLANKS = 10;
export const MAX_ANSWERS_PER_BLANK = 10;

export function countBlanks(content: string): number {
  return content.match(BLANK_MARKER_RE)?.length ?? 0;
}

/** Chữ số và chữ Latin toàn góc (Ｆ０-Ｆ９, Ａ-Ｚ, ａ-ｚ) → nửa góc. */
function toHalfWidthAlnum(s: string): string {
  return s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
}

/**
 * Chuẩn hoá trước khi so: bỏ khoảng trắng đầu/cuối (`trim` gồm cả U+3000),
 * số/Latin toàn góc = nửa góc, không phân biệt hoa/thường. Không đụng tới
 * hiragana/katakana/kanji.
 */
export function normalizeBlankAnswer(raw: string): string {
  return toHalfWidthAlnum(raw.trim()).toLowerCase();
}

/** Đọc `blank_answer_key` (Json) thành `string[][]`; sai dạng → []. */
export function parseBlankAnswerKey(raw: unknown): string[][] {
  if (!Array.isArray(raw)) return [];
  return raw.map((answers) =>
    Array.isArray(answers)
      ? answers.filter((a): a is string => typeof a === 'string')
      : [],
  );
}

/** Đọc chữ học sinh gõ (Json) thành `length` phần tử; ô trống/sai dạng → null. */
export function normalizeBlankAnswers(
  raw: unknown,
  length: number,
): (string | null)[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length }, (_, i) =>
    typeof list[i] === 'string' && list[i].trim() !== ''
      ? (list[i] as string)
      : null,
  );
}

/** Mọi ô đã có chữ. Câu không có ô (dữ liệu hỏng) coi như chưa làm. */
export function allBlanksFilled(rawKey: unknown, rawAnswers: unknown): boolean {
  const n = parseBlankAnswerKey(rawKey).length;
  return n > 0 && normalizeBlankAnswers(rawAnswers, n).every((a) => a !== null);
}

/**
 * Chấm từng ô: ô đúng khi chữ học sinh (đã chuẩn hoá) trùng một đáp án hợp lệ.
 * Điểm câu chia đều cho số ô; ô bỏ trống được 0.
 */
export function gradeFillBlank(
  rawKey: unknown,
  rawAnswers: unknown,
  pointsPossible: number,
): { correct: number; total: number; points: number } {
  const key = parseBlankAnswerKey(rawKey);
  const answers = normalizeBlankAnswers(rawAnswers, key.length);
  const correct = key.filter((accepted, i) => {
    const answer = answers[i];
    if (answer === null) return false;
    const given = normalizeBlankAnswer(answer);
    return accepted.some((a) => normalizeBlankAnswer(a) === given);
  }).length;
  const total = key.length;
  return {
    correct,
    total,
    points: total === 0 ? 0 : Math.round((pointsPossible * correct) / total),
  };
}

/** Số ô + chữ đã gõ trả cho client; loại câu khác → null. */
export function blankFieldsOf(
  type: QuestionType,
  rawKey: unknown,
  rawAnswers: unknown,
): { blankCount: number | null; blankAnswers: (string | null)[] | null } {
  if (type !== QuestionType.fill_blank) {
    return { blankCount: null, blankAnswers: null };
  }
  const blankCount = parseBlankAnswerKey(rawKey).length;
  return {
    blankCount,
    blankAnswers: normalizeBlankAnswers(rawAnswers, blankCount),
  };
}
