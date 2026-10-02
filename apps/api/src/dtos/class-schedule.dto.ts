import {
  PartialType,
  OmitType,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  Max,
  Min,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import {
  IsClassId,
  IsStaffId,
  IsStudentId,
} from '../common/entity-id.validators';
import { Type } from 'class-transformer';

const CALENDAR_EVENT_TYPES = ['fixed', 'makeup', 'exam'] as const;

export class ClassScheduleEntryDto {
  @ApiPropertyOptional({
    description: 'Unique identifier for this schedule entry',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({
    description:
      'Day of week (0=Chủ Nhật, 1=Thứ Hai, 2=Thứ Ba, 3=Thứ Tư, 4=Thứ Năm, 5=Thứ Sáu, 6=Thứ Bảy)',
    example: 1,
  })
  @IsInt()
  @IsIn([0, 1, 2, 3, 4, 5, 6])
  dayOfWeek: number;

  @ApiProperty({
    description: 'Start time in HH:mm or HH:mm:ss format',
    example: '19:00',
  })
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, {
    message: 'from must be in HH:mm or HH:mm:ss format',
  })
  from: string;

  @ApiProperty({
    description: 'End time in HH:mm or HH:mm:ss format',
    example: '20:30',
  })
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, {
    message: 'end must be in HH:mm or HH:mm:ss format',
  })
  end: string;

  @ApiPropertyOptional({
    description: 'Responsible tutor for this weekly schedule entry',
    example: 'UNISTAFF-c3d4e5f6a7',
  })
  @IsOptional()
  @IsStaffId()
  teacherId?: string;

  @ApiPropertyOptional({
    description: 'Google Calendar recurring event ID (auto-synced)',
    example: 'abc123 recurring event id from google',
  })
  @IsOptional()
  @IsString()
  googleCalendarEventId?: string;

  @ApiPropertyOptional({
    description: 'Google Meet link for this recurring schedule (auto-synced)',
    example: 'https://meet.google.com/xxx-yyy-zzz',
  })
  @IsOptional()
  @IsString()
  meetLink?: string;

  @ApiPropertyOptional({
    description:
      'Ngày slot có hiệu lực (YYYY-MM-DD), đọc từ class_schedule_entries.effective_from.',
    example: '2026-08-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effectiveFrom must be in YYYY-MM-DD format',
  })
  effectiveFrom?: string;
}

export class ClassSchedulePatternDto {
  @ApiProperty({
    description: 'Class schedule entries (weekly recurrence pattern)',
    type: [ClassScheduleEntryDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClassScheduleEntryDto)
  schedule: ClassScheduleEntryDto[];
}

export class GoogleCalendarResyncWarningDto {
  @ApiProperty({
    description: 'Machine-readable warning code',
    example: 'ambiguous_legacy_event',
  })
  @IsString()
  code: string;

  @ApiProperty({
    description: 'Human-readable warning message',
    example:
      'Legacy Google Calendar event has no schedule entry id and was skipped.',
  })
  @IsString()
  message: string;

  @ApiPropertyOptional({
    description: 'Related Google Calendar event id when available',
    example: 'google-event-123',
  })
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiPropertyOptional({
    description: 'Related schedule entry id when available',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsString()
  scheduleEntryId?: string;
}

export class ClassScheduleGoogleCalendarResyncSummaryDto {
  @ApiProperty({
    description: 'Class id that was resynced',
    example: 'UNICL-b2c3d4e5f6',
  })
  @IsClassId()
  classId: string;

  @ApiProperty({
    description:
      'Resync scope. class = all schedule entries, teacher = entries owned by teacherId only.',
    enum: ['class', 'teacher'],
    example: 'teacher',
  })
  @IsIn(['class', 'teacher'])
  scope: 'class' | 'teacher';

  @ApiPropertyOptional({
    description: 'Teacher id for teacher-scoped resync',
    example: 'UNISTAFF-c3d4e5f6a7',
  })
  @IsOptional()
  @IsStaffId()
  teacherId?: string;

  @ApiProperty({
    description: 'Number of recurring Google Calendar events deleted',
    example: 2,
  })
  @IsInt()
  deletedRecurringEvents: number;

  @ApiProperty({
    description: 'Number of recurring Google Calendar events created',
    example: 1,
  })
  @IsInt()
  createdRecurringEvents: number;

  @ApiProperty({
    description: 'Number of existing recurring Google Calendar events updated',
    example: 1,
  })
  @IsInt()
  updatedRecurringEvents: number;

  @ApiProperty({
    description:
      'Number of stale recurring event ids recovered by updating another discovered event or creating a replacement',
    example: 0,
  })
  @IsInt()
  recoveredStaleRecurringEvents: number;

  @ApiProperty({
    description:
      'Number of recurring events that failed to create, update, or delete',
    example: 0,
  })
  @IsInt()
  failedRecurringEvents: number;

  @ApiProperty({
    description: 'Number of schedule entries skipped by scope or validation',
    example: 1,
  })
  @IsInt()
  skippedScheduleEntries: number;

  @ApiProperty({
    description: 'Number of skipped schedule entries without teacherId',
    example: 1,
  })
  @IsInt()
  skippedMissingTeacherId: number;

  @ApiProperty({
    description: 'Number of skipped schedule entries owned by another teacher',
    example: 2,
  })
  @IsInt()
  skippedUnownedScheduleEntries: number;

  @ApiProperty({
    description:
      'Number of legacy Google Calendar events skipped because they cannot be tied to a schedule entry id',
    example: 1,
  })
  @IsInt()
  skippedAmbiguousGoogleEvents: number;

  @ApiProperty({
    description:
      'True when Google Calendar returned usage/rate limit and remaining writes were stopped',
    example: false,
  })
  @IsBoolean()
  quotaLimited: boolean;

  @ApiProperty({
    description: 'Warnings emitted during resync',
    type: [GoogleCalendarResyncWarningDto],
  })
  @IsArray()
  warnings: GoogleCalendarResyncWarningDto[];
}

export class ClassScheduleGoogleCalendarResyncResponseDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  success: boolean;

  @ApiProperty({ type: ClassScheduleGoogleCalendarResyncSummaryDto })
  data: ClassScheduleGoogleCalendarResyncSummaryDto;
}

export class MakeupGoogleCalendarResyncSummaryDto {
  @ApiProperty({
    description: 'Class id that owns the makeup event',
    example: 'UNICL-b2c3d4e5f6',
  })
  @IsClassId()
  classId: string;

  @ApiProperty({
    description: 'Makeup schedule event id that was resynced',
    example: '660e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  makeupEventId: string;

  @ApiProperty({
    description: 'Teacher id responsible for the makeup event',
    example: 'UNISTAFF-c3d4e5f6a7',
  })
  @IsStaffId()
  teacherId: string;

  @ApiPropertyOptional({
    description: 'Google Calendar event id after resync',
    example: 'google-event-123',
  })
  @IsOptional()
  @IsString()
  googleCalendarEventId?: string | null;

  @ApiPropertyOptional({
    description: 'Google Meet link after resync',
    example: 'https://meet.google.com/xxx-yyy-zzz',
  })
  @IsOptional()
  @IsString()
  googleMeetLink?: string | null;

  @ApiProperty({
    description:
      'True when a stale Google Calendar event id was missing in Google and a replacement event was created',
    example: false,
  })
  @IsBoolean()
  recoveredStaleEvent: boolean;

  @ApiProperty({
    description: 'Warnings emitted during resync',
    type: [GoogleCalendarResyncWarningDto],
  })
  @IsArray()
  warnings: GoogleCalendarResyncWarningDto[];
}

export class MakeupGoogleCalendarResyncResponseDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  success: boolean;

  @ApiProperty({ type: MakeupGoogleCalendarResyncSummaryDto })
  data: MakeupGoogleCalendarResyncSummaryDto;
}

export class ClassScheduleEventDto {
  @ApiProperty({
    description: 'Unique occurrence ID to render this calendar item',
    example: 'fixed:class-id:entry-id:2026-04-19',
  })
  @IsString()
  occurrenceId: string;

  @ApiProperty({
    description: 'Underlying source record id',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  sourceId: string;

  @ApiProperty({
    description: 'Calendar event type',
    enum: CALENDAR_EVENT_TYPES,
    example: 'makeup',
  })
  @IsString()
  @IsIn(CALENDAR_EVENT_TYPES)
  type: (typeof CALENDAR_EVENT_TYPES)[number];

  @ApiProperty({
    description: 'Display title for the calendar event',
    example: 'Lịch dạy bù - Lớp Toán 10A',
  })
  @IsString()
  title: string;

  @ApiPropertyOptional({
    description: 'Primary class id for this event if available',
    example: 'UNICL-b2c3d4e5f6',
  })
  @IsOptional()
  @IsClassId()
  classId?: string;

  @ApiProperty({
    description: 'Related class ids for filter matching',
    type: [String],
    example: ['UNICL-b2c3d4e5f6'],
  })
  @IsArray()
  @IsClassId({ each: true })
  classIds: string[];

  @ApiPropertyOptional({
    description: 'Primary class name for this event if available',
    example: 'Lớp Toán 10A',
  })
  @IsOptional()
  @IsString()
  className?: string;

  @ApiProperty({
    description: 'Related class names for display/filter context',
    type: [String],
    example: ['Lớp Toán 10A'],
  })
  @IsArray()
  @IsString({ each: true })
  classNames: string[];

  @ApiProperty({
    description: 'Teacher IDs assigned to this event',
    example: ['UNISTAFF-c3d4e5f6a7'],
    type: [String],
  })
  @IsArray()
  @IsStaffId({ each: true })
  teacherIds: string[];

  @ApiProperty({
    description: 'Teacher full names assigned to this event',
    example: ['Nguyễn Văn An'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  teacherNames: string[];

  @ApiPropertyOptional({
    description: 'Student ID for exam events',
    example: 'UNIST-a1b2c3d4e5',
  })
  @IsOptional()
  @IsStudentId()
  studentId?: string;

  @ApiPropertyOptional({
    description: 'Student name for exam events',
    example: 'Nguyễn Minh Anh',
  })
  @IsOptional()
  @IsString()
  studentName?: string;

  @ApiProperty({
    description: 'Session date in YYYY-MM-DD format',
    example: '2026-04-15',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must use YYYY-MM-DD format',
  })
  date: string;

  @ApiPropertyOptional({
    description: 'Session start time in HH:mm:ss format',
    example: '19:00:00',
  })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, {
    message: 'startTime must be in HH:mm or HH:mm:ss format',
  })
  startTime?: string;

  @ApiPropertyOptional({
    description: 'Session end time in HH:mm:ss format',
    example: '20:30:00',
  })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, {
    message: 'endTime must be in HH:mm or HH:mm:ss format',
  })
  endTime?: string;

  @ApiProperty({
    description: 'Whether this event should render as all-day',
    example: false,
  })
  @IsBoolean()
  allDay: boolean;

  @ApiPropertyOptional({
    description:
      'ID of the recurring pattern entry this occurrence derives from',
    example: 'entry-uuid',
  })
  @IsOptional()
  @IsString()
  patternEntryId?: string;

  @ApiPropertyOptional({
    description: 'Google Meet link for the event',
    example: 'https://meet.google.com/xxx-yyy-zzz',
  })
  @IsOptional()
  @IsString()
  meetLink?: string;

  @ApiPropertyOptional({
    description: 'Optional event note',
    example: 'Học bù do nghỉ lễ',
  })
  @IsOptional()
  @IsString()
  note?: string;
}

export class ClassScheduleFilterDto {
  @ApiPropertyOptional({
    description: 'Filter by class ID',
    example: 'UNICL-b2c3d4e5f6',
  })
  @IsOptional()
  @IsClassId()
  classId?: string;

  @ApiPropertyOptional({
    description: 'Filter by teacher ID',
    example: 'UNISTAFF-c3d4e5f6a7',
  })
  @IsOptional()
  @IsStaffId()
  teacherId?: string;

  @ApiPropertyOptional({
    description: 'Filter by student ID',
    example: 'UNIST-a1b2c3d4e5',
  })
  @IsOptional()
  @IsStudentId()
  studentId?: string;

  @ApiProperty({
    description: 'Start date in YYYY-MM-DD format',
    example: '2026-04-01',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate must use YYYY-MM-DD format',
  })
  startDate: string;

  @ApiProperty({
    description: 'End date in YYYY-MM-DD format',
    example: '2026-04-30',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate must use YYYY-MM-DD format',
  })
  endDate: string;

  @ApiPropertyOptional({
    description: 'Page number for paginated list endpoints',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Items per page for paginated list endpoints',
    example: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class MakeupScheduleEventDto {
  @ApiProperty({
    description: 'Makeup schedule event id',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  id: string;

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

  @ApiPropertyOptional({
    description:
      'Linked session id if this makeup event has been fulfilled by a session',
    example: '880e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  linkedSessionId?: string | null;

  @ApiPropertyOptional({
    description: 'Class.schedule entry id that this makeup event is based on',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  baselineScheduleEntryId?: string | null;

  @ApiPropertyOptional({
    description: 'Original fixed schedule occurrence date in YYYY-MM-DD format',
    example: '2026-04-17',
    nullable: true,
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'originalDate must use YYYY-MM-DD format',
  })
  originalDate?: string | null;

  @ApiProperty({
    description: 'Makeup date in YYYY-MM-DD format',
    example: '2026-04-24',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must use YYYY-MM-DD format',
  })
  date: string;

  @ApiPropertyOptional({
    description: 'Start time in HH:mm or HH:mm:ss format',
    example: '19:00:00',
  })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, {
    message: 'startTime must be in HH:mm or HH:mm:ss format',
  })
  startTime?: string;

  @ApiPropertyOptional({
    description: 'End time in HH:mm or HH:mm:ss format',
    example: '20:30:00',
  })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, {
    message: 'endTime must be in HH:mm or HH:mm:ss format',
  })
  endTime?: string;

  @ApiPropertyOptional({
    description: 'Optional admin title override',
    example: 'Dạy bù tuần nghỉ lễ',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Optional note',
    example: 'Học bù do lớp nghỉ lễ 30/4.',
  })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    description: 'Class name',
    example: 'Lớp Toán 10A',
  })
  @IsOptional()
  @IsString()
  className?: string;

  @ApiPropertyOptional({
    description: 'Teacher full name',
    example: 'Nguyễn Văn An',
  })
  @IsOptional()
  @IsString()
  teacherName?: string;

  @ApiPropertyOptional({
    description: 'Google Meet link if synced',
    example: 'https://meet.google.com/xxx-yyy-zzz',
  })
  @IsOptional()
  @IsString()
  googleMeetLink?: string | null;

  @ApiPropertyOptional({
    description: 'Google Calendar event id if synced',
    example: 'event-123',
  })
  @IsOptional()
  @IsString()
  googleCalendarEventId?: string | null;

  @ApiPropertyOptional({
    description: 'Timestamp of last successful calendar sync',
    example: '2026-04-19T08:30:00.000Z',
  })
  @IsOptional()
  @IsString()
  calendarSyncedAt?: string | null;

  @ApiPropertyOptional({
    description: 'Last calendar sync error',
    example: 'Google Calendar auth expired',
  })
  @IsOptional()
  @IsString()
  calendarSyncError?: string | null;

  @ApiPropertyOptional({
    description: 'Computed Google Calendar sync status',
    enum: ['pending', 'synced', 'error'],
    example: 'synced',
  })
  @IsOptional()
  @IsIn(['pending', 'synced', 'error'])
  calendarSyncStatus?: 'pending' | 'synced' | 'error';

  @ApiPropertyOptional({
    description: 'Warnings for schedule conflicts/overlaps',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warnings?: string[];
}

export class CreateMakeupScheduleEventDto {
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
    description: 'Makeup date in YYYY-MM-DD format',
    example: '2026-04-24',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must use YYYY-MM-DD format',
  })
  date: string;

  @ApiProperty({
    description: 'Start time in HH:mm or HH:mm:ss format',
    example: '19:00:00',
  })
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, {
    message: 'startTime must be in HH:mm or HH:mm:ss format',
  })
  startTime: string;

  @ApiProperty({
    description: 'End time in HH:mm or HH:mm:ss format',
    example: '20:30:00',
  })
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, {
    message: 'endTime must be in HH:mm or HH:mm:ss format',
  })
  endTime: string;

  @ApiPropertyOptional({
    description: 'Optional admin title override',
    example: 'Dạy bù tuần nghỉ lễ',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Optional note',
    example: 'Học bù do lớp nghỉ lễ 30/4.',
  })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    description: 'Class.schedule entry id that the makeup event is based on',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  baselineScheduleEntryId?: string | null;

  @ApiPropertyOptional({
    description: 'Original fixed schedule occurrence date in YYYY-MM-DD format',
    example: '2026-04-17',
    nullable: true,
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'originalDate must use YYYY-MM-DD format',
  })
  originalDate?: string | null;
}

export class UpdateMakeupScheduleEventDto extends PartialType(
  CreateMakeupScheduleEventDto,
) {}

export class CreateClassScopedMakeupScheduleEventDto extends OmitType(
  CreateMakeupScheduleEventDto,
  ['classId'] as const,
) {}

export class UpdateClassScopedMakeupScheduleEventDto extends PartialType(
  CreateClassScopedMakeupScheduleEventDto,
) {}
