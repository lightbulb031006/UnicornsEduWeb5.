import type { AttemptQuestionDto } from "@/dtos/attempt.dto";
import { assertNever } from "@/lib/assert-never";
import { touchedElectiveGroups } from "@/lib/exam-layout";

export type AttemptQuestionVisualStatus =
  "unanswered" | "answered" | "marked_for_review";

export function isAttemptQuestionUnanswered(q: AttemptQuestionDto): boolean {
  switch (q.type) {
    case "single_choice":
      return q.choiceIndex == null;
    case "true_false_group": {
      // Câu Đúng/Sai chỉ tính đã làm khi đủ cả 4 nhận định.
      const choices = q.tfChoices ?? [];
      return [0, 1, 2, 3].some((i) => typeof choices[i] !== "boolean");
    }
    case "true_false":
      return typeof q.tfChoices?.[0] !== "boolean";
    case "essay":
      return !q.essayAnswer?.trim();
    case "fill_blank": {
      // Chỉ tính đã làm khi mọi ô đều có chữ.
      const answers = q.blankAnswers ?? [];
      const count = q.blankCount ?? 0;
      return (
        count === 0 ||
        Array.from({ length: count }).some((_, i) => !answers[i]?.trim())
      );
    }
    case "ordering": {
      // Dùng hết thẻ mới tính đã làm.
      const cards = q.options?.length ?? 0;
      return cards === 0 || (q.orderAnswer?.length ?? 0) !== cards;
    }
    default:
      return assertNever(q.type, "question type");
  }
}

export function getAttemptQuestionVisualStatus(
  q: AttemptQuestionDto,
): AttemptQuestionVisualStatus {
  if (q.markedForReview) return "marked_for_review";
  if (isAttemptQuestionUnanswered(q)) return "unanswered";
  return "answered";
}

/**
 * Vị trí (1-based) các câu chưa làm. Đã chọn một nhóm tự chọn thì câu của nhóm
 * kia không tính là "chưa làm" — học sinh chỉ được làm một nhóm.
 */
export function unansweredQuestionNumbers(
  questions: AttemptQuestionDto[],
): number[] {
  const touched = touchedElectiveGroups(questions);
  return questions.flatMap((q, i) => {
    if (
      q.slot &&
      q.slot !== "required" &&
      touched.size > 0 &&
      !touched.has(q.slot)
    ) {
      return [];
    }
    return isAttemptQuestionUnanswered(q) ? [i + 1] : [];
  });
}

export function markedForReviewQuestionNumbers(
  questions: AttemptQuestionDto[],
): number[] {
  return questions.flatMap((q, i) => (q.markedForReview ? [i + 1] : []));
}

export function answeredQuestionCount(questions: AttemptQuestionDto[]): number {
  return questions.length - unansweredQuestionNumbers(questions).length;
}

export function answersSignature(questions: AttemptQuestionDto[]): string {
  return JSON.stringify(
    questions.map((q) => ({
      id: q.questionId,
      c: q.choiceIndex,
      e: q.essayAnswer ?? "",
      t: q.tfChoices ?? null,
      b: q.blankAnswers ?? null,
      o: q.orderAnswer ?? null,
      m: q.markedForReview ?? false,
    })),
  );
}

export function formatSavedAt(at: Date): string {
  const hh = String(at.getHours()).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
