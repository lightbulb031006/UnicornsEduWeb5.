import { QuestionType } from 'generated/enums';
import { assertNever } from 'src/common/assert-never';

/**
 * Đảo câu / đảo đáp án lúc `start` (CONTEXT.md — Đảo câu). Mỗi lượt xáo một lần,
 * kết quả nằm trong snapshot `attempt_answers` nên F5 không đổi thứ tự.
 */
export type Rng = () => number;

/**
 * Rng tất định theo chuỗi seed (băm FNV-1a → mulberry32). Dùng khi không có
 * snapshot để giữ thứ tự xáo ổn định giữa các lần tải (vd thẻ câu sắp xếp ở ôn nhẹ).
 */
export function seededRng(seed: string): Rng {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates: hoán vị ngẫu nhiên đều của `0..n-1`. */
export function shuffledIndices(n: number, rng: Rng = Math.random): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Xáo trong từng đoạn liên tiếp cùng nhóm, giữ nguyên thứ tự các nhóm. Đầu vào
 * phải đã sắp theo nhóm (vd `orderExamLinks`).
 */
export function shuffleWithinGroups<T>(
  items: T[],
  groupOf: (item: T) => string | number,
  rng: Rng = Math.random,
): T[] {
  const out: T[] = [];
  let start = 0;
  while (start < items.length) {
    const key = groupOf(items[start]);
    let end = start + 1;
    while (end < items.length && groupOf(items[end]) === key) end++;
    const run = items.slice(start, end);
    out.push(...shuffledIndices(run.length, rng).map((i) => run[i]));
    start = end;
  }
  return out;
}

/** Câu thuộc Bộ câu hỏi nào, ở vị trí nào trong bộ. */
export type SetSlot = { setId: string; position: number };

/**
 * Chia đề thành đơn vị: mỗi Bộ câu hỏi là một khối (đặt tại vị trí câu đầu
 * tiên của nó, bên trong xếp theo thứ tự của bộ), câu lẻ đứng riêng.
 */
function materialUnits<T>(
  items: T[],
  setOf: (item: T) => SetSlot | null,
): T[][] {
  type Entry = { item: T; position: number };
  const units: Entry[][] = [];
  const blockOf = new Map<string, Entry[]>();
  for (const item of items) {
    const slot = setOf(item);
    if (slot === null) {
      units.push([{ item, position: 0 }]);
      continue;
    }
    const entry = { item, position: slot.position };
    const block = blockOf.get(slot.setId);
    if (block) {
      block.push(entry);
    } else {
      const created = [entry];
      blockOf.set(slot.setId, created);
      units.push(created);
    }
  }
  return units.map((unit) =>
    unit.sort((x, y) => x.position - y.position).map((e) => e.item),
  );
}

/** Vị trí trong bộ của một câu (câu lẻ → null). */
export function setSlotOf(question: {
  sharedMaterialId: string | null;
  setPosition: number | null;
}): SetSlot | null {
  return question.sharedMaterialId === null
    ? null
    : { setId: question.sharedMaterialId, position: question.setPosition ?? 0 };
}

/** Các câu cùng bộ đứng liền nhau theo thứ tự bộ (không xáo). */
export function groupByMaterial<T>(
  items: T[],
  setOf: (item: T) => SetSlot | null,
): T[] {
  return materialUnits(items, setOf).flat();
}

/** Đảo câu theo đơn vị: bộ xáo như một câu, bên trong bộ giữ thứ tự bộ. */
export function shuffleMaterialBlocks<T>(
  items: T[],
  setOf: (item: T) => SetSlot | null,
  rng: Rng = Math.random,
): T[] {
  const units = materialUnits(items, setOf);
  return shuffledIndices(units.length, rng).flatMap((i) => units[i]);
}

const NOT_LETTER = '(?<![\\p{L}\\p{N}])';
const END = '(?![\\p{L}\\p{N}])';

/**
 * Đáp án / nhận định nhắc tới vị trí của phương án khác: đảo sẽ sai nghĩa. Thà
 * bắt nhầm (câu đó chỉ không đảo đáp án) còn hơn sót (đáp án sai nghĩa).
 */
const POSITION_DEPENDENT: RegExp[] = [
  /(ở|nêu|kể|liệt kê)\s+(bên\s+)?trên/iu,
  /trên\s+đây|dưới\s+đây/iu,
  /tất\s+cả\s+(các\s+)?(đáp\s+án|phương\s+án|ý|nhận\s+định|lựa\s+chọn)|tất\s+cả\s+đều/iu,
  /không\s+(có\s+)?(đáp\s+án|phương\s+án|ý|lựa\s+chọn)\s+nào/iu,
  /cả\s+(hai|ba|bốn)\s+(đáp\s+án|phương\s+án|ý|nhận\s+định|đều)/iu,
  new RegExp(`${NOT_LETTER}(cả|đáp\\s+án|phương\\s+án)\\s+[A-D]${END}`, 'iu'),
  new RegExp(`${NOT_LETTER}[A-D]\\s*(,|và|hoặc|and|or)\\s*[A-D]${END}`, 'u'),
  new RegExp(`${NOT_LETTER}(ý|nhận\\s+định|mệnh\\s+đề)\\s+[a-d]${END}`, 'iu'),
  /\b(all|none|both|neither)\s+of\s+(the\s+)?(above|these)\b/i,
];

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

export function isPositionDependent(options: string[]): boolean {
  return options.some((opt) => {
    const text = plainText(opt);
    return POSITION_DEPENDENT.some((re) => re.test(text));
  });
}

export interface AnswerKey {
  correctIndex: number | null;
  tfAnswerKey: boolean[];
}

/** Đổi đáp án thứ tự gốc sang thứ tự hiển thị. `optionOrder[i]` = chỉ số gốc của phương án hiển thị thứ i. */
export function remapAnswerKey(
  optionOrder: number[],
  key: Partial<AnswerKey>,
): Partial<AnswerKey> {
  if (optionOrder.length === 0) return key;
  const out: Partial<AnswerKey> = {};
  if (key.correctIndex !== undefined) {
    // Phương án đúng mới không có trong snapshot (gia sư thêm phương án sau khi
    // lượt bắt đầu) → null: không ai đúng, xem lại không hiện đáp án rác.
    const pos =
      key.correctIndex === null ? -1 : optionOrder.indexOf(key.correctIndex);
    out.correctIndex = pos < 0 ? null : pos;
  }
  if (key.tfAnswerKey !== undefined) {
    out.tfAnswerKey =
      key.tfAnswerKey.length === optionOrder.length
        ? optionOrder.map((i) => key.tfAnswerKey![i])
        : key.tfAnswerKey;
  }
  return out;
}

export interface ShuffledOptions extends AnswerKey {
  options: string[];
  optionOrder: number[];
}

/**
 * Xáo phương án (trắc nghiệm) hoặc nhận định (Đúng/Sai). `null` = giữ nguyên:
 * tự luận, dữ liệu lạ, hoặc có phương án phụ thuộc vị trí.
 */
export function shuffleQuestionOptions(
  question: {
    type: QuestionType;
    options: unknown;
    correctIndex: number | null;
    tfAnswerKey: boolean[];
  },
  rng: Rng = Math.random,
): ShuffledOptions | null {
  switch (question.type) {
    case QuestionType.essay:
    // Câu Đúng/Sai: hai lựa chọn cố định, không có phương án để xáo.
    case QuestionType.true_false:
    // Câu điền vào ô trống: ô theo thứ tự trong đề, không có phương án.
    case QuestionType.fill_blank:
    // Câu sắp xếp: thẻ luôn bị xáo riêng (`shuffleOrderingCards`), kể cả khi tắt Đảo câu.
    case QuestionType.ordering:
      return null;
    case QuestionType.single_choice:
    case QuestionType.true_false_group:
      break;
    default:
      return assertNever(question.type, 'question type');
  }
  const options = question.options;
  if (
    !Array.isArray(options) ||
    options.length < 2 ||
    !options.every((o): o is string => typeof o === 'string')
  ) {
    return null;
  }
  if (isPositionDependent(options)) return null;
  const optionOrder = shuffledIndices(options.length, rng);
  const key = remapAnswerKey(optionOrder, {
    correctIndex: question.correctIndex,
    tfAnswerKey: question.tfAnswerKey,
  });
  return {
    options: optionOrder.map((i) => options[i]),
    optionOrder,
    correctIndex: key.correctIndex ?? null,
    tfAnswerKey: key.tfAnswerKey ?? [],
  };
}

const sameSequence = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Xáo thẻ câu sắp xếp. Luôn xáo (kể cả khi tắt Đảo câu) và không bao giờ hiện
 * đúng thứ tự đáp án — trừ khi mọi thẻ cùng chữ. `optionOrder[i]` = vị trí
 * gốc (thứ tự đúng) của thẻ hiển thị thứ i.
 */
export function shuffleOrderingCards(
  cards: string[],
  rng: Rng = Math.random,
): { options: string[]; optionOrder: number[] } {
  let optionOrder = shuffledIndices(cards.length, rng);
  let options = optionOrder.map((i) => cards[i]);
  if (sameSequence(options, cards) && new Set(cards).size > 1) {
    // Xoay một bước tới khi khác chữ: luôn dừng vì có ≥2 chữ khác nhau.
    do {
      optionOrder = [...optionOrder.slice(1), optionOrder[0]];
      options = optionOrder.map((i) => cards[i]);
    } while (sameSequence(options, cards));
  }
  return { options, optionOrder };
}

/** Thứ tự đúng (chữ thẻ) từ snapshot đã xáo. */
export function orderingKeyOf(
  options: string[],
  optionOrder: number[],
): string[] {
  if (optionOrder.length !== options.length) return [...options];
  const key: string[] = new Array<string>(options.length);
  optionOrder.forEach((orig, display) => {
    key[orig] = options[display];
  });
  return key;
}

/**
 * `optionOrder` mới để snapshot (thẻ hiển thị `options`) có thứ tự đúng `key`.
 * `null` khi bộ thẻ khác (thêm/bớt/sửa chữ thẻ) — bài cũ không chấm lại.
 */
export function reorderForKey(
  options: string[],
  key: string[],
): number[] | null {
  if (options.length !== key.length) return null;
  const used = new Array<boolean>(key.length).fill(false);
  const order: number[] = [];
  for (const card of options) {
    const k = key.findIndex((text, i) => !used[i] && text === card);
    if (k < 0) return null;
    used[k] = true;
    order.push(k);
  }
  return order;
}
