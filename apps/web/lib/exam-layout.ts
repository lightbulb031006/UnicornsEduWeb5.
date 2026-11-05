import type {
  AttemptAudioView,
  AttemptQuestionDto,
  AttemptScoringDto,
  QuestionSlotDto,
  TrueFalseChoices,
} from "@/dtos/attempt.dto";
import type { QuestionTypeValue } from "@/dtos/question.dto";
import { assertNever } from "@/lib/assert-never";

/**
 * Bố cục đề theo form tốt nghiệp THPT Tin (CONTEXT.md — Phần của đề, Nhóm tự chọn).
 * Chỉ áp cho Bài làm `absolute_it`; JP/ENG đánh số liên tục như cũ.
 *
 * - Phần I: trắc nghiệm, đánh số 1..n.
 * - Phần II: Đúng/Sai, đánh số lại từ 1. Hai nhóm tự chọn dùng chung dải số
 *   (vd Câu 3–4 Tự chọn 1 và Câu 3–4 Tự chọn 2), như đề giấy.
 */
export interface ExamQuestionView<Q> {
  question: Q;
  /** Số hiển thị trong thẻ câu: "Câu 3". */
  number: number;
  /** Nhãn ngắn duy nhất cho lưới / danh sách chưa làm: "5", "II.3", "TC1·3". */
  shortLabel: string;
  /** Tiêu đề phần hiện trước câu này (lần đầu gặp phần), vd "PHẦN I". */
  partHeader: string | null;
  /** Tiêu đề nhóm tự chọn hiện trước câu này (lần đầu gặp nhóm). */
  groupHeader: string | null;
}

export type ElectiveGroupNames = {
  elective_1: string | null;
  elective_2: string | null;
};

type LayoutQuestion = Pick<AttemptQuestionDto, "type" | "slot">;

export function electiveGroupTitle(
  slot: Exclude<QuestionSlotDto, "required">,
  names?: ElectiveGroupNames | null,
): string {
  const base = slot === "elective_1" ? "Tự chọn 1" : "Tự chọn 2";
  const name = names?.[slot]?.trim();
  return name ? `${base} — ${name}` : base;
}

export function buildExamLayout<Q extends LayoutQuestion>(
  questions: Q[],
  scoring: AttemptScoringDto,
  names?: ElectiveGroupNames | null,
): ExamQuestionView<Q>[] {
  if (scoring !== "absolute_it") {
    return questions.map((question, i) => ({
      question,
      number: i + 1,
      shortLabel: String(i + 1),
      partHeader: null,
      groupHeader: null,
    }));
  }

  const hasPart2 = questions.some((q) => itExamPart(q.type) === "II");
  let part1 = 0;
  let required2 = 0;
  const electiveCount: Record<string, number> = { elective_1: 0, elective_2: 0 };
  const seen = new Set<string>();

  return questions.map((question) => {
    const partKey = itExamPart(question.type);
    const isPart2 = partKey === "II";
    const partHeader =
      !seen.has(partKey) && (hasPart2 || isPart2)
        ? `PHẦN ${partKey}`
        : null;
    seen.add(partKey);

    if (!isPart2) {
      part1 += 1;
      return {
        question,
        number: part1,
        shortLabel: String(part1),
        partHeader,
        groupHeader: null,
      };
    }
    if (question.slot === "required") {
      required2 += 1;
      return {
        question,
        number: required2,
        shortLabel: `II.${required2}`,
        partHeader,
        groupHeader: null,
      };
    }
    electiveCount[question.slot] += 1;
    const number = required2 + electiveCount[question.slot];
    const groupHeader = seen.has(question.slot)
      ? null
      : electiveGroupTitle(question.slot, names);
    seen.add(question.slot);
    return {
      question,
      number,
      shortLabel: `TC${question.slot === "elective_1" ? 1 : 2}·${number}`,
      partHeader,
      groupHeader,
    };
  });
}

export function hasAnyTrueFalseChoice(
  choices: TrueFalseChoices | null | undefined,
): boolean {
  return (choices ?? []).some((c) => c === true || c === false);
}

/** Nhóm tự chọn học sinh đã chạm (≥1 nhận định được chọn). */
export function touchedElectiveGroups(
  questions: Pick<AttemptQuestionDto, "slot" | "tfChoices">[],
): Set<QuestionSlotDto> {
  const touched = new Set<QuestionSlotDto>();
  for (const q of questions) {
    if (q.slot !== "required" && hasAnyTrueFalseChoice(q.tfChoices)) {
      touched.add(q.slot);
    }
  }
  return touched;
}

/** Cả hai nhóm tự chọn đều đã có lựa chọn → phần tự chọn sẽ bị 0 điểm. */
export function isElectiveConflict(
  questions: Pick<AttemptQuestionDto, "slot" | "tfChoices">[],
): boolean {
  const touched = touchedElectiveGroups(questions);
  return touched.has("elective_1") && touched.has("elective_2");
}

