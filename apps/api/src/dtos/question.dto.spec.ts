import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  BulkCreateQuestionDto,
  CreateQuestionDto,
  QuestionTypeDto,
  UpdateQuestionDto,
} from './question.dto';

/** Payload captured from POST /questions when saving an MCQ on a practice topic. */
const capturedCreateBody = {
  courseId: '1ac55cd7-1c0b-4b41-b009-d337324e90b2',
  moduleId: 'ef86678c-6cda-4916-88a9-0122eadc7006',
  difficultyLevelId: '3aad4fb4-b5a1-542d-93a7-f796787d072d',
  type: QuestionTypeDto.single_choice,
  content:
    '<p>Điều kiện tiên quyết để áp dụng tìm kiếm nhị phân trên một mảng là gì?</p>',
  options: [
    'Mảng phải đã được sắp xếp theo thứ tự đơn điệu',
    'Mảng phải có số phần tử là luỹ thừa của $2$',
    'Mảng không được chứa phần tử trùng nhau',
    'Mảng phải toàn số nguyên dương',
  ],
  correctIndex: 1,
  explanation:
    '<p>Nhị phân dựa vào tính đơn điệu để loại một nửa miền tìm kiếm sau mỗi bước.</p>',
};

function constraintMessages(errors: Awaited<ReturnType<typeof validate>>): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...(error.children ?? []).flatMap((child) =>
      Object.values(child.constraints ?? {}),
    ),
  ]);
}

describe('CreateQuestionDto', () => {
  it('accepts single_choice options as string[] (practice-topic save payload)', async () => {
    const dto = plainToInstance(CreateQuestionDto, capturedCreateBody);
    const errors = await validate(dto);
    expect(constraintMessages(errors)).toEqual([]);
    expect(errors).toHaveLength(0);
  });

  it('rejects non-string option entries', async () => {
    const dto = plainToInstance(CreateQuestionDto, {
      ...capturedCreateBody,
      options: [{ text: 'A' }, { text: 'B' }],
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'options')).toBe(true);
  });
});

describe('UpdateQuestionDto', () => {
  it('accepts patching options as string[]', async () => {
    const dto = plainToInstance(UpdateQuestionDto, {
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

describe('BulkCreateQuestionDto', () => {
  it('accepts nested single_choice options as string[]', async () => {
    const dto = plainToInstance(BulkCreateQuestionDto, {
      courseId: capturedCreateBody.courseId,
      moduleId: capturedCreateBody.moduleId,
      questions: [
        {
          type: QuestionTypeDto.single_choice,
          content: capturedCreateBody.content,
          options: capturedCreateBody.options,
          correctIndex: 0,
          difficultyLevelId: capturedCreateBody.difficultyLevelId,
        },
      ],
    });
    const errors = await validate(dto);
    expect(constraintMessages(errors)).toEqual([]);
    expect(errors).toHaveLength(0);
  });
});
