import { groupByMaterial, type SetSlot } from '../attempt/shuffle';

/**
 * Thứ tự xem lại bài tập ôn nhẹ = thứ tự lúc làm: theo thứ tự câu trong tiết,
 * câu cùng Bộ câu hỏi dồn về khối tại câu đầu, trong khối theo thứ tự bộ. Câu đã gỡ khỏi tiết
 * (vẫn còn câu trả lời) xuống cuối.
 */
export function orderQuizAnswers<T extends { questionId: string }>(
  answers: T[],
  quizOrder: ReadonlyMap<string, number>,
  setOf: (answer: T) => SetSlot | null,
): T[] {
  const rank = (a: T) => quizOrder.get(a.questionId) ?? Number.MAX_SAFE_INTEGER;
  const sorted = [...answers].sort((x, y) => rank(x) - rank(y));
  return groupByMaterial(sorted, setOf);
}
