import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ParseStaffIdPipe,
  ParseClassIdPipe,
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
import { StaffRole, UserRole } from 'generated/enums';
import { AllowStaffRolesOnAdminRoutes } from 'src/auth/decorators/allow-staff-roles-on-admin.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { PaginationQueryDto } from 'src/dtos/pagination.dto';
import {
  CurrentUser,
  type JwtPayload,
} from 'src/auth/decorators/current-user.decorator';
import {
  CreateStaffDto,
  type StaffDepositPaymentPreviewDto,
  StaffDepositPaymentYearDto,
  type StaffPayAllPaymentsResultDto,
  StaffPayAllPaymentsDto,
  StaffPaySelectedPaymentsDto,
  type StaffPayDepositSessionsResultDto,
  StaffPayDepositSessionsDto,
  type StaffPaymentPreviewDto,
  StaffPaymentMonthDto,
  type StaffIncomeSummaryDto,
  SearchCustomerCareStaffDto,
  SearchAssignableStaffUsersDto,
  SearchStaffOptionsDto,
  UpdateStaffDto,
  UpdateStaffStatusDto,
  PatchStaffClassTeacherOperatingDeductionDto,
} from 'src/dtos/staff.dto';
import { normalizeHttpHttpsUrl } from 'src/storage/supabase-storage';
import { StaffService } from './staff.service';
import type { RequestWithResolvedAuthContext } from 'src/auth/auth-request-context';

