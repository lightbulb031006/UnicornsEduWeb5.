import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from 'generated/enums';
import {
  CurrentUser,
  type JwtPayload,
} from 'src/auth/decorators/current-user.decorator';
import { AllowStaffRolesOnAdminRoutes } from 'src/auth/decorators/allow-staff-roles-on-admin.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import {
  type DeleteNotificationResponseDto,
  type NotificationAdminItemDto,
  type NotificationFeedItemDto,
  type NotificationFeedMarkReadResponseDto,
  type NotificationRecipientOptionDto,
  CreateNotificationDto,
  GetAdminNotificationsQueryDto,
  GetNotificationFeedQueryDto,
  GetNotificationRecipientOptionsQueryDto,
  PushNotificationDto,
  UpdateNotificationDto,
} from 'src/dtos/notification.dto';
import { NOTIFICATION_PUBLISHER_STAFF_ROLES } from './notification-publisher-roles';
import { NotificationService } from './notification.service';

const MANAGEMENT_FORBIDDEN_RESPONSE = {
  status: 403,
  description: 'Gia sư và CSKH chỉ nhận thông báo, không được quản lý.',
};

@Controller('notifications')
@ApiTags('notifications')
@ApiCookieAuth('access_token')
// Route quản lý (`@Roles(admin)`) mở cho các staff role được tạo push; feed giữ `@Roles(admin, staff)`.
@AllowStaffRolesOnAdminRoutes(...NOTIFICATION_PUBLISHER_STAFF_ROLES)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @Roles(UserRole.admin)
  @ApiResponse(MANAGEMENT_FORBIDDEN_RESPONSE)
  @ApiOperation({
    summary: 'List notifications for admin management',
    description:
      'Return draft and published notifications so admins and publisher staff roles can create, edit, push, and delete them.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Optional notification status filter.',
    example: 'draft',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of rows returned.',
    example: 200,
  })
  @ApiResponse({
    status: 200,
    description: 'Notification management list.',
  })
  async getAdminNotifications(
    @Query() query: GetAdminNotificationsQueryDto,
  ): Promise<NotificationAdminItemDto[]> {
    return this.notificationService.getAdminNotifications(query);
  }

  @Post()
  @Roles(UserRole.admin)
  @ApiResponse(MANAGEMENT_FORBIDDEN_RESPONSE)
  @ApiOperation({
    summary: 'Create a notification draft',
    description:
      'Create a draft notification. Drafts are persisted but not broadcast until pushed.',
  })
  @ApiBody({
    type: CreateNotificationDto,
    description: 'Draft notification payload.',
  })
  @ApiResponse({
    status: 201,
    description: 'Draft notification created.',
  })
  async createNotificationDraft(
    @CurrentUser() user: JwtPayload,
    @Body() data: CreateNotificationDto,
  ): Promise<NotificationAdminItemDto> {
    return this.notificationService.createNotificationDraft(data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get('recipient-options')
  @Roles(UserRole.admin)
  @ApiResponse(MANAGEMENT_FORBIDDEN_RESPONSE)
  @ApiOperation({
    summary: 'Search eligible notification recipients for tagging',
    description:
      'Return active admin and staff accounts that can receive notification feed items.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by display name, email, or account handle.',
    example: 'nguyen',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of options returned.',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: 'Recipient autocomplete options.',
  })
  async getNotificationRecipientOptions(
    @Query() query: GetNotificationRecipientOptionsQueryDto,
  ): Promise<NotificationRecipientOptionDto[]> {
    return this.notificationService.searchNotificationRecipientOptions(query);
  }

  @Patch('feed/:notificationId/read')
  @Roles(UserRole.admin, UserRole.staff)
  @ApiOperation({
    summary: 'Mark a published notification as read for the current user',
    description:
      'Upserts a row in `notification_reads`. Only published notifications with a push timestamp are accepted.',
  })
  @ApiParam({
    name: 'notificationId',
    description: 'Published notification id',
  })
  @ApiResponse({
    status: 200,
    description: 'Read receipt recorded.',
  })
  async markFeedNotificationRead(
    @CurrentUser() user: JwtPayload,
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
  ): Promise<NotificationFeedMarkReadResponseDto> {
    return this.notificationService.markFeedNotificationRead(
      user,
      notificationId,
    );
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  @ApiResponse(MANAGEMENT_FORBIDDEN_RESPONSE)
  @ApiOperation({
    summary: 'Update a notification draft',
    description:
      'Update a draft notification. Published notifications must use push to apply adjustments.',
  })
  @ApiParam({
    name: 'id',
    description: 'Notification id',
  })
  @ApiBody({
    type: UpdateNotificationDto,
    description: 'Draft fields to update.',
  })
  @ApiResponse({
    status: 200,
    description: 'Draft notification updated.',
  })
  async updateNotificationDraft(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() data: UpdateNotificationDto,
  ): Promise<NotificationAdminItemDto> {
    return this.notificationService.updateNotificationDraft(id, data ?? {}, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post(':id/push')
  @Roles(UserRole.admin)
  @ApiResponse(MANAGEMENT_FORBIDDEN_RESPONSE)
  @ApiOperation({
    summary: 'Push a notification to its configured audience',
    description:
      'Publish a draft or apply an adjusted re-push for an already published notification, then broadcast it via websocket to the matched audience.',
  })
  @ApiParam({
    name: 'id',
    description: 'Notification id',
  })
  @ApiBody({
    type: PushNotificationDto,
    required: false,
    description:
      'Optional updated title/message applied atomically with the push.',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification pushed to all staff.',
  })
  async pushNotification(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() data: PushNotificationDto,
  ): Promise<NotificationAdminItemDto> {
    return this.notificationService.pushNotification(id, data ?? {}, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  @ApiResponse(MANAGEMENT_FORBIDDEN_RESPONSE)
  @ApiOperation({
    summary: 'Delete a notification',
    description:
      'Delete a draft or published notification. Deletion does not emit a realtime retract event.',
  })
  @ApiParam({
    name: 'id',
    description: 'Notification id',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification deleted.',
  })
  async deleteNotification(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DeleteNotificationResponseDto> {
    return this.notificationService.deleteNotification(id, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get('feed')
  @Roles(UserRole.admin, UserRole.staff)
  @ApiOperation({
    summary: 'Get the notification feed (staff, admin)',
    description:
      'Return published notifications with per-user readStatus. Admin (kể cả staff role admin): mọi thông báo đã đẩy, không cần staff profile. Staff khác: chỉ thông báo nhắm tới mình, cần profile active.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of published notifications returned.',
    example: 100,
  })
  @ApiResponse({
    status: 200,
    description: 'Published notification feed.',
  })
  async getNotificationFeed(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetNotificationFeedQueryDto,
  ): Promise<NotificationFeedItemDto[]> {
    return this.notificationService.getNotificationFeed(user, query);
  }
}
