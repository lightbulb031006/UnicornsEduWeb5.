import { SALE_CS_HEAD_ROLE } from 'src/common/sale-cs-head-access';
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
  UseGuards,
} from '@nestjs/common';
import {
  ParseStaffIdPipe,
  ParseClassIdPipe,
} from 'src/common/pipes/parse-entity-id.pipe';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { StaffRole, UserRole } from 'generated/enums';
import { AllowStaffRolesOnAdminRoutes } from 'src/auth/decorators/allow-staff-roles-on-admin.decorator';
import { Public } from 'src/auth/decorators/public.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { LANDING_API_KEY_HEADER } from 'src/auth/decorators/api-key.decorator';
import { ApiKeyGuard } from 'src/auth/guards/api-key.guard';
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
  UpdateStaffFixedSalaryPayableDto,
  SearchCustomerCareStaffDto,
  SearchAssignableStaffUsersDto,
  SearchStaffOptionsDto,
  UpdateStaffDto,
  UpdateStaffTrainingRolesDto,
  StaffTrainingRolesResultDto,
  UpdateStaffWithFixedSalaryOverridesDto,
  UpdateStaffStatusDto,
  PatchStaffClassTeacherOperatingDeductionDto,
  type StaffSurveyDeadlineBlockWarningItemDto,
} from 'src/dtos/staff.dto';
import {
  StaffLandingProfileQueryDto,
  StaffLandingProfilesResponseDto,
} from 'src/dtos/landing-profile.dto';
import { normalizeHttpHttpsUrl } from 'src/storage/supabase-storage';
import { StaffService } from './staff.service';
import type { RequestWithResolvedAuthContext } from 'src/auth/auth-request-context';

