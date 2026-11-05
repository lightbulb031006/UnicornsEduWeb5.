import { orderQuizAnswers } from './quiz-review-order';

type A = { questionId: string; material: string | null; position: number };
const a = (
  questionId: string,
  material: string | null = null,
  position = 0,
): A => ({ questionId, material, position });
const setOf = (x: A) =>
  x.material === null ? null : { setId: x.material, position: x.position };

describe('orderQuizAnswers — xem lại ôn nhẹ', () => {
  const order = new Map([
    ['q1', 0],
    ['q2', 1],
    ['q3', 2],
    ['q4', 3],
  ]);

  it('xếp theo thứ tự câu trong tiết, không theo thứ tự trả lời', () => {
    const result = orderQuizAnswers(
      [a('q3'), a('q1'), a('q2')],
      order,
      setOf,
    );
    expect(result.map((x) => x.questionId)).toEqual(['q1', 'q2', 'q3']);
  });

  it('câu cùng tư liệu dồn về khối tại câu đầu (khớp lúc làm)', () => {
    const result = orderQuizAnswers(
      [a('q4', 'm'), a('q2'), a('q1', 'm'), a('q3')],
      order,
      setOf,
    );
    expect(result.map((x) => x.questionId)).toEqual(['q1', 'q4', 'q2', 'q3']);
  });

  it('trong khối theo thứ tự bộ', () => {
    const result = orderQuizAnswers(
      [a('q1', 'm', 1), a('q2'), a('q4', 'm', 0)],
      order,
      setOf,
    );
    expect(result.map((x) => x.questionId)).toEqual(['q4', 'q1', 'q2']);
  });

  it('câu đã gỡ khỏi tiết xuống cuối', () => {
    const result = orderQuizAnswers(
      [a('q-cu'), a('q2'), a('q1')],
      order,
      setOf,
    );
    expect(result.map((x) => x.questionId)).toEqual(['q1', 'q2', 'q-cu']);
  });
});
