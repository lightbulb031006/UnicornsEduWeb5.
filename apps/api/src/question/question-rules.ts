import { BadRequestException } from '@nestjs/common';
import { assertNever } from 'src/common/assert-never';
import type {
  LmsProfileConfig,
  LmsQuestionType,
} from '../lms-profile/lms-profile';
import {
  MAX_ANSWERS_PER_BLANK,
  MAX_BLANKS,
  countBlanks,
  normalizeBlankAnswer,
} from '../attempt/fill-blank';

/** Hình dạng câu hỏi theo loại + hồ sơ môn. Trả lỗi tiếng Việt hoặc null. */
export interface QuestionShape {
  type: string;
  options?: unknown;
  correctIndex?: number | null;
  tfAnswerKey?: boolean[] | null;
  /** Kiểu ô nhập của câu tự luận (JP). null = ô dài như câu cũ. */
  essayInputSize?: 'short' | 'long' | null;
  /** Kiểu nhãn Câu Đúng/Sai (JP). null = ○/×. */
  tfLabelStyle?: string | null;
  /** Đề bài — câu điền vào ô trống đếm ô `[[___]]` trong đây. */
  content?: string;
  /** Câu điền vào ô trống (JP): đáp án hợp lệ từng ô. */
  blankAnswerKey?: unknown;
}

const TYPE_LABEL: Record<LmsQuestionType, string> = {
  single_choice: 'trắc nghiệm',
  essay: 'tự luận',
  true_false_group: 'Đúng/Sai (nhóm 4 nhận định)',
  true_false: 'Đúng/Sai',
  fill_blank: 'điền vào ô trống',
  ordering: 'sắp xếp',
};

/** Số thẻ của câu sắp xếp. */
export const ORDERING_MIN_CARDS = 2;
export const ORDERING_MAX_CARDS = 12;

export function questionShapeError(
  shape: QuestionShape,
  profile: LmsProfileConfig,
): string | null {
  if (!(profile.questionTypes as string[]).includes(shape.type)) {
    if (shape.type === 'essay' && profile.profile === 'it') {
      return 'Hồ sơ Tin học không có câu tự luận.';
    }
    return `Hồ sơ ${profile.profile.toUpperCase()} không hỗ trợ câu ${TYPE_LABEL[shape.type as LmsQuestionType] ?? shape.type}.`;
  }
  const options = Array.isArray(shape.options) ? shape.options : null;
  const hasKey = (shape.tfAnswerKey?.length ?? 0) > 0;
  const type = shape.type as LmsQuestionType;
  if (shape.essayInputSize != null && type !== 'essay') {
    return 'Chỉ câu tự luận có kiểu ô nhập.';
  }
  if (shape.tfLabelStyle != null && type !== 'true_false') {
    return 'Chỉ Câu Đúng/Sai có kiểu nhãn.';
  }
  if (shape.blankAnswerKey != null && type !== 'fill_blank') {
    return 'Chỉ câu điền vào ô trống có đáp án ô trống.';
  }
  switch (type) {
    case 'single_choice': {
      const { min, max } = profile.optionCount;
      if (!options || options.length < min || options.length > max) {
        return `Câu trắc nghiệm phải có ${min}–${max} phương án.`;
      }
      if (shape.correctIndex === undefined || shape.correctIndex === null) {
        return 'Câu trắc nghiệm phải có đáp án đúng.';
      }
      if (shape.correctIndex < 0 || shape.correctIndex >= options.length) {
        return 'Đáp án đúng nằm ngoài danh sách phương án.';
      }
      if (hasKey) return 'Câu trắc nghiệm không có đáp án Đúng/Sai.';
      return null;
    }
    case 'true_false_group':
      if (!options || options.length !== 4) {
        return 'Câu Đúng/Sai phải có đúng 4 nhận định a–d.';
      }
      if (shape.tfAnswerKey?.length !== 4) {
        return 'Câu Đúng/Sai phải có đáp án cho đủ 4 nhận định.';
      }
      if (shape.correctIndex !== undefined && shape.correctIndex !== null) {
        return 'Câu Đúng/Sai không dùng correctIndex.';
      }
      return null;
    case 'true_false':
      // Một nhận định nằm ở `content`; đáp án ở `tfAnswerKey[0]`.
      if (options?.length) return 'Câu Đúng/Sai không có phương án.';
      if (shape.tfAnswerKey?.length !== 1) {
        return 'Câu Đúng/Sai phải có đáp án Đúng hoặc Sai.';
      }
      if (shape.correctIndex !== undefined && shape.correctIndex !== null) {
        return 'Câu Đúng/Sai không dùng correctIndex.';
      }
      return null;
    case 'fill_blank':
      if (options?.length || hasKey) {
        return 'Câu điền vào ô trống không có phương án.';
      }
      if (shape.correctIndex !== undefined && shape.correctIndex !== null) {
        return 'Câu điền vào ô trống không dùng correctIndex.';
      }
      return blankAnswerKeyError(shape.content ?? '', shape.blankAnswerKey);
    case 'ordering': {
      // Thẻ nằm ở `options` theo đúng thứ tự; thẻ trùng chữ hợp lệ.
      if (
        !options ||
        options.length < ORDERING_MIN_CARDS ||
        options.length > ORDERING_MAX_CARDS
      ) {
        return `Câu sắp xếp phải có ${ORDERING_MIN_CARDS}–${ORDERING_MAX_CARDS} thẻ.`;
      }
      const blank = options.findIndex(
        (o) => typeof o !== 'string' || o.trim() === '',
      );
      if (blank >= 0) return `Thẻ ${blank + 1} không được để trống.`;
      if (shape.correctIndex !== undefined && shape.correctIndex !== null) {
        return 'Câu sắp xếp không dùng correctIndex.';
      }
      if (hasKey) return 'Câu sắp xếp không có đáp án Đúng/Sai.';
      return null;
    }
    case 'essay':
      if (options?.length) return 'Câu tự luận không có phương án.';
      if (hasKey) return 'Câu tự luận không có đáp án Đúng/Sai.';
      if (shape.essayInputSize != null && !profile.essayInputSizes) {
        return `Hồ sơ ${profile.profile.toUpperCase()} không có kiểu ô tự luận.`;
      }
      return null;
    default:
      return assertNever(type, 'question type');
  }
}

