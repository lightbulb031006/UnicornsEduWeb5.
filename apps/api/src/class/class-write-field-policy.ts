import { ForbiddenException } from '@nestjs/common';
import { ClassStatus, StaffRole } from 'generated/enums';
import type {
  CreateClassDto,
  UpdateClassBasicInfoDto,
} from 'src/dtos/class.dto';
import { SALE_CS_HEAD_ROLE } from 'src/common/sale-cs-head-access';
import {
  assertNotEditingOwnCompensation,
  type StaffPolicyActor,
} from 'src/common/staff-role-policy';

/**
 * #274 — Tạo lớp và sửa Thông tin lớp theo role (biên bản họp 12/11/2026,
 * mục 5.2/5.3).
 *
 * - **Admin:** mọi trường.
 * - **Trưởng ban Đào tạo:** thông tin lớp + gia sư + Quản lý lớp + lương gia
 *   sư (trợ cấp mỗi học sinh, trợ cấp tối đa, scale, trợ cấp riêng/scale
 *   riêng/% vận hành từng gia sư). Không học phí, không học sinh.
 * - **Trưởng phòng Sale & CSKH:** thông tin lớp + học phí + học sinh.
 * - Người mang cả hai role trưởng được hợp hai tập trường.
 * - Lịch học, cách thu học phí, «không cần điểm danh» và tạo lớp ở trạng
 *   thái kết thúc: chỉ Admin.
 *
 * Gửi trường ngoài quyền → 403 liệt kê các trường bị từ chối (không lặng lẽ
 * bỏ qua, để client biết payload sai).
 */

export interface ClassWriteScope {
  isAdmin: boolean;
  isTrainingHead: boolean;
  isSaleCsHead: boolean;
}

export function resolveClassWriteScope(
  actor: StaffPolicyActor,
): ClassWriteScope {
  return {
    isAdmin: actor.isAdmin,
    isTrainingHead: actor.roles.includes(StaffRole.training_head),
    isSaleCsHead: actor.roles.includes(SALE_CS_HEAD_ROLE),
  };
}

/** Admin + hai role trưởng được tạo lớp và sửa Thông tin lớp cơ bản. */
export function canWriteClassInfo(scope: ClassWriteScope): boolean {
  return scope.isAdmin || scope.isTrainingHead || scope.isSaleCsHead;
}

export const CLASS_WRITE_FIELD_LABELS: Record<string, string> = {
  name: 'Tên lớp',
  course_id: 'Khoá học',
  status: 'Trạng thái',
  max_students: 'Sĩ số tối đa',
  allowance_per_session_per_student: 'Trợ cấp mỗi học sinh',
  max_allowance_per_session: 'Trợ cấp tối đa',
  scale_amount: 'Scale',
  teacher_ids: 'Gia sư',
  teachers: 'Gia sư',
  training_manager_staff_id: 'Quản lý lớp',
  student_tuition_per_session: 'Học phí',
  student_tuition_per_block: 'Học phí',
  tuition_package_total: 'Học phí',
  tuition_package_session: 'Học phí',
  student_ids: 'Học sinh',
  pricing_mode: 'Cách thu học phí',
  schedule: 'Lịch học',
  no_attendance: 'Không cần điểm danh',
  content_access_expires_at: 'Hạn xem nội dung',
};

/** Trường cả hai role trưởng đều được gửi (tạo lớp + Thông tin lớp). */
const HEAD_CLASS_INFO_FIELDS = ['name', 'course_id', 'max_students'] as const;

const TRAINING_HEAD_CREATE_FIELDS = [
  'allowance_per_session_per_student',
  'max_allowance_per_session',
  'scale_amount',
  'teacher_ids',
  'teachers',
  'training_manager_staff_id',
] as const;

const SALE_CS_HEAD_CREATE_FIELDS = [
  'student_tuition_per_session',
  'student_tuition_per_block',
  'tuition_package_total',
  'tuition_package_session',
  'student_ids',
] as const;

