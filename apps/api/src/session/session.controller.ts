import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
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
import { StaffRole, UserRole } from 'generated/enums';
import { AllowStaffRolesOnAdminRoutes } from 'src/auth/decorators/allow-staff-roles-on-admin.decorator';
import {
  CurrentUser,
  type JwtPayload,
} from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import {
  CreateMissedTeachingExplanationDto,
  SessionBulkPaymentStatusUpdateDto,
  SessionBulkPaymentStatusUpdateResult,
  SessionCreateDto,
  MissedTeachingAlertDto,
  MissedTeachingExplanationResponseDto,
  SessionUnpaidSummaryItem,
  SessionUpdateDto,
  UpdateMissedTeachingExplanationDto,
} from 'src/dtos/session.dto';
import {
  ParseClassIdPipe,
  ParseStaffIdPipe,
} from 'src/common/pipes/parse-entity-id.pipe';
import { SessionService } from './session.service';
import type { RequestWithResolvedAuthContext } from 'src/auth/auth-request-context';
import {
  redactSessionsForAccountantView,
  resolveAccountantFinanceView,
} from 'src/common/accountant-finance-redaction.util';

@Controller('sessions')
@ApiTags('sessions')
@ApiCookieAuth('access_token')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  private parseOptionalPositiveDays(days?: string) {
    if (days == null || days === '') {
      return undefined;
    }

    const parsedDays = Number(days);
    if (!Number.isInteger(parsedDays) || parsedDays < 1) {
      throw new BadRequestException('days must be a positive integer.');
    }

    return parsedDays;
  }

  @Post()
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
  @ApiOperation({ summary: 'Tạo session' })
  @ApiBody({ type: SessionCreateDto, description: 'Session create payload' })
  @ApiResponse({ status: 201, description: 'Session đã được tạo.' })
  @ApiResponse({ status: 400, description: 'Lỗi khi tạo session.' })
  async createSession(
    @CurrentUser() user: JwtPayload,
    @Body() data: SessionCreateDto,
  ) {
    return this.sessionService.createSession(data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Put(':id')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.accountant_income,
    StaffRole.accountant_expense,
  )
  @ApiOperation({ summary: 'Cập nhật session' })
  @ApiParam({ name: 'id', description: 'ID session' })
  @ApiBody({ type: SessionUpdateDto, description: 'Session update payload' })
  @ApiResponse({ status: 200, description: 'Session đã được cập nhật.' })
  @ApiResponse({ status: 400, description: 'Lỗi khi cập nhật session.' })
  @ApiResponse({ status: 404, description: 'Session không tồn tại.' })
  async updateSession(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() data: SessionUpdateDto,
  ) {
    return this.sessionService.updateSession(
      { ...data, id },
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Patch('payment-status/bulk')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.accountant_income,
    StaffRole.accountant_expense,
  )
  @ApiOperation({
    summary: 'Cập nhật trạng thái thanh toán cho nhiều session',
    description:
      'Khi chuyển buổi dạy của gia sư sang paid, backend ghi snapshot % khấu trừ vận hành và % thuế vào sessions theo mức hiện hành tại thời điểm thanh toán; riêng session deposit snapshot 0/0. Khi đổi paid về unpaid/deposit, backend reset hai snapshot này về 0.',
  })
  @ApiBody({
    type: SessionBulkPaymentStatusUpdateDto,
    description: 'Bulk update payment status payload',
  })
  @ApiResponse({
    status: 200,
    description: 'Đã cập nhật trạng thái thanh toán cho các session được chọn.',
    type: Object,
  })
  @ApiResponse({
    status: 400,
    description: 'Payload không hợp lệ hoặc thiếu sessionIds.',
  })
  @ApiResponse({
    status: 404,
    description: 'Ít nhất một session không tồn tại.',
  })
  async updateSessionPaymentStatuses(
    @CurrentUser() user: JwtPayload,
    @Body() data: SessionBulkPaymentStatusUpdateDto,
  ): Promise<SessionBulkPaymentStatusUpdateResult> {
    return this.sessionService.updateSessionPaymentStatuses(
      data.sessionIds,
      data.teacherPaymentStatus,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Xóa session' })
  @ApiParam({ name: 'id', description: 'ID session' })
  @ApiResponse({ status: 200, description: 'Session đã được xóa.' })
  @ApiResponse({ status: 404, description: 'Session không tồn tại.' })
  async deleteSession(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.sessionService.deleteSession(id, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get('/staff/:staffId/unpaid')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.accountant_expense,
  )
  @ApiOperation({
    summary:
      'Lấy tổng phụ cấp session chưa nhận theo staff trong N ngày gần nhất',
  })
  @ApiParam({
    name: 'staffId',
    description: 'ID staff',
    example: 'UNISTAFF-c3d4e5f6a7',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    description: 'Số ngày gần nhất cần tổng hợp. Mặc định 14 ngày.',
    example: 14,
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách tổng phụ cấp chưa nhận theo lớp.',
    type: Object,
    isArray: true,
  })
  @ApiResponse({
    status: 400,
    description: 'days phải là số nguyên dương nếu được truyền vào.',
  })
  async getUnpaidSessionsByTeacherId(
    @Param('staffId', new ParseStaffIdPipe()) teacherId: string,
    @Query('days') days?: string,
  ): Promise<SessionUnpaidSummaryItem[]> {
    if (days == null) {
      return this.sessionService.getUnpaidSessionsByTeacherId(teacherId);
    }

    const parsedDays = Number(days);
    if (!Number.isInteger(parsedDays) || parsedDays < 1) {
      throw new BadRequestException('days must be a positive integer.');
    }

    return this.sessionService.getUnpaidSessionsByTeacherId(
      teacherId,
      parsedDays,
    );
  }

  @Get('/staff/:staffId/missed-teaching-alerts')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.accountant_expense,
  )
  @ApiOperation({
    summary: 'Lấy cảnh báo chưa dạy theo nhân sự',
  })
  @ApiParam({
    name: 'staffId',
    description: 'ID staff',
    example: 'UNISTAFF-c3d4e5f6a7',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    description: 'Số ngày gần nhất cần rà. Mặc định 31 ngày.',
    example: 31,
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách cảnh báo chưa dạy của staff.',
    type: MissedTeachingAlertDto,
    isArray: true,
  })
  async getMissedTeachingAlertsByTeacherId(
    @Param('staffId', new ParseStaffIdPipe()) teacherId: string,
    @Query('days') days?: string,
  ): Promise<MissedTeachingAlertDto[]> {
    return this.sessionService.getMissedTeachingAlertsByTeacher(
      teacherId,
      this.parseOptionalPositiveDays(days),
    );
  }

  @Get('/staff/:staffId')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.accountant_expense,
  )
  @ApiOperation({ summary: 'Lấy session theo staff + tháng/năm' })
  @ApiParam({
    name: 'staffId',
    description: 'ID staff',
    example: 'UNISTAFF-c3d4e5f6a7',
  })
  @ApiQuery({ name: 'month', required: true, description: 'Tháng (01-12)' })
  @ApiQuery({ name: 'year', required: true, description: 'Năm (YYYY)' })
  @ApiResponse({
    status: 200,
    description: 'Danh sách session của staff trong tháng.',
  })
  @ApiResponse({ status: 400, description: 'month/year không hợp lệ.' })
  async getSessionsByTeacherId(
    @Param('staffId', new ParseStaffIdPipe()) teacherId: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.sessionService.getSessionsByTeacherId(teacherId, month, year);
  }

  @Get('/class/:classId')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.accountant_income,
    StaffRole.accountant_expense,
  )
  @ApiOperation({ summary: 'Lấy session theo class + tháng/năm' })
  @ApiParam({
    name: 'classId',
    description: 'ID lớp học',
    example: 'UNICL-b2c3d4e5f6',
  })
  @ApiQuery({ name: 'month', required: true, description: 'Tháng (01-12)' })
  @ApiQuery({ name: 'year', required: true, description: 'Năm (YYYY)' })
  @ApiResponse({
    status: 200,
    description: 'Danh sách session của lớp trong tháng.',
  })
  @ApiResponse({ status: 400, description: 'month/year không hợp lệ.' })
  async getSessionsByClassId(
    @CurrentUser() user: JwtPayload,
    @Req() req: RequestWithResolvedAuthContext,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const sessions = await this.sessionService.getSessionsByClassId(
      classId,
      month,
      year,
    );
    return redactSessionsForAccountantView(
      sessions,
      resolveAccountantFinanceView(user.roleType, req.resolvedStaffRoles ?? []),
    );
  }

  @Get('/class/:classId/missed-teaching-alerts')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.accountant_expense,
  )
  @ApiOperation({
    summary: 'Lấy cảnh báo chưa dạy theo lớp',
  })
  @ApiParam({
    name: 'classId',
    description: 'ID lớp học',
    example: 'UNICL-b2c3d4e5f6',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    description: 'Số ngày gần nhất cần rà. Mặc định 31 ngày.',
    example: 31,
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách cảnh báo chưa dạy của lớp.',
    type: MissedTeachingAlertDto,
    isArray: true,
  })
  async getMissedTeachingAlertsByClassId(
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Query('days') days?: string,
  ): Promise<MissedTeachingAlertDto[]> {
    return this.sessionService.getMissedTeachingAlertsByClass(
      classId,
      this.parseOptionalPositiveDays(days),
    );
  }

  @Post('/class/:classId/missed-teaching-explanations')
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
  @ApiOperation({
    summary: 'Lưu giải trình vắng cho buổi học gốc',
  })
  @ApiParam({
    name: 'classId',
    description: 'ID lớp học',
    example: 'UNICL-b2c3d4e5f6',
  })
  @ApiBody({ type: CreateMissedTeachingExplanationDto })
  @ApiResponse({
    status: 201,
    description: 'Giải trình vắng đã được lưu.',
    type: MissedTeachingExplanationResponseDto,
  })
  async createMissedTeachingExplanationByClassId(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Body() dto: CreateMissedTeachingExplanationDto,
  ): Promise<MissedTeachingExplanationResponseDto> {
    return this.sessionService.createMissedTeachingExplanationForClass(
      classId,
      dto,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Patch('/missed-teaching-explanations/:id')
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
  @ApiOperation({
    summary: 'Cập nhật giải trình vắng',
  })
  @ApiParam({
    name: 'id',
    description: 'ID giải trình vắng',
  })
  @ApiBody({ type: UpdateMissedTeachingExplanationDto })
  @ApiResponse({
    status: 200,
    description: 'Giải trình vắng đã được cập nhật.',
    type: MissedTeachingExplanationResponseDto,
  })
  async updateMissedTeachingExplanation(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMissedTeachingExplanationDto,
  ): Promise<MissedTeachingExplanationResponseDto> {
    return this.sessionService.updateMissedTeachingExplanation(id, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }
}
