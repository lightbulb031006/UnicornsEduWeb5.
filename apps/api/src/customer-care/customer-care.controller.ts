import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ParseStaffIdPipe,
  ParseStudentIdPipe,
} from 'src/common/pipes/parse-entity-id.pipe';
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
import type {
  CustomerCareBulkPaymentStatusUpdateDto,
  CustomerCareBulkPaymentStatusUpdateResultDto,
  CustomerCareCommissionDto,
  CustomerCareSessionCommissionDto,
  CustomerCareStudentListDto,
  CustomerCareTopUpHistoryListDto,
} from 'src/dtos/customer-care.dto';
import { CustomerCareService } from './customer-care.service';

@ApiTags('customer-care')
@Controller('customer-care')
@ApiCookieAuth('access_token')
@Roles(UserRole.staff, UserRole.admin)
export class CustomerCareController {
  constructor(private readonly customerCareService: CustomerCareService) {}

  @Get('staff/:staffId/students')
  @ApiOperation({
    summary: 'List students in customer care',
    description:
      'Students assigned to this staff in customer_care_service, sorted by balance ascending.',
  })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default 1).',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Page size (default 20, max 100).',
  })
  @ApiResponse({ status: 200, description: 'List of students.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async getStudentsByStaffId(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<CustomerCareStudentListDto> {
    return this.customerCareService.getStudentsByStaffId(
      user.id,
      user.roleType,
      staffId,
      {
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
    );
  }

  @Get('staff/:staffId/topup-history')
  @ApiOperation({
    summary: 'List top-up history for students in customer care',
    description:
      'Wallet top-up transactions for students assigned to this customer-care staff, sorted newest first.',
  })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default 1).',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Page size (default 20, max 100).',
  })
  @ApiResponse({ status: 200, description: 'Paginated top-up history.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async getTopUpHistoryByStaffId(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<CustomerCareTopUpHistoryListDto> {
    return this.customerCareService.getTopUpHistoryByStaffId(
      user.id,
      user.roleType,
      staffId,
      {
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
    );
  }

  @Get('staff/:staffId/commissions')
  @ApiOperation({
    summary: 'List students with total commission',
    description:
      'Students with commission from attendances. Default scope=pending returns all unpaid rows; scope=month returns every commission row in the selected calendar month.',
  })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['pending', 'month'],
    description: 'Filter scope (default pending).',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: String,
    description: 'Month key YYYY-MM (required when scope=month).',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description:
      'Legacy last-N-days filter used only when scope is omitted (default 30).',
  })
  @ApiResponse({
    status: 200,
    description:
      'List of studentId, fullName, totalCommission, pendingCommission, paidCommission.',
  })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async getCommissionsByStaffId(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Query('scope') scope?: string,
    @Query('month') month?: string,
    @Query('days') days?: string,
  ): Promise<CustomerCareCommissionDto[]> {
    const parsedDays = days ? parseInt(days, 10) : undefined;
    const safeDays =
      parsedDays != null && Number.isFinite(parsedDays) && parsedDays >= 1
        ? Math.min(parsedDays, 365)
        : undefined;

    return this.customerCareService.getCommissionsByStaffId(
      user.id,
      user.roleType,
      staffId,
      {
        scope:
          scope === 'month'
            ? 'month'
            : scope === 'pending'
              ? 'pending'
              : undefined,
        month,
        days: safeDays,
      },
    );
  }

  @Get('staff/:staffId/students/:studentId/session-commissions')
  @ApiOperation({
    summary: 'Session-level commissions for one student',
    description:
      'Attendances with commission per session. Default scope=pending returns all unpaid rows; scope=month returns every commission row in the selected calendar month.',
  })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiParam({ name: 'studentId', description: 'Student ID' })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['pending', 'month'],
    description: 'Filter scope (default pending).',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: String,
    description: 'Month key YYYY-MM (required when scope=month).',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description:
      'Legacy last-N-days filter used only when scope is omitted (default 30).',
  })
  @ApiResponse({
    status: 200,
    description:
      'List of session commission rows, including customer-care payment status.',
  })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async getSessionCommissionsByStudent(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Param('studentId', new ParseStudentIdPipe()) studentId: string,
    @Query('scope') scope?: string,
    @Query('month') month?: string,
    @Query('days') days?: string,
  ): Promise<CustomerCareSessionCommissionDto[]> {
    const parsedDays = days ? parseInt(days, 10) : undefined;
    const safeDays =
      parsedDays != null && Number.isFinite(parsedDays) && parsedDays >= 1
        ? Math.min(parsedDays, 365)
        : undefined;

    return this.customerCareService.getSessionCommissionsByStudent(
      user.id,
      user.roleType,
      staffId,
      studentId,
      {
        scope:
          scope === 'month'
            ? 'month'
            : scope === 'pending'
              ? 'pending'
              : undefined,
        month,
        days: safeDays,
      },
    );
  }

  @Patch('staff/:staffId/payment-status/bulk')
  @ApiOperation({
    summary: 'Bulk update customer-care commission payment status',
    description:
      'Cập nhật trạng thái thanh toán hoa hồng CSKH cho các attendance đã chọn. Khi chuyển sang paid, backend snapshot % thuế hiện hành vào attendance; khi đổi về pending, reset snapshot thuế về 0.',
  })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiBody({
    description: 'Bulk payment status update payload',
    schema: {
      type: 'object',
      required: ['attendanceIds', 'paymentStatus'],
      properties: {
        attendanceIds: {
          type: 'array',
          items: { type: 'string' },
        },
        paymentStatus: {
          type: 'string',
          enum: [PaymentStatus.pending, PaymentStatus.paid],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Selected customer-care commission rows updated.',
    type: Object,
  })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({
    status: 404,
    description: 'At least one attendance was not found for this staff.',
  })
  async bulkUpdateCommissionPaymentStatus(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Body() data: CustomerCareBulkPaymentStatusUpdateDto,
  ): Promise<CustomerCareBulkPaymentStatusUpdateResultDto> {
    return this.customerCareService.bulkUpdateCommissionPaymentStatus(
      user.id,
      user.roleType,
      staffId,
      data.attendanceIds,
      data.paymentStatus,
    );
  }
}
