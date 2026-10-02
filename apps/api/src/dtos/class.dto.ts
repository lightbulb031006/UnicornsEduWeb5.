import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
  PickType,
} from '@nestjs/swagger';
import { ClassPricingMode, ClassStatus } from 'generated/enums';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
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
  IsStudentId,
  IsStaffId,
  IsClassId,
} from '../common/entity-id.validators';

export class ClassTeacherItemDto {
  @ApiProperty({
    description: 'Teacher (staff) id',
    example: 'UNISTAFF-c3d4e5f6a7',
  })
  @IsStaffId()
  teacher_id: string;

  @ApiPropertyOptional({
    description:
      'Custom allowance for this teacher in this class (VNĐ). Omit to preserve an existing value or inherit the class default for new assignments. Send null to clear an override and inherit the class default.',
    example: 150000,
    minimum: 0,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  custom_allowance?: number | null;

  @ApiPropertyOptional({
    description:
      'Operating deduction rate for this teacher-class relation in percent. If omitted, backend persists 0.',
    example: 10,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  operating_deduction_rate_percent?: number;

  @ApiPropertyOptional({
    description:
      'Deprecated alias for operating_deduction_rate_percent. Backend still accepts it during transition.',
    example: 10,
    minimum: 0,
    maximum: 100,
    deprecated: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  tax_rate_percent?: number;
}

export class CreateClassDto {
  @ApiProperty({ example: 'Math 10A' })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Course id (see GET /courses).',
    example: 'a1b2c3d4-...-uuid',
  })
  @IsOptional()
  @IsString()
  course_id?: string;

  @ApiPropertyOptional({ enum: ClassStatus, default: ClassStatus.running })
  @IsOptional()
  @IsEnum(ClassStatus)
  status?: ClassStatus;

  @ApiPropertyOptional({ example: 15, minimum: 1, default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  max_students?: number;

  @ApiPropertyOptional({ example: 120000, minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  allowance_per_session_per_student?: number;

  @ApiPropertyOptional({
    example: 200000,
    minimum: 0,
    nullable: true,
    description:
      'Maximum teacher allowance per session. null or 0 means unlimited (0 is stored as null).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  max_allowance_per_session?: number | null;

  @ApiPropertyOptional({ example: 2, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  scale_amount?: number;

  @ApiPropertyOptional({
    example: [
      {
        from: '19:00:00',
        to: '20:30:00',
      },
    ],
    description: 'Class schedule JSON array in { from, to } format',
  })
  @IsOptional()
  @IsArray()
  schedule?: unknown[];

  @ApiPropertyOptional({ example: 300000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  student_tuition_per_session?: number;

  @ApiPropertyOptional({
    example: 100000,
    minimum: 0,
    nullable: true,
    description:
      'Đơn giá học phí / học viên / 30 phút. Số dương: giữ nguyên, không suy từ gói. null hoặc bỏ trống: suy ROUND(học phí mỗi buổi ÷ số block chuẩn) như trước. Không ghi đè student_tuition_per_session.',
  })
  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  student_tuition_per_block?: number | null;

  @ApiPropertyOptional({
    enum: ClassPricingMode,
    default: ClassPricingMode.per_session,
    description:
      'Chế độ tính tiền của lớp. Mặc định theo buổi. Theo block 30 phút chỉ khi lịch chuẩn suy được số block.',
  })
  @IsOptional()
  @IsEnum(ClassPricingMode)
  pricing_mode?: ClassPricingMode;

  @ApiPropertyOptional({ example: 3600000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tuition_package_total?: number;

  @ApiPropertyOptional({ example: 12, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tuition_package_session?: number;

  @ApiPropertyOptional({
    description:
      'Lớp không cần điểm danh (lớp quá đông). Hệ thống tự sinh Attendance present cho mọi học sinh đang học.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  no_attendance?: boolean;

  @ApiPropertyOptional({
    description:
      'Staff ids (gia sư phụ trách). Ignored if teachers[] is provided.',
    type: [String],
    example: ['UNISTAFF-c3d4e5f6a7'],
  })
  @IsOptional()
  @IsArray()
  @IsStaffId({ each: true })
  teacher_ids?: string[];

  @ApiPropertyOptional({
    description:
      'Teachers with optional custom allowance and operating deduction rate per teacher. Takes precedence over teacher_ids.',
    type: [ClassTeacherItemDto],
    example: [
      {
        teacher_id: 'UNISTAFF-c3d4e5f6a7',
        custom_allowance: 150000,
        operating_deduction_rate_percent: 10,
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClassTeacherItemDto)
  teachers?: ClassTeacherItemDto[];

  @ApiPropertyOptional({
    description: 'Student ids (học sinh trong lớp).',
    type: [String],
    example: ['UNIST-a1b2c3d4e5'],
  })
  @IsOptional()
  @IsArray()
  @IsStudentId({ each: true })
  student_ids?: string[];
}

/** DTO for PATCH /class/:id/basic-info – basic info + tuition only */
export class UpdateClassBasicInfoDto extends PartialType(
  PickType(CreateClassDto, [
    'name',
    'course_id',
    'status',
    'max_students',
    'allowance_per_session_per_student',
    'max_allowance_per_session',
    'scale_amount',
    'student_tuition_per_session',
    'student_tuition_per_block',
    'tuition_package_total',
    'tuition_package_session',
    'no_attendance',
  ]),
) {
  @ApiPropertyOptional({
    description:
      'Ngày hết hạn xem nội dung của lớp (YYYY-MM-DD). Gửi null để xoá hạn (vô hạn).',
    example: '2026-12-31',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'content_access_expires_at must be in YYYY-MM-DD format',
  })
  content_access_expires_at?: string | null;
}

export class UpdateClassPricingModeDto {
  @ApiProperty({
    enum: ClassPricingMode,
    description:
      'Đổi chế độ tính tiền. Buổi unpaid được tính lại; buổi paid/deposit/cọc giữ nguyên.',
    example: ClassPricingMode.per_session,
  })
  @IsEnum(ClassPricingMode)
  pricing_mode: ClassPricingMode;
}

/** DTO for PATCH /class/:id/teachers – replace teachers list */
export class UpdateClassTeachersDto {
  @ApiProperty({
    description:
      'Teachers with optional custom allowance and operating deduction rate. Replaces current list; omitted custom_allowance inherits allowance_per_session_per_student of the class, omitted operating_deduction_rate_percent persists 0.',
    type: [ClassTeacherItemDto],
    example: [
      {
        teacher_id: 'uuid-1',
        custom_allowance: 150000,
        operating_deduction_rate_percent: 10,
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClassTeacherItemDto)
  teachers: ClassTeacherItemDto[];
}

export class ClassStatusActionDto {
  @ApiPropertyOptional({
    description: 'Optional audit reason for the operational status action.',
    example: 'Lớp đã hoàn thành chương trình.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ClassTeacherCompensationItemDto {
  @ApiProperty({
    description: 'Teacher (staff) id already assigned to the class',
    example: 'UNISTAFF-c3d4e5f6a7',
  })
  @IsStaffId()
  teacher_id: string;

  @ApiPropertyOptional({
    description:
      'Custom allowance for this teacher in this class (VNĐ). Omit to leave unchanged. Send null to inherit the class default.',
    example: 150000,
    minimum: 0,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  custom_allowance?: number | null;

  @ApiPropertyOptional({
    description:
      'Operating deduction rate for this teacher-class relation in percent. Omitted value keeps the current rate.',
    example: 10,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  operating_deduction_rate_percent?: number;

  @ApiPropertyOptional({
    description:
      'Deprecated alias for operating_deduction_rate_percent. Backend still accepts it during transition.',
    example: 10,
    minimum: 0,
    maximum: 100,
    deprecated: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  tax_rate_percent?: number;
}

export class UpdateClassTeacherCompensationDto {
  @ApiProperty({
    description:
      'Teacher compensation updates. Does not change teacher roster.',
    type: [ClassTeacherCompensationItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClassTeacherCompensationItemDto)
  teachers: ClassTeacherCompensationItemDto[];
}

export class UpdateClassStudentTuitionDto {
  @ApiProperty({
    description: 'Student id already enrolled in the class',
    example: 'UNIST-a1b2c3d4e5',
  })
  @IsStudentId()
  student_id: string;

  @ApiPropertyOptional({ example: 3600000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  custom_tuition_package_total?: number;

  @ApiPropertyOptional({ example: 12, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  custom_tuition_package_session?: number;

  @ApiPropertyOptional({ example: 300000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  custom_tuition_per_session?: number;
}

/** Schedule slot for UpdateClassScheduleDto */
export class ScheduleSlotDto {
  @ApiPropertyOptional({
    description:
      'Unique identifier for this schedule slot. Optional for new rows; backend auto-generates UUID when omitted.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({
    description: 'Day of week (0-6, 0=Chủ Nhật, 1=Thứ Hai, ...)',
    example: 1,
  })
  @IsInt()
  @IsIn([0, 1, 2, 3, 4, 5, 6])
  dayOfWeek: number;

  @ApiProperty({ description: 'Start time HH:mm:ss', example: '19:00:00' })
  @IsString()
  from: string;

  @ApiProperty({ description: 'End time HH:mm:ss', example: '21:00:00' })
  @IsString()
  to: string;

  @ApiPropertyOptional({
    description:
      'Responsible tutor for this schedule slot. PATCH /class/:id/schedule requires this field and it must belong to the class teachers.',
    example: 'UNISTAFF-c3d4e5f6a7',
  })
  @IsOptional()
  @IsStaffId()
  teacherId?: string;

  @ApiPropertyOptional({
    description: 'Creation ISO timestamp',
    example: '2026-06-03T14:12:42.000Z',
  })
  @IsOptional()
  @IsString()
  createdAt?: string;

  @ApiPropertyOptional({
    description: 'Deletion ISO timestamp',
    example: '2026-06-03T14:12:42.000Z',
  })
  @IsOptional()
  @IsString()
  deletedAt?: string;

  @ApiPropertyOptional({
    description:
      'Ngày slot này thực sự bắt đầu có hiệu lực (YYYY-MM-DD). Dùng để backdate khi admin sửa lịch trễ so với ngày đổi thực tế. Mặc định là hôm nay nếu bỏ trống.',
    example: '2026-08-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effectiveFrom must be in YYYY-MM-DD format',
  })
  effectiveFrom?: string;
}

/** DTO for PATCH /class/:id/schedule – upsert schedule slots */
export class UpdateClassScheduleDto {
  @ApiProperty({
    description:
      'Danh sách slot lịch cần thêm mới/cập nhật. Slot đang active nhưng KHÔNG có mặt ở đây sẽ được GIỮ NGUYÊN (không tự xoá) — muốn xoá phải liệt kê id trong `removedEntryIds`.',
    type: [ScheduleSlotDto],
    example: [{ from: '19:00:00', to: '20:30:00' }],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDto)
  schedule: ScheduleSlotDto[];

  @ApiPropertyOptional({
    description: 'Id các slot cần xoá tường minh (soft-delete).',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  removedEntryIds?: string[];

  @ApiPropertyOptional({
    description:
      'ISO timestamp `updatedAt` của lớp lúc client tải dữ liệu — dùng để phát hiện xung đột (optimistic lock). Nếu lớp đã bị người khác cập nhật sau thời điểm này, request bị từ chối với 409.',
    example: '2026-08-18T14:50:43.600Z',
  })
  @IsOptional()
  @IsString()
  expectedUpdatedAt?: string;
}

/** DTO for POST /staff-ops/classes – minimal class metadata only */
export class CreateStaffOpsClassDto extends PickType(CreateClassDto, [
  'name',
  'course_id',
  'status',
] as const) {
  @ApiPropertyOptional({
    description: 'Class schedule array { from, to } in HH:mm:ss',
    type: [ScheduleSlotDto],
    example: [{ from: '19:00:00', to: '20:30:00' }],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDto)
  schedule?: ScheduleSlotDto[];
}

export class StudentClassCreateDto {
  @ApiProperty({
    description: 'Student id',
    example: 'UNIST-a1b2c3d4e5',
  })
  @IsStudentId()
  id: string;

  @ApiPropertyOptional({ example: 300000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  custom_tuition_per_session?: number;

  @ApiPropertyOptional({ example: 3600000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  custom_tuition_package_total?: number;

  @ApiPropertyOptional({ example: 12, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  custom_tuition_package_session?: number;
}

/** DTO for PATCH /class/:id/students – replace students list */
export class UpdateClassStudentsDto {
  @ApiProperty({
    description:
      'Student memberships in the class. Replaces current list and lets backend derive effective tuition overrides.',
    type: [StudentClassCreateDto],
    example: [
      {
        id: 'UNIST-a1b2c3d4e5',
        custom_tuition_package_total: 3600000,
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StudentClassCreateDto)
  students: StudentClassCreateDto[];
}

export class UpdateClassDto extends PartialType(CreateClassDto) {
  @ApiProperty({
    description: 'Class id',
    example: 'UNICL-b2c3d4e5f6',
  })
  @IsClassId()
  id: string;

  @ApiPropertyOptional({
    description:
      'Staff ids (gia sư phụ trách). Ignored if teachers[] is provided.',
    type: [String],
    example: ['UNISTAFF-c3d4e5f6a7'],
  })
  @IsOptional()
  @IsArray()
  @IsStaffId({ each: true })
  teacher_ids?: string[];

  @ApiPropertyOptional({
    description:
      'Teachers with optional custom allowance. Sync replaces current list. Takes precedence over teacher_ids.',
    type: [ClassTeacherItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClassTeacherItemDto)
  teachers?: ClassTeacherItemDto[];

  @ApiPropertyOptional({
    description:
      'Student ids (học sinh trong lớp). Sync replaces current list.',
    type: [String],
    example: ['UNIST-a1b2c3d4e5'],
  })
  @IsOptional()
  @IsArray()
  @IsStudentId({ each: true })
  student_ids?: string[];
}
