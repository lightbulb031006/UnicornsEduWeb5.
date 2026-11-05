import {
  assignmentDurationMinutes,
  isAssignmentClosed,
} from './assignment-window';

describe('assignment window', () => {
  it('lần giao mới đọc thời lượng từ tiết; lần giao cũ giữ thời lượng đã chốt', () => {
    expect(
      assignmentDurationMinutes({
        durationMinutes: null,
        lesson: { durationMinutes: 30 },
      }),
    ).toBe(30);
    expect(
      assignmentDurationMinutes({
        durationMinutes: 90,
        lesson: { durationMinutes: 30 },
      }),
    ).toBe(90);
  });

  it('không có hạn → không bao giờ đóng', () => {
    expect(isAssignmentClosed(null)).toBe(false);
  });

  it('đóng đúng từ mốc hạn trở đi', () => {
    const closeAt = new Date('2026-10-08T09:00:00.000Z');
    expect(isAssignmentClosed(closeAt, closeAt.getTime() - 1)).toBe(false);
    expect(isAssignmentClosed(closeAt, closeAt.getTime())).toBe(true);
  });
});
