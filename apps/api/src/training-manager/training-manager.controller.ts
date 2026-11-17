import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { PaymentStatus, UserRole } from 'generated/enums';
import {
  CurrentUser,
  type JwtPayload,
} from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import {
  ParseClassIdPipe,
  ParseStaffIdPipe,
} from 'src/common/pipes/parse-entity-id.pipe';
import type {
  TrainingManagerBulkPaymentStatusUpdateDto,
  TrainingManagerBulkPaymentStatusUpdateResultDto,
  TrainingManagerManagedClassListDto,
  TrainingManagerSessionAllowanceDto,
  TrainingManagerStaffOptionDto,
  UpdateClassTrainingManagerDto,
  UpdateTrainingManagerSessionRateDto,
} from 'src/dtos/training-manager.dto';
import { TrainingManagerService } from './training-manager.service';

@ApiTags('training-manager')
@Controller()
@ApiCookieAuth('access_token')
@Roles(UserRole.staff, UserRole.admin)
export class TrainingManagerController {
  constructor(
    private readonly trainingManagerService: TrainingManagerService,
  ) {}

  // Không đặt dưới `/staff/*`: `GET /staff/:id` (StaffModule, chỉ Admin) đăng
  // ký trước và nuốt path cũ `/staff/training-manager-options` → Admin 400,
  // Trưởng ban Đào tạo 403, dropdown Quản lý lớp không bao giờ có danh sách.
  @Get('training-manager/options')
  @ApiOperation({
    summary: 'Search active training staff for class manager assignment',
    description:
      'Nhân sự Ban Đào Tạo đang hoạt động (`training` / `training_head`) để gán Quản lý lớp. Trước đây là `GET /staff/training-manager-options` (bị `GET /staff/:id` che).',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Training staff options.' })
  async searchTrainingManagerOptions(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ): Promise<TrainingManagerStaffOptionDto[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    return this.trainingManagerService.searchTrainingManagerOptions({
      search,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @Patch('class/:id/training-manager')
  @ApiOperation({
    summary: 'Assign class training manager and rate percent',
    description:
      'Giao / gỡ Quản lý lớp: Admin và Trưởng ban Đào tạo trên mọi lớp (#277). Sửa % trợ cấp quản lý lớp: chỉ Admin (#276). Chỉ kiểm phần thật sự đổi so với giá trị hiện tại (gửi lại % cũ không bị chặn).',
  })
  @ApiParam({ name: 'id', description: 'Class ID' })
  @ApiBody({ description: 'Training manager assignment payload' })
  @ApiResponse({ status: 200, description: 'Updated class training manager.' })
  @ApiResponse({
    status: 403,
    description:
      'Đổi % trợ cấp quản lý lớp khi không phải Admin («Chỉ Admin được sửa % trợ cấp quản lý lớp.»), hoặc giao / gỡ Quản lý lớp khi không phải Admin / Trưởng ban Đào tạo.',
  })
  async updateClassTrainingManager(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) classId: string,
    @Body() body: UpdateClassTrainingManagerDto,
  ) {
    return this.trainingManagerService.updateClassTrainingManager(
      classId,
      body,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Get('training-manager/staff/:staffId/managed-classes')
  @ApiOperation({
    summary: 'List classes managed by training staff with totals',
  })
  @ApiParam({ name: 'staffId', description: 'Training staff ID' })
  @ApiQuery({ name: 'month', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Managed class list with summary.' })
  async getManagedClasses(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Query('month') month: string,
  ): Promise<TrainingManagerManagedClassListDto> {
    return this.trainingManagerService.getManagedClassesByStaffId(
      user.id,
      user.roleType,
      staffId,
      month,
    );
  }

  @Get('training-manager/staff/:staffId/classes/:classId/session-allowances')
  @ApiOperation({
    summary: 'List training manager session allowances for one managed class',
  })
  @ApiParam({ name: 'staffId', description: 'Training staff ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiQuery({ name: 'month', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'Session-level training manager allowances in month.',
  })
  async getSessionAllowancesByClass(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Query('month') month: string,
  ): Promise<TrainingManagerSessionAllowanceDto[]> {
    return this.trainingManagerService.getSessionAllowancesByClass(
      user.id,
      user.roleType,
      staffId,
      classId,
      month,
    );
  }

  @Patch('training-manager/staff/:staffId/sessions/:sessionId/rate')
  @ApiOperation({
    summary: 'Adjust training manager rate percent of one unpaid session',
  })
  @ApiParam({ name: 'staffId', description: 'Training staff ID' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiBody({ description: '{ trainingManagerRatePercent } (0 < % ≤ 100)' })
  @ApiResponse({
    status: 200,
    description: 'Session allowance recomputed with the new rate.',
  })
  @ApiResponse({ status: 400, description: 'Invalid rate or session paid.' })
  @ApiResponse({
    status: 403,
    description: 'Chỉ Admin được sửa % trợ cấp quản lý lớp (#276).',
  })
  async updateSessionRatePercent(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: UpdateTrainingManagerSessionRateDto,
  ): Promise<TrainingManagerSessionAllowanceDto> {
    return this.trainingManagerService.updateSessionRatePercent(
      { userId: user.id, userEmail: user.email, roleType: user.roleType },
      staffId,
      sessionId,
      body?.trainingManagerRatePercent,
    );
  }

  @Patch('training-manager/staff/:staffId/payment-status/bulk')
  @ApiOperation({
    summary: 'Bulk update training manager session payment status',
  })
  @ApiParam({ name: 'staffId', description: 'Training staff ID' })
  @ApiBody({ description: 'Session ids and payment status' })
  @ApiResponse({ status: 200, description: 'Bulk update result.' })
  async bulkUpdatePaymentStatus(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Body() body: TrainingManagerBulkPaymentStatusUpdateDto,
  ): Promise<TrainingManagerBulkPaymentStatusUpdateResultDto> {
    return this.trainingManagerService.bulkUpdatePaymentStatus(
      user.id,
      user.roleType,
      staffId,
      body.sessionIds,
      body.paymentStatus,
    );
  }
}
