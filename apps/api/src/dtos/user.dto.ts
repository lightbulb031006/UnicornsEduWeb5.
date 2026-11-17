import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  IsNotEmpty,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  Gender,
  StaffRole,
  StudentStatus,
  UserRole,
  UserStatus,
} from 'generated/enums';
import { IsClassId } from '../common/entity-id.validators';
import { PaginationQueryDto } from './pagination.dto';
import { CreateStaffDto } from './staff.dto';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '0901234567' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'TP.HCM' })
  @IsString()
  @IsOptional()
  province?: string;

  @ApiProperty({ example: 'nguyenvana' })
  @IsString()
  accountHandle: string;

  @ApiProperty({ example: 'Nguyen' })
  @IsString()
  first_name: string;

  @ApiProperty({ example: 'Van A' })
  @IsString()
  last_name: string;
}

export class AdminCreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'nguyenvana' })
  @IsString()
  accountHandle: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'TP.HCM' })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ example: 'Nguyen' })
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiPropertyOptional({ example: 'Van A' })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiPropertyOptional({
    enum: UserRole,
    description:
      'Immediate role assignment after provisioning. Defaults to guest when omitted. Student creation requires first_name and/or last_name.',
  })
  @IsOptional()
  @IsEnum(UserRole)
  roleType?: UserRole;

  @ApiPropertyOptional({
    enum: StaffRole,
    isArray: true,
    description:
      'Detailed staff roles to persist immediately when roleType is staff.',
  })
  @IsOptional()
  @IsEnum(StaffRole, { each: true })
  staffRoles?: StaffRole[];

  @ApiPropertyOptional({
    example: true,
    description: 'Xác thực email ngay khi tạo user từ admin',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  emailVerified?: boolean;
}

export class AdminCreateStudentUserDto extends CreateUserDto {
  @ApiPropertyOptional({ example: 2010 })
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(3000)
  birth_year?: number;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: 'THPT ABC' })
  @IsOptional()
  @IsString()
  school?: string;

  @ApiPropertyOptional({ example: 'Nguyen Van A' })
  @IsOptional()
  @IsString()
  parent_name?: string;

  @ApiPropertyOptional({ example: '0912345678' })
  @IsOptional()
  @IsString()
  parent_phone?: string;

  @ApiPropertyOptional({ example: 'Dat IELTS 7.0' })
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional({ enum: StudentStatus })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;

  @ApiProperty({
    description: 'Class ids assigned to the student at creation time.',
    type: [String],
    example: ['UNICL-b2c3d4e5f6', 'UNICL-c3d4e5f6a7'],
  })
  @IsArray()
  @IsClassId({ each: true })
  class_ids: string[];

  @ApiPropertyOptional({
    example: true,
    description:
      'Xác thực email ngay khi tạo học sinh từ admin/Trưởng phòng Sale & CSKH',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  emailVerified?: boolean;
}

/**
 * 15/11: tạo tài khoản đăng nhập + hồ sơ nhân sự trong một bước (Admin, 3 role
 * trưởng). Không có `user_id`: luôn là tài khoản mới, không gắn vào user có sẵn.
 * Không nhận mức % thu nhập — chỉ Admin sửa ở màn quản trị nhân sự.
 */
export class AdminCreateStaffUserDto extends OmitType(CreateStaffDto, [
  'user_id',
  'first_name',
  'last_name',
  'full_name',
  'roles',
  'customer_care_managed_by_staff_id',
  'google_meet_link',
  'revenue_share_percent',
  'customer_care_default_profit_percent',
] as const) {
  @ApiProperty({ example: 'staff@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'nguyenvanb' })
  @IsString()
  @IsNotEmpty()
  accountHandle: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'Nguyễn Văn B' })
  @IsString()
  @IsNotEmpty()
  full_name: string;

  @ApiProperty({
    enum: StaffRole,
    isArray: true,
    description:
      'Ít nhất 1 role. Role trưởng không gán được Admin / role trưởng (#265).',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(StaffRole, { each: true })
  roles: StaffRole[];

  @ApiPropertyOptional({
    example: true,
    description: 'Xác thực email ngay — nhân sự đăng nhập được luôn.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  emailVerified?: boolean;
}

export class UserInfoDto {
  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Nguyen Van A' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Nguyen' })
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiPropertyOptional({ example: 'Van A' })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  roleType?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ description: 'Linked entity id' })
  @IsOptional()
  @IsUUID()
  linkId?: string;

  @ApiPropertyOptional({ example: 'TP.HCM' })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ example: 'nguyenvana' })
  @IsOptional()
  @IsString()
  accountHandle?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  emailVerified?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  phoneVerified?: boolean;

  @ApiPropertyOptional({
    enum: StaffRole,
    isArray: true,
    description:
      'Detailed staff roles to persist when roleType is staff. Missing profile will be auto-created if needed.',
  })
  @IsOptional()
  @IsEnum(StaffRole, { each: true })
  staffRoles?: StaffRole[];
}

export class UpdateUserDto extends PartialType(UserInfoDto) {
  @ApiProperty({ description: 'User id' })
  @IsUUID()
  id: string;
}

export class GetUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'nguyen van',
    description:
      'Search by account handle, email, phone, first name, or last name.',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

export class UserAuthDto {
  @ApiProperty({ example: 'nguyenvan' })
  @IsString()
  accountHandle: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

export class StudentLoginDto extends UserAuthDto {
  @ApiPropertyOptional({
    example: false,
    description:
      'Học sinh bị chặn `DEVICE_ACTIVE` chọn đăng xuất mọi thiết bị khác rồi đăng nhập máy này.',
  })
  @IsOptional()
  @IsBoolean()
  forceLogoutOthers?: boolean;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Reset password token from email' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewStrongPass123!' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ description: 'New password', example: 'NewStrongPass123!' })
  @IsString()
  @MinLength(6)
  newPassword: string;
}

export class AdminSetUserPasswordDto {
  @ApiProperty({
    description: 'New password set by admin/assistant for the target user',
    example: '123456',
  })
  @IsString()
  @MinLength(6)
  newPassword: string;
}

/**
 * Đổi tên đăng nhập (16/11). Dùng chung cho `PATCH /users/:id/account-handle`,
 * `PATCH /sale-cs-team/members/:staffId/account-handle`,
 * `PATCH /training/tutors/:id/account-handle`. Luật chi tiết (3–50 ký tự,
 * không khoảng trắng, không `@`) kiểm ở `normalizeAccountHandle`.
 */
export class SetAccountHandleDto {
  @ApiProperty({
    description:
      'Tên đăng nhập mới: 3–50 ký tự, không khoảng trắng, không ký tự @. Không phân biệt hoa thường khi kiểm trùng.',
    example: 'nguyenvana',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  accountHandle: string;
}

export interface AccountHandleResultDto {
  /** `users.id` (route `/users`) hoặc staff id (route của role trưởng). */
  id: string;
  accountHandle: string;
}

export class SetupPasswordDto {
  @ApiProperty({
    description: 'First password for an OAuth-created account',
    example: 'NewStrongPass123!',
  })
  @IsString()
  @MinLength(6)
  password: string;
}

export class ResendVerificationDto {
  @ApiPropertyOptional({
    example: 'user@example.com',
    description:
      'Optional replacement email. When omitted, backend uses current account email.',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export interface RefreshUserDto {
  id: string;
  accountHandle: string;
  roleType: UserRole;
}
