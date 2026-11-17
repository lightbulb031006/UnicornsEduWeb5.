import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from 'generated/enums';
import { AllowStaffRolesOnAdminRoutes } from 'src/auth/decorators/allow-staff-roles-on-admin.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import {
  type AdminDashboardActionAlertListDto,
  type AdminDashboardFinancialDetailDto,
  type AdminDashboardFinancialExportDto,
  type AdminDashboardMonthlyStatisticsDto,
  type AdminMonthlyReportDto,
  type AdminDashboardTopupHistoryItemDto,
  type AdminDashboardActiveClassBreakdownDto,
  type AdminDashboardStudentBalanceItemDto,
  type AdminDashboardStudentChurnItemDto,
  type AdminDashboardStudentDemographicsDto,
  type AdminDashboardDto,
  GetAdminDashboardQueryDto,
  GetAdminDashboardActionAlertsQueryDto,
  GetAdminDashboardFinancialDetailQueryDto,
  GetAdminDashboardFinancialExportQueryDto,
  GetAdminMonthlyReportQueryDto,
  GetStudentDemographicsQueryDto,
  GetAdminMonthlyStatisticsQueryDto,
  GetAdminStudentBalanceDetailsQueryDto,
  GetAdminStudentChurnDetailsQueryDto,
  GetAdminTopupHistoryQueryDto,
} from '../dtos/dashboard.dto';

/** Slug hoá label kỳ báo cáo thành tên file ASCII an toàn cho HTTP header. */
function toSafeFilenameSlug(label: string): string {
  return (
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'export'
  );
}
import { DashboardService } from './dashboard.service';
import { FinancialExportExcelService } from './financial-export-excel.service';
import { FinancialExportPdfService } from './financial-export-pdf.service';
import { MonthlyReportService } from './monthly-report.service';
import { MonthlyStatisticsExportPdfService } from './monthly-statistics-export-pdf.service';
import { StudentDemographicsExportPdfService } from './student-demographics-export-pdf.service';

