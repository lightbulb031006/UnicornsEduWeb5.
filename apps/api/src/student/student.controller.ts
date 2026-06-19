import {
  ForbiddenException,
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
  UseGuards,
} from '@nestjs/common';
import { ParseStudentIdPipe } from 'src/common/pipes/parse-entity-id.pipe';
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
import { AllowAssistantOnAdminRoutes } from 'src/auth/decorators/allow-assistant-on-admin.decorator';
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
} from 'src/dtos/student.dto';
import {
  StudentLandingProfileQueryDto,
  StudentLandingProfilesResponseDto,
} from 'src/dtos/landing-profile.dto';
import { StudentService } from './student.service';

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
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
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
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
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
      'Get all students. Admin, assistant, legacy accountant, and income accountant only.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated students list with data and meta.',
  })
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.accountant,
    StaffRole.accountant_income,
  )
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
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
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
      'Assistant can only submit negative balance deltas (withdraw). Positive manual top-up remains admin-only.',
  })
  @ApiResponse({ status: 404, description: 'Student not found.' })
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
  async updateStudentAccountBalance(
    @CurrentUser() user: JwtPayload,
    @CurrentAuth() auth: ResolvedAuthAccess | null,
    @Body() data: UpdateStudentAccountBalanceCreateDto,
  ) {
    if (auth?.access.admin.tier === 'assistant' && data.amount > 0) {
      throw new ForbiddenException(
        'Assistant cannot top up student balance directly.',
      );
    }

    return this.studentService.updateStudentAccountBalance(data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get('wallet-direct-topup-requests')
  @AllowAssistantOnAdminRoutes(false)
  @ApiOperation({
    summary: 'List direct wallet top-up approval requests',
    description:
      'Admin-only queue for pending and historical direct wallet top-up approval requests.',
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
  @ApiResponse({ status: 403, description: 'Admin-only.' })
  async listStudentWalletDirectTopUpRequests(
    @Query() query: StudentWalletDirectTopUpRequestListQueryDto,
  ): Promise<StudentWalletDirectTopUpRequestListResponseDto> {
    return this.studentService.listStudentWalletDirectTopUpRequests(query);
  }

  @Get('wallet-direct-topup-requests/:requestId')
  @AllowAssistantOnAdminRoutes(false)
  @ApiOperation({
    summary: 'Get one direct wallet top-up approval request',
    description:
      'Admin-only detail endpoint used by the notification approval popup.',
  })
  @ApiParam({ name: 'requestId', description: 'Direct top-up request ID' })
  @ApiResponse({
    status: 200,
    description: 'Direct top-up approval request.',
    type: StudentWalletDirectTopUpRequestResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Admin-only.' })
  @ApiResponse({ status: 404, description: 'Request not found.' })
  async getStudentWalletDirectTopUpRequest(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ): Promise<StudentWalletDirectTopUpRequestResponseDto> {
    return this.studentService.getStudentWalletDirectTopUpRequestById(
      requestId,
    );
  }

  @Post('wallet-direct-topup-requests/:requestId/approve')
  @AllowAssistantOnAdminRoutes(false)
  @ApiOperation({
    summary: 'Approve a direct wallet top-up request from the admin queue',
    description:
      'Admin-only approval endpoint. Credits the student wallet using the same transaction logic as the email approval flow.',
  })
  @ApiParam({ name: 'requestId', description: 'Direct top-up request ID' })
  @ApiResponse({
    status: 200,
    description: 'Direct top-up approval result.',
    type: StudentWalletDirectTopUpApprovalResultDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired request.' })
  @ApiResponse({ status: 403, description: 'Admin-only.' })
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
      'API-key protected endpoint for the marketing landing site. Returns sanitized student identity fields only.',
  })
  @ApiHeader({
    name: LANDING_API_KEY_HEADER,
    required: true,
    description: 'Landing site API key (LANDING_API_KEY)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'inactive'],
    description: 'Filter by student status (default: active)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max profiles to return (default: 100, max: 500)',
    example: 100,
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

  @Post(':id/wallet-direct-topup-requests')
  @ApiOperation({
    summary: 'Create a direct wallet top-up request for admin approval',
    description:
      'Create a pending direct top-up request and send an approval email to ADMIN_EMAIL. Admin, assistant, and assigned customer care staff only.',
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
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.customer_care)
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
      'Create a SePay QR top-up order for a specific student. Admin, assistant, and assigned customer care staff only.',
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
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.customer_care)
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
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.customer_care)
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
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Student or class not found.' })
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
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
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
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
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
  @ApiOperation({
    summary: 'Update student operational status',
    description:
      'Admin-only status transition. Marking inactive closes active class memberships; reactivating does not restore old class memberships.',
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
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.customer_care)
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
    StaffRole.assistant,
    StaffRole.accountant,
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
    StaffRole.assistant,
    StaffRole.accountant,
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
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
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
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
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
