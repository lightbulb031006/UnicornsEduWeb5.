import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StaffRole, UserRole } from 'generated/enums';
import { AllowAssistantOnAdminRoutes } from 'src/auth/decorators/allow-assistant-on-admin.decorator';
import { AllowStaffRolesOnAdminRoutes } from 'src/auth/decorators/allow-staff-roles-on-admin.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import {
  type AdminDashboardActionAlertListDto,
  type AdminDashboardFinancialDetailDto,
  type AdminDashboardTopupHistoryItemDto,
  type AdminDashboardStudentBalanceItemDto,
  type AdminDashboardDto,
  GetAdminDashboardQueryDto,
  GetAdminDashboardActionAlertsQueryDto,
  GetAdminDashboardFinancialDetailQueryDto,
  GetAdminStudentBalanceDetailsQueryDto,
  GetAdminTopupHistoryQueryDto,
} from '../dtos/dashboard.dto';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@ApiTags('dashboard')
@ApiCookieAuth('access_token')
@AllowAssistantOnAdminRoutes(false)
@AllowStaffRolesOnAdminRoutes(StaffRole.accountant_income)
@Roles(UserRole.admin)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Get admin dashboard aggregate',
    description:
      'Return authoritative admin dashboard data aggregated directly from database records. Supports month mode (month+year) and date-range mode (dateFrom+dateTo).',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: String,
    description: 'Month in 01-12 format. Defaults to current month.',
    example: '03',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: String,
    description: 'Year in YYYY format. Defaults to current year.',
    example: '2026',
  })
  @ApiQuery({
    name: 'alertLimit',
    required: false,
    type: Number,
    description: 'Maximum number of rows returned for each alert group.',
    example: 6,
  })
  @ApiQuery({
    name: 'topClassLimit',
    required: false,
    type: Number,
    description: 'Maximum number of classes returned in the top classes table.',
    example: 5,
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    type: String,
    description:
      'Date range start in YYYY-MM-DD format. When provided together with dateTo, overrides month/year for financial calculations.',
    example: '2026-04-01',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description:
      'Date range end (inclusive) in YYYY-MM-DD format. Must be used together with dateFrom.',
    example: '2026-04-30',
  })
  @ApiResponse({
    status: 200,
    description: 'Admin dashboard aggregate.',
  })
  async getAdminDashboard(
    @Query() query: GetAdminDashboardQueryDto,
  ): Promise<AdminDashboardDto> {
    return this.dashboardService.getAdminDashboard(query);
  }

  @Get('action-alerts')
  @ApiOperation({
    summary: 'Get paginated admin dashboard action alerts',
    description:
      'Return paginated action alerts for a specific dashboard alert group in the selected month.',
  })
  @ApiQuery({
    name: 'group',
    required: true,
    type: String,
    description: 'Alert group key: expiring, debt, payroll, or class.',
    example: 'expiring',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: String,
    description: 'Month in 01-12 format. Defaults to current month.',
    example: '03',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: String,
    description: 'Year in YYYY format. Defaults to current year.',
    example: '2026',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-based).',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Rows per page.',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated action alert rows.',
  })
  async getAdminActionAlerts(
    @Query() query: GetAdminDashboardActionAlertsQueryDto,
  ): Promise<AdminDashboardActionAlertListDto> {
    return this.dashboardService.getAdminActionAlerts(query);
  }

  @Get('topup-history')
  @ApiOperation({
    summary: 'Get topup history in selected month',
    description:
      'Return wallet topup rows and cumulative totals for the selected period.',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: String,
    description: 'Month in 01-12 format. Defaults to current month.',
    example: '03',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: String,
    description: 'Year in YYYY format. Defaults to current year.',
    example: '2026',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of rows returned.',
    example: 120,
  })
  @ApiResponse({
    status: 200,
    description: 'Topup history rows in selected period.',
  })
  async getAdminTopupHistory(
    @Query() query: GetAdminTopupHistoryQueryDto,
  ): Promise<AdminDashboardTopupHistoryItemDto[]> {
    return this.dashboardService.getAdminTopupHistory(query);
  }

  @Get('student-balance-details')
  @ApiOperation({
    summary: 'Get student balance detail rows',
    description:
      'Return active students and class labels with current account balance for dashboard detail popup.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of rows returned.',
    example: 200,
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: String,
    description:
      'Month in 01-12 format. Defaults to current month; limits rows to students with session activity in that calendar month.',
    example: '03',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: String,
    description: 'Year in YYYY format. Defaults to current year.',
    example: '2026',
  })
  @ApiResponse({
    status: 200,
    description: 'Student balance detail rows.',
  })
  async getAdminStudentBalanceDetails(
    @Query() query: GetAdminStudentBalanceDetailsQueryDto,
  ): Promise<AdminDashboardStudentBalanceItemDto[]> {
    return this.dashboardService.getAdminStudentBalanceDetails(query);
  }

  @Get('financial-detail')
  @ApiOperation({
    summary: 'Get financial summary detail popup payload',
    description:
      'Return authoritative detail rows and contributing sources for a financial summary row on the admin dashboard. Supports month mode (month+year) and date-range mode (dateFrom+dateTo).',
  })
  @ApiQuery({
    name: 'rowKey',
    required: true,
    type: String,
    description: 'Financial summary row key to inspect in detail.',
    example: 'personnel-cost',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: String,
    description: 'Month in 01-12 format. Defaults to current month.',
    example: '03',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: String,
    description: 'Year in YYYY format. Defaults to current year.',
    example: '2026',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of detail rows returned.',
    example: 500,
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    type: String,
    description:
      'Date range start in YYYY-MM-DD format. When provided together with dateTo, activates date-range mode for this popup.',
    example: '2026-04-01',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description:
      'Date range end (inclusive) in YYYY-MM-DD format. Must be used together with dateFrom.',
    example: '2026-04-30',
  })
  @ApiResponse({
    status: 200,
    description: 'Financial detail payload for popup rendering.',
  })
  async getAdminFinancialDetail(
    @Query() query: GetAdminDashboardFinancialDetailQueryDto,
  ): Promise<AdminDashboardFinancialDetailDto> {
    return this.dashboardService.getAdminFinancialDetail(query);
  }
}
