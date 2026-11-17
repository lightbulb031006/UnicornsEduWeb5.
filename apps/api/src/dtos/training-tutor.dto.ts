import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaymentStatus, StaffRole, StaffStatus } from 'generated/enums';
import { PaginationQueryDto } from './pagination.dto';

export const TRAINING_TUTOR_SCOPES = ['tutors', 'all'] as const;
export type TrainingTutorScope = (typeof TRAINING_TUTOR_SCOPES)[number];

/** Lọc một role trong ba nhóm ở `scope=all` (Gia sư / Ban Chuyên môn / Đào tạo). */
export const TRAINING_TUTOR_ROLE_FILTERS = [
  StaffRole.teacher,
  StaffRole.lesson_plan,
  StaffRole.training,
] as const;
export type TrainingTutorRoleFilter =
  (typeof TRAINING_TUTOR_ROLE_FILTERS)[number];

export class TrainingTutorListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo họ tên gia sư' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: StaffStatus })
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;

  @ApiPropertyOptional({
    enum: TRAINING_TUTOR_SCOPES,
    description:
      '`tutors` (mặc định): staff có role teacher. `all`: nhân sự ba nhóm Gia sư / Ban Chuyên môn / Đào tạo (#278) — chỉ Trưởng ban Đào tạo (và admin).',
  })
  @IsOptional()
  @IsIn(TRAINING_TUTOR_SCOPES)
  scope?: TrainingTutorScope;

  @ApiPropertyOptional({
    enum: TRAINING_TUTOR_ROLE_FILTERS,
    description:
      'Chỉ dùng với `scope=all`: lọc người mang role này (teacher = Gia sư, lesson_plan = Ban Chuyên môn, training = Đào tạo). Bỏ trống = cả ba nhóm.',
  })
  @IsOptional()
  @IsIn(TRAINING_TUTOR_ROLE_FILTERS)
  role?: TrainingTutorRoleFilter;
}

/**
 * Hồ sơ gia sư Ban Đào Tạo được xem. Chỉ allowlist: không email, số điện thoại,
 * CCCD, dân tộc, giới tính, ngày sinh, địa chỉ, ngân hàng, QR, Meet link, tiền.
 */
export interface TrainingTutorSummaryDto {
  id: string;
  fullName: string;
  status: StaffStatus;
  /**
   * Role nhân sự (không phải PII). Người xem không phải Admin chỉ thấy phần role
   * thuộc ba nhóm teacher / lesson_plan / training (#278).
   */
  roles: StaffRole[];
  avatarUrl: string | null;
  university: string | null;
  highSchool: string | null;
  achievementCount: number;
  /** Chỉ có khi người xem là Trưởng ban Đào tạo (#278). */
  management?: TrainingHeadTutorManagementDto;
}

/** Cờ thao tác Trưởng ban Đào tạo được làm trên nhân sự này (#278). */
export interface TrainingHeadTutorPermissionsDto {
  /** Bật/tắt role teacher / lesson_plan / training. */
  canEditRoles: boolean;
  /** Cấp dưới: sửa hồ sơ chuyên môn (họ tên, ảnh, trường). */
  canEditProfile: boolean;
  /** Đổi trạng thái đang làm / đã nghỉ — chỉ khi nhân sự CHỈ mang role ba nhóm. */
  canChangeStatus: boolean;
  /** Khoá tài khoản — chỉ khi nhân sự CHỈ mang role ba nhóm. */
  canLockAccount: boolean;
  /** Xem và tạo lại link Meet. */
  canManageMeetLink: boolean;
  /** Xem thưởng (chỉ đọc). */
  canViewBonuses: boolean;
  /** Đổi tên đăng nhập (16/11) — cùng điều kiện khoá tài khoản, cần có tài khoản. */
  canEditAccountHandle: boolean;
}

export interface TrainingHeadTutorManagementDto {
  /** Cấp dưới: thuộc ba nhóm, không phải chính mình, Admin hay role trưởng. */
  isSubordinate: boolean;
  /**
   * Nhân sự còn role ngoài ba nhóm (không nêu là role gì) — để form chỉnh role
   * biết tắt hết ba role vẫn hợp lệ.
   */
  hasOtherRoles: boolean;
  /** `users.status = inactive`; `null` nếu không phải cấp dưới hoặc chưa có tài khoản. */
  accountLocked: boolean | null;
  permissions: TrainingHeadTutorPermissionsDto;
}

