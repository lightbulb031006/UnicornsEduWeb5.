import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  Matches,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Gender } from 'generated/enums';

/** Update current user's basic info (self). No id. */
export class UpdateMyProfileDto {
  @ApiPropertyOptional({ example: 'Nguyen' })
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiPropertyOptional({ example: 'Van A' })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'TP.HCM' })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ example: 'nguyenvana' })
  @IsOptional()
  @IsString()
  accountHandle?: string;
}

/** Update current user's staff record (self). No id. */
export class UpdateMyStaffProfileDto {
  @ApiPropertyOptional({
    example: 'Nguyen',
    description: 'Staff first name stored on user.first_name.',
  })
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiPropertyOptional({
    example: 'Van B',
    description: 'Staff last name stored on user.last_name.',
  })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiPropertyOptional({
    example: 'Nguyen Van B',
    description:
      'Deprecated compatibility field. Backend will split this into user first_name/last_name.',
  })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiPropertyOptional({
    example: '012345678901',
    description: 'Số CCCD gồm đúng 12 chữ số',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{12}$/, { message: 'Số CCCD phải gồm đúng 12 chữ số.' })
  cccd_number?: string;

  @ApiPropertyOptional({ example: 'Kinh' })
  @IsOptional()
  @IsString()
  ethnicity?: string;

  @ApiPropertyOptional({ enum: Gender, example: Gender.male })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: '123 Nguyễn Trãi, Quận 1, TP.HCM' })
  @IsOptional()
  @IsString()
  current_address?: string;

  @ApiPropertyOptional({ example: '2022-01-15' })
  @IsOptional()
  @IsDateString()
  cccd_issued_date?: string;

  @ApiPropertyOptional({ example: 'Cục CSQLHC về TTXH' })
  @IsOptional()
  @IsString()
  cccd_issued_place?: string;

  @ApiPropertyOptional({ example: '1998-01-01' })
  @IsOptional()
  @IsDateString()
  birth_date?: string;

  @ApiPropertyOptional({ example: 'HCMUT' })
  @IsOptional()
  @IsString()
  university?: string;

  @ApiPropertyOptional({ example: 'Le Hong Phong' })
  @IsOptional()
  @IsString()
  high_school?: string;

  @ApiPropertyOptional({ example: 'Math' })
  @IsOptional()
  @IsString()
  specialization?: string;

  @ApiPropertyOptional({ example: '1234567890' })
  @IsOptional()
  @IsString()
  bank_account?: string;

  @ApiPropertyOptional({ example: 'https://example.com/qr.png' })
  @IsOptional()
  @IsString()
  bank_qr_link?: string;

  @ApiPropertyOptional({
    example: 'https://drive.google.com/drive/folders/abc123',
  })
  @IsOptional()
  @IsString()
  personal_achievement_link?: string | null;
}

/** Update current user's student record (self). No id. */
export class UpdateMyStudentProfileDto {
  @ApiPropertyOptional({ example: 'Nguyễn Văn B' })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiPropertyOptional({ example: 'student@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'THPT ABC' })
  @IsOptional()
  @IsString()
  school?: string;

  @ApiPropertyOptional({ example: 'TP.HCM' })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ example: 2010 })
  @IsOptional()
  @IsInt()
  @Min(1900)
  birth_year?: number;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  parent_name?: string;

  @ApiPropertyOptional({ example: '0912345678' })
  @IsOptional()
  @IsString()
  parent_phone?: string;

  @ApiPropertyOptional({
    example: 'parent@example.com',
    nullable: true,
    description:
      'Email nhận biên lai nạp ví của phụ huynh. Truyền chuỗi rỗng hoặc null để xoá.',
  })
  @IsOptional()
  @IsEmail()
  parent_email?: string | null;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: 'Đạt IELTS 7.0' })
  @IsOptional()
  @IsString()
  goal?: string;
}
