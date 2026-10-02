import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { AchievementLevel } from 'generated/enums';

export class StaffLandingProfileQueryDto {
  @ApiPropertyOptional({
    description: 'Search by staff name (case-insensitive)',
    example: 'Nguyen Van',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    minimum: 1,
    default: 1,
    description: 'Page number (1-based)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    default: 50,
    description: 'Page size (max 100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Comma-separated staff ids (`UNISTAFF-…`). When set, only those profiles are returned. Still paginated by `page`/`limit` — loop pages if more than `limit` ids are passed.',
    example: 'UNISTAFF-a1b2c3d4e5,UNISTAFF-f6e5d4c3b2',
  })
  @IsOptional()
  @IsString()
  ids?: string;
}

export class StudentLandingProfileQueryDto {
  @ApiPropertyOptional({
    description: 'Search by student full name (case-insensitive)',
    example: 'Le Van',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    minimum: 1,
    default: 1,
    description: 'Page number (1-based)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    default: 50,
    description:
      'Page size (max 100). Landing CMS should loop pages for full sync.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Comma-separated student ids (`UNIST-…`). When set, only those profiles are returned. Still paginated by `page`/`limit` — loop pages if more than `limit` ids are passed.',
    example: 'UNIST-a1b2c3d4e5,UNIST-f6e5d4c3b2',
  })
  @IsOptional()
  @IsString()
  ids?: string;
}

export class StudentLandingAchievementsQueryDto {
  @ApiPropertyOptional({
    enum: AchievementLevel,
    description: 'Filter by achievement level. Omit for all levels.',
  })
  @IsOptional()
  @IsEnum(AchievementLevel)
  level?: AchievementLevel;

  @ApiPropertyOptional({
    minimum: 1,
    default: 1,
    description: 'Page number (1-based)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    default: 9,
    description: 'Page size (max 100). Landing /thanh-tich uses 9.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Comma-separated published student ids from CMS (`UNIST-…`). Required unless `includeUnpublished=true`. Empty / missing (without `includeUnpublished`) → empty page (no roster leak).',
    example: 'UNIST-a1b2c3d4e5,UNIST-f6e5d4c3b2',
  })
  @IsOptional()
  @IsString()
  sourceIds?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'When true, ignores `sourceIds`/publish gate and returns achievements for ALL students (level-list surface, e.g. /thanh-tich by-level browse). Keep false for publish-gated surfaces (e.g. "Tự Hào Unicorns" showcase).',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeUnpublished?: boolean;
}

export class LandingAchievementDto {
  @ApiProperty({ example: 'ach-uuid-1' })
  id: string;

  @ApiProperty({ example: 'HCV Olympic Tin học 2024' })
  title: string;

  @ApiProperty({
    nullable: true,
    example:
      'https://your-project.supabase.co/storage/v1/object/public/achievements-public/staff/.../ach.jpg',
    description:
      'Stable public URL of the watermarked proof image (null if no twin).',
  })
  imageUrl: string | null;

  @ApiProperty({
    nullable: true,
    example: 'staff/UNISTAFF-a1b2c3d4e5/ach-uuid-1.jpg',
    description:
      'Stable path in public bucket `achievements-public` (watermarked twin). CMS may store as `eduweb5://achievements-public/{path}`.',
  })
  imagePath: string | null;

  @ApiProperty({
    example: 0,
    description: 'Display order ascending (0 first).',
  })
  sortOrder: number;
}

/** Student landing achievements — structured fields for CMS /thanh-tich. */
export class LandingStudentAchievementDto {
  @ApiProperty({ example: 'sach-uuid-1' })
  id: string;

  @ApiProperty({ example: 'Giải Khuyến khích' })
  award: string;

  @ApiProperty({ example: 'HSG Quốc gia' })
  exam: string;

  @ApiProperty({ example: 2025 })
  year: number;

  @ApiProperty({
    enum: AchievementLevel,
    example: AchievementLevel.HSG_QUOC_GIA,
  })
  level: AchievementLevel;

  @ApiProperty({
    nullable: true,
    example: 'KHỐI THPT',
    description: 'Optional course label; blank → landing infers from level.',
  })
  courseLabel: string | null;

  @ApiProperty({
    example: 'Giải Khuyến khích · HSG Quốc gia',
    description:
      'Derived `${award} · ${exam}` for short-term CMS title consumers.',
  })
  title: string;

  @ApiProperty({
    nullable: true,
    example:
      'https://your-project.supabase.co/storage/v1/object/public/achievements-public/student/.../sach.jpg',
  })
  imageUrl: string | null;

  @ApiProperty({
    nullable: true,
    example: 'student/UNIST-a1b2c3d4e5/sach-uuid-1.jpg',
  })
  imagePath: string | null;

  @ApiProperty({ example: 0 })
  sortOrder: number;
}

export class LandingStudentGalleryItemDto {
  @ApiProperty({ example: 'gallery-uuid-1' })
  id: string;

  @ApiProperty({
    nullable: true,
    example: null,
    description: 'Unused in product UI; typically null.',
  })
  caption: string | null;

