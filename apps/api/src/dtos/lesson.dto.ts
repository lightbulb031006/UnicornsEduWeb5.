import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaymentStatus, StaffRole, StaffStatus } from 'generated/enums';
import {
  LessonOutputDifficultyBand,
  LessonOutputStatus,
  LessonTaskPriority,
  LessonTaskStatus,
} from 'generated/enums';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  IsStaffId,
  IsLessonTaskId,
  IsLessonOutputId,
} from '../common/entity-id.validators';

export interface LessonListMetaDto {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LessonOverviewSummaryDto {
  resourceCount: number;
  taskCount: number;
  openTaskCount: number;
  completedTaskCount: number;
}

export interface LessonResourceResponseDto {
  id: string;
  title: string | null;
  description: string | null;
  resourceLink: string;
  lessonTaskId: string | null;
  tags: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LessonTaskCreatorDto {
  id: string;
  fullName: string;
  roles: StaffRole[];
  status: StaffStatus;
}

export interface LessonTaskAssigneeDto {
  id: string;
  fullName: string;
  roles: StaffRole[];
  status: StaffStatus;
}

export interface LessonTaskStaffOptionDto {
  id: string;
  fullName: string;
  roles: StaffRole[];
  status: StaffStatus;
}

export interface LessonTaskOptionDto {
  id: string;
  title: string | null;
  status: LessonTaskStatus;
  priority: LessonTaskPriority;
  dueDate: string | null;
}

export interface LessonResourceOptionDto {
  id: string;
  title: string | null;
  resourceLink: string;
  tags: string[];
  lessonTaskId: string | null;
  lessonTaskTitle: string | null;
}

export interface LessonTaskResponseDto {
  id: string;
  title: string | null;
  description: string | null;
  status: LessonTaskStatus;
  priority: LessonTaskPriority;
  dueDate: string | null;
  /** Legacy creator staff. Kept for backward compatibility; task coordination uses `assignees`. */
  createdByStaff: LessonTaskCreatorDto | null;
  /** Unified execution staff, including legacy creator/output staff fallbacks for old data. */
  assignees: LessonTaskAssigneeDto[];
  /** Legacy output-level staff summary. Kept for backward compatibility; not a task coordination group. */
  outputAssignees: LessonTaskAssigneeDto[];
}

export interface LessonResourcePreviewDto {
  id: string;
  title: string | null;
  resourceLink: string;
}

export interface LessonTaskOutputProgressDto {
  total: number;
  completed: number;
}

export interface LessonTaskOutputListItemDto {
  id: string;
  lessonName: string;
  contestUploaded: string | null;
  date: string;
  /** Nhân sự nhận thanh toán / đứng tên output. */
  staffId: string | null;
  /** Display name for `staffId`, not task execution staff. */
  staffDisplayName: string | null;
  status: LessonOutputStatus;
  paymentStatus: PaymentStatus;
}

export interface LessonTaskDetailResponseDto extends LessonTaskResponseDto {
  outputs: LessonTaskOutputListItemDto[];
  outputProgress: LessonTaskOutputProgressDto;
  resourcePreview: LessonResourcePreviewDto[];
  contestUploadedSummary: string[];
}

export interface LessonOverviewResponseDto {
  summary: LessonOverviewSummaryDto;
  resources: LessonResourceResponseDto[];
  resourcesMeta: LessonListMetaDto;
  tasks: LessonTaskResponseDto[];
  tasksMeta: LessonListMetaDto;
}

export interface LessonWorkSummaryDto {
  taskCount: number;
  outputCount: number;
  pendingOutputCount: number;
  completedOutputCount: number;
  cancelledOutputCount: number;
}

export interface LessonWorkOutputItemDto extends LessonTaskOutputListItemDto {
  updatedAt: string;
  task: LessonOutputTaskSummaryDto | null;
  /** Tag hiển thị trên bảng tab Công việc */
  tags: string[];
  level: string | null;
  link: string | null;
  /** Link gốc (bài) — dùng fallback khi `link` trống */
  originalLink: string | null;
  /** Chi phí trợ cấp của output, độc lập với `paymentStatus`. */
  cost: number;
}

export interface LessonWorkResponseDto {
  summary: LessonWorkSummaryDto;
  outputs: LessonWorkOutputItemDto[];
  outputsMeta: LessonListMetaDto;
}

export interface LessonOutputStaffStatsSummaryDto {
  days: number;
  staff: LessonOutputStaffDto;
  outputCount: number;
  pendingOutputCount: number;
  completedOutputCount: number;
  cancelledOutputCount: number;
  unpaidCostTotal: number;
}

export interface LessonOutputStaffStatsResponseDto {
  summary: LessonOutputStaffStatsSummaryDto;
  outputs: LessonWorkOutputItemDto[];
}

export interface LessonOutputTaskSummaryDto {
  id: string;
  title: string | null;
  status: LessonTaskStatus;
  priority: LessonTaskPriority;
}

export interface LessonOutputStaffDto {
  id: string;
  fullName: string;
  roles: StaffRole[];
  status: StaffStatus;
}

export interface LessonOutputStaffOptionDto {
  id: string;
  fullName: string;
  roles: StaffRole[];
  status: StaffStatus;
}

export interface LessonOutputResponseDto {
  id: string;
  lessonTaskId: string | null;
  lessonName: string;
  originalTitle: string | null;
  source: string | null;
  originalLink: string | null;
  level: string | null;
  difficultyBand: LessonOutputDifficultyBand | null;
  includesTest: boolean;
  includesSolution: boolean;
  includesLectureVideo: boolean;
  tags: string[];
  cost: number;
  date: string;
  contestUploaded: string | null;
  link: string | null;
  staffId: string | null;
  staff: LessonOutputStaffDto | null;
  status: LessonOutputStatus;
  paymentStatus: PaymentStatus;
  task: LessonOutputTaskSummaryDto | null;
  createdAt: string;
  updatedAt: string;
}

export class LessonOverviewQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  resourcePage?: number;