type OrderableQuestion = Pick<AttemptQuestionDto, "type" | "slot">;

/**
 * Phần của đề IT theo loại câu. Loại câu ngoài hồ sơ IT không lên đề IT — xếp
 * Phần I như trước; thêm loại câu mới thì tsc buộc chọn phần ở đây.
 */
export function itExamPart(type: QuestionTypeValue): "I" | "II" {
  switch (type) {
    case "true_false_group":
      return "II";
    case "single_choice":
    case "essay":
    case "true_false":
    case "fill_blank":
    case "ordering":
      return "I";
    default:
      return assertNever(type, "question type");
  }
}

function examRank(q: OrderableQuestion): number {
  if (itExamPart(q.type) === "I") return 0;
  if (q.slot === "elective_1") return 2;
  if (q.slot === "elective_2") return 3;
  return 1;
}

/**
 * Sắp ổn định Phần I → Phần II (bắt buộc, Tự chọn 1, Tự chọn 2), giữ thứ tự gốc
 * trong từng nhóm — khớp `orderExamLinks` phía API để màn soạn đề hiện đúng
 * thứ tự học sinh thấy.
 */
export function orderExamQuestions<Q extends OrderableQuestion>(questions: Q[]): Q[] {
  return questions
    .map((question, index) => ({ question, index }))
    .sort((a, b) => examRank(a.question) - examRank(b.question) || a.index - b.index)
    .map(({ question }) => question);
}

/** Điểm mỗi câu hồ sơ IT, đơn vị 1/100 (ADR it-absolute-scoring). */
export const IT_POINTS = { single_choice: 25, true_false_group: 100 } as const;

export interface ItExamBreakdown {
  part1: number;
  required2: number;
  elective1: number;
  elective2: number;
  /** Điểm tối đa học sinh đạt được, đơn vị 1/100: chỉ một nhóm tự chọn được tính. */
  maxPoints: number;
}

export function itExamBreakdown(questions: OrderableQuestion[]): ItExamBreakdown {
  const count = { part1: 0, required2: 0, elective1: 0, elective2: 0 };
  for (const q of questions) {
    if (itExamPart(q.type) === "I") count.part1 += 1;
    else if (q.slot === "elective_1") count.elective1 += 1;
    else if (q.slot === "elective_2") count.elective2 += 1;
    else count.required2 += 1;
  }
  const maxPoints =
    count.part1 * IT_POINTS.single_choice +
    (count.required2 + Math.max(count.elective1, count.elective2)) *
      IT_POINTS.true_false_group;
  return { ...count, maxPoints };
}

export interface MaterialHeader {
  /** HTML tư liệu (bản chụp lúc start). */
  content: string;
  /** Audio của tư liệu; vắng/null = tư liệu không có audio. */
  audio?: AttemptAudioView | null;
  /** Dải số câu (đánh số liên tục từ 1) dựa vào tư liệu: "Câu 2–4". */
  firstNumber: number;
  lastNumber: number;
}

/**
 * Tư liệu dùng chung hiện MỘT lần trước câu đầu của khối (API đã xếp câu cùng
 * tư liệu liền nhau). Phần tử i = tư liệu cần hiện trước câu i, hoặc null.
 */
export function materialHeaders<Q>(
  questions: Q[],
  materialOf: (
    q: Q,
  ) =>
    | { id: string; content: string; audio?: AttemptAudioView | null }
    | null
    | undefined,
): (MaterialHeader | null)[] {
  return questions.map((q, i) => {
    const material = materialOf(q);
    if (!material) return null;
    if (i > 0 && materialOf(questions[i - 1])?.id === material.id) return null;
    let last = i;
    while (
      last + 1 < questions.length &&
      materialOf(questions[last + 1])?.id === material.id
    ) {
      last += 1;
    }
    return {
      content: material.content,
      ...(material.audio !== undefined && { audio: material.audio }),
      firstNumber: i + 1,
      lastNumber: last + 1,
    };
  });
}

export interface MaterialSegment {
  /** Tư liệu của khối; null = một câu lẻ. */
  header: MaterialHeader | null;
  /** Chỉ số (trong danh sách câu) các câu của đoạn, liền nhau. */
  indices: number[];
}

/**
 * Chia danh sách câu thành đoạn theo `materialHeaders`: mỗi bộ là một đoạn gồm
 * mọi câu của khối, câu lẻ là đoạn riêng — để khối bộ bọc chung một phần tử
 * (trình phát audio của bộ dính trong phạm vi khối).
 */
export function materialSegments(
  headers: (MaterialHeader | null)[],
): MaterialSegment[] {
  const segments: MaterialSegment[] = [];
  let i = 0;
  while (i < headers.length) {
    const header = headers[i];
    const end = header ? header.lastNumber - 1 : i;
    const indices: number[] = [];
    for (let k = i; k <= end; k += 1) indices.push(k);
    segments.push({ header, indices });
    i = end + 1;
  }
  return segments;
}
