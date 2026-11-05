import { BadRequestException } from '@nestjs/common';
import { QuestionSlot, QuestionType } from 'generated/enums';
import { assertExamForm, examFormError, orderExamLinks } from './exam-form';

const link = (
  id: string,
  type: QuestionType,
  slot: QuestionSlot = QuestionSlot.required,
) => ({ id, slot, question: { type } });
const SC = QuestionType.single_choice;
const TF = QuestionType.true_false_group;

describe('orderExamLinks', () => {
  it('Phần I trước, rồi Đúng/Sai bắt buộc, Tự chọn 1, Tự chọn 2; giữ thứ tự trong nhóm', () => {
    const links = [
      link('e2a', TF, QuestionSlot.elective_2),
      link('r1', TF),
      link('sc1', SC),
      link('e1a', TF, QuestionSlot.elective_1),
      link('sc2', SC),
      link('e1b', TF, QuestionSlot.elective_1),
      link('r2', TF),
    ];
    expect(orderExamLinks(links).map((l) => l.id)).toEqual([
      'sc1',
      'sc2',
      'r1',
      'r2',
      'e1a',
      'e1b',
      'e2a',
    ]);
  });
});

describe('examFormError', () => {
  it('đề không có tự chọn → hợp lệ', () => {
    expect(examFormError([link('a', SC), link('b', TF)])).toBeNull();
  });
  it('đề chuẩn 2 + 2 → hợp lệ', () => {
    expect(
      examFormError([
        link('a', TF, QuestionSlot.elective_1),
        link('b', TF, QuestionSlot.elective_1),
        link('c', TF, QuestionSlot.elective_2),
        link('d', TF, QuestionSlot.elective_2),
      ]),
    ).toBeNull();
  });
  it('trắc nghiệm trong nhóm tự chọn', () => {
    expect(
      examFormError([
        link('a', SC, QuestionSlot.elective_1),
        link('b', TF, QuestionSlot.elective_2),
      ]),
    ).toMatch('chỉ được chứa câu Đúng/Sai');
  });
  it('thiếu một nhóm', () => {
    expect(examFormError([link('a', TF, QuestionSlot.elective_1)])).toMatch(
      'đủ cả Tự chọn 1 và Tự chọn 2',
    );
  });
  it('lệch số câu', () => {
    expect(
      examFormError([
        link('a', TF, QuestionSlot.elective_1),
        link('b', TF, QuestionSlot.elective_1),
        link('c', TF, QuestionSlot.elective_2),
      ]),
    ).toBe('Hai nhóm tự chọn phải cùng số câu (Tự chọn 1: 2, Tự chọn 2: 1).');
  });
  it('assertExamForm ném BadRequest', () => {
    expect(() =>
      assertExamForm([link('a', TF, QuestionSlot.elective_1)]),
    ).toThrow(BadRequestException);
  });
});
