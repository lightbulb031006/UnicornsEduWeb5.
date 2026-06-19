import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { StaffRole, StaffStatus, StudentStatus } from 'generated/enums';

export class StaffLandingProfileQueryDto {
  @ApiPropertyOptional({
    enum: StaffRole,
    description: 'Filter by staff role (default: teacher)',
    example: StaffRole.teacher,
  })
  @IsOptional()
  @IsEnum(StaffRole)
  role?: StaffRole;

  @ApiPropertyOptional({
    enum: StaffStatus,
    description: 'Filter by staff status (default: active)',
    example: StaffStatus.active,
  })
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    default: 50,
    description: 'Maximum number of profiles to return',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class StudentLandingProfileQueryDto {
  @ApiPropertyOptional({
    enum: StudentStatus,
    description: 'Filter by student status (default: active)',
    example: StudentStatus.active,
  })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 500,
    default: 100,
    description: 'Maximum number of profiles to return',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class StaffLandingProfileDto {
  @ApiProperty({ example: 'teacher-001' })
  id: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  name: string;

  @ApiProperty({
    nullable: true,
    example: 'https://example.com/avatar.jpg',
  })
  avatarUrl: string | null;

  @ApiProperty({
    nullable: true,
    example: 'users/user-1/avatar',
    description: 'Stable storage path in the avatars bucket',
  })
  avatarPath: string | null;

  @ApiProperty({ nullable: true, example: 'HCMUS' })
  university: string | null;

  @ApiProperty({ nullable: true, example: 'Computer Science' })
  specialization: string | null;
}

export class StudentLandingProfileDto {
  @ApiProperty({ example: 'student-001' })
  id: string;

  @ApiProperty({ example: 'Tran Thi B' })
  name: string;

  @ApiProperty({ nullable: true, example: 'THPT Nguyen Du' })
  school: string | null;

  @ApiProperty({ nullable: true, example: 'Ha Noi' })
  province: string | null;
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
