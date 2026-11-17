import { SALE_CS_HEAD_ROLE } from 'src/common/sale-cs-head-access';
import {
  ForbiddenException,
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
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ParseStudentIdPipe } from 'src/common/pipes/parse-entity-id.pipe';
import {
  ApiBody,
  ApiConsumes,
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
import { CurrentAuth } from 'src/auth/decorators/current-auth.decorator';
import {
  CurrentUser,
  type JwtPayload,
} from 'src/auth/decorators/current-user.decorator';
import type { ResolvedAuthAccess } from 'src/auth/auth-access.service';
import { Public } from 'src/auth/decorators/public.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { LANDING_API_KEY_HEADER } from 'src/auth/decorators/api-key.decorator';
import { ApiKeyGuard } from 'src/auth/guards/api-key.guard';
import {
  CreateStudentDto,
  CreateStudentSePayTopUpOrderDto,
  CreateStudentWalletDirectTopUpRequestDto,
  SearchAssignableStudentUsersDto,
  StudentSePayStaticQrResponseDto,
  StudentSePayTopUpOrderResponseDto,
  StudentWalletDirectTopUpApprovalResultDto,
  StudentWalletDirectTopUpApprovalTokenDto,
  StudentWalletDirectTopUpRequestListQueryDto,
  StudentWalletDirectTopUpRequestListResponseDto,
  StudentWalletDirectTopUpRequestResponseDto,
  StudentWalletHistoryQueryDto,
  StudentListQueryDto,
  StudentExamScheduleItemDto,
  UpdateStudentAccountBalanceCreateDto,
  UpdateStudentBodyDto,
  UpdateStudentClassesDto,
  UpdateStudentExamSchedulesDto,
  UpdateStudentDto,
  UpdateStudentStatusDto,
  SetStudentEmailVerifiedDto,
} from 'src/dtos/student.dto';
import {
  StudentLandingAchievementsQueryDto,
  StudentLandingAchievementsResponseDto,
  StudentLandingProfileQueryDto,
  StudentLandingProfilesResponseDto,
} from 'src/dtos/landing-profile.dto';
import {
  buildImageUploadFileFilter,
  DEFAULT_MAX_IMAGE_BYTES,
} from 'src/storage/supabase-storage';
import { StudentService } from './student.service';

const avatarUploadInterceptor = FileInterceptor('avatar', {
  limits: { fileSize: DEFAULT_MAX_IMAGE_BYTES },
  fileFilter: buildImageUploadFileFilter({
    defaultFieldLabel: 'Ảnh đại diện',
    labelsByFieldName: { avatar: 'Ảnh đại diện' },
  }),
});

@ApiTags('student')
@Controller('student')
@ApiCookieAuth('access_token')
@Roles(UserRole.admin)
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Get('assignable-users')
  @ApiOperation({
    summary: 'Search users by email for student assignment',
    description:
      'Search existing users by email and return whether they can be linked to a new student profile.',
  })
  @ApiQuery({
    name: 'email',
    required: true,
    type: String,
    description: 'Full or partial email',
    example: 'student@example.com',
  })
  @ApiResponse({
    status: 200,
    description: 'Matching users with eligibility metadata.',
  })
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE)
  async searchAssignableUsers(@Query() query: SearchAssignableStudentUsersDto) {
    return this.studentService.searchAssignableUsersByEmail(query.email);
  }

  @Post()
  @ApiOperation({
    summary: 'Create student',
    description: 'Create a student profile from an existing user.',
  })
  @ApiBody({
    type: CreateStudentDto,
    description: 'Student creation payload',
  })
  @ApiResponse({ status: 201, description: 'Created student.' })
  @ApiResponse({ status: 400, description: 'Validation or eligibility error.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE)
  async createStudent(
    @CurrentUser() user: JwtPayload,
    @Body() data: CreateStudentDto,
  ) {
    return this.studentService.createStudent(data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get()
  @ApiOperation({
    summary: 'List students',
    description:
      'Get all students. Admin, sale_customer_care_head, and income accountant only.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated students list with data and meta.',
  })
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE, StaffRole.accountant_income)
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
    description: 'Search by student full name (case-insensitive)',
    example: 'Nguyen',
  })
  @ApiQuery({
    name: 'school',
    required: false,
    type: String,
    description: 'Filter by school name (contains, case-insensitive)',
    example: 'THPT Nguyen Du',
  })
  @ApiQuery({
    name: 'province',
    required: false,
    type: String,
    description: 'Filter by province (contains, case-insensitive)',
    example: 'ha noi',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'inactive'],
    description: 'Filter by student status',
  })
  @ApiQuery({
    name: 'gender',
    required: false,
    enum: ['male', 'female'],
    description: 'Filter by gender',
  })
  @ApiQuery({
    name: 'className',
    required: false,
    type: String,
    description: 'Filter by class name (contains, case-insensitive)',
    example: 'Toan 8A',
  })
  async getStudents(
    @CurrentUser() user: JwtPayload,
    @Query() query: StudentListQueryDto,
  ) {
    return this.studentService.getStudents(query);
  }

  @Patch('update-student')
  @ApiOperation({
    summary: 'Update student',
    description: 'Update a student by payload.',
  })
  @ApiBody({
    type: UpdateStudentDto,
    description: 'Student update payload (id required)',
  })
  @ApiResponse({ status: 200, description: 'Updated student.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Student not found.' })
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE, StaffRole.customer_care)
  async updateStudent(
    @CurrentUser() user: JwtPayload,
    @Body() data: UpdateStudentDto,
  ) {
    return this.studentService.updateStudent(data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch('update-student-account-balance')
  @ApiOperation({
    summary: 'Update student account balance',
    description: 'Update a student account balance by payload.',
  })
  @ApiBody({
    type: UpdateStudentAccountBalanceCreateDto,
    description: 'Student account balance update payload',
  })
  @ApiResponse({ status: 200, description: 'Student account balance updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({
    status: 403,
    description:
      'Trưởng phòng Sale & CSKH chỉ được gửi số âm (rút tiền). Nạp thẳng số dương chỉ Admin (#267).',
  })
  @ApiResponse({ status: 404, description: 'Student not found.' })
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE)
  async updateStudentAccountBalance(
    @CurrentUser() user: JwtPayload,
    @CurrentAuth() auth: ResolvedAuthAccess | null,
    @Body() data: UpdateStudentAccountBalanceCreateDto,
  ) {
    // #267: nạp thẳng số dương chỉ Admin; Trưởng phòng Sale & CSKH chỉ được rút
    // (số âm) và nạp qua yêu cầu nạp / QR SePay. Trưởng phòng được duyệt hàng
    // chờ nạp thẳng (`wallet-direct-topup-requests/:id/approve`).
    const isFullAdmin =
      user.roleType === UserRole.admin || auth?.access.admin.tier === 'full';
    if (!isFullAdmin && data.amount > 0) {
      throw new ForbiddenException(
        'Chỉ Admin được nạp thẳng tiền vào ví học sinh. Trưởng phòng Sale & CSKH hãy tạo yêu cầu nạp hoặc dùng QR.',
      );
    }

    return this.studentService.updateStudentAccountBalance(data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get('wallet-direct-topup-requests')
  @ApiOperation({
    summary: 'List direct wallet top-up approval requests',
    description:
      'Queue for pending and historical direct wallet top-up approval requests. Admin and Trưởng phòng Sale & CSKH.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'approved', 'expired', 'all'],
    description: 'Queue status filter. Defaults to pending.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Paginated direct top-up approval requests.',
    type: StudentWalletDirectTopUpRequestListResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Admin hoặc Trưởng phòng Sale & CSKH.',
  })
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE)
  async listStudentWalletDirectTopUpRequests(
    @Query() query: StudentWalletDirectTopUpRequestListQueryDto,
  ): Promise<StudentWalletDirectTopUpRequestListResponseDto> {
    return this.studentService.listStudentWalletDirectTopUpRequests(query);
  }

  @Get('wallet-direct-topup-requests/:requestId')
  @ApiOperation({
    summary: 'Get one direct wallet top-up approval request',
    description:
      'Detail endpoint used by the notification approval popup. Admin and Trưởng phòng Sale & CSKH.',
  })
  @ApiParam({ name: 'requestId', description: 'Direct top-up request ID' })
  @ApiResponse({
    status: 200,
    description: 'Direct top-up approval request.',
    type: StudentWalletDirectTopUpRequestResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Admin hoặc Trưởng phòng Sale & CSKH.',
  })
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE)
  @ApiResponse({ status: 404, description: 'Request not found.' })
  async getStudentWalletDirectTopUpRequest(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ): Promise<StudentWalletDirectTopUpRequestResponseDto> {
    return this.studentService.getStudentWalletDirectTopUpRequestById(
      requestId,
    );
  }

  @Post('wallet-direct-topup-requests/:requestId/approve')
  @ApiOperation({
    summary: 'Approve a direct wallet top-up request from the approval queue',
    description:
      'Approval endpoint for Admin and Trưởng phòng Sale & CSKH (may approve any request, including their own). Credits the student wallet using the same transaction logic as the email approval flow.',
  })
  @ApiParam({ name: 'requestId', description: 'Direct top-up request ID' })
  @ApiResponse({
    status: 200,
    description: 'Direct top-up approval result.',
    type: StudentWalletDirectTopUpApprovalResultDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired request.' })
  @ApiResponse({
    status: 403,
    description: 'Admin hoặc Trưởng phòng Sale & CSKH.',
  })
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE)
  async approveStudentWalletDirectTopUpRequestFromQueue(
    @CurrentUser() user: JwtPayload,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ): Promise<StudentWalletDirectTopUpApprovalResultDto> {
    return this.studentService.approveStudentWalletDirectTopUpRequestById(
      requestId,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Get('wallet-direct-topup-approval')
  @Public()
  @Roles()
  @ApiOperation({
    summary: 'Preview a direct wallet top-up approval request',
    description:
      'Public token-only endpoint used by the approval email. This does not credit the student wallet.',
  })
  @ApiQuery({
    name: 'token',
    required: true,
    type: String,
    description: 'Approval token from email link',
  })
  @ApiResponse({
    status: 200,
    description: 'Direct top-up request preview.',
    type: StudentWalletDirectTopUpRequestResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid token.' })
  async getStudentWalletDirectTopUpApproval(
    @Query() query: StudentWalletDirectTopUpApprovalTokenDto,
  ): Promise<StudentWalletDirectTopUpRequestResponseDto> {
    return this.studentService.getStudentWalletDirectTopUpApprovalByToken(
      query.token,
    );
  }

  @Post('wallet-direct-topup-approval/confirm')
  @Public()
  @Roles()
  @ApiOperation({
    summary: 'Confirm a direct wallet top-up approval request',
    description:
      'Public token-only endpoint used by the approval page. Credits the student wallet only after this POST.',
  })
  @ApiBody({ type: StudentWalletDirectTopUpApprovalTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Direct top-up approval result.',
    type: StudentWalletDirectTopUpApprovalResultDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired token.' })
  async confirmStudentWalletDirectTopUpApproval(
    @Body() body: StudentWalletDirectTopUpApprovalTokenDto,
  ): Promise<StudentWalletDirectTopUpApprovalResultDto> {
    return this.studentService.approveStudentWalletDirectTopUpRequest(
      body.token,
    );
  }

  @Get('landing-profiles')
  @Public()
  @Roles()
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'List public student landing profiles',
    description:
      'API-key protected endpoint for the marketing landing site. Returns sanitized student identity fields only. Does not filter by status (active + inactive).',
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
    description: 'Case-insensitive student full name search',
  })
  @ApiQuery({
    name: 'ids',
    required: false,
    type: String,
    description:
      'Comma-separated student ids (`UNIST-…`). When set, only those profiles are returned. Still paginated by page/limit — loop pages if more than `limit` ids are passed.',
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
    description:
      'Page size (default: 50, max: 100). Loop pages for full CMS sync.',
    example: 50,
  })
  @ApiResponse({
    status: 200,
    description: 'Sanitized student landing profiles.',
    type: StudentLandingProfilesResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async getStudentLandingProfiles(
    @Query() query: StudentLandingProfileQueryDto,
  ): Promise<StudentLandingProfilesResponseDto> {
    return this.studentService.getLandingProfiles(query);
  }

  @Get('landing-achievements')
  @Public()
  @Roles()
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'List public student landing achievements',
    description:
      'API-key protected endpoint for the marketing landing site. Default: returns flat achievements filtered by CMS published `sourceIds`; empty/missing `sourceIds` returns an empty page (no roster leak). Pass `includeUnpublished=true` for the /thanh-tich level-list surface to return achievements for all students regardless of publish gate.',
  })
  @ApiHeader({
    name: LANDING_API_KEY_HEADER,
    required: true,
    description: 'Landing site API key (LANDING_API_KEY)',
  })
  @ApiQuery({
    name: 'sourceIds',
    required: false,
    type: String,
    description:
      'Comma-separated published student ids (`UNIST-…`). Required unless `includeUnpublished=true`; empty/missing → empty page.',
  })
  @ApiQuery({
    name: 'includeUnpublished',
    required: false,
    type: Boolean,
    description:
      'When true, ignores sourceIds/publish gate and returns achievements for ALL students (level-list surface). Keep false/omit for publish-gated surfaces (e.g. "Tự Hào Uni").',
  })
  @ApiQuery({
    name: 'level',
    required: false,
    type: String,
    description:
      'Optional achievement level filter (e.g. national, provincial)',
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
    description: 'Page size (default: 9, max: 100)',
    example: 9,
  })
  @ApiResponse({
    status: 200,
    description:
      'Sanitized student landing achievements with nested student identity.',
    type: StudentLandingAchievementsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async getStudentLandingAchievements(
    @Query() query: StudentLandingAchievementsQueryDto,
  ): Promise<StudentLandingAchievementsResponseDto> {
    return this.studentService.getLandingAchievements(query);
  }

  @Post(':id/wallet-direct-topup-requests')
  @ApiOperation({
    summary: 'Create a direct wallet top-up request for admin approval',
    description:
      'Create a pending direct top-up request and send an approval email to ADMIN_EMAIL. Admin, sale_customer_care_head, and assigned customer care staff only.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiBody({ type: CreateStudentWalletDirectTopUpRequestDto })
  @ApiResponse({
    status: 201,
    description: 'Direct top-up request created and approval email sent.',
    type: StudentWalletDirectTopUpRequestResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Student not found.' })
  @ApiResponse({
    status: 503,
    description: 'ADMIN_EMAIL or SMTP is not configured.',
  })
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE, StaffRole.customer_care)
  async createStudentWalletDirectTopUpRequest(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStudentIdPipe()) id: string,
    @Body() body: CreateStudentWalletDirectTopUpRequestDto,
  ): Promise<StudentWalletDirectTopUpRequestResponseDto> {
    return this.studentService.createStudentWalletDirectTopUpRequest(id, body, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post(':id/wallet-sepay-topup-order')
  @ApiOperation({
    summary: 'Create SePay top-up order for a student',
    description:
      'Create a SePay QR top-up order for a specific student. Admin, sale_customer_care_head, and assigned customer care staff only.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiBody({ type: CreateStudentSePayTopUpOrderDto })
  @ApiResponse({
    status: 201,
    description: 'SePay top-up order created.',
    type: StudentSePayTopUpOrderResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Student not found.' })
  @ApiResponse({ status: 503, description: 'SePay is not configured.' })
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE, StaffRole.customer_care)
  async createStudentSePayTopUpOrder(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStudentIdPipe()) id: string,
    @Body() body: CreateStudentSePayTopUpOrderDto,
  ): Promise<StudentSePayTopUpOrderResponseDto> {
    return this.studentService.createStudentSePayTopUpOrder(id, body, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get(':id/wallet-sepay-static-qr')
  @ApiOperation({
    summary: 'Get static SePay QR for a student wallet top-up',
    description:
      'Return a static bank-transfer QR for a student. The QR has no amount and uses transfer note [SEPAY_TRANSFER_NOTE_PREFIX] NAPVI <studentId> <activeClassId...> LOP <activeClassName...>; webhook reconciliation uses the NAPVI marker and id tokens before the class-name suffix.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiResponse({
    status: 200,
    description: 'Static SePay QR found.',
    type: StudentSePayStaticQrResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Student not found.' })
  @ApiResponse({
    status: 503,
    description: 'SePay static QR is not configured.',
  })
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE, StaffRole.customer_care)
  async getStudentSePayStaticQr(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStudentIdPipe()) id: string,
  ): Promise<StudentSePayStaticQrResponseDto> {
    return this.studentService.getStudentSePayStaticQr(id, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id/classes')
  @ApiOperation({
    summary: 'Replace student class memberships',
    description:
      'Replace all classes assigned to the student while preserving existing tuition overrides on unchanged memberships.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiBody({
    type: UpdateStudentClassesDto,
    description: 'Student class membership payload',
  })
  @ApiResponse({ status: 200, description: 'Student classes updated.' })
  @ApiResponse({
    status: 400,
    description:
      'Validation error, hoặc lớp đang trống chưa có Học phí lớp (#273): «Lớp chưa có học phí. Hãy điền Học phí lớp trước khi thêm học sinh đầu tiên.»',
  })
  @ApiResponse({
    status: 403,
    description: 'Chỉ Admin và Trưởng phòng Sale & CSKH (#273).',
  })
  @ApiResponse({ status: 404, description: 'Student or class not found.' })
  // #273: thêm/bớt học sinh trong lớp — Admin + Trưởng phòng Sale & CSKH.
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE)
  async updateStudentClasses(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStudentIdPipe()) id: string,
    @Body() body: UpdateStudentClassesDto,
  ) {
    return this.studentService.updateStudentClasses(id, body, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update student by id',
    description: 'Update a student record by route param id.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiBody({
    type: UpdateStudentBodyDto,
    description: 'Student update payload',
  })
  @ApiResponse({ status: 200, description: 'Updated student.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Student not found.' })
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE, StaffRole.customer_care)
  async updateStudentById(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStudentIdPipe()) id: string,
    @Body() body: UpdateStudentBodyDto,
  ) {
    return this.studentService.updateStudentById(id, body, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id/status')
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE, StaffRole.customer_care)
  @ApiOperation({
    summary: 'Update student operational status',
    description:
      'Status transition for admin, sale_customer_care_head, and assigned customer care. Marking inactive closes active class memberships; reactivating does not restore old class memberships.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiBody({
    type: UpdateStudentStatusDto,
    description: 'Student status transition payload',
  })
  @ApiResponse({ status: 200, description: 'Student status updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Student not found.' })
  async updateStudentStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStudentIdPipe()) id: string,
    @Body() body: UpdateStudentStatusDto,
  ) {
    return this.studentService.updateStudentStatus(id, body, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id/email-verified')
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE, StaffRole.customer_care)
  @ApiOperation({
    summary: 'Set student account email verified flag',
    description:
      '16/11: bật/tắt «Email đã xác thực» trên tài khoản đăng nhập của học sinh (giống checkbox Admin ở popup Quản lý user). Admin, Trưởng phòng Sale & CSKH: mọi học sinh; CSKH: chỉ học sinh mình là Người chăm sóc.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiBody({ type: SetStudentEmailVerifiedDto })
  @ApiResponse({
    status: 200,
    description: '{ studentId, userId, emailVerified }.',
  })
  @ApiResponse({
    status: 400,
    description: 'Học sinh chưa gắn tài khoản đăng nhập.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden. Không phải Admin / Trưởng phòng Sale & CSKH / CSKH.',
  })
  @ApiResponse({
    status: 404,
    description: 'Student not found (kể cả CSKH không phụ trách học sinh).',
  })
  async setStudentEmailVerified(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStudentIdPipe()) id: string,
    @Body() body: SetStudentEmailVerifiedDto,
  ) {
    return this.studentService.setStudentEmailVerified(
      id,
      body.email_verified,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Get(':id/wallet-history')
  @ApiOperation({
    summary: 'Get student wallet history',
    description:
      'Get the most recent wallet transactions for a student from wallet_transactions_history.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of wallet transactions to return.',
    example: 50,
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['topup'],
    description: 'Filter wallet history to top-up transactions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Student wallet history found.',
  })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Student not found.' })
  // Kế toán thu cần đối soát nạp ví với học phí (quyết định 13/11).
  @AllowStaffRolesOnAdminRoutes(
    SALE_CS_HEAD_ROLE,
    StaffRole.accountant_income,
    StaffRole.customer_care,
  )
  async getStudentWalletHistory(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStudentIdPipe()) id: string,
    @Query() query: StudentWalletHistoryQueryDto,
  ) {
    return this.studentService.getStudentWalletHistory(id, query, {
      userId: user.id,
      roleType: user.roleType,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get student by ID',
    description: 'Get a student by ID.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiResponse({ status: 200, description: 'Student found.' })
  @ApiResponse({ status: 404, description: 'Student not found.' })
  @AllowStaffRolesOnAdminRoutes(
    SALE_CS_HEAD_ROLE,
    StaffRole.accountant_income,
    StaffRole.customer_care,
  )
  async getStudentById(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStudentIdPipe()) id: string,
  ) {
    return this.studentService.getStudentById(id, {
      userId: user.id,
      roleType: user.roleType,
    });
  }

  @Post(':id/avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(avatarUploadInterceptor)
  @ApiOperation({
    summary: 'Upload student avatar',
    description:
      'Uploads avatar for the linked user account (clean + watermarked twin).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['avatar'],
      properties: { avatar: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Student detail with avatar URL.' })
  @ApiResponse({
    status: 400,
    description: 'Missing linked user or invalid image.',
  })
  @ApiResponse({ status: 404, description: 'Student not found.' })
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE, StaffRole.customer_care)
  async uploadStudentAvatar(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStudentIdPipe()) id: string,
    @UploadedFile()
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    return this.studentService.uploadStudentAvatar(id, file, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':id/avatar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete student avatar',
    description: 'Removes clean + watermarked avatar for the linked user.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiResponse({ status: 200, description: 'Student detail without avatar.' })
  @ApiResponse({ status: 400, description: 'Missing linked user.' })
  @ApiResponse({ status: 404, description: 'Student not found.' })
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE, StaffRole.customer_care)
  async deleteStudentAvatar(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStudentIdPipe()) id: string,
  ) {
    return this.studentService.deleteStudentAvatar(id, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get(':id/exam-schedules')
  @ApiOperation({
    summary: 'Get exam schedules for a student',
    description: 'Returns authoritative exam schedule rows for the student.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiResponse({
    status: 200,
    description: 'Student exam schedules found.',
    type: [StudentExamScheduleItemDto],
  })
  @ApiResponse({ status: 404, description: 'Student not found.' })
  @AllowStaffRolesOnAdminRoutes(
    SALE_CS_HEAD_ROLE,
    StaffRole.accountant_income,
    StaffRole.customer_care,
  )
  async getStudentExamSchedules(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStudentIdPipe()) id: string,
  ) {
    return this.studentService.getStudentExamSchedules(id, {
      userId: user.id,
      roleType: user.roleType,
    });
  }

  @Put(':id/exam-schedules')
  @ApiOperation({
    summary: 'Replace exam schedules for a student',
    description:
      'Replace the authoritative exam schedule list for the student.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiBody({
    type: UpdateStudentExamSchedulesDto,
    description: 'Replace-all exam schedule payload',
  })
  @ApiResponse({
    status: 200,
    description: 'Student exam schedules updated.',
    type: [StudentExamScheduleItemDto],
  })
  @ApiResponse({ status: 404, description: 'Student not found.' })
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE, StaffRole.customer_care)
  async updateStudentExamSchedules(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStudentIdPipe()) id: string,
    @Body() body: UpdateStudentExamSchedulesDto,
  ) {
    return this.studentService.updateStudentExamSchedules(id, body.items, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete student',
    description: 'Delete a student by ID.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiResponse({ status: 200, description: 'Student deleted.' })
  @ApiResponse({ status: 404, description: 'Student not found.' })
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE)
  async deleteStudent(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStudentIdPipe()) id: string,
  ) {
    return this.studentService.deleteStudent(id, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }
}
