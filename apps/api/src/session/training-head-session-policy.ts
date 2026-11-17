import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AttendanceStatus } from '../../generated/enums';

/**
 * 14/11: Trưởng ban Đào tạo tick Học thử của từng học sinh trên buổi.
 *
 * Luật chuyển trạng thái điểm danh Trưởng ban được làm. Trưởng ban không phải
 * người điểm danh (việc của gia sư) → chỉ được đổi khi một phía là `trial`
 * (đánh dấu / bỏ đánh dấu học thử), không đổi qua lại có mặt / vắng / nghỉ phép.
 */
export function isTrainingHeadAttendanceTransitionAllowed(
  from: AttendanceStatus,
  to: AttendanceStatus,
): boolean {
  return from === AttendanceStatus.trial || to === AttendanceStatus.trial;
}

export interface TrainingHeadAttendanceChange {
  studentId: string;
  status: AttendanceStatus;
}

/**
 * Kiểm payload điểm danh của Trưởng ban, trả về các dòng thật sự đổi trạng thái.
 * - Học sinh phải có sẵn trong điểm danh buổi (không thêm / bớt học sinh).
 * - Mỗi học sinh tối đa một dòng.
 * - Mỗi lần đổi phải qua `isTrainingHeadAttendanceTransitionAllowed`.
 */
export function resolveTrainingHeadAttendanceChanges(
  currentStatusByStudentId: ReadonlyMap<string, AttendanceStatus>,
  changes: readonly TrainingHeadAttendanceChange[],
): TrainingHeadAttendanceChange[] {
  const seen = new Set<string>();
  const effective: TrainingHeadAttendanceChange[] = [];

  for (const change of changes) {
    if (seen.has(change.studentId)) {
      throw new BadRequestException(
        'Mỗi học sinh chỉ được gửi một trạng thái.',
      );
    }
    seen.add(change.studentId);

    const current = currentStatusByStudentId.get(change.studentId);
    if (current === undefined) {
      throw new BadRequestException(
        'Chỉ đổi được trạng thái học sinh đã có trong điểm danh của buổi.',
      );
    }
    if (current === change.status) {
      continue;
    }
    if (!isTrainingHeadAttendanceTransitionAllowed(current, change.status)) {
      throw new ForbiddenException(
        'Trưởng ban Đào tạo chỉ được đánh dấu hoặc bỏ đánh dấu Học thử.',
      );
    }
    effective.push(change);
  }

  return effective;
}