  @ApiPropertyOptional({ example: 6, minimum: 1, maximum: 100, default: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  resourceLimit?: number;

  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  taskPage?: number;

  @ApiPropertyOptional({ example: 6, minimum: 1, maximum: 100, default: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  taskLimit?: number;
}

export class LessonWorkQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 6, minimum: 1, maximum: 100, default: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    example: 2026,
    minimum: 2000,
    maximum: 2100,
    description: 'Lọc theo tháng: năm (dùng cùng month).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({
    example: 3,
    minimum: 1,
    maximum: 12,
    description: 'Lọc theo tháng: tháng 1–12 (dùng cùng year).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({
    description:
      'Tìm theo tên bài hoặc contest (contains, không phân biệt hoa thường).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({
    description: 'Gợi ý tag (substring trên tên bài / contest).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tag?: string;

  @ApiPropertyOptional({
    example: 'UNISTAFF-c3d4e5f6a7',
    description: 'Lọc theo nhân sự nhận thanh toán output.',
  })
  @IsOptional()
  @IsStaffId()
  staffId?: string;

  @ApiPropertyOptional({
    enum: ['all', 'pending', 'completed', 'cancelled'],
    description: 'Trạng thái output; `all` = không lọc.',
  })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'pending', 'completed', 'cancelled'])
  outputStatus?: string;

  @ApiPropertyOptional({
    description:
      'Từ ngày (YYYY-MM-DD). Nếu cả dateFrom và dateTo hợp lệ, dùng khoảng này thay cho lọc tháng year/month.',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Đến ngày (YYYY-MM-DD).',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description:
      'Lọc theo level (0–5): khớp `Level {n}` hoặc chuỗi `{n}` (không phân biệt hoa thường).',
    enum: ['0', '1', '2', '3', '4', '5'],
  })
  @IsOptional()
  @IsIn(['0', '1', '2', '3', '4', '5'])
  level?: string;
}

export class LessonTaskStaffOptionsQueryDto {
  @ApiPropertyOptional({
    example: 'Nguyen',
    description: 'Search by staff full name.',
  })
  @IsOptional()
  @Type(() => String)
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 6, minimum: 1, maximum: 6, default: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  limit?: number;
}

export class LessonTaskOptionsQueryDto {
  @ApiPropertyOptional({
    example: 'outline',
    description: 'Search by lesson task title.',
  })
  @IsOptional()
  @Type(() => String)
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ example: 6, minimum: 1, maximum: 12, default: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  limit?: number;
}

export class LessonResourceOptionsQueryDto {
  @ApiPropertyOptional({
    example: 'note',
    description: 'Search by lesson resource title or link.',
  })
  @IsOptional()
  @Type(() => String)
  @IsString()
  @MaxLength(160)
  search?: string;

