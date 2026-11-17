import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AttendanceStatus } from '../../generated/enums';
import {
  isTrainingHeadAttendanceTransitionAllowed,
  resolveTrainingHeadAttendanceChanges,
} from './training-head-session-policy';

describe('Trưởng ban Đào tạo tick Học thử (14/11)', () => {
  const current = new Map<string, AttendanceStatus>([
    ['st1', AttendanceStatus.present],
    ['st2', AttendanceStatus.trial],
    ['st3', AttendanceStatus.absent],
  ]);

  it.each([
    [AttendanceStatus.present, AttendanceStatus.trial, true],
    [AttendanceStatus.trial, AttendanceStatus.present, true],
    [AttendanceStatus.absent, AttendanceStatus.trial, true],
    [AttendanceStatus.present, AttendanceStatus.absent, false],
    [AttendanceStatus.excused, AttendanceStatus.present, false],
  ])('%s → %s: %s', (from, to, allowed) => {
    expect(isTrainingHeadAttendanceTransitionAllowed(from, to)).toBe(allowed);
  });

  it('chỉ trả các dòng thật sự đổi', () => {
    expect(
      resolveTrainingHeadAttendanceChanges(current, [
        { studentId: 'st1', status: AttendanceStatus.trial },
        { studentId: 'st2', status: AttendanceStatus.trial },
        { studentId: 'st3', status: AttendanceStatus.absent },
      ]),
    ).toEqual([{ studentId: 'st1', status: AttendanceStatus.trial }]);
  });

  it('chặn đổi có mặt ↔ vắng', () => {
    expect(() =>
      resolveTrainingHeadAttendanceChanges(current, [
        { studentId: 'st1', status: AttendanceStatus.absent },
      ]),
    ).toThrow(ForbiddenException);
  });

  it('chặn thêm học sinh không có trong buổi', () => {
    expect(() =>
      resolveTrainingHeadAttendanceChanges(current, [
        { studentId: 'st9', status: AttendanceStatus.trial },
      ]),
    ).toThrow(BadRequestException);
  });

  it('chặn gửi trùng học sinh', () => {
    expect(() =>
      resolveTrainingHeadAttendanceChanges(current, [
        { studentId: 'st1', status: AttendanceStatus.trial },
        { studentId: 'st1', status: AttendanceStatus.present },
      ]),
    ).toThrow(BadRequestException);
  });
});