@Controller('staff')
@ApiTags('staff')
@ApiCookieAuth('access_token')
@AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.accountant_expense)
@Roles(UserRole.admin)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get('assignable-users')
  @ApiOperation({
    summary: 'Search users by email for tutor assignment',
    description:
      'Search existing users by email and return whether they can be linked to a new staff/tutor profile.',
  })
  @ApiQuery({
    name: 'email',
    required: true,
    type: String,
    description: 'Full or partial email',
    example: 'teacher@example.com',
  })
  @ApiResponse({
    status: 200,
    description: 'Matching users with eligibility metadata.',
  })
  async searchAssignableUsers(@Query() query: SearchAssignableStaffUsersDto) {
    return this.staffService.searchAssignableUsersByEmail(query.email);
  }

  @Get('customer-care-options')
  @ApiOperation({
    summary: 'Search customer care staff options',
    description:
      'Return staff options eligible for customer care assignment, filtered by full name.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by full name',
    example: 'Nguyen',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max number of options to return (default 20, max 50)',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: 'Matching customer care staff options.',
  })
  async searchCustomerCareStaffOptions(
    @Query() query: SearchCustomerCareStaffDto,
  ) {
    return this.staffService.searchCustomerCareStaff(query);
  }

  @Get('assistant-options')
  @ApiOperation({
    summary: 'Search assistant staff options',
    description:
      'Return staff options eligible for assistant manager assignment, filtered by full name.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by full name',
    example: 'Nguyen',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max number of options to return (default 20, max 50)',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: 'Matching assistant staff options.',
  })
  async searchAssistantStaffOptions(@Query() query: SearchStaffOptionsDto) {
    return this.staffService.searchAssistantStaff(query);
  }

  @Get('options')
  @ApiOperation({
    summary: 'Search staff options',
    description:
      'Return lightweight staff options for admin selection controls.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by full name',
    example: 'Nguyen',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max number of options to return (default 20, max 50)',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: 'Matching lightweight staff options.',
  })
  async searchStaffOptions(@Query() query: SearchStaffOptionsDto) {
    return this.staffService.searchStaffOptions(query);
  }

  @Get()
  @ApiOperation({
    summary: 'List staff',
    description: 'Get all staff records.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20, max: 100)',
    example: 20,
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by full name',
    example: 'Nguyen',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'inactive'],
    description: 'Filter by staff status',
  })
  @ApiQuery({
    name: 'classId',
    required: false,
    type: String,
    description: 'Filter by class ID',
    example: '7b9f53df-0f90-4e2b-8d52-60b8488f5d5f',
  })
  @ApiQuery({
    name: 'className',
    required: false,
    type: String,
    description: 'Filter by class name (contains, case-insensitive)',
    example: 'Toán 8A',
  })
  @ApiQuery({
    name: 'province',
    required: false,
    type: String,
    description: 'Filter by province (contains, case-insensitive)',
    example: 'ha noi',
  })
  @ApiQuery({
    name: 'university',
    required: false,
    type: String,
    description: 'Filter by university (contains, case-insensitive)',
    example: 'HCMUS',
  })
  @ApiQuery({
    name: 'highSchool',
    required: false,
    type: String,
    description: 'Filter by high school (contains, case-insensitive)',
    example: 'Lê Hồng Phong',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    type: String,
    description: 'Filter by staff role',
    example: 'teacher',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated staff list with data and meta.',
  })
  async getStaff(
    @Query() query: PaginationQueryDto,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('classId') classId?: string,
    @Query('className') className?: string,
    @Query('province') province?: string,
    @Query('university') university?: string,
    @Query('highSchool') highSchool?: string,
    @Query('role') role?: string,
  ) {
    return this.staffService.getStaff({
      ...query,
      search,
      status,
      classId,
      className,
      province,
      university,
      highSchool,
      role,
    });
  }

  @Get(':id/income-summary')
  @ApiOperation({
    summary: 'Get staff income summary',
    description:
      'Backend-authoritative net-first totals for staff detail. incomeStatsTotalNet is the top-card "Tổng nhận" monthly NET (monthlyIncomeTotals.total), while yearIncomeTotal remains the selected-year net rollup and totalReceivedNet keeps the current paid-year + unpaid-snapshot contract. Teacher allowance uses operating + tax on post-operating base; bonuses use tax only (no operating), at the current effective rate for the first matching staff role in priority order: teacher, customer_care, lesson_plan_head, lesson_plan, assistant, accountant, communication, technical. Gross/tax breakdown fields include bonus gross and bonus tax.',
  })
  @ApiParam({ name: 'id', description: 'Staff id' })
  @ApiQuery({
    name: 'month',
    required: true,
    type: String,
    description: 'Month in 01-12 format',
    example: '03',
  })
  @ApiQuery({
    name: 'year',
    required: true,
    type: String,
    description: 'Year in YYYY format',
    example: '2026',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Recent unpaid window in days (default: 14)',
    example: 14,
  })
  @ApiResponse({
    status: 200,
    description: 'Staff income summary.',
  })
  @ApiResponse({ status: 400, description: 'month/year/days invalid.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async getStaffIncomeSummary(
    @Param('id', new ParseStaffIdPipe()) id: string,
    @Query('month') month: string,
    @Query('year') year: string,
    @Query('days') days?: string,
  ): Promise<StaffIncomeSummaryDto> {
    const parsedDays =
      days == null || days.trim() === '' ? undefined : Number(days);

    return this.staffService.getIncomeSummary(id, {
      month,
      year,
      days: parsedDays,
    });
  }

  @Get(':id/payment-preview')
  @ApiOperation({
    summary: 'Get staff payment preview',
    description:
      'Get backend-authoritative payable items grouped by role/source. Every pending/unpaid item across all roles and months is included (deposit sessions excluded). Query month/year are UI context only and do not limit the payable set. Teacher tax is recalculated from the current teacher rate on the post-operating amount, while other roles keep their current per-role tax behavior. Bonus items use the same prioritized staff-role tax rate as income-summary (no operating deduction on bonus).',
  })
  @ApiParam({ name: 'id', description: 'Staff id' })
  @ApiQuery({
    name: 'month',
    required: true,
    type: String,
    description: 'Month in 01-12 format',
    example: '03',
  })
  @ApiQuery({
    name: 'year',
    required: true,
    type: String,
    description: 'Year in YYYY format',
    example: '2026',
  })
  @ApiResponse({
    status: 200,
    description: 'Staff payment preview.',
  })
  @ApiResponse({ status: 400, description: 'month/year invalid.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async getStaffPaymentPreview(
    @Param('id', new ParseStaffIdPipe()) id: string,
    @Query() query: StaffPaymentMonthDto,
  ): Promise<StaffPaymentPreviewDto> {
    return this.staffService.getPaymentPreview(id, query);
  }

  @Get(':id/deposit-payment-preview')
  @ApiOperation({
    summary: 'Get staff deposit payment preview',
    description:
      'List teacher sessions currently marked as deposit for the selected year, grouped by class. Deposit sessions are paid at gross value with no operating deduction and no tax.',
  })
  @ApiParam({ name: 'id', description: 'Staff id' })
  @ApiQuery({
    name: 'year',
    required: true,
    type: String,
    description: 'Year in YYYY format',
    example: '2026',
  })
  @ApiResponse({
    status: 200,
    description: 'Staff deposit payment preview.',
  })
  @ApiResponse({ status: 400, description: 'year invalid.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async getStaffDepositPaymentPreview(
    @Param('id', new ParseStaffIdPipe()) id: string,
    @Query() query: StaffDepositPaymentYearDto,
  ): Promise<StaffDepositPaymentPreviewDto> {
    return this.staffService.getDepositPaymentPreview(id, query);
  }

  @Patch(':id/payment-status/pay-all')
  @ApiOperation({
    summary: 'Pay all listed staff payments',
    description:
      'Refresh each listed item tax snapshot before marking items paid. Recomputes every pending/unpaid item across all roles and months (deposit sessions excluded). Body month/year are UI context only. For teacher sessions, tax is applied on the post-operating amount; other roles keep their current per-role tax behavior.',
  })
  @ApiParam({ name: 'id', description: 'Staff id' })
  @ApiBody({
    type: StaffPayAllPaymentsDto,
    description:
      'Month/year for UI context; payable set includes all pending/unpaid items regardless of month.',
  })
  @ApiResponse({
    status: 200,
    description: 'All listed staff payments processed.',
  })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async payAllStaffPayments(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) id: string,
    @Body() data: StaffPayAllPaymentsDto,
  ): Promise<StaffPayAllPaymentsResultDto> {
    return this.staffService.payAllPayments(id, data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id/payment-status/pay-selected')
  @ApiOperation({
    summary: 'Pay selected staff payments',
    description:
      'Mark only the selected payment-preview items as paid in one transaction. Each item must match a current pending/unpaid preview row for the staff. Body month/year are UI context only.',
  })
  @ApiParam({ name: 'id', description: 'Staff id' })
  @ApiBody({
    type: StaffPaySelectedPaymentsDto,
    description:
      'Selected preview items identified by sourceType and entity id.',
  })
  @ApiResponse({
    status: 200,
    description: 'Selected staff payments processed.',
  })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async paySelectedStaffPayments(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) id: string,
    @Body() data: StaffPaySelectedPaymentsDto,
  ): Promise<StaffPayAllPaymentsResultDto> {
    return this.staffService.paySelectedPayments(id, data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id/payment-status/pay-deposit')
  @ApiOperation({
    summary: 'Pay selected deposit sessions',
    description:
      'Zero out teacher operating/tax deductions, then mark the selected deposit sessions as paid in one transaction. Only sessions currently in deposit state and owned by the target staff are accepted.',
  })
  @ApiParam({ name: 'id', description: 'Staff id' })
  @ApiBody({
    type: StaffPayDepositSessionsDto,
    description: 'Selected deposit session ids',
  })
  @ApiResponse({
    status: 200,
    description: 'Selected deposit sessions processed.',
  })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async payStaffDepositSessions(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) id: string,
    @Body() data: StaffPayDepositSessionsDto,
  ): Promise<StaffPayDepositSessionsResultDto> {
    return this.staffService.payDepositSessions(id, data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id/class-teachers/:classId/operating-deduction')
  @ApiOperation({
    summary: 'Update operating deduction rate for a staff-class assignment',
    description:
      'Updates operating deduction on session allowance for a staff-class assignment. Restricted to admin users and accountant_expense staff.',
  })
  @ApiParam({ name: 'id', description: 'Staff id (teacher)' })
  @ApiParam({ name: 'classId', description: 'Class id' })
  @ApiBody({ type: PatchStaffClassTeacherOperatingDeductionDto })
  @ApiResponse({
    status: 200,
    description:
      'Full staff profile after update (same shape as GET /staff/:id).',
  })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 403, description: 'Not allowed.' })
  @ApiResponse({
    status: 404,
    description: 'Staff or class–teacher row not found.',
  })
  async patchStaffClassTeacherOperatingDeduction(
    @CurrentUser() user: JwtPayload,
    @Req() req: RequestWithResolvedAuthContext,
    @Param('id', new ParseStaffIdPipe()) id: string,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Body() body: PatchStaffClassTeacherOperatingDeductionDto,
  ) {
    return this.staffService.patchStaffClassTeacherOperatingDeduction(
      id,
      classId,
      body,
      {
        roleType: user.roleType,
        staffRoles: req.resolvedStaffRoles ?? [],
        auditActor: {
          userId: user.id,
          userEmail: user.email,
          roleType: user.roleType,
        },
      },
    );
  }

  @Post(':id/regenerate-meet-link')
  @Roles(UserRole.admin, UserRole.staff)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerate Google Meet link for a tutor',
    description:
      'Generates a new Google Meet link for the specified staff member and saves it to staff_info.google_meet_link. Any authenticated admin or staff user can call this endpoint. Returns the new Meet link.',
  })
  @ApiParam({ name: 'id', description: 'Staff id' })
  @ApiResponse({
    status: 200,
    description: 'New Google Meet link generated and saved.',
  })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async regenerateMeetLink(@Param('id', new ParseStaffIdPipe()) id: string) {
    return this.staffService.regenerateMeetLink(id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get staff by id',
    description: 'Get a single staff record by id.',
  })
  @ApiParam({ name: 'id', description: 'Staff id' })
  @ApiResponse({ status: 200, description: 'Staff found.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async getStaffById(@Param('id', new ParseStaffIdPipe()) id: string) {
    return this.staffService.getStaffById(id);
  }

  @Post()
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
  @ApiOperation({
    summary: 'Create staff',
    description: 'Create a new staff record.',
  })
  @ApiBody({ type: CreateStaffDto, description: 'Staff create payload' })
  @ApiResponse({ status: 201, description: 'Staff created.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async createStaff(
    @CurrentUser() user: JwtPayload,
    @Body() data: CreateStaffDto,
  ) {
    const normalizedBankQrLink = normalizeHttpHttpsUrl(
      data.bank_qr_link,
      'Link QR ngân hàng',
    );
    const normalizedAchievementLink = normalizeHttpHttpsUrl(
      data.personal_achievement_link,
      'Link thành tích cá nhân',
    );

    return this.staffService.createStaff(
      {
        ...data,
        bank_qr_link: normalizedBankQrLink ?? undefined,
        personal_achievement_link: normalizedAchievementLink ?? undefined,
      },
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Patch()
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
  @ApiOperation({
    summary: 'Update staff',
    description: 'Update a staff record.',
  })
  @ApiBody({
    type: UpdateStaffDto,
    description: 'Staff update payload (id required)',
  })
  @ApiResponse({ status: 200, description: 'Staff updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async updateStaff(
    @CurrentUser() user: JwtPayload,
    @Body() data: UpdateStaffDto,
  ) {
    const normalizedBankQrLink = normalizeHttpHttpsUrl(
      data.bank_qr_link,
      'Link QR ngân hàng',
    );
    const normalizedAchievementLink = normalizeHttpHttpsUrl(
      data.personal_achievement_link,
      'Link thành tích cá nhân',
    );

    return this.staffService.updateStaff(
      {
        ...data,
        bank_qr_link: normalizedBankQrLink ?? undefined,
        personal_achievement_link: normalizedAchievementLink ?? undefined,
      },
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Patch(':id/status')
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
  @ApiOperation({
    summary: 'Update staff operational status',
    description:
      'Admin-only status transition. Inactive staff remain in historical records but cannot receive new assignments.',
  })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @ApiBody({
    type: UpdateStaffStatusDto,
    description: 'Staff status transition payload',
  })
  @ApiResponse({ status: 200, description: 'Staff status updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async updateStaffStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) id: string,
    @Body() body: UpdateStaffStatusDto,
  ) {
    return this.staffService.updateStaffStatus(id, body, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':id')
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
  @ApiOperation({
    summary: 'Delete staff',
    description: 'Delete a staff record by id.',
  })
  @ApiParam({ name: 'id', description: 'Staff id' })
  @ApiResponse({ status: 200, description: 'Staff deleted.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async deleteStaff(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) id: string,
  ) {
    return this.staffService.deleteStaff(id, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }
}
