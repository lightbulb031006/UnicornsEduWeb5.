import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
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
import { ParseClassIdPipe, ParseStaffIdPipe } from 'src/common/pipes/parse-entity-id.pipe';
import type {
  TrainingManagerBulkPaymentStatusUpdateDto,
  TrainingManagerBulkPaymentStatusUpdateResultDto,
  TrainingManagerManagedClassListDto,
  TrainingManagerSessionAllowanceDto,
  TrainingManagerStaffOptionDto,
  UpdateClassTrainingManagerDto,
} from 'src/dtos/training-manager.dto';
import { TrainingManagerService } from './training-manager.service';

@ApiTags('training-manager')
@Controller()
@ApiCookieAuth('access_token')
@Roles(UserRole.staff, UserRole.admin)
export class TrainingManagerController {
  constructor(private readonly trainingManagerService: TrainingManagerService) {}

  @Get('staff/training-manager-options')
  @ApiOperation({ summary: 'Search active training staff for class manager assignment' })
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
  @ApiOperation({ summary: 'Assign class training manager and rate percent' })
  @ApiParam({ name: 'id', description: 'Class ID' })
  @ApiBody({ description: 'Training manager assignment payload' })
  @ApiResponse({ status: 200, description: 'Updated class training manager.' })
  async updateClassTrainingManager(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) classId: string,
    @Body() body: UpdateClassTrainingManagerDto,
  ) {
    return this.trainingManagerService.updateClassTrainingManager(classId, body, {
      userId: user.id,
      roleType: user.roleType,
    });
  }

  @Get('training-manager/staff/:staffId/managed-classes')
  @ApiOperation({ summary: 'List classes managed by training staff with totals' })
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

  @Patch('training-manager/staff/:staffId/payment-status/bulk')
  @ApiOperation({ summary: 'Bulk update training manager session payment status' })
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
