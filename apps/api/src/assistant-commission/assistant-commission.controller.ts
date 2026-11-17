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
import {
  ParseStaffIdPipe,
  ParseStudentIdPipe,
} from 'src/common/pipes/parse-entity-id.pipe';
import type {
  AssistantBulkPaymentStatusUpdateDto,
  AssistantBulkPaymentStatusUpdateResultDto,
  AssistantCommissionScope,
  AssistantManagedCustomerCareListDto,
  AssistantManagedStudentListDto,
  AssistantSessionShareItemDto,
} from 'src/dtos/assistant-commission.dto';
import { AssistantCommissionService } from './assistant-commission.service';

function normalizeScopeParam(scope?: string): AssistantCommissionScope {
  if (scope === 'all' || scope === 'month') {
    return scope;
  }

  return 'pending';
}

@ApiTags('assistant-commission')
@Controller('assistant-commission')
@ApiCookieAuth('access_token')
@Roles(UserRole.staff, UserRole.admin)
export class AssistantCommissionController {
  constructor(
    private readonly assistantCommissionService: AssistantCommissionService,
  ) {}

  @Get('staff/:assistantStaffId/managed-customer-care')
  @ApiOperation({
    summary: 'List customer-care staff managed by a Sale & CSKH head',
    description:
      'Returns CSKH staff managed by the Sale & CSKH head (sale_customer_care_head) with aggregated head commission (hoa hồng trưởng phòng, 3% tuition) totals.',
  })
  @ApiParam({
    name: 'assistantStaffId',
    description: 'Sale & CSKH head staff ID',
  })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['pending', 'all', 'month'],
    description: 'Filter scope (default pending).',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: String,
    description: 'Month key YYYY-MM (required when scope=month).',
  })
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
  @ApiResponse({ status: 200, description: 'Paginated managed CSKH list.' })
  @ApiResponse({ status: 404, description: 'Assistant staff not found.' })
  async getManagedCustomerCare(
    @CurrentUser() user: JwtPayload,
    @Param('assistantStaffId', new ParseStaffIdPipe()) assistantStaffId: string,
    @Query('scope') scope?: string,
    @Query('month') month?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<AssistantManagedCustomerCareListDto> {
    return this.assistantCommissionService.getManagedCustomerCare(
      user.id,
      user.roleType,
      assistantStaffId,
      {
        scope: normalizeScopeParam(scope),
        month,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
    );
  }

  @Get(
    'staff/:assistantStaffId/managed-customer-care/:customerCareStaffId/students',
  )
  @ApiOperation({
    summary: 'List students with head commission under one managed CSKH',
    description:
      'Aggregates 3% tuition share by student for one customer-care staff managed by the Sale & CSKH head.',
  })
  @ApiParam({
    name: 'assistantStaffId',
    description: 'Sale & CSKH head staff ID',
  })
  @ApiParam({
    name: 'customerCareStaffId',
    description: 'Managed customer-care staff ID',
  })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['pending', 'all', 'month'],
    description: 'Filter scope (default pending).',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: String,
    description: 'Month key YYYY-MM (required when scope=month).',
  })
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
  @ApiResponse({ status: 200, description: 'Paginated student share list.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async getStudentsByManagedCustomerCare(
    @CurrentUser() user: JwtPayload,
    @Param('assistantStaffId', new ParseStaffIdPipe()) assistantStaffId: string,
    @Param('customerCareStaffId', new ParseStaffIdPipe())
    customerCareStaffId: string,
    @Query('scope') scope?: string,
    @Query('month') month?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<AssistantManagedStudentListDto> {
    return this.assistantCommissionService.getStudentsByManagedCustomerCare(
      user.id,
      user.roleType,
      assistantStaffId,
      customerCareStaffId,
      {
        scope: normalizeScopeParam(scope),
        month,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
    );
  }

  @Get(
    'staff/:assistantStaffId/managed-customer-care/:customerCareStaffId/students/:studentId/session-shares',
  )
  @ApiOperation({
    summary: 'Session-level head commission rows for one student',
    description:
      'Returns attendance-level 3% tuition share rows for one student under a managed CSKH.',
  })
  @ApiParam({
    name: 'assistantStaffId',
    description: 'Sale & CSKH head staff ID',
  })
  @ApiParam({
    name: 'customerCareStaffId',
    description: 'Managed customer-care staff ID',
  })
  @ApiParam({ name: 'studentId', description: 'Student ID' })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['pending', 'all', 'month'],
    description: 'Filter scope (default pending).',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: String,
    description: 'Month key YYYY-MM (required when scope=month).',
  })
  @ApiResponse({
    status: 200,
    description: 'Session-level head commission rows.',
  })
  @ApiResponse({ status: 404, description: 'Staff or student not found.' })
  async getSessionSharesByStudent(
    @CurrentUser() user: JwtPayload,
    @Param('assistantStaffId', new ParseStaffIdPipe()) assistantStaffId: string,
    @Param('customerCareStaffId', new ParseStaffIdPipe())
    customerCareStaffId: string,
    @Param('studentId', new ParseStudentIdPipe()) studentId: string,
    @Query('scope') scope?: string,
    @Query('month') month?: string,
  ): Promise<AssistantSessionShareItemDto[]> {
    return this.assistantCommissionService.getSessionSharesByStudent(
      user.id,
      user.roleType,
      assistantStaffId,
      customerCareStaffId,
      studentId,
      {
        scope: normalizeScopeParam(scope),
        month,
      },
    );
  }

  @Patch('staff/:assistantStaffId/payment-status/bulk')
  @ApiOperation({
    summary: 'Bulk update head commission payment status',
    description:
      'Cập nhật trạng thái thanh toán hoa hồng trưởng phòng (3%) cho các attendance đã chọn. Khi chuyển sang paid, backend snapshot % thuế hiện hành; khi đổi về pending, reset snapshot thuế về 0.',
  })
  @ApiParam({
    name: 'assistantStaffId',
    description: 'Sale & CSKH head staff ID',
  })
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
    description: 'Selected head commission rows updated.',
  })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({
    status: 404,
    description:
      'At least one attendance was not found for this Sale & CSKH head.',
  })
  async bulkUpdatePaymentStatus(
    @CurrentUser() user: JwtPayload,
    @Param('assistantStaffId', new ParseStaffIdPipe()) assistantStaffId: string,
    @Body() data: AssistantBulkPaymentStatusUpdateDto,
  ): Promise<AssistantBulkPaymentStatusUpdateResultDto> {
    return this.assistantCommissionService.bulkUpdatePaymentStatus(
      user.id,
      user.roleType,
      assistantStaffId,
      data.attendanceIds,
      data.paymentStatus,
    );
  }
}