  @ApiPropertyOptional({ example: 6, minimum: 1, maximum: 12, default: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  limit?: number;

  @ApiPropertyOptional({
    example: 'UNILTK-a1b2c3d4e5',
    description:
      'Optional task id to exclude resources already linked to that task from the search result.',
  })
  @IsOptional()
  @IsLessonTaskId()
  excludeTaskId?: string;
}

export class LessonOutputStaffOptionsQueryDto {
  @ApiPropertyOptional({
    example: 'Nguyen',
    description: 'Search by staff full name.',
  })
  @IsOptional()
  @Type(() => String)
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 6, minimum: 1, maximum: 12, default: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  limit?: number;
}

export class LessonOutputStaffStatsQueryDto {
  @ApiPropertyOptional({
    example: 30,
    minimum: 1,
    maximum: 365,
    default: 30,
    description: 'Số ngày gần nhất cần lấy thống kê lesson output.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class CreateLessonResourceDto {
  @ApiProperty({ example: 'Bộ note đại số tổ hợp' })
  @Type(() => String)
  @IsString()
  title: string;

  @ApiProperty({ example: 'https://example.com/lesson-note' })
  @Type(() => String)
  @IsString()
  @IsUrl({
    require_protocol: true,
    require_tld: true,
  })
  resourceLink: string;

  @ApiPropertyOptional({
    example: 'Tài liệu nền cho buổi mở đầu của cụm chuyên đề.',
  })
  @IsOptional()
  @Type(() => String)
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({
    example: 'UNILTK-a1b2c3d4e5',
    description:
      'Optional parent lesson task id. Khi có giá trị, resource sẽ được gắn trực tiếp vào task này.',
  })
  @IsOptional()
  @IsLessonTaskId()
  lessonTaskId?: string | null;

  @ApiPropertyOptional({
    type: [String],
    example: ['đại số', 'mở đầu', 'lecture-note'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[] | null;
}

export class UpdateLessonResourceDto extends PartialType(
  CreateLessonResourceDto,
) {}

export class CreateLessonTaskDto {
  @ApiProperty({ example: 'Soạn outline buổi 1' })
  @Type(() => String)
  @IsString()
  title: string;

  @ApiPropertyOptional({
    example: 'Chốt mục tiêu, ví dụ mở bài, và checklist slide chính.',
  })
  @IsOptional()
  @Type(() => String)
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({
    enum: LessonTaskStatus,
    default: LessonTaskStatus.pending,
  })
  @IsOptional()
  @IsEnum(LessonTaskStatus)
  status?: LessonTaskStatus;

  @ApiPropertyOptional({
    enum: LessonTaskPriority,
    default: LessonTaskPriority.medium,
  })
  @IsOptional()
  @IsEnum(LessonTaskPriority)
  priority?: LessonTaskPriority;

  @ApiPropertyOptional({
    example: '2026-03-24',
    description: 'Date-only string in YYYY-MM-DD format.',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({
    example: 'UNISTAFF-c3d4e5f6a7',
    description:
      'Deprecated legacy staff id. New writes merge this staff into assigneeStaffIds and do not store a separate task-level personnel group.',
  })
  @IsOptional()
  @IsStaffId()
  createdByStaffId?: string | null;

  @ApiPropertyOptional({
    type: [String],
    example: ['UNISTAFF-c3d4e5f6a7', 'UNISTAFF-d4e5f6a7b8'],
    description:
      'Danh sách nhân sự thực hiện giáo án của task. Đây là nguồn điều phối task chính thức.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsStaffId({ each: true })
  assigneeStaffIds?: string[] | null;
}

export class UpdateLessonTaskDto extends PartialType(CreateLessonTaskDto) {}

export class CreateLessonOutputDto {
  @ApiPropertyOptional({
    example: 'UNILTK-a1b2c3d4e5',
    description:
      'Parent lesson task id. Có thể bỏ qua để tạo output chưa gắn công việc.',
  })
  @IsOptional()
  @IsLessonTaskId()
  lessonTaskId?: string | null;

  @ApiProperty({ example: 'Bài 1 - Tổ hợp cơ bản' })
  @Type(() => String)
  @IsString()
  lessonName: string;

  @ApiPropertyOptional({ example: 'Đề HSG Vĩnh Phúc 2024 - Bài 1' })
  @IsOptional()
  @Type(() => String)
  @IsString()
  originalTitle?: string | null;

  @ApiPropertyOptional({ example: 'Vĩnh Phúc HSG 2024' })
  @IsOptional()
  @Type(() => String)
  @IsString()
  source?: string | null;

  @ApiPropertyOptional({ example: 'https://example.com/original-problem' })
  @IsOptional()
  @Type(() => String)
  @IsString()
  @IsUrl({
    require_protocol: true,
    require_tld: true,
  })
  originalLink?: string | null;

  @ApiPropertyOptional({ example: 'HSG tỉnh' })
  @IsOptional()
  @Type(() => String)
  @IsString()
  level?: string | null;

  @ApiPropertyOptional({
    enum: LessonOutputDifficultyBand,
    nullable: true,
    description:
      'Bậc độ khó giáo án — nguồn sự thật để backend tự tính `cost`. Khác `level` (lọc nội bộ).',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(LessonOutputDifficultyBand)
  difficultyBand?: LessonOutputDifficultyBand | null;

  @ApiPropertyOptional({
    default: false,
    description: 'Hạng mục Sinh test — cộng vào `cost` theo bậc đã chọn.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includesTest?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Hạng mục Lời giải — cộng vào `cost` theo bậc đã chọn.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includesSolution?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Hạng mục Bài giảng video — cộng vào `cost` theo bậc đã chọn.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includesLectureVideo?: boolean;

  @ApiPropertyOptional({
    type: [String],
    example: ['hsg', 'vinh-phuc', 'to-hop'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[] | null;

  @ApiPropertyOptional({
    example: 250000,
    default: 0,
    minimum: 0,
    description:
      'Bị backend bỏ qua. `cost` luôn tính từ bậc độ khó + tick hạng mục; dòng chưa có bậc giữ nguyên số cũ khi sửa.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional({
    enum: PaymentStatus,
    default: PaymentStatus.pending,
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiProperty({
    example: '2026-03-21',
    description: 'Date-only string in YYYY-MM-DD format.',
  })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ example: 'Vĩnh Phúc HSG 2024' })
  @IsOptional()
  @Type(() => String)
  @IsString()
  contestUploaded?: string | null;

  @ApiPropertyOptional({ example: 'https://example.com/output-link' })
  @IsOptional()
  @Type(() => String)
  @IsString()
  @IsUrl({
    require_protocol: true,
    require_tld: true,
  })
  link?: string | null;

  @ApiPropertyOptional({
    example: 'UNISTAFF-c3d4e5f6a7',
    description:
      'Nhân sự nhận thanh toán / đứng tên output. Không phải nhóm điều phối task.',
  })
  @IsOptional()
  @IsStaffId()
  staffId?: string | null;

  @ApiPropertyOptional({
    enum: LessonOutputStatus,
    default: LessonOutputStatus.pending,
  })
  @IsOptional()
  @IsEnum(LessonOutputStatus)
  status?: LessonOutputStatus;
}

export class UpdateLessonOutputDto extends PartialType(CreateLessonOutputDto) {}

export class BulkUpdateLessonOutputPaymentStatusDto {
  @ApiProperty({
    description:
      'Danh sách id lesson output cần cập nhật trạng thái thanh toán.',
    type: [String],
    example: ['UNILOT-a1b2c3d4e5'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsLessonOutputId({ each: true })
  outputIds: string[];

  @ApiProperty({
    description: 'Trạng thái thanh toán mới cho các lesson output đã chọn.',
    enum: PaymentStatus,
    example: PaymentStatus.paid,
  })
  @IsEnum(PaymentStatus)
  paymentStatus: PaymentStatus;
}

export interface BulkUpdateLessonOutputPaymentStatusResultDto {
  requestedCount: number;
  updatedCount: number;
}
