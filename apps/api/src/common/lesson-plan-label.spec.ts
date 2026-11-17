import {
  LESSON_PLAN_HEAD_ROLE_LABEL,
  LESSON_PLAN_LABEL,
  LESSON_PLAN_ROLE_LABEL,
} from './lesson-plan-label';

describe('tên gọi Ban Chuyên môn (#280)', () => {
  it('nhãn role lesson_plan / lesson_plan_head dùng tên mới', () => {
    expect(LESSON_PLAN_ROLE_LABEL).toBe('Ban Chuyên môn');
    expect(LESSON_PLAN_HEAD_ROLE_LABEL).toBe('Trưởng ban Chuyên môn');
  });

  it('giữ nguyên tên nghiệp vụ giáo án (không phải tên role)', () => {
    expect(LESSON_PLAN_LABEL).toBe('Giáo án học sinh giỏi');
  });
});
