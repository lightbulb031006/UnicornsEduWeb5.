import { BadRequestException } from '@nestjs/common';
import { QuestionSlot, QuestionType } from 'generated/enums';

/**
 * Form đề hồ sơ IT theo đề tốt nghiệp THPT (CONTEXT.md — Phần của đề, Nhóm tự chọn).
 * Phần I: trắc nghiệm. Phần II: Đúng/Sai bắt buộc → Tự chọn 1 → Tự chọn 2.
 */
interface ExamLinkLike {
  slot: QuestionSlot;
  question: { type: QuestionType };
}

/** Nhóm của câu trong đề IT: 0 Phần I, 1 bắt buộc, 2 Tự chọn 1, 3 Tự chọn 2. */
export function examGroupRank(link: ExamLinkLike): number {
  if (link.question.type !== QuestionType.true_false_group) return 0;
  if (link.slot === QuestionSlot.elective_1) return 2;
  if (link.slot === QuestionSlot.elective_2) return 3;
  return 1;
}

/** Sắp ổn định theo Phần I → Phần II (bắt buộc, Tự chọn 1, Tự chọn 2), giữ thứ tự gốc trong từng nhóm. */
export function orderExamLinks<T extends ExamLinkLike>(links: T[]): T[] {
  return links
    .map((link, index) => ({ link, index }))
    .sort(
      (a, b) =>
        examGroupRank(a.link) - examGroupRank(b.link) || a.index - b.index,
    )
    .map(({ link }) => link);
}

/** Lý do đề sai form, hoặc null nếu hợp lệ. Dùng chung cho cảnh báo lúc soạn và chặn lúc bắt đầu. */
export function examFormError(links: ExamLinkLike[]): string | null {
  const electives = links.filter((l) => l.slot !== QuestionSlot.required);
  if (electives.length === 0) return null;
  if (
    electives.some((l) => l.question.type !== QuestionType.true_false_group)
  ) {
    return 'Nhóm tự chọn chỉ được chứa câu Đúng/Sai.';
  }
  const g1 = electives.filter((l) => l.slot === QuestionSlot.elective_1).length;
  const g2 = electives.filter((l) => l.slot === QuestionSlot.elective_2).length;
  if (g1 === 0 || g2 === 0) {
    return 'Đề có nhóm tự chọn thì phải có đủ cả Tự chọn 1 và Tự chọn 2.';
  }
  if (g1 !== g2) {
    return `Hai nhóm tự chọn phải cùng số câu (Tự chọn 1: ${g1}, Tự chọn 2: ${g2}).`;
  }
  return null;
}

export function assertExamForm(links: ExamLinkLike[]): void {
  const error = examFormError(links);
  if (error) {
    throw new BadRequestException(
      `Đề sai form, không thể bắt đầu làm bài. ${error}`,
    );
  }
}
