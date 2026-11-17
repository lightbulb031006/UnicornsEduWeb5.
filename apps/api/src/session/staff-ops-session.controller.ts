import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ParseClassIdPipe } from 'src/common/pipes/parse-entity-id.pipe';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from 'generated/enums';
import {
  CurrentUser,
  type JwtPayload,
} from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import {
  CreateMissedTeachingExplanationDto,
  CreateStaffOpsSessionDto,
  MissedTeachingAlertDto,
  MissedTeachingExplanationResponseDto,
  TrainingHeadSessionUpdateDto,
  UpdateMissedTeachingExplanationDto,
  UpdateStaffOpsSessionDto,
} from 'src/dtos/session.dto';
import { SessionService } from './session.service';
import {
  pickAttendanceReviewInput,
  pickSessionReviewInput,
} from './session-validation.service';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';

@Controller('staff-ops')
@ApiTags('staff-ops-sessions')
@ApiCookieAuth('access_token')
@Roles(UserRole.staff, UserRole.admin)
export class StaffOpsSessionController {
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

  @Get('classes/:classId/sessions')
  @ApiOperation({
    summary: 'Get class sessions for staff operations',
  })
  @ApiParam({ name: 'classId', description: 'Class id' })
  @ApiQuery({ name: 'month', required: true, description: 'Tháng (01-12)' })
  @ApiQuery({ name: 'year', required: true, description: 'Năm (YYYY)' })
  @ApiResponse({
    status: 200,
    description: 'Class sessions in selected month.',
  })
  async getSessionsByClassId(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.sessionService.getSessionsByClassIdForStaff(
      user.id,
      user.roleType,
      classId,
      month,
      year,
    );
  }

  @Get('classes/:classId/sessions/next-ordinal')
  @ApiOperation({
    summary: 'Số thứ tự buổi nếu tạo buổi mới tại ngày/giờ cho trước',
  })
  @ApiParam({ name: 'classId', description: 'Class id' })
  @ApiQuery({ name: 'date', required: true, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'startTime', required: false, description: 'HH:mm' })
  @ApiResponse({ status: 200, description: '{ ordinal: number }' })
  @ApiResponse({ status: 400, description: 'date/startTime không hợp lệ.' })
  async getNextSessionOrdinal(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Query('date') date: string,
    @Query('startTime') startTime?: string,
  ) {
    return this.sessionService.getNextSessionOrdinalForStaff(
      user.id,
      user.roleType,
      classId,
      date,
      startTime,
    );
  }

  @Get('classes/:classId/missed-teaching-alerts')
  @ApiOperation({
    summary: 'Get missed teaching alerts for staff class operations',
  })
  @ApiParam({ name: 'classId', description: 'Class id' })
  @ApiQuery({
    name: 'days',
    required: false,
    description: 'Số ngày gần nhất cần rà. Mặc định 31 ngày.',
  })
  @ApiResponse({
    status: 200,
    description: 'Missed teaching alerts for the selected class.',
    type: MissedTeachingAlertDto,
    isArray: true,
  })
  async getMissedTeachingAlertsByClassId(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Query('days') days?: string,
  ): Promise<MissedTeachingAlertDto[]> {
    return this.sessionService.getMissedTeachingAlertsByClassForStaff(
      user.id,
      user.roleType,
      classId,
      this.parseOptionalPositiveDays(days),
    );
  }

