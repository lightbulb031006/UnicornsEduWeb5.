import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { StaffRole, UserRole } from 'generated/enums';

export const NOTIFICATION_STATUSES = ['draft', 'published'] as const;
export const NOTIFICATION_DELIVERY_KINDS = ['published', 'adjusted'] as const;
export const NOTIFICATION_TARGET_ROLE_TYPES = [
  UserRole.admin,
  UserRole.staff,
] as const;

export type NotificationStatusDto = (typeof NOTIFICATION_STATUSES)[number];
export type NotificationDeliveryKindDto =
  (typeof NOTIFICATION_DELIVERY_KINDS)[number];
export type NotificationTargetRoleTypeDto =
  (typeof NOTIFICATION_TARGET_ROLE_TYPES)[number];

export class NotificationTargetingDto {
  @ApiPropertyOptional({
    description:
      'When true, this notification targets every eligible admin and staff account.',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  targetAll?: boolean;

  @ApiPropertyOptional({
    description: 'Optional role types to include in the audience union.',
    enum: NOTIFICATION_TARGET_ROLE_TYPES,
    isArray: true,
    example: [UserRole.staff],
  })
  @IsOptional()
  @IsArray()
  @IsIn(NOTIFICATION_TARGET_ROLE_TYPES, { each: true })
  @ArrayUnique()
  targetRoleTypes?: NotificationTargetRoleTypeDto[];

  @ApiPropertyOptional({
    description: 'Optional staff roles to include in the audience union.',
    enum: StaffRole,
    isArray: true,
    example: [StaffRole.teacher, StaffRole.assistant],
  })
  @IsOptional()
  @IsArray()
  @IsIn(Object.values(StaffRole), { each: true })
  @ArrayUnique()
  targetStaffRoles?: StaffRole[];

  @ApiPropertyOptional({
    description:
      'Optional direct user recipients to include in the audience union.',
    type: [String],
    example: ['0b0c4d3b-0f7d-4f72-b0a1-cf7f17a3eb1c'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayUnique()
  targetUserIds?: string[];
}

export class GetAdminNotificationsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter notifications by status.',
    enum: NOTIFICATION_STATUSES,
    example: 'published',
  })
  @IsOptional()
  @IsIn(NOTIFICATION_STATUSES)
  status?: NotificationStatusDto;

  @ApiPropertyOptional({
    description: 'Maximum number of rows returned.',
    example: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  limit?: number;
}

export class GetNotificationFeedQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of published notifications returned.',
    example: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class GetNotificationRecipientOptionsQueryDto {
  @ApiPropertyOptional({
    description:
      'Search by full or partial display name, email, or account handle.',
    example: 'nguyen',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of recipient options returned.',
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CreateNotificationDto extends NotificationTargetingDto {
  @ApiProperty({
    description: 'Notification title shown to the matched audience.',
    example: 'Lịch nghỉ lễ 30/4',
    maxLength: 160,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @ApiProperty({
    description: 'Notification body shown to the matched audience.',
    example:
      'Trung tâm nghỉ từ 30/4 đến hết 1/5. Mọi lịch học sẽ dời sang cuối tuần.',
    maxLength: 4000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message!: string;
}

export class UpdateNotificationDto extends NotificationTargetingDto {
  @ApiPropertyOptional({
    description: 'Notification title.',
    example: 'Điều chỉnh lịch nghỉ lễ 30/4',
    maxLength: 160,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({
    description: 'Notification body.',
    example: 'Trung tâm nghỉ từ 30/4 đến hết 2/5.',
    maxLength: 4000,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message?: string;
}

export class PushNotificationDto extends UpdateNotificationDto {}

export interface NotificationRecipientOptionDto {
  userId: string;
  roleType: NotificationTargetRoleTypeDto;
  staffRoles: StaffRole[];
  accountHandle: string | null;
  email: string | null;
  displayName: string | null;
}

export interface NotificationAuthorDto {
  userId: string | null;
  accountHandle: string | null;
  email: string | null;
  displayName: string | null;
}

export interface NotificationAdminItemDto {
  id: string;
  title: string;
  message: string;
  status: NotificationStatusDto;
  targetAll: boolean;
  targetRoleTypes: NotificationTargetRoleTypeDto[];
  targetStaffRoles: StaffRole[];
  targetUserIds: string[];
  targetUsers: NotificationRecipientOptionDto[];
  version: number;
  pushCount: number;
  lastPushedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: NotificationAuthorDto | null;
}

export type NotificationFeedReadStatusDto = 'read' | 'unread';

export interface NotificationFeedItemDto {
  id: string;
  title: string;
  message: string;
  status: 'published';
  readStatus: NotificationFeedReadStatusDto;
  version: number;
  pushCount: number;
  lastPushedAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: NotificationAuthorDto | null;
}

export interface NotificationFeedMarkReadResponseDto {
  id: string;
  readStatus: 'read';
}

export interface NotificationPushEventDto {
  id: string;
  title: string;
  message: string;
  version: number;
  lastPushedAt: string;
  deliveryKind: NotificationDeliveryKindDto;
}

export interface DeleteNotificationResponseDto {
  id: string;
}