/** `undefined`, `null`, mảng rỗng và `no_attendance: false` = không gửi. */
function isFieldSent(key: string, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (key === 'no_attendance' && value === false) return false;
  return true;
}

function throwForbiddenFields(action: string, keys: string[]): never {
  const labels = [
    ...new Set(keys.map((key) => CLASS_WRITE_FIELD_LABELS[key] ?? key)),
  ];
  throw new ForbiddenException(
    `Bạn không có quyền ${action} các trường: ${labels.join(', ')}.`,
  );
}

function collectForbiddenFields(
  payload: object,
  allowed: ReadonlySet<string>,
): string[] {
  return Object.entries(payload)
    .filter(([key, value]) => !allowed.has(key) && isFieldSent(key, value))
    .map(([key]) => key);
}

/** Trường được phép khi tạo lớp theo scope (hợp role). */
export function allowedCreateClassFields(
  scope: ClassWriteScope,
): ReadonlySet<string> | 'all' {
  if (scope.isAdmin) return 'all';
  const allowed = new Set<string>();
  if (scope.isTrainingHead || scope.isSaleCsHead) {
    HEAD_CLASS_INFO_FIELDS.forEach((field) => allowed.add(field));
  }
  if (scope.isTrainingHead) {
    TRAINING_HEAD_CREATE_FIELDS.forEach((field) => allowed.add(field));
  }
  if (scope.isSaleCsHead) {
    SALE_CS_HEAD_CREATE_FIELDS.forEach((field) => allowed.add(field));
  }
  return allowed;
}

/**
 * Chặn tạo lớp ngoài quyền. Thứ tự: role không được tạo lớp → 403; trường
 * ngoài quyền → 403 liệt kê; tự gán mình làm gia sư (lương của chính mình,
 * luật #265) → 403.
 */
export function assertCreateClassAllowed(
  actor: StaffPolicyActor,
  data: CreateClassDto,
): void {
  const scope = resolveClassWriteScope(actor);
  if (scope.isAdmin) return;
  if (!canWriteClassInfo(scope)) {
    throw new ForbiddenException(
      'Chỉ Admin, Trưởng ban Đào tạo hoặc Trưởng phòng Sale & CSKH được tạo lớp.',
    );
  }

  const allowed = allowedCreateClassFields(scope);
  const { status, ...rest } = data;
  const forbidden =
    allowed === 'all' ? [] : collectForbiddenFields(rest, allowed);
  // Lớp mới của role trưởng luôn «đang chạy»; kết thúc lớp chỉ Admin.
  if (status !== undefined && status !== ClassStatus.running) {
    forbidden.unshift('status');
  }
  if (forbidden.length > 0) {
    throwForbiddenFields('tạo lớp với', forbidden);
  }

  const teacherIds = [
    ...(data.teacher_ids ?? []),
    ...(data.teachers ?? []).map((teacher) => teacher.teacher_id),
  ];
  assertNotEditingOwnCompensation(actor, teacherIds);
}

/** Trưởng ban/Trưởng phòng chỉ sửa tên, khoá học (môn/loại lớp), sĩ số. */
export const HEAD_BASIC_INFO_FIELDS: ReadonlySet<string> = new Set(
  HEAD_CLASS_INFO_FIELDS,
);

export function assertUpdateClassBasicInfoAllowed(
  actor: StaffPolicyActor,
  dto: UpdateClassBasicInfoDto,
): void {
  const scope = resolveClassWriteScope(actor);
  if (scope.isAdmin) return;
  if (!canWriteClassInfo(scope)) {
    throw new ForbiddenException(
      'Chỉ Admin, Trưởng ban Đào tạo hoặc Trưởng phòng Sale & CSKH được sửa Thông tin lớp.',
    );
  }
  const forbidden = Object.entries(dto)
    .filter(
      ([key, value]) => !HEAD_BASIC_INFO_FIELDS.has(key) && value !== undefined,
    )
    .map(([key]) => key);
  if (forbidden.length > 0) {
    throwForbiddenFields('sửa', forbidden);
  }
}
