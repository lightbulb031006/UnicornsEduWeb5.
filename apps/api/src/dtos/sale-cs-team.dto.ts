import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaymentStatus, StaffRole, StaffStatus } from 'generated/enums';
import { PaginationQueryDto } from './pagination.dto';

/**
 * Quản lý đội Sale & CSKH của Trưởng phòng Sale & CSKH (#271). Mọi response
 * là allowlist: không email, số điện thoại, CCCD, ngày sinh, địa chỉ, ngân
 * hàng, lương; trợ cấp sale không có số tiền.
 */

export const SALE_CS_TEAM_SCOPES = ['members', 'candidates'] as const;
export type SaleCsTeamScope = (typeof SALE_CS_TEAM_SCOPES)[number];

export class SaleCsTeamListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo họ tên' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: [StaffRole.sale, StaffRole.customer_care],
    description: 'Lọc thành viên theo role (chỉ áp với scope=members).',
  })
  @IsOptional()
  @IsIn([StaffRole.sale, StaffRole.customer_care])
  role?: StaffRole;

  @ApiPropertyOptional({ enum: StaffStatus })
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;

  @ApiPropertyOptional({
    enum: SALE_CS_TEAM_SCOPES,
    description:
      '`members` (mặc định): nhân sự có role sale hoặc customer_care. `candidates`: nhân sự chưa thuộc đội và không phải Admin / trưởng — để bật role Sale/CSKH.',
  })
  @IsOptional()
  @IsIn(SALE_CS_TEAM_SCOPES)
  scope?: SaleCsTeamScope;
}

export class SaleCsTeamMonthQueryDto {
  @ApiPropertyOptional({
    description: 'Lọc theo tháng `YYYY-MM`',
    example: '2026-11',
  })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  month?: string;
}

/** PATCH /sale-cs-team/members/:staffId/roles */
export class UpdateSaleCsTeamRolesDto {
  @ApiProperty({
    description:
      'Trạng thái đích của role Sale / CSKH (sale, customer_care). Role khác của nhân sự giữ nguyên; gửi role ngoài phạm vi → 403.',
    enum: StaffRole,
    isArray: true,
    example: [StaffRole.customer_care],
  })
  @IsArray()
  @IsEnum(StaffRole, { each: true })
  roles: StaffRole[];
}

/** PATCH /sale-cs-team/members/:staffId/account-status */
export class UpdateSaleCsTeamAccountStatusDto {
  @ApiProperty({
    description: '`true`: khoá tài khoản đăng nhập; `false`: mở khoá.',
  })
  @IsBoolean()
  locked: boolean;
}

/**
 * PATCH /sale-cs-team/members/:staffId/professional-profile — chỉ hồ sơ chuyên
 * môn. Field khác (email, SĐT, CCCD, ngân hàng, lương…) không nằm trong DTO nên
 * ValidationPipe (`whitelist: true`) loại bỏ trước khi vào service.
 */
export class UpdateSaleCsTeamProfileDto {
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

export interface SaleCsTeamPermissionsDto {
  canEditRoles: boolean;
  canLockAccount: boolean;
  canEditProfile: boolean;
  /** Thêm/sửa/xoá/sao/ảnh thành tích (nhân sự dưới cấp). */
  canEditAchievements: boolean;
  /** Đổi tên đăng nhập (16/11) — cùng phạm vi khoá tài khoản, cần có tài khoản. */
  canEditAccountHandle: boolean;
}

export interface SaleCsTeamMemberDto {
  id: string;
  fullName: string;
  /** Họ / tên tách riêng để form sửa hồ sơ chuyên môn điền sẵn. */
  lastName: string | null;
  firstName: string | null;
  avatarUrl: string | null;
  roles: StaffRole[];
  status: StaffStatus;
  /** Tài khoản đăng nhập bị khoá (`users.status = inactive`); `null` nếu chưa có tài khoản. */
  accountLocked: boolean | null;
  university: string | null;
  highSchool: string | null;
  /** % lợi nhuận mặc định của CSKH (phân số 0–0.99), chỉ đọc — chỉ Admin sửa. */
  customerCareDefaultProfitPercent: number | null;
  /** Trưởng phòng đang quản lý CSKH này (để biết hoa hồng tính cho ai). */
  managedBy: { id: string; fullName: string } | null;
  /** Số học sinh CSKH này đang phụ trách. */
  customerCareStudentCount: number;
  /** Tỉnh/TP (không nhạy cảm, như cột «Tỉnh» ở `/admin/staffs`). */
  province: string | null;
  /** Số thành tích — nút «Xem thành tích» ở danh sách. */
  achievementCount: number;
  permissions: SaleCsTeamPermissionsDto;
}

/**
 * Chi tiết thành viên (trang `/staff/staffs/:id`, bố cục như admin): thêm field
 * không nhạy cảm của card «Hồ sơ nhân sự». Vẫn không có email, SĐT, CCCD, ngày
 * sinh, dân tộc, giới tính, địa chỉ, ngân hàng, QR (#270).
 */
export interface SaleCsTeamMemberDetailDto extends SaleCsTeamMemberDto {
  accountHandle: string | null;
  googleMeetLink: string | null;
}

export interface SaleCsTeamPageDto<T> {
  data: T[];
  meta: { total: number; page: number; limit: number };
}

/** Trợ cấp sale: học sinh, ghi chú, ngày — KHÔNG có số tiền / trạng thái thanh toán. */
export interface SaleCsTeamSaleAllowanceDto {
  id: string;
  month: string;
  note: string | null;
  createdAt: string;
  student: { id: string; fullName: string } | null;
}

/** Thưởng của thành viên đội: có số tiền (biên bản họp mục 9), chỉ đọc. */
export interface SaleCsTeamBonusDto {
  id: string;
  workType: string;
  amount: number;
  status: PaymentStatus;
  note: string | null;
  month: string;
  date: string;
  /** ISO — trang chi tiết hiện giờ tạo như thẻ «Thưởng tháng» của admin. */
  createdAt: string;
}

export interface SaleCsTeamRolesResultDto {
  id: string;
  roles: StaffRole[];
  /** Số học sinh vừa mất Người chăm sóc do tắt role CSKH (follow-up 13/11 mục 2.1). */
  releasedCustomerCareStudentCount: number;
}

export interface SaleCsTeamAccountStatusResultDto {
  id: string;
  accountLocked: boolean;
}
