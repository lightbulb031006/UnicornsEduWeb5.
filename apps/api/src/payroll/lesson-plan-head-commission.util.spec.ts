import { computeLessonPlanHeadCommissionAmount } from './lesson-plan-head-commission.util';

describe('computeLessonPlanHeadCommissionAmount', () => {
  it('rounds percent of the attendance tuition_fee', () => {
    expect(computeLessonPlanHeadCommissionAmount(240000, 2)).toBe(4800);
    expect(computeLessonPlanHeadCommissionAmount(194280, 5)).toBe(9714);
  });
});
