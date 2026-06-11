import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
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

export class SessionCreateDto {
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
    description: 'Start time HH:mm or HH:mm:ss',
    example: '19:00:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/, {
    message: 'startTime must use HH:mm or HH:mm:ss format',
  })
  startTime?: string;

  @ApiPropertyOptional({
    description: 'End time HH:mm or HH:mm:ss',
    example: '20:30:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/, {
    message: 'endTime must use HH:mm or HH:mm:ss format',
  })
  endTime?: string;

  @ApiPropertyOptional({
    description: 'Session note (HTML/plain text accepted).',
  })
  @IsOptional()
  @IsString()
  notes?: string | null;

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
    description: 'Teacher payment status',
    example: 'unpaid',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  teacherPaymentStatus?: string | null;

  @ApiProperty({
    description: 'Attendance items for this session.',
    type: [AttendanceCreateDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceCreateDto)
  attendance: AttendanceCreateDto[];
}

export class SessionUpdateDto extends PartialType(SessionCreateDto) {
  @ApiPropertyOptional({ description: 'Session id', example: 'uuid' })
  @IsOptional()
  @IsUUID()
  id?: string;

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

export class StaffOpsAttendanceDto {
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
    description: 'Attendance note',
    example: 'Đi trễ 10 phút.',
  })
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class CreateStaffOpsSessionDto {
  @ApiProperty({
    description: 'Session date YYYY-MM-DD',
    example: '2026-03-18',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must use YYYY-MM-DD format',
  })
  date: string;

  @ApiPropertyOptional({
    description: 'Start time HH:mm or HH:mm:ss',
    example: '19:00:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/, {
    message: 'startTime must use HH:mm or HH:mm:ss format',
  })
  startTime?: string;

  @ApiPropertyOptional({
    description: 'End time HH:mm or HH:mm:ss',
    example: '20:30:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/, {
    message: 'endTime must use HH:mm or HH:mm:ss format',
  })
  endTime?: string;

  @ApiPropertyOptional({
    description: 'Session note (HTML/plain text accepted).',
  })
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({
    description:
      'Coefficient for this session, from 0.0 to 1.0. Staff ops may edit this, but not allowance or tuition overrides.',
    example: 1.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(1)
  coefficient?: number;

  @ApiProperty({
    description: 'Attendance items without financial overrides.',
    type: [StaffOpsAttendanceDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffOpsAttendanceDto)
  attendance: StaffOpsAttendanceDto[];
}

export class UpdateStaffOpsSessionDto extends PartialType(
  CreateStaffOpsSessionDto,
) {}