@Controller('dashboard')
@ApiTags('dashboard')
@ApiCookieAuth('access_token')
// #269: Dashboard, Báo cáo tháng, Thống kê học sinh chỉ Admin (users.role_type
// admin hoặc staff role admin). Mọi staff role khác — kể cả Trưởng phòng Sale &
// CSKH (Trợ lí cũ) và Kế toán thu — bị 403. Route admin từ chối mặc định (#267);
// danh sách staff role rỗng tường minh để ghi rõ ý định.
@AllowStaffRolesOnAdminRoutes()
@Roles(UserRole.admin)
@ApiResponse({
  status: 403,
  description:
    'Chỉ Admin được xem dashboard, báo cáo tháng và thống kê học sinh (#269).',
})
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly financialExportPdfService: FinancialExportPdfService,
    private readonly financialExportExcelService: FinancialExportExcelService,
    private readonly monthlyStatisticsExportPdfService: MonthlyStatisticsExportPdfService,
    private readonly studentDemographicsExportPdfService: StudentDemographicsExportPdfService,
    private readonly monthlyReportService: MonthlyReportService,
  ) {}

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

  @Get('student-churn-details')
  @ApiOperation({
    summary: 'Get new/dropped student detail rows for a period',
    description:
      'Return the list of students who newly enrolled or dropped out in the selected period, for the "Biến động học sinh" KPI drill-down. Supports month mode (month+year) and date-range mode (dateFrom+dateTo).',
  })
  @ApiQuery({
    name: 'type',
    required: true,
    type: String,
    description:
      'Churn type: new, dropped (Học sinh cũ nghỉ), trial_dropped (Học sinh thử nghỉ), or active (snapshot, ignores month/dateFrom/dateTo).',
    example: 'new',
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
    name: 'dateFrom',
    required: false,
    type: String,
    description: 'Date range start in YYYY-MM-DD format.',
    example: '2026-04-01',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description: 'Date range end (inclusive) in YYYY-MM-DD format.',
    example: '2026-04-30',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of student rows returned.',
    example: 200,
  })
  @ApiResponse({
    status: 200,
    description: 'New/dropped student detail rows.',
  })
  async getAdminStudentChurnDetails(
    @Query() query: GetAdminStudentChurnDetailsQueryDto,
  ): Promise<AdminDashboardStudentChurnItemDto[]> {
    return this.dashboardService.getAdminStudentChurnDetails(query);
  }

  @Get('active-class-breakdown')
  @ApiOperation({
    summary: 'Get running classes grouped by course',
    description:
      'Snapshot of classes with status running, grouped by course (khoá học). Each row has the running class count and the distinct active-student count for that course. The top-level studentCount is distinct across courses and matches summary.activeStudents. Not filtered by the dashboard month.',
  })
  @ApiResponse({
    status: 200,
    description: 'Running class breakdown by course.',
  })
  async getAdminActiveClassBreakdown(): Promise<AdminDashboardActiveClassBreakdownDto> {
    return this.dashboardService.getAdminActiveClassBreakdown();
  }

  @Get('monthly-statistics')
  @ApiOperation({
    summary: 'Get per-month statistics for an arbitrary month range',
    description:
      'Return per-month student/class/teacher/revenue/expense/profit statistics for the "Thống kê theo tháng" admin chart page. Range is inclusive and capped at 36 months.',
  })
  @ApiQuery({
    name: 'fromMonth',
    required: true,
    type: String,
    description: 'Start month in 01-12 format.',
    example: '09',
  })
  @ApiQuery({
    name: 'fromYear',
    required: true,
    type: String,
    description: 'Start year in YYYY format.',
    example: '2025',
  })
  @ApiQuery({
    name: 'toMonth',
    required: true,
    type: String,
    description: 'End month in 01-12 format (inclusive).',
    example: '08',
  })
  @ApiQuery({
    name: 'toYear',
    required: true,
    type: String,
    description: 'End year in YYYY format (inclusive).',
    example: '2026',
  })
  @ApiResponse({
    status: 200,
    description: 'Per-month statistics for the requested range.',
  })
  async getAdminMonthlyStatistics(
    @Query() query: GetAdminMonthlyStatisticsQueryDto,
  ): Promise<AdminDashboardMonthlyStatisticsDto> {
    return this.dashboardService.getAdminMonthlyStatistics(query);
  }

  @Get('monthly-report')
  @ApiOperation({
    summary: 'Get the monthly operations report (Báo cáo tháng)',
    description:
      'Return KPI, new-student matrix (customer source × course of first class, with early drops and total top-up from first top-up to month end), dropped students by drop-out reason group, per customer-care staff table and appendix lists for one month. New student = first qualifying wallet top-up in the month. Computed live, not snapshotted. Admin only (#269).',
  })
  @ApiQuery({
    name: 'month',
    required: true,
    type: String,
    description: 'Report month in 01-12 format.',
    example: '09',
  })
  @ApiQuery({
    name: 'year',
    required: true,
    type: String,
    description: 'Report year in YYYY format.',
    example: '2026',
  })
  @ApiResponse({ status: 200, description: 'Monthly report payload.' })
  @ApiResponse({ status: 403, description: 'Not admin (#269).' })
  async getAdminMonthlyReport(
    @Query() query: GetAdminMonthlyReportQueryDto,
  ): Promise<AdminMonthlyReportDto> {
    return this.monthlyReportService.getAdminMonthlyReport(query);
  }

  @Get('monthly-statistics/pdf')
  @ApiOperation({
    summary: 'Download monthly statistics report as PDF',
    description:
      'Same data as GET /dashboard/monthly-statistics, rendered server-side to a landscape A4 PDF with charts and tables for direct download.',
  })
  @ApiQuery({
    name: 'fromMonth',
    required: true,
    type: String,
    description: 'Start month in 01-12 format.',
    example: '01',
  })
  @ApiQuery({
    name: 'fromYear',
    required: true,
    type: String,
    description: 'Start year in YYYY format.',
    example: '2026',
  })
  @ApiQuery({
    name: 'toMonth',
    required: true,
    type: String,
    description: 'End month in 01-12 format (inclusive).',
    example: '07',
  })
  @ApiQuery({
    name: 'toYear',
    required: true,
    type: String,
    description: 'End year in YYYY format (inclusive).',
    example: '2026',
  })
  @ApiResponse({
    status: 200,
    description: 'PDF file (application/pdf).',
  })
  async getAdminMonthlyStatisticsPdf(
    @Query() query: GetAdminMonthlyStatisticsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const payload =
      await this.dashboardService.getAdminMonthlyStatistics(query);
    const pdfBuffer =
      await this.monthlyStatisticsExportPdfService.toPdfBuffer(payload);

    const filename = `thong-ke-thang-${toSafeFilenameSlug(
      `${payload.fromMonthKey}-${payload.toMonthKey}`,
    )}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
    });

    return new StreamableFile(pdfBuffer);
  }

  @Get('student-demographics')
  @ApiOperation({
    summary: 'Get student demographics aggregate',
    description:
      'Thống kê học sinh theo tỉnh, năm sinh, khoá học, doanh thu, lợi nhuận và tổng nạp. Lọc trạng thái (all / active / inactive) và kỳ: `month`+`year` = theo tháng, chỉ `year` = theo năm, bỏ trống = toàn thời gian. Có kỳ thì chỉ tính học sinh có buổi học (present/excused) trong kỳ; doanh thu, chi phí, tổng nạp chỉ tính phát sinh trong kỳ.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['all', 'active', 'inactive'],
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: String,
    example: '09',
    description: 'Tháng 01-12, cần kèm year.',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: String,
    example: '2026',
    description: 'Năm YYYY.',
  })
  @ApiResponse({
    status: 200,
    description: 'Student demographic statistics.',
  })
  @ApiResponse({ status: 400, description: 'month/year sai định dạng.' })
  async getStudentDemographics(
    @Query() query: GetStudentDemographicsQueryDto,
  ): Promise<AdminDashboardStudentDemographicsDto> {
    return this.dashboardService.getStudentDemographics(query);
  }

  @Get('student-demographics/pdf')
  @ApiOperation({
    summary: 'Download student demographics report as PDF',
    description:
      'Landscape A4 PDF report with charts and matrices of students by province, birth year, class category, revenue/profit and wallet topup. Same filters as GET /dashboard/student-demographics.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['all', 'active', 'inactive'],
  })
  @ApiQuery({ name: 'month', required: false, type: String, example: '09' })
  @ApiQuery({ name: 'year', required: false, type: String, example: '2026' })
  @ApiResponse({
    status: 200,
    description: 'PDF file (application/pdf).',
  })
  async getStudentDemographicsPdf(
    @Res({ passthrough: true }) res: Response,
    @Query() query: GetStudentDemographicsQueryDto,
  ): Promise<StreamableFile> {
    const payload = await this.dashboardService.getStudentDemographics(query);
    const pdfBuffer =
      await this.studentDemographicsExportPdfService.toPdfBuffer(payload);

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const status = query.status ?? 'all';
    const suffix =
      status === 'active'
        ? 'dang-hoc'
        : status === 'inactive'
          ? 'da-nghi'
          : 'toan-bo';
    const periodSuffix = payload.period.key ? `-${payload.period.key}` : '';
    const filename = `thong-ke-hoc-sinh-${suffix}${periodSuffix}-${dateStr}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
    });

    return new StreamableFile(pdfBuffer);
  }

  @Get('financial-detail')
  @ApiOperation({
    summary: 'Get financial summary detail popup payload',
    description:
      'Return authoritative detail rows and contributing sources for a financial summary row on the admin dashboard. Supports month mode (month+year) and date-range mode (dateFrom+dateTo). Revenue detail rows are per student.',
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
  @ApiQuery({
    name: 'customerSource',
    required: false,
    type: String,
    description:
      'Nguồn khách khi rowKey=customer-source. Giá trị unassigned là nhóm Chưa gán.',
    example: 'tiktok',
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

  @Get('financial-export')
  @ApiOperation({
    summary: 'Get detailed financial export payload for PDF/print',
    description:
      'Return period summary totals plus detail rows for revenue (per student), personnel cost (per staff), and other operating costs. Supports month mode and date-range mode. Default row limit is 5000.',
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
    description: 'Maximum detail rows per section. Defaults to 5000.',
    example: 5000,
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    type: String,
    description:
      'Date range start in YYYY-MM-DD format. When provided together with dateTo, activates date-range mode.',
    example: '2026-01-01',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description:
      'Date range end (inclusive) in YYYY-MM-DD format. Must be used together with dateFrom.',
    example: '2026-08-03',
  })
  @ApiResponse({
    status: 200,
    description: 'Financial export payload for printable PDF report.',
  })
  async getAdminFinancialExport(
    @Query() query: GetAdminDashboardFinancialExportQueryDto,
  ): Promise<AdminDashboardFinancialExportDto> {
    return this.dashboardService.getAdminFinancialExport(query);
  }

  @Get('financial-export/pdf')
  @ApiOperation({
    summary: 'Download financial export report as PDF',
    description:
      'Same data as GET /dashboard/financial-export, rendered server-side to a PDF file for direct download (no browser print dialog).',
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
    name: 'dateFrom',
    required: false,
    type: String,
    description:
      'Date range start in YYYY-MM-DD format. When provided together with dateTo, activates date-range mode.',
    example: '2026-01-01',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description:
      'Date range end (inclusive) in YYYY-MM-DD format. Must be used together with dateFrom.',
    example: '2026-08-03',
  })
  @ApiResponse({
    status: 200,
    description: 'PDF file (application/pdf).',
  })
  async getAdminFinancialExportPdf(
    @Query() query: GetAdminDashboardFinancialExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const payload = await this.dashboardService.getAdminFinancialExport(query);
    const pdfBuffer = await this.financialExportPdfService.toPdfBuffer(payload);

    const filename = `bao-cao-tai-chinh-${toSafeFilenameSlug(payload.period.monthLabel)}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
    });

    return new StreamableFile(pdfBuffer);
  }

  @Get('financial-export/excel')
  @ApiOperation({
    summary: 'Download financial export report as Excel',
    description:
      'Same data as GET /dashboard/financial-export, rendered to an .xlsx workbook: sheet 1 "Doanh thu" (revenue per student), sheet 2 "Chi phí" (personnel + other operating costs).',
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
    name: 'dateFrom',
    required: false,
    type: String,
    description:
      'Date range start in YYYY-MM-DD format. When provided together with dateTo, activates date-range mode.',
    example: '2026-01-01',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description:
      'Date range end (inclusive) in YYYY-MM-DD format. Must be used together with dateFrom.',
    example: '2026-08-03',
  })
  @ApiResponse({
    status: 200,
    description:
      'Excel file (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet).',
  })
  async getAdminFinancialExportExcel(
    @Query() query: GetAdminDashboardFinancialExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const payload = await this.dashboardService.getAdminFinancialExport(query);
    const excelBuffer =
      await this.financialExportExcelService.toExcelBuffer(payload);

    const filename = `bao-cao-tai-chinh-${toSafeFilenameSlug(payload.period.monthLabel)}.xlsx`;

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': excelBuffer.length,
    });

    return new StreamableFile(excelBuffer);
  }
}