/** Số ô `[[___]]` trong đề khớp danh sách đáp án; mỗi ô có ≥1 đáp án không rỗng. */
function blankAnswerKeyError(content: string, rawKey: unknown): string | null {
  const blanks = countBlanks(content);
  if (blanks === 0) {
    return 'Câu điền vào ô trống phải có ít nhất một ô [[___]] trong đề.';
  }
  if (blanks > MAX_BLANKS) {
    return `Câu điền vào ô trống có tối đa ${MAX_BLANKS} ô.`;
  }
  const key = Array.isArray(rawKey) ? (rawKey as unknown[]) : [];
  if (key.length !== blanks) {
    return `Đề có ${blanks} ô trống nhưng có đáp án cho ${key.length} ô.`;
  }
  for (const [i, answers] of key.entries()) {
    const valid = Array.isArray(answers)
      ? answers.filter(
          (a) => typeof a === 'string' && normalizeBlankAnswer(a) !== '',
        )
      : [];
    if (valid.length === 0) {
      return `Ô ${i + 1} phải có ít nhất một đáp án hợp lệ.`;
    }
    if (!Array.isArray(answers) || answers.length > MAX_ANSWERS_PER_BLANK) {
      return `Ô ${i + 1} có tối đa ${MAX_ANSWERS_PER_BLANK} đáp án hợp lệ.`;
    }
  }
  return null;
}

/**
 * Kỹ năng theo hồ sơ: JP bắt buộc ≥1 khi tạo/sửa (câu cũ rỗng chỉ bị đòi khi
 * sửa), hồ sơ khác không có kỹ năng.
 */
export function questionSkillsError(
  skills: readonly string[],
  profile: LmsProfileConfig,
): string | null {
  if (!profile.questionSkills) {
    return skills.length
      ? `Hồ sơ ${profile.profile.toUpperCase()} không có kỹ năng câu hỏi.`
      : null;
  }
  if (!skills.length) return 'Câu hỏi phải chọn ít nhất một kỹ năng.';
  if (new Set(skills).size !== skills.length) return 'Kỹ năng bị chọn trùng.';
  return null;
}

export function assertQuestionSkills(
  skills: readonly string[],
  profile: LmsProfileConfig,
  prefix = '',
): void {
  const error = questionSkillsError(skills, profile);
  if (error) throw new BadRequestException(`${prefix}${error}`);
}

export function assertQuestionShape(
  shape: QuestionShape,
  profile: LmsProfileConfig,
  prefix = '',
): void {
  const error = questionShapeError(shape, profile);
  if (error) throw new BadRequestException(`${prefix}${error}`);
}