  @ApiProperty({
    nullable: true,
    example:
      'https://your-project.supabase.co/storage/v1/object/public/student-gallery-public/student/.../item.jpg',
    description:
      'Stable public URL of the watermarked gallery image (null if no twin).',
  })
  imageUrl: string | null;

  @ApiProperty({
    nullable: true,
    example: 'student/UNIST-a1b2c3d4e5/gallery-uuid-1.jpg',
    description:
      'Stable path in public bucket `student-gallery-public` (watermarked twin).',
  })
  imagePath: string | null;

  @ApiProperty({
    example: 0,
    description: 'Display order ascending (0 first).',
  })
  sortOrder: number;
}

export class StaffLandingProfileDto {
  @ApiProperty({ example: 'teacher-001' })
  id: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  name: string;

  @ApiProperty({
    enum: ['active', 'inactive'],
    example: 'active',
    description:
      'Staff employment status. Landing CMS may label inactive as đã nghỉ; publish is still CMS-gated.',
  })
  status: 'active' | 'inactive';

  @ApiProperty({
    nullable: true,
    example:
      'https://your-project.supabase.co/storage/v1/object/public/avatars-public/users/user-1/avatar.jpg',
    description: 'Public URL of watermarked avatar twin (landing only).',
  })
  avatarUrl: string | null;

  @ApiProperty({
    nullable: true,
    example: 'users/user-1/avatar.jpg',
    description:
      'Stable path in public bucket `avatars-public` (watermarked twin).',
  })
  avatarPath: string | null;

  @ApiProperty({ nullable: true, example: 'HCMUS' })
  university: string | null;

  @ApiProperty({
    nullable: true,
    example: 'Computer Science',
    description:
      'Deprecated legacy blob. Prefer `achievements`. Kept for CMS backward compatibility during migration.',
  })
  specialization: string | null;

  @ApiProperty({
    type: [LandingAchievementDto],
    description:
      'Ordered public achievements (title + optional proof image). Prefer this over `specialization`.',
  })
  achievements: LandingAchievementDto[];
}

export class StudentLandingProfileDto {
  @ApiProperty({ example: 'student-001' })
  id: string;

  @ApiProperty({ example: 'Tran Thi B' })
  name: string;

  @ApiProperty({
    enum: ['active', 'inactive'],
    example: 'active',
    description:
      'Student enrollment status (`inactive` = đã nghỉ học). Included for CMS browse labels; no status filter on this endpoint.',
  })
  status: 'active' | 'inactive';

  @ApiProperty({
    nullable: true,
    example:
      'https://your-project.supabase.co/storage/v1/object/public/avatars-public/users/user-2/avatar.jpg',
    description: 'Public URL of watermarked avatar twin (landing only).',
  })
  avatarUrl: string | null;

  @ApiProperty({
    nullable: true,
    example: 'users/user-2/avatar.jpg',
    description:
      'Stable path in public bucket `avatars-public` (watermarked twin).',
  })
  avatarPath: string | null;

  @ApiProperty({ nullable: true, example: 'THPT Nguyen Du' })
  school: string | null;

  @ApiProperty({ nullable: true, example: 'Ha Noi' })
  province: string | null;

  @ApiProperty({
    type: [LandingStudentAchievementDto],
    description:
      'Ordered public student achievements (award/exam/year/level/courseLabel + proof image).',
  })
  achievements: LandingStudentAchievementDto[];

  @ApiProperty({
    type: [LandingStudentGalleryItemDto],
    description:
      'Ordered gallery photos (watermarked public images only; no captions in product UI).',
  })
  gallery: LandingStudentGalleryItemDto[];
}

export class StaffLandingProfilesResponseDto {
  @ApiProperty({ type: [StaffLandingProfileDto] })
  data: StaffLandingProfileDto[];

  @ApiProperty({ example: 12 })
  total: number;
}

export class StudentLandingProfilesResponseDto {
  @ApiProperty({ type: [StudentLandingProfileDto] })
  data: StudentLandingProfileDto[];

  @ApiProperty({ example: 48 })
  total: number;
}

export class LandingAchievementStudentDto {
  @ApiProperty({ example: 'UNIST-a1b2c3d4e5' })
  id: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  name: string;

  @ApiProperty({ nullable: true, example: 'THPT Chuyên Vĩnh Phúc' })
  school: string | null;

  @ApiProperty({ nullable: true, example: 'Vĩnh Phúc' })
  province: string | null;

  @ApiProperty({
    nullable: true,
    example:
      'https://your-project.supabase.co/storage/v1/object/public/avatars-public/users/user-1/avatar.jpg',
  })
  avatarUrl: string | null;

  @ApiProperty({
    nullable: true,
    example: 'users/user-1/avatar.jpg',
  })
  avatarPath: string | null;
}

export class LandingAchievementListItemDto extends LandingStudentAchievementDto {
  @ApiProperty({ type: LandingAchievementStudentDto })
  student: LandingAchievementStudentDto;
}

export class StudentLandingAchievementsResponseDto {
  @ApiProperty({ type: [LandingAchievementListItemDto] })
  data: LandingAchievementListItemDto[];

  @ApiProperty({ example: 42 })
  total: number;
}