@Controller('staff')
@ApiTags('staff')
@ApiCookieAuth('access_token')
@AllowStaffRolesOnAdminRoutes(StaffRole.accountant_expense)
@Roles(UserRole.admin)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get('assignable-users')
  // #270: trả email người dùng → chỉ Admin (tạo hồ sơ nhân sự cũng chỉ Admin).
  @AllowStaffRolesOnAdminRoutes()
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
  @AllowStaffRolesOnAdminRoutes(
    SALE_CS_HEAD_ROLE,
    StaffRole.accountant_expense,
    StaffRole.customer_care,
  )
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
    summary: 'Search Sale & CSKH head staff options',
    description:
      'Return staff with role sale_customer_care_head (Trưởng phòng Sale & CSKH) eligible to manage a CSKH staff, filtered by full name. Several heads may exist.',
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
    description: 'Matching Sale & CSKH head staff options.',
  })
  async searchAssistantStaffOptions(@Query() query: SearchStaffOptionsDto) {
    return this.staffService.searchAssistantStaff(query);
  }

  @Get('options')
  @ApiOperation({
    summary: 'Search staff options',
    description:
      'Return lightweight staff options (id, fullName, status, roles — không có email/thông tin cá nhân) for admin selection controls. #274: Trưởng ban Đào tạo dùng để chọn gia sư khi tạo lớp.',
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
  @ApiResponse({ status: 403, description: 'Role không được tra nhân sự.' })
  // #274: Trưởng ban Đào tạo chọn gia sư khi tạo lớp (giữ Kế toán chi cấp class).
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.accountant_expense,
    StaffRole.training_head,
  )
  async searchStaffOptions(@Query() query: SearchStaffOptionsDto) {
    return this.staffService.searchStaffOptions(query);
  }

  @Get()
  @ApiOperation({
    summary: 'List staff',
    description:
      'Get all staff records. Each row carries `achievementCount` (number of staff achievements) for the «Xem thành tích (n)» button. #270: fields are redacted per viewer (`sensitiveView`): personal info (CCCD, phone, email, address, birth date, gender, ethnicity) only for Admin/self; bank + QR also for accountant_expense; income (`unpaidAmountTotal`) only Admin/accountant_expense/self — hidden fields are absent from the row.',
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
  @ApiResponse({ status: 403, description: 'Not allowed.' })
  async getStaff(
    @CurrentUser() user: JwtPayload,
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
    return this.staffService.getStaff(
      {
        ...query,
        search,
        status,
        classId,
        className,
        province,
        university,
        highSchool,
        role,
      },
      { userId: user.id, roleType: user.roleType },
    );
  }

  @Get('landing-tutors/count')
  @Public()
  @Roles()
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Count landing tutors, including inactive teachers',
  })
  @ApiHeader({ name: LANDING_API_KEY_HEADER, required: true })
  @ApiResponse({
    status: 200,
    description: 'Total teachers across all statuses.',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async getLandingTutorCount() {
    return this.staffService.getLandingTutorCount();
  }

  @Get('landing-tutors')
  @Public()
  @Roles()
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary:
      'List all landing tutors without pagination, including inactive teachers',
  })
  @ApiHeader({ name: LANDING_API_KEY_HEADER, required: true })
  @ApiResponse({ status: 200, type: StaffLandingProfilesResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async getLandingTutors(): Promise<StaffLandingProfilesResponseDto> {
    return this.staffService.getLandingProfiles({}, true);
  }

  @Get('landing-profiles')
  @Public()
  @Roles()
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'List public staff landing profiles',
    description:
      'API-key protected endpoint for the marketing landing site. Returns sanitized staff identity fields only. Does not filter by status or role (all staff).',
  })
  @ApiHeader({
    name: LANDING_API_KEY_HEADER,
    required: true,
    description: 'Landing site API key (LANDING_API_KEY)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Case-insensitive staff name search',
  })
  @ApiQuery({
    name: 'ids',
    required: false,
    type: String,
    description:
      'Comma-separated staff ids (`UNISTAFF-…`). When set, only those profiles are returned. Still paginated by page/limit — loop pages if more than `limit` ids are passed.',
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
    description: 'Page size (default: 50, max: 100)',
    example: 50,
  })
  @ApiResponse({
    status: 200,
    description: 'Sanitized staff landing profiles.',
    type: StaffLandingProfilesResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async getStaffLandingProfiles(
    @Query() query: StaffLandingProfileQueryDto,
  ): Promise<StaffLandingProfilesResponseDto> {
    return this.staffService.getLandingProfiles(query);
  }

  @Get(':id/income-summary')
  @ApiOperation({
    summary: 'Get staff income summary',
    description:
      'Backend-authoritative net-first totals for staff detail. incomeStatsTotalNet is the top-card "Tổng nhận" monthly NET (monthlyIncomeTotals.total), while yearIncomeTotal remains the selected-year net rollup and totalReceivedNet keeps the current paid-year + unpaid-snapshot contract. Teacher allowance uses operating + tax on post-operating base; bonuses use tax only (no operating), at the current effective rate for the first matching staff role in priority order: teacher, customer_care, lesson_plan_head, lesson_plan, assistant, accountant_income, accountant_expense, communication, technical. Gross/tax breakdown fields include bonus gross and bonus tax.',
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

  @Patch(':id/fixed-salary-payables/:payableId')
  @ApiOperation({
    summary: 'Update a pending fixed-salary payable',
    description:
      'Edit gross amount and/or note while the payable is still pending. Net is recalculated from the frozen operating and tax percents stored on the payable. Paid payables cannot be edited. There is no delete endpoint — set the staff override to 0 instead.',
  })
  @ApiParam({ name: 'id', description: 'Staff id' })
  @ApiParam({ name: 'payableId', description: 'Fixed-salary payable id' })
  @ApiBody({ type: UpdateStaffFixedSalaryPayableDto })
  @ApiResponse({ status: 200, description: 'Updated payable amounts.' })
  @ApiResponse({
    status: 400,
    description: 'Paid payable, empty payload, or invalid amount.',
  })
  @ApiResponse({ status: 404, description: 'Staff or payable not found.' })
  async updateStaffFixedSalaryPayable(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) id: string,
    @Param('payableId', new ParseUUIDPipe()) payableId: string,
    @Body() data: UpdateStaffFixedSalaryPayableDto,
  ) {
    return this.staffService.updateStaffFixedSalaryPayable(
      id,
      payableId,
      data,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Get(':id/revenue-share')
  @ApiOperation({
    summary: 'Get staff revenue share commission (lesson_plan_head)',
    description:
      'Tổng doanh thu hệ thống (gộp, chưa trừ chi phí) trong tháng, % hoa hồng doanh thu hiện tại của staff, và số tiền tương ứng = doanh thu × %. Tính real-time, không khấu trừ thuế.',
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
  @ApiResponse({ status: 200, description: 'Staff revenue share commission.' })
  @ApiResponse({ status: 400, description: 'month/year invalid.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async getStaffRevenueShare(
    @Param('id', new ParseStaffIdPipe()) id: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.staffService.getStaffRevenueShare(id, month, year);
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
    description:
      'Staff payment preview. `trialTeachingWarnings`: [{ classId, className }] — lớp còn trợ cấp buổi chờ trả mà gia sư chưa có buổi Dạy thử (coefficient = 0) và chưa bị bỏ qua; chỉ cảnh báo, không chặn thanh toán.',
  })
  @ApiResponse({ status: 400, description: 'month/year invalid.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async getStaffPaymentPreview(
    @Param('id', new ParseStaffIdPipe()) id: string,
    @Query() query: StaffPaymentMonthDto,
  ): Promise<StaffPaymentPreviewDto> {
    return this.staffService.getPaymentPreview(id, query);
  }

  @Post(':id/trial-teaching-warnings/:classId/dismiss')
  @ApiOperation({
    summary: 'Dismiss a trial-teaching warning (Cảnh báo chưa dạy thử)',
    description:
      'Bỏ qua cảnh báo «gia sư chưa có buổi dạy thử ở lớp» trong popup thanh toán (`trialTeachingWarnings` của GET /staff/:id/payment-preview). Lưu theo cặp (gia sư, lớp), dùng chung cho mọi người xem, không nhắc lại. Idempotent. Admin + Kế toán chi; Kế toán chi không bỏ qua cảnh báo của chính mình (#265).',
  })
  @ApiParam({ name: 'id', description: 'Staff id (gia sư)' })
  @ApiParam({ name: 'classId', description: 'Class id' })
  @ApiResponse({
    status: 201,
    description: '{ staffId, classId, dismissedAt }',
  })
  @ApiResponse({
    status: 403,
    description: 'Kế toán chi bỏ qua cảnh báo của chính mình.',
  })
  @ApiResponse({ status: 404, description: 'Staff or class not found.' })
  async dismissTrialTeachingWarning(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) id: string,
    @Param('classId', new ParseClassIdPipe()) classId: string,
  ) {
    return this.staffService.dismissTrialTeachingWarning(id, classId, {
      userId: user.id,
      roleType: user.roleType,
    });
  }

  @Get(':id/survey-deadline-block-warnings')
  @ApiOperation({
    summary: 'Get survey deadline block warnings for paying a teacher',
    description:
      'Surveys inside the deadline block window (from the day before endDate, Vietnam time, including after the deadline) that this teacher still has running classes not reported for. Informational only: payment endpoints are not blocked by it.',
  })
  @ApiParam({ name: 'id', description: 'Staff id' })
  @ApiResponse({
    status: 200,
    description:
      'List of { surveyId, surveyName, endDate (YYYY-MM-DD), classNames }. Empty when nothing is pending.',
  })
  async getStaffSurveyDeadlineBlockWarnings(
    @Param('id', new ParseStaffIdPipe()) id: string,
  ): Promise<StaffSurveyDeadlineBlockWarningItemDto[]> {
    return this.staffService.getSurveyDeadlineBlockWarnings(id);
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
      'Month/year for UI context; payable set includes all pending/unpaid items regardless of month. Set confirmOverdueSurveyReports=true to proceed despite an overdue survey warning.',
  })
  @ApiResponse({
    status: 200,
    description: 'All listed staff payments processed.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation error, or overdue survey warning (code SURVEY_OVERDUE_WARNING) requiring confirmation via confirmOverdueSurveyReports.',
  })
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
      'Selected preview items identified by sourceType and entity id. Set confirmOverdueSurveyReports=true to proceed despite an overdue survey warning.',
  })
  @ApiResponse({
    status: 200,
    description: 'Selected staff payments processed.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation error, or overdue survey warning (code SURVEY_OVERDUE_WARNING) requiring confirmation via confirmOverdueSurveyReports.',
  })
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
    description:
      'Selected deposit session ids. Set confirmOverdueSurveyReports=true to proceed despite an overdue survey warning.',
  })
  @ApiResponse({
    status: 200,
    description: 'Selected deposit sessions processed.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation error, or overdue survey warning (code SURVEY_OVERDUE_WARNING) requiring confirmation via confirmOverdueSurveyReports.',
  })
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
      'Updates operating deduction on session allowance for a staff-class assignment. Follow-up grill 13/11: Admin, Trưởng ban Đào tạo hoặc Quản lý lớp của lớp sửa; Kế toán chi chỉ xem (403) trừ khi kiêm một role trên (hợp quyền). Không sửa % của chính mình (#265).',
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
  @ApiResponse({
    status: 403,
    description:
      'Kế toán chi không kiêm Trưởng ban Đào tạo / Quản lý lớp của lớp, hoặc sửa % của chính mình.',
  })
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
      'Generates a new Google Meet link for the specified staff member and saves it to staff_info.google_meet_link. #278: chỉ Admin, chính nhân sự, hoặc Trưởng ban Đào tạo đang hoạt động trên cấp dưới (nhân sự mang role Gia sư / Ban Chuyên môn / Đào tạo, không phải Admin hay role trưởng). Returns the new Meet link.',
  })
  @ApiParam({ name: 'id', description: 'Staff id' })
  @ApiResponse({
    status: 200,
    description: 'New Google Meet link generated and saved.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Admin, chính nhân sự hay Trưởng ban Đào tạo với cấp dưới.',
  })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async regenerateMeetLink(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) id: string,
  ) {
    await this.staffService.assertCanRegenerateMeetLink(id, {
      userId: user.id,
      roleType: user.roleType,
    });
    return this.staffService.regenerateMeetLink(id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get staff by id',
    description:
      'Get a single staff record by id. #270: response carries `sensitiveView` { personal, bank, income }; fields the viewer may not see are absent — personal info (cccd*, ethnicity, gender, currentAddress, birthDate, user.email, user.phone) only Admin/self; bankAccount + bankQrLink also accountant_expense; income (classAllowance, monthlyStats) Admin/accountant_expense/self.',
  })
  @ApiParam({ name: 'id', description: 'Staff id' })
  @ApiResponse({ status: 200, description: 'Staff found.' })
  @ApiResponse({ status: 403, description: 'Not allowed.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async getStaffById(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) id: string,
  ) {
    return this.staffService.getStaffById(id, {
      userId: user.id,
      roleType: user.roleType,
    });
  }

  @Post()
  @ApiOperation({
    summary: 'Create staff',
    description: 'Create a new staff record.',
  })
  @ApiBody({ type: CreateStaffDto, description: 'Staff create payload' })
  @ApiResponse({ status: 201, description: 'Staff created.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
  async createStaff(
    @CurrentUser() user: JwtPayload,
    @Body() data: CreateStaffDto,
  ) {
    const normalizedBankQrLink = normalizeHttpHttpsUrl(
      data.bank_qr_link,
      'Link QR ngân hàng',
    );

    return this.staffService.createStaff(
      {
        ...data,
        bank_qr_link: normalizedBankQrLink ?? undefined,
      },
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Patch()
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
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
  async updateStaff(
    @CurrentUser() user: JwtPayload,
    @Body() data: UpdateStaffDto,
  ) {
    const normalizedBankQrLink = normalizeHttpHttpsUrl(
      data.bank_qr_link,
      'Link QR ngân hàng',
    );

    return this.staffService.updateStaff(
      {
        ...data,
        bank_qr_link: normalizedBankQrLink ?? undefined,
      },
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Patch(':id/with-fixed-salary-overrides')
  @ApiOperation({
    summary: 'Update staff roles and fixed-salary overrides together',
    description:
      'Write staff profile fields, the authoritative role list, and per-role lương cứng / % vận hành overrides in one transaction. Roles are stored first, then overrides, so a newly added role can receive an override in the same request. Teacher is not a fixed-salary role (session allowance only) — teacher overrides are rejected and leftover teacher config rows are cleared. An error rolls back every change. Null on an axis clears that override only; 0 is stored as an intentional exclusion. Roles removed from the payload have both override rows deleted and action-history records the deletion with that role; staff_fixed_salary_payables (closed months) are not touched. Per-axis PUT /fixed-salary-settings/staff-overrides/* endpoints are unchanged.',
  })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @ApiBody({
    type: UpdateStaffWithFixedSalaryOverridesDto,
    description:
      'Staff update payload plus roleFixedSalaryOverrides. Path id is the staff id.',
  })
  @ApiResponse({
    status: 200,
    description: 'Staff updated with roles and overrides applied together.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation error, override for a role not in the payload roles list, or duplicate roleType.',
  })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
  async updateStaffWithFixedSalaryOverrides(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) id: string,
    @Body() data: UpdateStaffWithFixedSalaryOverridesDto,
  ) {
    const normalizedBankQrLink = normalizeHttpHttpsUrl(
      data.bank_qr_link,
      'Link QR ngân hàng',
    );

    return this.staffService.updateStaffWithFixedSalaryOverrides(
      id,
      {
        ...data,
        bank_qr_link: normalizedBankQrLink ?? undefined,
      },
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Patch(':id/training-roles')
  @Roles(UserRole.staff)
  @ApiOperation({
    summary:
      'Trưởng ban Đào tạo bật/tắt role gia sư / Ban Chuyên môn / Đào Tạo',
    description:
      'Chỉ staff active có role training_head. Body là trạng thái đích của 3 role teacher / lesson_plan / training; role khác của nhân sự giữ nguyên. 403 nếu body có role ngoài 3 role này, nếu target là Admin / mang role trưởng (admin, sale_customer_care_head, training_head, lesson_plan_head — #278), target là chính mình, hoặc target ngoài 3 nhóm (không mang teacher / lesson_plan / training) mà body không bật role nào (chỉ được bật role cho ứng viên). Role bị tắt: mức đè lương cứng / % vận hành của role đó bị xoá và ghi action_history; khoản đã chốt/đã trả không đổi; không cascade lớp dạy, quản lý lớp, đội chuyên môn. Response chỉ có id + roles, roles chỉ gồm teacher / lesson_plan / training (#278: không lộ role khác).',
  })
  @ApiParam({ name: 'id', description: 'Staff id của nhân sự được chỉnh' })
  @ApiBody({ type: UpdateStaffTrainingRolesDto })
  @ApiResponse({ status: 200, description: 'Roles sau khi lưu.' })
  @ApiResponse({ status: 400, description: 'Bỏ hết role của nhân sự.' })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Trưởng ban, role ngoài phạm vi, target được bảo vệ, tự chỉnh, hoặc target ngoài 3 nhóm mà không bật role nào.',
  })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async updateStaffTrainingRoles(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) id: string,
    @Body() data: UpdateStaffTrainingRolesDto,
  ): Promise<StaffTrainingRolesResultDto> {
    return this.staffService.updateStaffTrainingRoles(id, data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id/status')
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
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
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

  @Delete(':id/avatar')
  @ApiOperation({
    summary: 'Delete staff avatar',
    description:
      'Full admin only. Removes clean + watermarked avatar of the user linked to this staff record.',
  })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @ApiResponse({ status: 200, description: 'Staff detail without avatar.' })
  @ApiResponse({ status: 400, description: 'Staff has no linked user.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin only.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  // #270: trả hồ sơ đầy đủ → chỉ Admin (không kế thừa staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
  async deleteStaffAvatar(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) id: string,
  ) {
    return this.staffService.deleteStaffAvatar(id, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete staff',
    description: 'Delete a staff record by id.',
  })
  @ApiParam({ name: 'id', description: 'Staff id' })
  @ApiResponse({ status: 200, description: 'Staff deleted.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
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
