import { ForbiddenException } from '@nestjs/common';
import type { UpdateClassTeacherPayDto } from 'src/dtos/class.dto';

/**
 * #276 — Quản lý lớp sửa lương gia sư theo lớp, **trừ phần của chính mình**
 * (luật #265, biên bản 12/11/2026 mục 2 + 6). #277: Trưởng ban Đào tạo dùng
 * cùng luật trên mọi lớp (mục 7).
 *
 * «Phần của chính mình» gồm:
 * - Dòng gia sư của chính mình (`teachers[].teacher_id === lockedTeacherId`).
 * - Mức mặc định của lớp mà dòng của mình đang **kế thừa** khi mình đang dạy
 *   lớp (phân công chưa nghỉ):
 *   - Trợ cấp mỗi học sinh — khi dòng của mình không có trợ cấp riêng.
 *   - Scale — khi dòng của mình không có scale riêng.
 *   - Trợ cấp tối đa — luôn chặn vì trần áp cho mọi gia sư của lớp.
 *
 * Admin (`lockedTeacherId = null`) được miễn.
 */

export interface OwnClassTeacherAssignment {
  customAllowance: number | null;
  customAllowancePerSession?: number | null;
  customScaleAmount: number | null;
  status: string | null;
}

const OWN_PAY_FIELD_LABELS: Record<string, string> = {
  teachers: 'Lương của chính mình',
  allowance_per_session_per_student:
    'Trợ cấp mỗi học sinh (bạn đang hưởng mức mặc định)',
  max_allowance_per_session: 'Trợ cấp tối đa (áp cho cả phần của bạn)',
  scale_amount: 'Scale (bạn đang hưởng mức mặc định)',
};

function isActiveAssignment(
  assignment: OwnClassTeacherAssignment | null | undefined,
): assignment is OwnClassTeacherAssignment {
  return Boolean(assignment) && assignment?.status !== 'inactive';
}

/** Các trường trong payload chạm vào lương của chính actor (rỗng = hợp lệ). */
export function findOwnPayFieldsInTeacherPayUpdate(
  dto: UpdateClassTeacherPayDto,
  lockedTeacherId: string | null,
  ownAssignment: OwnClassTeacherAssignment | null | undefined,
): string[] {
  if (!lockedTeacherId) {
    return [];
  }

  const fields: string[] = [];
  if (
    (dto.teachers ?? []).some(
      (teacher) => teacher.teacher_id === lockedTeacherId,
    )
  ) {
    fields.push('teachers');
  }

  if (!isActiveAssignment(ownAssignment)) {
    return fields;
  }

  const inheritsAllowance =
    ownAssignment.customAllowance == null &&
    ownAssignment.customAllowancePerSession == null;
  if (
    dto.allowance_per_session_per_student !== undefined &&
    inheritsAllowance
  ) {
    fields.push('allowance_per_session_per_student');
  }
  if (dto.max_allowance_per_session !== undefined) {
    fields.push('max_allowance_per_session');
  }
  if (
    dto.scale_amount !== undefined &&
    ownAssignment.customScaleAmount == null
  ) {
    fields.push('scale_amount');
  }

  return fields;
}

export function assertTeacherPayUpdateExcludesOwnPay(
  dto: UpdateClassTeacherPayDto,
  lockedTeacherId: string | null,
  ownAssignment: OwnClassTeacherAssignment | null | undefined,
): void {
  const fields = findOwnPayFieldsInTeacherPayUpdate(
    dto,
    lockedTeacherId,
    ownAssignment,
  );
  if (fields.length === 0) {
    return;
  }
  const labels = fields.map((field) => OWN_PAY_FIELD_LABELS[field] ?? field);
  throw new ForbiddenException(
    `Không được tự chỉnh lương của chính mình: ${labels.join('; ')}.`,
  );
}