  @Post('classes/:classId/missed-teaching-explanations')
  @ApiOperation({
    summary: 'Save missed teaching explanation for staff class operations',
  })
  @ApiParam({ name: 'classId', description: 'Class id' })
  @ApiBody({ type: CreateMissedTeachingExplanationDto })
  @ApiResponse({
    status: 201,
    description: 'Missed teaching explanation saved.',
    type: MissedTeachingExplanationResponseDto,
  })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Admin / Quản lý lớp / gia sư của lớp, hoặc gia sư giải trình buổi của gia sư khác (follow-up grill 13/11: cùng quyền xếp lịch bù #275).',
  })
  async createMissedTeachingExplanationByClassId(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Body() dto: CreateMissedTeachingExplanationDto,
  ): Promise<MissedTeachingExplanationResponseDto> {
    return this.sessionService.createMissedTeachingExplanationForStaff(
      user.id,
      user.roleType,
      classId,
      dto,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Patch('missed-teaching-explanations/:id')
  @ApiOperation({
    summary: 'Update missed teaching explanation for staff operations',
  })
  @ApiParam({ name: 'id', description: 'Missed teaching explanation id' })
  @ApiBody({ type: UpdateMissedTeachingExplanationDto })
  @ApiResponse({
    status: 200,
    description: 'Missed teaching explanation updated.',
    type: MissedTeachingExplanationResponseDto,
  })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Admin / Quản lý lớp / gia sư của lớp của giải trình, hoặc gia sư sửa giải trình của gia sư khác (follow-up grill 13/11).',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy giải trình vắng.' })
  async updateMissedTeachingExplanation(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMissedTeachingExplanationDto,
  ): Promise<MissedTeachingExplanationResponseDto> {
    return this.sessionService.updateMissedTeachingExplanationForStaff(
      user.id,
      user.roleType,
      id,
      dto,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Post('classes/:classId/sessions')
  @ApiOperation({
    summary: 'Create class session for staff operations',
    description:
      'Creates a session allowing date/time/notes/attendance and coefficient. No-attendance classes snapshot Class.noAttendance; the payload has no noAttendance override. startTime and endTime are required; endTime must be after startTime. #275: Admin, gia sư của lớp hoặc Quản lý lớp (hợp quyền). `teacherId` tuỳ chọn: Admin / Quản lý lớp chọn bất kỳ gia sư của lớp, gia sư chỉ chính mình. Hệ số khác 1 / Dạy thử chỉ Admin hoặc gia sư tự tạo buổi của mình. Allowance và tuition override không được nhận.',
  })
  @ApiParam({ name: 'classId', description: 'Class id' })
  @ApiBody({ type: CreateStaffOpsSessionDto })
  @ApiResponse({ status: 201, description: 'Session created.' })
  @ApiResponse({
    status: 400,
    description: 'Gia sư được chọn không dạy lớp này.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Admin / gia sư của lớp / Quản lý lớp; gia sư chọn gia sư khác; Quản lý lớp đặt hệ số hoặc dạy thử cho buổi của gia sư khác; hoặc lớp chưa nộp khảo sát trong cửa sổ khoá (từ ngày trước endDate, giờ Việt Nam).',
  })
  async createSession(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Body() dto: CreateStaffOpsSessionDto,
  ) {
    return this.sessionService.createSessionForStaff(
      user.id,
      user.roleType,
      classId,
      {
        teacherId: dto.teacherId,
        date: dto.date,
        startTime: dto.startTime,
        endTime: dto.endTime,
        notes: dto.notes,
        lessonContent: dto.lessonContent,
        homework: dto.homework,
        tutorial: dto.tutorial,
        ...pickSessionReviewInput(dto),
        coefficient: dto.coefficient,
        attendance: dto.attendance?.map((a) => ({
          studentId: a.studentId,
          status: a.status,
          notes: a.notes,
          ...pickAttendanceReviewInput(a),
        })),
      },
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Put('sessions/:id')
  @ApiOperation({
    summary: 'Update class session for staff operations',
    description:
      'Updates session date/time/notes/attendance and coefficient only. Sending startTime/endTime requires both and end after start. Paid/deposit sessions reject time changes. Teacher, allowance and tuition fields are not accepted. #275: gia sư chỉ sửa buổi do mình dạy; Admin và Quản lý lớp sửa mọi buổi của lớp (người kiêm gia sư + Quản lý lớp được hợp quyền). Đổi hệ số / Dạy thử chỉ Admin hoặc gia sư trên buổi của mình.',
  })
  @ApiParam({ name: 'id', description: 'Session id' })
  @ApiBody({ type: UpdateStaffOpsSessionDto })
  @ApiResponse({ status: 200, description: 'Session updated.' })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Admin / gia sư của lớp / Quản lý lớp (kể cả Kế toán thu/chi); gia sư sửa buổi của gia sư khác; Quản lý lớp đổi hệ số / Dạy thử của buổi gia sư khác.',
  })
  @ApiResponse({ status: 404, description: 'Session not found.' })
  async updateSession(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateStaffOpsSessionDto,
  ) {
    return this.sessionService.updateSessionForStaff(
      user.id,
      user.roleType,
      id,
      dto,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Patch('sessions/:id/training-head')
  @ApiOperation({
    summary:
      'Trưởng ban Đào tạo chỉnh tay trợ cấp / Dạy thử / Học thử của buổi',
    description:
      '14/11: Admin hoặc Trưởng ban Đào tạo (mọi lớp). Chỉnh tay `allowanceAmount` (trợ cấp gốc của buổi), tick Dạy thử (`coefficient` 0/1) và tick Học thử từng học sinh (chỉ đổi sang/ra khỏi `trial`, học sinh không gửi giữ nguyên). Không sửa được buổi do chính mình dạy (#265); buổi đã thanh toán / ghi cọc không đổi trợ cấp hay Dạy thử. Đổi Học thử mà không nhập trợ cấp → trợ cấp tự tính lại theo số học sinh tính phí. Response ẩn học phí / vận hành với Trưởng ban.',
  })
  @ApiParam({ name: 'id', description: 'Session id' })
  @ApiBody({ type: TrainingHeadSessionUpdateDto })
  @ApiResponse({ status: 200, description: 'Session updated.' })
  @ApiResponse({
    status: 400,
    description:
      'Không có thay đổi; buổi đã thanh toán / ghi cọc; học sinh không thuộc buổi; buổi không điểm danh.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Admin / Trưởng ban Đào tạo; sửa buổi do chính mình dạy; đổi trạng thái điểm danh không liên quan Học thử.',
  })
  @ApiResponse({ status: 404, description: 'Session not found.' })
  async updateSessionAsTrainingHead(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: TrainingHeadSessionUpdateDto,
  ) {
    return this.sessionService.updateSessionAsTrainingHead(
      user.id,
      user.roleType,
      id,
      dto,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }
}
