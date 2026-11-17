import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  IsClassId,
  IsStaffId,
  IsStudentId,
} from '../common/entity-id.validators';
import { AttendanceStatus, SessionPaymentStatus } from '../../generated/enums';
import { AttendanceCreateDto, AttendanceUpdateDto } from './attendance.dto';
import { CONTENT_LIMITS, HTTP_URL_OPTIONS } from './content-limits';
import {
  AttendanceReviewFieldsDto,
  SessionReviewFieldsDto,
} from './session-review.dto';

export class MissedTeachingAlertExplanationDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsUUID()
  id: string;

  @ApiProperty({ example: 'Gia sư bị ốm nên không dạy được buổi này.' })
  @IsString()
  reason: string;

  @ApiProperty({ example: '2026-06-11T10:00:00.000Z' })
  @IsString()
  explainedAt: string;

  @ApiPropertyOptional({ example: 'Nguyen Van A', nullable: true })
  @IsOptional()
  @IsString()
  explainedByName: string | null;

  @ApiProperty({ example: true })
  canEdit: boolean;
}

export class MissedTeachingAlertDto {
  @ApiProperty({ example: 'UNICL-a:UNISTAFF-b:slot-1:2026-05-18' })
  id: string;

  @ApiProperty({ example: 'UNICL-b2c3d4e5f6' })
  @IsClassId()
  classId: string;

  @ApiProperty({ example: 'IELTS Foundation A' })
  @IsString()
  className: string;

  @ApiProperty({ example: 'UNISTAFF-c3d4e5f6a7' })
  @IsStaffId()
  teacherId: string;

  @ApiPropertyOptional({ example: 'Nguyen Van A', nullable: true })
  @IsOptional()
  @IsString()
  teacherName: string | null;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsUUID()
  scheduleEntryId: string;

  @ApiProperty({ example: '2026-05-18' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  originalDate: string;

  @ApiProperty({ example: '19:00:00' })
  @IsString()
  scheduledStartTime: string;

  @ApiPropertyOptional({ example: '20:30:00', nullable: true })
  @IsOptional()
  @IsString()
  scheduledEndTime: string | null;

  @ApiProperty({
    enum: ['pending_explanation', 'explained_pending_makeup'],
    example: 'pending_explanation',
  })
  @IsString()
  status: 'pending_explanation' | 'explained_pending_makeup';

  @ApiPropertyOptional({ type: MissedTeachingAlertExplanationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MissedTeachingAlertExplanationDto)
  explanation?: MissedTeachingAlertExplanationDto;
}

export class CreateMissedTeachingExplanationDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsUUID()
  scheduleEntryId: string;

  @ApiProperty({ example: '2026-06-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  originalDate: string;

  @ApiProperty({ example: 'UNISTAFF-c3d4e5f6a7' })
  @IsStaffId()
  teacherId: string;

  @ApiProperty({ example: 'Gia sư bị ốm nên không dạy được buổi này.' })
  @IsString()
  reason: string;
}

export class UpdateMissedTeachingExplanationDto {
  @ApiProperty({ example: 'Gia sư bị ốm, đã báo phụ huynh trước.' })
  @IsString()
  reason: string;
}

export class MissedTeachingExplanationResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'UNICL-b2c3d4e5f6' })
  classId: string;

  @ApiProperty({ example: 'UNISTAFF-c3d4e5f6a7' })
  teacherId: string;

  @ApiProperty({ example: 'slot-1' })
  baselineScheduleEntryId: string;

  @ApiProperty({ example: '2026-06-01' })
  originalDate: string;

  @ApiProperty({ example: 'Gia sư bị ốm nên không dạy được buổi này.' })
  reason: string;

  @ApiProperty({ example: '2026-06-11T10:00:00.000Z' })
  explainedAt: string;

  @ApiPropertyOptional({ example: 'Nguyen Van A', nullable: true })
  explainedByName: string | null;
}

export class SessionCreateDto extends SessionReviewFieldsDto {
  @ApiProperty({
    description: 'Class id',
    example: 'UNICL-b2c3d4e5f6',
  })
  @IsClassId()
  classId: string;