/** Phần chi tiết thêm cho Trưởng ban: điền sẵn form hồ sơ + link Meet (chỉ cấp dưới). */
export interface TrainingHeadTutorDetailManagementDto extends TrainingHeadTutorManagementDto {
  lastName: string | null;
  firstName: string | null;
  googleMeetLink: string | null;
  /** Tên đăng nhập hiện tại (16/11) — chỉ cấp dưới có tài khoản, còn lại `null`. */
  accountHandle: string | null;
}

export interface TrainingTutorClassDto {
  id: string;
  name: string;
}

/** Dòng danh sách: hồ sơ + Lớp đang dạy (Lớp đã nghỉ chỉ có ở hồ sơ chi tiết). */
export interface TrainingTutorListItemDto extends TrainingTutorSummaryDto {
  currentClasses: TrainingTutorClassDto[];
}

export interface TrainingTutorDetailDto extends Omit<
  TrainingTutorListItemDto,
  'management'
> {
  /** Lớp đã nghỉ: lớp từng dạy nay không còn dạy, không phân biệt lý do. */
  pastClasses: TrainingTutorClassDto[];
  taughtSessionCount: number;
  management?: TrainingHeadTutorDetailManagementDto;
}

export interface TrainingTutorSessionDto {
  id: string;
  date: Date;
  startTime: Date | null;
  endTime: Date | null;
  class: TrainingTutorClassDto;
}

/**
 * Ứng viên để Trưởng ban Đào tạo bật role Gia sư / Ban Chuyên môn / Đào tạo
 * (follow-up 13/11 mục 2.2): nhân sự thường **ngoài** ba nhóm, đang active.
 */
export class TrainingRoleCandidateQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo họ tên nhân sự' })
  @IsOptional()
  @IsString()
  search?: string;
}

/** Chỉ họ tên + role hiện có — không thông tin cá nhân, không ảnh, không tiền. */
export interface TrainingRoleCandidateDto {
  id: string;
  fullName: string;
  roles: StaffRole[];
}

export interface TrainingTutorPageDto<T> {
  data: T[];
  meta: { total: number; page: number; limit: number };
}

export class TrainingTutorMonthQueryDto {
  @ApiPropertyOptional({ description: 'Tháng `YYYY-MM`', example: '2026-11' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'Tháng phải có dạng YYYY-MM.',
  })
  month?: string;
}

/** Thưởng của cấp dưới: có số tiền (thưởng không phải thu nhập cá nhân), chỉ đọc. */
export interface TrainingTutorBonusDto {
  id: string;
  workType: string;
  amount: number;
  status: PaymentStatus;
  note: string | null;
  month: string;
  /** `YYYY-MM-DD`. */
  date: string;
}

/**
 * PATCH /training/tutors/:id/professional-profile — chỉ hồ sơ chuyên môn. Field
 * khác (email, SĐT, CCCD, ngân hàng, lương…) không nằm trong DTO nên
 * ValidationPipe (`whitelist: true`) loại bỏ trước khi vào service.
 */
export class UpdateTrainingTutorProfileDto {
  @ApiPropertyOptional({ description: 'Họ (và tên đệm)', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Tên', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ description: 'Trường đại học', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  university?: string | null;

  @ApiPropertyOptional({ description: 'Trường THPT', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  highSchool?: string | null;
}

/** PATCH /training/tutors/:id/status — đang làm / đã nghỉ. */
export class UpdateTrainingTutorStatusDto {
  @ApiProperty({ enum: StaffStatus })
  @IsEnum(StaffStatus)
  status: StaffStatus;

  @ApiPropertyOptional({ description: 'Lý do (ghi vào lịch sử thao tác)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** PATCH /training/tutors/:id/account-status */
export class UpdateTrainingTutorAccountStatusDto {
  @ApiProperty({
    description: '`true`: khoá tài khoản đăng nhập; `false`: mở khoá.',
  })
  @IsBoolean()
  locked: boolean;
}

export interface TrainingTutorAccountStatusResultDto {
  id: string;
  accountLocked: boolean;
}

export interface TrainingTutorStatusResultDto {
  id: string;
  status: StaffStatus;
}
