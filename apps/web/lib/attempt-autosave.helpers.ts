import type { AttemptQuestionDto } from "@/dtos/attempt.dto";

export type AttemptQuestionVisualStatus =
  | "unanswered"
  | "answered"
  | "marked_for_review";

export function isAttemptQuestionUnanswered(q: AttemptQuestionDto): boolean {
  if (q.type === "single_choice") return q.choiceIndex == null;
  return !q.essayAnswer?.trim();
}

export function getAttemptQuestionVisualStatus(
  q: AttemptQuestionDto,
): AttemptQuestionVisualStatus {
  if (q.markedForReview) return "marked_for_review";
  if (isAttemptQuestionUnanswered(q)) return "unanswered";
  return "answered";
}

export function unansweredQuestionNumbers(
  questions: AttemptQuestionDto[],
): number[] {
  return questions.flatMap((q, i) =>
    isAttemptQuestionUnanswered(q) ? [i + 1] : [],
  );
}

export function markedForReviewQuestionNumbers(
  questions: AttemptQuestionDto[],
): number[] {
  return questions.flatMap((q, i) => (q.markedForReview ? [i + 1] : []));
}

export function answeredQuestionCount(questions: AttemptQuestionDto[]): number {
  return questions.filter((q) => !isAttemptQuestionUnanswered(q)).length;
}

export function answersSignature(questions: AttemptQuestionDto[]): string {
  return JSON.stringify(
    questions.map((q) => ({
      id: q.questionId,
      c: q.choiceIndex,
      e: q.essayAnswer ?? "",
      m: q.markedForReview ?? false,
    })),
  );
}

export function formatSavedAt(at: Date): string {
  const hh = String(at.getHours()).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