  @ApiProperty({
    description: 'Teacher id',
    example: 'UNISTAFF-c3d4e5f6a7',
  })
  @IsStaffId()
  teacherId: string;

  @ApiProperty({
    description: 'Session date YYYY-MM-DD',
    example: '2026-03-18',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must use YYYY-MM-DD format',
  })
  date: string;

  @ApiPropertyOptional({
    description:
      'Start time HH:mm or HH:mm:ss. Bắt buộc khi lớp ở chế độ theo block 30 phút.',
    example: '19:00:00',
  })
  @IsOptional()
  @ValidateIf((_obj, value) => value != null && String(value).trim() !== '')
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/, {
    message: 'startTime must use HH:mm or HH:mm:ss format',
  })
  startTime?: string;

  @ApiPropertyOptional({
    description:
      'End time HH:mm or HH:mm:ss. Bắt buộc khi lớp ở chế độ theo block 30 phút; phải sau startTime.',
    example: '20:30:00',
  })
  @IsOptional()
  @ValidateIf((_obj, value) => value != null && String(value).trim() !== '')
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/, {
    message: 'endTime must use HH:mm or HH:mm:ss format',
  })
  endTime?: string;

  @ApiPropertyOptional({
    description:
      'Session note (HTML/plain text accepted). Legacy field; prefer lessonContent.',
    maxLength: CONTENT_LIMITS.sessionRichText,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionRichText)
  notes?: string | null;

  @ApiProperty({
    description: 'Lesson content for the session (HTML/plain text accepted).',
    maxLength: CONTENT_LIMITS.sessionRichText,
  })
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionRichText)
  lessonContent: string;

  @ApiProperty({
    description:
      'Homework assignment for the session (HTML/plain text accepted).',
    maxLength: CONTENT_LIMITS.sessionRichText,
  })
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionRichText)
  homework: string;

  @ApiProperty({
    description:
      'Session tutorial for the class session (HTML/plain text accepted).',
    maxLength: CONTENT_LIMITS.sessionRichText,
  })
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionRichText)
  tutorial: string;

  @ApiPropertyOptional({
    description: 'YouTube video recording URL for this session.',
    example: 'https://youtube.com/watch?v=abc123',
    nullable: true,
    maxLength: CONTENT_LIMITS.url,
  })
  @IsOptional()
  @ValidateIf((_, value) => typeof value === 'string' && value.trim() !== '')
  @IsUrl(HTTP_URL_OPTIONS)
  @MaxLength(CONTENT_LIMITS.url)
  recordingUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Coefficient for this session, from 0.0 to 1.0.',
    example: 1.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(1)
  coefficient?: number;

  @ApiPropertyOptional({
    description:
      'Allowance amount (VNĐ) for this session. If omitted, uses class teacher custom allowance.',
    example: 120000,
    nullable: true,
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  allowanceAmount?: number | null;

  @ApiPropertyOptional({
    description:
      'Whether to apply teacher operating deduction for this session. Defaults to true.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  includeTeacherOperatingDeduction?: boolean;

  @ApiPropertyOptional({
    description: 'Teacher payment status',
    example: 'unpaid',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  teacherPaymentStatus?: string | null;

  @ApiPropertyOptional({
    description:
      'Attendance items for this session. Required for normal classes; omitted for no-attendance classes (auto-generated as present).',
    type: [AttendanceCreateDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceCreateDto)
  attendance?: AttendanceCreateDto[];
}

export class SessionUpdateDto extends PartialType(SessionCreateDto) {
  @ApiPropertyOptional({ description: 'Session id', example: 'uuid' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({
    description: 'Lesson content for the session (HTML/plain text accepted).',
    maxLength: CONTENT_LIMITS.sessionRichText,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionRichText)
  declare lessonContent?: string;

  @ApiPropertyOptional({
    description:
      'Homework assignment for the session (HTML/plain text accepted).',
    maxLength: CONTENT_LIMITS.sessionRichText,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionRichText)
  declare homework?: string;

  @ApiPropertyOptional({
    description:
      'Session tutorial for the class session (HTML/plain text accepted).',
    maxLength: CONTENT_LIMITS.sessionRichText,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionRichText)
  declare tutorial?: string;

  @ApiPropertyOptional({
    description: 'Teacher payment status',
    example: 'unpaid',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  teacherPaymentStatus?: string | null;

  @ApiPropertyOptional({
    description: 'Attendance items for this session.',
    type: [AttendanceUpdateDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceUpdateDto)
  declare attendance?: AttendanceUpdateDto[];
}

export class SessionBulkPaymentStatusUpdateDto {
  @ApiProperty({
    description: 'Danh sách id session cần cập nhật trạng thái thanh toán.',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  sessionIds: string[];

  @ApiProperty({
    description: 'Trạng thái thanh toán mới cho các session đã chọn.',
    enum: SessionPaymentStatus,
    example: SessionPaymentStatus.paid,
  })
  @IsEnum(SessionPaymentStatus)
  teacherPaymentStatus: SessionPaymentStatus;
}

export interface SessionBulkPaymentStatusUpdateResult {
  requestedCount: number;
  updatedCount: number;
}

export interface SessionUnpaidSummaryItem {
  classId: string;
  className: string;
  totalAllowance: number | string;
}

export class StaffOpsAttendanceDto extends AttendanceReviewFieldsDto {
  @ApiProperty({
    description: 'Student id',
    example: 'UNIST-a1b2c3d4e5',
  })
  @IsStudentId()
  studentId: string;

  @ApiProperty({ enum: AttendanceStatus, example: AttendanceStatus.present })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @ApiPropertyOptional({
    description:
      'Rich-text attendance note, maximum 500 plain-text characters.',
    example: 'Đi trễ 10 phút.',
    maxLength: CONTENT_LIMITS.sessionRichText,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionRichText)
  notes?: string | null;
}

export class CreateStaffOpsSessionDto extends SessionReviewFieldsDto {
  @ApiPropertyOptional({
    description:
      'Gia sư dạy buổi (#275). Admin / Quản lý lớp chọn bất kỳ gia sư nào của lớp; gia sư chỉ được để trống hoặc gửi chính mình. Bỏ trống: gia sư = chính người tạo (nếu là gia sư của lớp) hoặc gia sư duy nhất của lớp.',
    example: 'UNISTAFF-c3d4e5f6a7',
  })
  @IsOptional()
  @IsStaffId()
  teacherId?: string;

  @ApiProperty({
    description: 'Session date YYYY-MM-DD',
    example: '2026-03-18',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must use YYYY-MM-DD format',
  })
  date: string;

  @ApiPropertyOptional({
    description:
      'Start time HH:mm or HH:mm:ss. Bắt buộc khi lớp ở chế độ theo block 30 phút.',
    example: '19:00:00',
  })
  @IsOptional()
  @ValidateIf((_obj, value) => value != null && String(value).trim() !== '')
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/, {
    message: 'startTime must use HH:mm or HH:mm:ss format',
  })
  startTime?: string;

  @ApiPropertyOptional({
    description:
      'End time HH:mm or HH:mm:ss. Bắt buộc khi lớp ở chế độ theo block 30 phút; phải sau startTime.',
    example: '20:30:00',
  })
  @IsOptional()
  @ValidateIf((_obj, value) => value != null && String(value).trim() !== '')
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/, {
    message: 'endTime must use HH:mm or HH:mm:ss format',
  })
  endTime?: string;

  @ApiPropertyOptional({
    description:
      'Session note (HTML/plain text accepted). Legacy field; prefer lessonContent.',
    maxLength: CONTENT_LIMITS.sessionRichText,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionRichText)
  notes?: string | null;

  @ApiProperty({
    description: 'Lesson content for the session (HTML/plain text accepted).',
    maxLength: CONTENT_LIMITS.sessionRichText,
  })
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionRichText)
  lessonContent: string;

  @ApiProperty({
    description:
      'Homework assignment for the session (HTML/plain text accepted).',
    maxLength: CONTENT_LIMITS.sessionRichText,
  })
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionRichText)
  homework: string;

  @ApiProperty({
    description:
      'Session tutorial for the class session (HTML/plain text accepted).',
    maxLength: CONTENT_LIMITS.sessionRichText,
  })
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionRichText)
  tutorial: string;

  @ApiPropertyOptional({
    description: 'YouTube video recording URL for this session.',
    example: 'https://youtube.com/watch?v=abc123',
    nullable: true,
    maxLength: CONTENT_LIMITS.url,
  })
  @IsOptional()
  @ValidateIf((_, value) => typeof value === 'string' && value.trim() !== '')
  @IsUrl(HTTP_URL_OPTIONS)
  @MaxLength(CONTENT_LIMITS.url)
  recordingUrl?: string | null;

  @ApiPropertyOptional({
    description:
      'Coefficient for this session, from 0.0 to 1.0 (0 = Dạy thử). Chỉ Admin hoặc gia sư trên buổi do chính mình dạy được đổi; Quản lý lớp gửi giá trị khác hệ số hiện tại trên buổi của gia sư khác → 403 (#275). Không nhận allowance hay tuition override.',
    example: 1.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(1)
  coefficient?: number;

  @ApiPropertyOptional({
    description:
      'Attendance items without financial overrides. Required for normal classes; omitted for no-attendance classes (auto-generated as present).',
    type: [StaffOpsAttendanceDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffOpsAttendanceDto)
  attendance?: StaffOpsAttendanceDto[];
}

export class UpdateStaffOpsSessionDto extends PartialType(
  OmitType(CreateStaffOpsSessionDto, ['teacherId'] as const),
) {}

/** Một dòng đổi trạng thái học thử (Trưởng ban Đào tạo, 14/11). */
export class TrainingHeadAttendanceStatusDto {
  @ApiProperty({
    description: 'Học sinh đã có trong điểm danh của buổi',
    example: 'UNIST-a1b2c3d4e5',
  })
  @IsStudentId()
  studentId: string;

  @ApiProperty({
    enum: AttendanceStatus,
    example: AttendanceStatus.trial,
    description:
      'Trạng thái mới. Chỉ được đổi sang hoặc ra khỏi `trial` (Học thử).',
  })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;
}

/**
 * `PATCH /staff-ops/sessions/:id/training-head` (14/11): Trưởng ban Đào tạo
 * chỉnh tay trợ cấp buổi, tick Dạy thử của buổi, tick Học thử từng học sinh.
 */
export class TrainingHeadSessionUpdateDto {
  @ApiPropertyOptional({
    description:
      'Trợ cấp gốc của buổi (VNĐ, trước hệ số / vận hành / thuế). Buổi đã thanh toán hoặc ghi cọc không đổi được.',
    example: 150000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  allowanceAmount?: number;

  @ApiPropertyOptional({
    description: 'Dạy thử: 0 = buổi dạy thử (không trợ cấp), 1 = buổi thường.',
    enum: [0, 1],
    example: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1])
  coefficient?: number;

  @ApiPropertyOptional({
    type: [TrainingHeadAttendanceStatusDto],
    description:
      'Chỉ các học sinh cần đổi. Học sinh không gửi giữ nguyên trạng thái, ghi chú và nhận xét.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TrainingHeadAttendanceStatusDto)
  attendance?: TrainingHeadAttendanceStatusDto[];
}
