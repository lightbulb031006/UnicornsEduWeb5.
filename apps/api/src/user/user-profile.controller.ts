import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  FileInterceptor,
} from '@nestjs/platform-express';
import { BonusService } from 'src/bonus/bonus.service';
import { PaymentStatus } from 'generated/enums';
import { ExtraAllowanceService } from 'src/extra-allowance/extra-allowance.service';
import { LessonService } from 'src/lesson/lesson.service';
import {
  GetStaffDashboardQueryDto,
  type StaffDashboardDto,
} from 'src/dtos/dashboard.dto';
import {
  CreateStudentSePayTopUpOrderDto,
  StudentExamScheduleItemDto,
  StudentSePayStaticQrResponseDto,
  StudentSePayTopUpOrderResponseDto,
  StudentWalletHistoryQueryDto,
  UpdateStudentExamSchedulesDto,
  UpdateMyStudentAccountBalanceDto,
} from 'src/dtos/student.dto';
import {
  CurrentUser,
  type JwtPayload,
} from 'src/auth/decorators/current-user.decorator';
import { CreateMyBonusDto, UpdateMyBonusDto } from 'src/dtos/bonus.dto';
import {
  CreateMyStaffExtraAllowanceDto,
  UpdateMyStaffExtraAllowanceDto,
} from 'src/dtos/extra-allowance.dto';
import { PaginationQueryDto } from 'src/dtos/pagination.dto';
import {
  UpdateMyProfileDto,
  UpdateMyStaffProfileDto,
  UpdateMyStudentProfileDto,
} from 'src/dtos/profile.dto';
import { SessionService } from 'src/session/session.service';
import { StaffService } from 'src/staff/staff.service';
import { StudentService } from 'src/student/student.service';
import { DashboardService } from 'src/dashboard/dashboard.service';
import {
  buildImageUploadFileFilter,
  DEFAULT_MAX_IMAGE_BYTES,
} from 'src/storage/supabase-storage';
import { UserService } from './user.service';
import { VerifiedEmailGuard } from 'src/auth/guards/verified-email.guard';

@ApiTags('users')
@Controller('users/me')
@ApiCookieAuth('access_token')
@UseGuards(VerifiedEmailGuard)
export class UserProfileController {
  constructor(
    private readonly userService: UserService,
    private readonly staffService: StaffService,
    private readonly bonusService: BonusService,
    private readonly sessionService: SessionService,
    private readonly extraAllowanceService: ExtraAllowanceService,
    private readonly lessonService: LessonService,
    private readonly studentService: StudentService,
    private readonly dashboardService: DashboardService,
  ) {}

