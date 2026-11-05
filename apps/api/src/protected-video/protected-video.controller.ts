import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StaffRole, UserRole } from 'generated/enums';
import { AllowStaffRolesOnAdminRoutes } from 'src/auth/decorators/allow-staff-roles-on-admin.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import type {
  ProtectedVideoRetryDto,
  ProtectedVideoStatusDto,
} from 'src/dtos/protected-video.dto';
import { ProtectedVideoService } from './protected-video.service';

/** Badge trạng thái + «Thử lại» ở chỗ staff nhập link video (tiết lý thuyết, recording buổi). */
@Controller('protected-videos')
@ApiTags('protected-videos')
@ApiCookieAuth('access_token')
export class ProtectedVideoController {
  constructor(private readonly protectedVideos: ProtectedVideoService) {}

  @Get('status')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.teacher)
  @ApiOperation({ summary: 'Trạng thái Đồng bộ video của một link YouTube' })
  @ApiQuery({ name: 'url', description: 'Link YouTube đã lưu ở tiết/buổi' })
  @ApiResponse({
    status: 200,
    description:
      'Trạng thái (pending/queued/…/ready/failed); null nếu không phải link YouTube.',
  })
  getStatus(@Query('url') url = ''): Promise<ProtectedVideoStatusDto | null> {
    return this.protectedVideos.getStatus(url);
  }

  @Post('retry')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.teacher)
  @ApiOperation({ summary: 'Gửi lại link YouTube sang UNIOJ (Thử lại)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['url'],
      properties: { url: { type: 'string' } },
    },
  })
  @ApiResponse({
    status: 201,
    description:
      'Trạng thái sau khi gửi lại; null nếu không phải link YouTube.',
  })
  retry(
    @Body() body: ProtectedVideoRetryDto,
  ): Promise<ProtectedVideoStatusDto | null> {
    return this.protectedVideos.retry(body?.url ?? '');
  }
}