  @Get('full')
  @ApiOperation({
    summary: 'Get full profile',
    description:
      'Returns current user with staffInfo and studentInfo (if linked). Requires access_token cookie.',
  })
  @ApiResponse({
    status: 200,
    description: 'Full profile (user + staff + student).',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getFullProfile(@CurrentUser() user: JwtPayload) {
    return this.userService.getFullProfile(user.id);
  }

  @Get('staff-detail')
  @ApiOperation({
    summary: 'Get current staff detail',
    description:
      'Returns the linked staff detail of the current authenticated user. Fails if user has no linked staff record.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current staff detail.',
  })
  @ApiResponse({ status: 400, description: 'User has no staff record.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getMyStaffDetail(@CurrentUser() user: JwtPayload) {
    const staffId = await this.userService.getLinkedStaffId(user.id);
    return this.staffService.getStaffById(staffId);
  }

  @Get('staff-income-summary')
  @ApiOperation({
    summary: 'Get current staff income summary',
    description:
      'Returns backend-authoritative income summary for the current linked staff profile.',
  })
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
    description: 'Current staff income summary.',
  })
  @ApiResponse({
    status: 400,
    description: 'month/year invalid or no staff record.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getMyStaffIncomeSummary(
    @CurrentUser() user: JwtPayload,
    @Query('month') month: string,
    @Query('year') year: string,
    @Query('days') days?: string,
  ) {
    const staffId = await this.userService.getLinkedStaffId(user.id);
    const parsedDays =
      days == null || days.trim() === '' ? undefined : Number(days);

    return this.staffService.getIncomeSummary(staffId, {
      month,
      year,
      days: parsedDays,
    });
  }

  @Get('staff-dashboard')
  @ApiOperation({
    summary: 'Get current staff dashboard payload',
    description:
      'Returns role-aware dashboard data for the current linked staff profile. Each section is included only when the current staff has the required role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Role-aware dashboard data for current staff.',
  })
  @ApiResponse({
    status: 400,
    description: 'User has no linked staff record.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getMyStaffDashboard(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetStaffDashboardQueryDto,
  ): Promise<StaffDashboardDto> {
    const profile = await this.userService.getFullProfile(user.id);
    const staffInfo = profile.staffInfo;

    if (!staffInfo?.id) {
      throw new BadRequestException('User has no linked staff record');
    }

    return this.dashboardService.getStaffDashboard({
      staffId: staffInfo.id,
      staffRoles: staffInfo.roles ?? [],
      query,
    });
  }

  @Get('staff-bonuses')
  @ApiOperation({
    summary: 'List current staff bonuses',
    description:
      'Returns paginated bonus records for the current linked staff profile.',
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
    name: 'month',
    required: false,
    type: String,
    description: 'Filter by month key (YYYY-MM)',
    example: '2026-03',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Filter by payment status',
    example: 'pending',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated bonus list for current staff.',
  })
  @ApiResponse({ status: 400, description: 'User has no staff record.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getMyStaffBonuses(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQueryDto,
    @Query('month') month?: string,
    @Query('status') status?: string,
  ) {
    const staffId = await this.userService.getLinkedStaffId(user.id);

    return this.bonusService.getBonuses({
      ...query,
      staffId,
      month,
      status,
    });
  }

  @Post('staff-bonuses')
  @ApiOperation({
    summary: 'Create current staff bonus',
    description:
      'Creates a bonus record for the current linked staff profile. Self-service entries are always created with pending payment status.',
  })
  @ApiBody({ type: CreateMyBonusDto })
  @ApiResponse({
    status: 201,
    description: 'Bonus created for current staff with pending payment status.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or no staff record.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async createMyStaffBonus(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateMyBonusDto,
  ) {
    const staffId = await this.userService.getLinkedStaffId(user.id);

    return this.bonusService.createBonus(
      {
        ...body,
        staffId,
        status: PaymentStatus.pending,
      },
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Patch('staff-bonuses')
  @ApiOperation({
    summary: 'Update current staff bonus',
    description:
      'Updates a bonus record belonging to the current linked staff profile. Self-service can edit work type, month, amount and note, but cannot change payment status.',
  })
  @ApiBody({ type: UpdateMyBonusDto })
  @ApiResponse({
    status: 200,
    description: 'Bonus updated for current staff.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or no staff record.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 404,
    description: 'Bonus not found for current staff.',
  })
  async updateMyStaffBonus(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpdateMyBonusDto,
  ) {
    const staffId = await this.userService.getLinkedStaffId(user.id);
    const bonus = await this.bonusService.getBonusOwnershipById(body.id);

    if (bonus.staffId !== staffId) {
      throw new NotFoundException('Bonus not found');
    }

    return this.bonusService.updateBonus(
      {
        id: body.id,
        workType: body.workType,
        month: body.month,
        amount: body.amount,
        note: body.note,
      },
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Get('staff-sessions')
  @ApiOperation({
    summary: 'List current staff sessions by month/year',
    description:
      'Returns sessions for the current linked staff profile in a given month/year.',
  })
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
    description: 'Session list for current staff in the selected month.',
  })
  @ApiResponse({
    status: 400,
    description: 'month/year invalid or no staff record.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getMyStaffSessions(
    @CurrentUser() user: JwtPayload,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const staffId = await this.userService.getLinkedStaffId(user.id);
    return this.sessionService.getSessionsByTeacherId(staffId, month, year);
  }

  @Get('staff-extra-allowances')
  @ApiOperation({
    summary: 'List current staff extra allowances',
    description:
      'Returns paginated extra allowance records for the current linked staff profile.',
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
    name: 'year',
    required: false,
    type: String,
    description: 'Filter by year (e.g. 2026). Use with month.',
    example: '2026',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: String,
    description: 'Filter by month 1-12. Use with year.',
    example: '03',
  })
  @ApiQuery({
    name: 'roleType',
    required: false,
    type: String,
    description: 'Filter by staff role type.',
    example: 'assistant',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Filter by payment status.',
    example: 'pending',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated extra allowance list for current staff.',
  })
  @ApiResponse({ status: 400, description: 'User has no staff record.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getMyStaffExtraAllowances(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQueryDto,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('roleType') roleType?: string,
    @Query('status') status?: string,
  ) {
    const staffId = await this.userService.getLinkedStaffId(user.id);

    return this.extraAllowanceService.getExtraAllowances({
      ...query,
      year,
      month,
      roleType,
      status,
      staffId,
    });
  }

  @Post('staff-extra-allowances')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create staff extra allowance (self)',
    description:
      'Staff with self-managed extra-allowance roles may create one pending extra allowance for themselves per request; amount, month, and role type are supplied; admin confirms payment separately.',
  })
  @ApiBody({ type: CreateMyStaffExtraAllowanceDto })
  @ApiResponse({
    status: 201,
    description: 'Extra allowance created in pending status.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or no staff record.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Not staff or staff lacks the requested self-managed role.',
  })
  async createMyStaffExtraAllowance(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateMyStaffExtraAllowanceDto,
  ) {
    return this.extraAllowanceService.createMyStaffExtraAllowance(user, body);
  }

  @Patch('staff-extra-allowances')
  @ApiOperation({
    summary: 'Update staff extra allowance (self)',
    description:
      'Staff with self-managed extra-allowance roles may update month, amount, and note of their own allowance. Payment status remains admin-managed.',
  })
  @ApiBody({ type: UpdateMyStaffExtraAllowanceDto })
  @ApiResponse({
    status: 200,
    description: 'Extra allowance updated for current staff.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or no staff record.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Not staff or staff lacks the requested self-managed role.',
  })
  @ApiResponse({
    status: 404,
    description: 'Extra allowance not found for current staff.',
  })
  async updateMyStaffExtraAllowance(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpdateMyStaffExtraAllowanceDto,
  ) {
    return this.extraAllowanceService.updateMyStaffExtraAllowance(user, body);
  }

  @Get('staff-lesson-output-stats')
  @ApiOperation({
    summary: 'Get current staff lesson output stats',
    description:
      'Returns lesson output statistics and recent outputs for the current linked staff profile.',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Recent window in days (default: 30, max: 365)',
    example: 30,
  })
  @ApiResponse({
    status: 200,
    description: 'Lesson output statistics for current staff.',
  })
  @ApiResponse({ status: 400, description: 'User has no staff record.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getMyStaffLessonOutputStats(
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: string,
  ) {
    const staffId = await this.userService.getLinkedStaffId(user.id);
    const parsedDays =
      days == null || days.trim() === '' ? undefined : Number(days);

    return this.lessonService.getOutputStatsByStaff(staffId, {
      days: parsedDays,
    });
  }

  @Get('student-detail')
  @ApiOperation({
    summary: 'Get current student detail',
    description:
      'Returns the linked student detail of the current authenticated user with self-safe fields only.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current student detail.',
  })
  @ApiResponse({ status: 400, description: 'User has no student record.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getMyStudentDetail(@CurrentUser() user: JwtPayload) {
    const studentId = await this.userService.getLinkedStudentId(user.id);
    return this.studentService.getStudentSelfDetail(studentId);
  }

  @Get('student-wallet-history')
  @ApiOperation({
    summary: 'Get current student wallet history',
    description:
      'Returns wallet transactions for the current linked student profile only.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of wallet transactions to return.',
    example: 50,
  })
  @ApiResponse({
    status: 200,
    description: 'Wallet history for current student.',
  })
  @ApiResponse({ status: 400, description: 'User has no student record.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getMyStudentWalletHistory(
    @CurrentUser() user: JwtPayload,
    @Query() query: StudentWalletHistoryQueryDto,
  ) {
    const studentId = await this.userService.getLinkedStudentId(user.id);
    return this.studentService.getStudentSelfWalletHistory(studentId, query);
  }

  @Get('student-exam-schedules')
  @ApiOperation({
    summary: 'Get current student exam schedules',
    description:
      'Returns authoritative exam schedule rows for the current linked student profile.',
  })
  @ApiResponse({
    status: 200,
    description: 'Exam schedule list for current student.',
    type: [StudentExamScheduleItemDto],
  })
  @ApiResponse({ status: 400, description: 'User has no student record.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getMyStudentExamSchedules(@CurrentUser() user: JwtPayload) {
    const studentId = await this.userService.getLinkedStudentId(user.id);
    return this.studentService.getStudentSelfExamSchedules(studentId);
  }

  @Put('student-exam-schedules')
  @ApiOperation({
    summary: 'Replace current student exam schedules',
    description:
      'Replaces the authoritative exam schedule list for the current linked student profile.',
  })
  @ApiBody({ type: UpdateStudentExamSchedulesDto })
  @ApiResponse({
    status: 200,
    description: 'Updated exam schedule list for current student.',
    type: [StudentExamScheduleItemDto],
  })
  @ApiResponse({ status: 400, description: 'User has no student record.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async updateMyStudentExamSchedules(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpdateStudentExamSchedulesDto,
  ) {
    const studentId = await this.userService.getLinkedStudentId(user.id);
    return this.studentService.updateStudentExamSchedules(
      studentId,
      body.items,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Patch('student-account-balance')
  @ApiOperation({
    summary: 'Legacy blocked student wallet balance update',
    description:
      'This legacy self-service direct balance update is blocked. Students must create a SePay QR top-up order instead.',
  })
  @ApiBody({ type: UpdateMyStudentAccountBalanceDto })
  @ApiResponse({
    status: 400,
    description: 'Direct self-service wallet updates are blocked.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async updateMyStudentAccountBalance(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpdateMyStudentAccountBalanceDto,
  ) {
    const studentId = await this.userService.getLinkedStudentId(user.id);
    return this.studentService.updateMyStudentAccountBalance(studentId, body, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get('student-wallet-sepay-static-qr')
  @ApiOperation({
    summary: 'Get static SePay QR for current student wallet top-up',
    description:
      'Trả QR chuyển khoản tĩnh cho học sinh hiện tại. QR không chứa số tiền; nội dung là NAPVI <studentId> <activeClassId...> LOP <activeClassName...>, webhook SePay cộng ví theo các id ở đầu nội dung và số tiền ngân hàng xác nhận.',
  })
  @ApiResponse({
    status: 200,
    description: 'Static SePay QR for current student.',
    type: StudentSePayStaticQrResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Linked student not found.' })
  @ApiResponse({
    status: 503,
    description: 'SePay static QR chưa được cấu hình trên server.',
  })
  async getMyStudentSePayStaticQr(
    @CurrentUser() user: JwtPayload,
  ): Promise<StudentSePayStaticQrResponseDto> {
    const studentId = await this.userService.getLinkedStudentId(user.id);
    return this.studentService.getStudentSePayStaticQr(studentId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post('student-wallet-sepay-topup-order')
  @ApiOperation({
    summary: 'Create SePay top-up order with QR for current student',
    description:
      'Tạo yêu cầu nạp tiền qua SePay kèm mã QR. Mode va_order dùng UserAPI v2 VA order; mode bank_transfer tạo QR chuyển khoản thường và reconcile bằng webhook. Không cộng số dư ví — chỉ trả thông tin thanh toán.',
  })
  @ApiBody({ type: CreateStudentSePayTopUpOrderDto })
  @ApiResponse({
    status: 201,
    description: 'Yêu cầu nạp SePay đã tạo; trả QR / thông tin nhận tiền.',
    type: StudentSePayTopUpOrderResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or invalid amount.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized.',
  })
  @ApiResponse({
    status: 503,
    description: 'SePay chưa được cấu hình trên server.',
  })
  @ApiResponse({
    status: 502,
    description: 'SePay từ chối hoặc lỗi kết nối.',
  })
  async createMyStudentSePayTopUpOrder(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateStudentSePayTopUpOrderDto,
  ): Promise<StudentSePayTopUpOrderResponseDto> {
    const studentId = await this.userService.getLinkedStudentId(user.id);
    return this.studentService.createStudentSePayTopUpOrder(studentId, body, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch()
  @ApiOperation({
    summary: 'Update my profile',
    description:
      'Update current user basic info (first_name, last_name, email, phone, province, accountHandle).',
  })
  @ApiBody({ type: UpdateMyProfileDto })
  @ApiResponse({ status: 200, description: 'Updated full profile.' })
  @ApiResponse({
    status: 400,
    description: 'Validation or duplicate email/handle.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async updateMyProfile(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpdateMyProfileDto,
  ) {
    return this.userService.updateMyProfile(user.id, body, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post('avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: {
        fileSize: DEFAULT_MAX_IMAGE_BYTES,
      },
      fileFilter: buildImageUploadFileFilter({
        defaultFieldLabel: 'Ảnh đại diện',
        labelsByFieldName: {
          avatar: 'Ảnh đại diện',
        },
      }),
    }),
  )
  @ApiOperation({
    summary: 'Upload my avatar',
    description:
      'Upload or replace the current authenticated user avatar in Supabase Storage.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['avatar'],
      properties: {
        avatar: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Updated full profile with avatar URL.',
  })
  @ApiResponse({
    status: 400,
    description: 'Missing file, invalid image format, or storage error.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async uploadMyAvatar(
    @CurrentUser() user: JwtPayload,
    @UploadedFile()
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    return this.userService.uploadMyAvatar(user.id, file, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete('avatar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete my avatar',
    description:
      'Deletes the current authenticated user avatar and clears the saved storage path.',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated full profile without avatar.',
  })
  @ApiResponse({
    status: 400,
    description: 'Storage error while deleting the avatar.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async deleteMyAvatar(@CurrentUser() user: JwtPayload) {
    return this.userService.deleteMyAvatar(user.id, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch('staff')
  @ApiOperation({
    summary: 'Update my staff profile',
    description:
      'Update current user linked staff record. Fails if user has no staff.',
  })
  @ApiBody({ type: UpdateMyStaffProfileDto })
  @ApiResponse({ status: 200, description: 'Updated full profile.' })
  @ApiResponse({ status: 400, description: 'User has no staff record.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async updateMyStaffProfile(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpdateMyStaffProfileDto,
  ) {
    return this.userService.updateMyStaffProfile(user.id, body, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }
  @Patch('student')
  @ApiOperation({
    summary: 'Update my student profile',
    description:
      'Update current user linked student record. Fails if user has no student.',
  })
  @ApiBody({ type: UpdateMyStudentProfileDto })
  @ApiResponse({ status: 200, description: 'Updated full profile.' })
  @ApiResponse({ status: 400, description: 'User has no student record.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async updateMyStudentProfile(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpdateMyStudentProfileDto,
  ) {
    return this.userService.updateMyStudentProfile(user.id, body, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }
}
