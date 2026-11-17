import { SALE_CS_HEAD_ROLE } from 'src/common/sale-cs-head-access';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ParseClassIdPipe,
  ParseStaffIdPipe,
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
import {
  CurrentUser,
  type JwtPayload,
} from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { PaginationQueryDto } from 'src/dtos/pagination.dto';
import {
  ClassStatusActionDto,
  CreateClassDto,
  UpdateClassBasicInfoDto,
  UpdateClassDto,
  UpdateClassPricingModeDto,
  UpdateClassScheduleDto,
  UpdateClassStudentsDto,
  UpdateClassStudentTuitionDto,
  UpdateClassTeacherCompensationDto,
  UpdateClassTeachersDto,
  UpdateClassTuitionDto,
} from 'src/dtos/class.dto';
import {
  CreateClassSurveyDto,
  UpdateClassSurveyDto,
} from 'src/dtos/class-survey.dto';
import {
  ClassScheduleGoogleCalendarResyncResponseDto,
  ClassScheduleFilterDto,
  CreateClassScopedMakeupScheduleEventDto,
  MakeupGoogleCalendarResyncResponseDto,
  MakeupScheduleEventDto,
  UpdateClassScopedMakeupScheduleEventDto,
} from 'src/dtos/class-schedule.dto';
import { CalendarService } from 'src/calendar/calendar.service';
import { ClassService } from './class.service';
import { ClassSurveyService } from './class-survey.service';
import type { RequestWithResolvedAuthContext } from 'src/auth/auth-request-context';
import {
  canSeeClassStudentContactsOnAdminRoutes,
  canSeeClassStudentWalletOnAdminRoutes,
  redactClassForAccountantView,
  redactClassListForAccountantView,
  redactClassStudentContacts,
  redactClassStudentWalletBalances,
  redactStudentClassRowsContacts,
  redactStudentClassRowsForAccountantView,
  redactStudentClassRowsWalletBalance,
  resolveAdminClassFinanceView,
} from 'src/common/accountant-finance-redaction.util';
import { StaffOperationsAccessService } from 'src/staff-ops/staff-operations-access.service';

/**
 * Response route admin của lớp theo người xem: bỏ học phí / lương gia sư
 * (#272/#274) và bỏ số dư ví học sinh với role không được xem (follow-up grill
 * 13/11 — Trưởng ban Đào tạo không xem; Kế toán chi vẫn xem), và bỏ liên hệ /
 * hồ sơ học sinh với Trưởng ban Đào tạo thuần (quyết định 13/11).
 */
function redactAdminClassResponse<T>(
  classRecord: T,
  roleType: UserRole,
  staffRoles: readonly StaffRole[],
): T {
  let redacted = redactClassForAccountantView(
    classRecord,
    resolveAdminClassFinanceView(roleType, staffRoles),
  );
  if (!canSeeClassStudentWalletOnAdminRoutes(roleType, staffRoles)) {
    redacted = redactClassStudentWalletBalances(redacted, { mode: 'none' });
  }
  if (!canSeeClassStudentContactsOnAdminRoutes(roleType, staffRoles)) {
    redacted = redactClassStudentContacts(redacted);
  }
  return redacted;
}

/**
 * #272: role được XEM lớp ở route admin. Trưởng phòng Sale & CSKH thấy mọi
 * lớp nhưng response bỏ lương gia sư (`resolveAdminClassFinanceView`).
 * #274: Trưởng ban Đào tạo cũng xem được (bỏ học phí, giữ lương gia sư).
 */
const CLASS_VIEWER_STAFF_ROLES = [
  SALE_CS_HEAD_ROLE,
  StaffRole.training_head,
  StaffRole.accountant_income,
  StaffRole.accountant_expense,
] as const;

@Controller('class')
@ApiTags('class')
@ApiCookieAuth('access_token')
@AllowStaffRolesOnAdminRoutes(
  StaffRole.accountant_income,
  StaffRole.accountant_expense,
)
@Roles(UserRole.admin)
export class ClassController {
  constructor(
    private readonly classService: ClassService,
    private readonly classSurveyService: ClassSurveyService,
    private readonly calendarService: CalendarService,
    private readonly staffOperationsAccess: StaffOperationsAccessService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List classes',
    description: 'Get paginated class list.',
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
    description: 'Search by class name',
    example: 'Math',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['running', 'ended'],
    description: 'Filter by class status',
  })
  @ApiQuery({
    name: 'courseId',
    required: false,
    description: 'Filter by course id (see GET /courses)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated class list with data and meta.',
  })
  // #272: TP Sale & CSKH xem mọi lớp (không lương gia sư); kế toán thu/chi
  // xem theo góc nhìn tài chính của mình.
  @AllowStaffRolesOnAdminRoutes(...CLASS_VIEWER_STAFF_ROLES)
  async getClasses(
    @CurrentUser() user: JwtPayload,
    @Req() req: RequestWithResolvedAuthContext,
    @Query() query: PaginationQueryDto,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('courseId') courseId?: string,
  ) {
    const classes = await this.classService.getClasses({
      ...query,
      search,
      status,
      courseId,
    });
    return redactClassListForAccountantView(
      classes,
      resolveAdminClassFinanceView(user.roleType, req.resolvedStaffRoles ?? []),
    );
  }

  @Get(':id/students')
  @ApiOperation({
    summary: 'Get students by class id',
    description: 'Get list of students enrolled in the class.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiResponse({
    status: 200,
    description:
      'List of students in the class. Trưởng ban Đào tạo: không có số dư ví học sinh (`accountBalance`, kể cả `student.accountBalance`) và `student` chỉ còn `id`, `fullName`, `status` (không liên hệ / hồ sơ — quyết định 13/11); Admin, Trưởng phòng Sale & CSKH, Kế toán thu/chi giữ (follow-up grill 13/11).',
  })
  @ApiResponse({ status: 403, description: 'Role không được xem lớp.' })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  @AllowStaffRolesOnAdminRoutes(...CLASS_VIEWER_STAFF_ROLES)
  async getStudentsByClassId(
    @CurrentUser() user: JwtPayload,
    @Req() req: RequestWithResolvedAuthContext,
    @Param('id', new ParseClassIdPipe()) id: string,
  ) {
    const students = await this.classService.getStudentsByClassId(id);
    const staffRoles = req.resolvedStaffRoles ?? [];
    return redactStudentClassRowsContacts(
      redactStudentClassRowsWalletBalance(
        redactStudentClassRowsForAccountantView(
          students,
          resolveAdminClassFinanceView(user.roleType, staffRoles),
        ),
        canSeeClassStudentWalletOnAdminRoutes(user.roleType, staffRoles),
      ),
      canSeeClassStudentContactsOnAdminRoutes(user.roleType, staffRoles),
    );
  }

  @Get(':id/surveys')
  @ApiOperation({
    summary: 'List class surveys',
    description: 'Get class survey reports in the selected month.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiQuery({ name: 'month', required: true, description: 'Tháng (01-12)' })
  @ApiQuery({ name: 'year', required: true, description: 'Năm (YYYY)' })
  @ApiResponse({ status: 200, description: 'List of class surveys.' })
  async getClassSurveys(
    @Param('id', new ParseClassIdPipe()) id: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.classSurveyService.getClassSurveys(id, { month, year });
  }

  @Patch(':id/basic-info')
  @ApiOperation({
    summary: 'Cập nhật Thông tin lớp',
    description:
      'Thông tin lớp (tên, khoá, trạng thái, sĩ số, không điểm danh, hạn xem nội dung) + lương gia sư mặc định của lớp. KHÔNG nhận học phí (#272: dùng PATCH /class/:id/tuition; trường học phí gửi lên bị bỏ qua). Changing allowance_per_session_per_student updates only the class default; per-teacher class_teachers.custom_allowance overrides are not modified. #274: Admin sửa mọi trường; Trưởng ban Đào tạo và Trưởng phòng Sale & CSKH chỉ được gửi name, course_id (môn/loại lớp), max_students — gửi trường khác → 403 liệt kê trường bị từ chối. Kế toán thu/chi bị 403. Response bỏ học phí/lương gia sư theo role người xem.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: UpdateClassBasicInfoDto })
  @ApiResponse({ status: 200, description: 'Class updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({
    status: 403,
    description:
      'Role không được sửa Thông tin lớp, hoặc role trưởng gửi trường ngoài tên/khoá học/sĩ số (#274).',
  })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  // #274: Admin + Trưởng ban Đào tạo + Trưởng phòng; giới hạn trường ở service.
  @AllowStaffRolesOnAdminRoutes(StaffRole.training_head, SALE_CS_HEAD_ROLE)
  async updateClassBasicInfo(
    @CurrentUser() user: JwtPayload,
    @Req() req: RequestWithResolvedAuthContext,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Body() dto: UpdateClassBasicInfoDto,
  ) {
    const updated = await this.classService.updateClassBasicInfo(id, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
    return redactAdminClassResponse(
      updated,
      user.roleType,
      req.resolvedStaffRoles ?? [],
    );
  }

  @Patch(':id/tuition')
  @ApiOperation({
    summary: 'Cập nhật Học phí lớp',
    description:
      'Học phí chung của lớp (#272): student_tuition_per_session, student_tuition_per_block, tuition_package_total, tuition_package_session. student_tuition_per_block: số dương lưu nguyên đơn giá / 30 phút; null suy ROUND(học phí mỗi buổi ÷ số block chuẩn). Admin và Trưởng phòng Sale & CSKH sửa; Kế toán thu chỉ xem (403); Kế toán chi không thấy học phí (403). Response bỏ lương gia sư với Trưởng phòng.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: UpdateClassTuitionDto })
  @ApiResponse({ status: 200, description: 'Học phí lớp đã cập nhật.' })
  @ApiResponse({
    status: 400,
    description: 'Payload không hợp lệ, hoặc xoá tổng gói của lớp bán một lần.',
  })
  @ApiResponse({
    status: 403,
    description: 'Chỉ Admin và Trưởng phòng Sale & CSKH sửa Học phí lớp.',
  })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE)
  async updateClassTuition(
    @CurrentUser() user: JwtPayload,
    @Req() req: RequestWithResolvedAuthContext,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Body() dto: UpdateClassTuitionDto,
  ) {
    const classDetail = await this.classService.updateClassTuition(id, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
    return redactAdminClassResponse(
      classDetail,
      user.roleType,
      req.resolvedStaffRoles ?? [],
    );
  }

  @Patch(':id/pricing-mode')
  @ApiOperation({
    summary: 'Đổi chế độ tính tiền của lớp',
    description:
      'Theo buổi (mặc định), theo block 30 phút, hoặc một lần (one_time: học phí cả khoá ở buổi tính phí đầu tiên). Giữa per_session và per_block, buổi unpaid được tính lại học phí/trợ cấp/snapshot; buổi paid, deposit hoặc cọc không đổi. Đổi có dính one_time không tính lại buổi nào, để không đụng ví. Từ chối bật theo block nếu không suy được số block chuẩn từ lịch cố định.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: UpdateClassPricingModeDto })
  @ApiResponse({ status: 200, description: 'Class updated.' })
  @ApiResponse({
    status: 400,
    description: 'Không suy được số block chuẩn, hoặc payload không hợp lệ.',
  })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
  async updateClassPricingMode(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Body() dto: UpdateClassPricingModeDto,
  ) {
    return this.classService.updateClassPricingMode(id, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id/teachers')
  @ApiOperation({
    summary: 'Update class teachers',
    description:
      'Replace the list of teachers for the class. Omit custom_allowance to preserve an existing override or inherit the class default for new teachers; send null to clear an override. If operating_deduction_rate_percent is omitted, backend persists 0 for new assignments.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: UpdateClassTeachersDto })
  @ApiResponse({ status: 200, description: 'Class updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
  async updateClassTeachers(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Body() dto: UpdateClassTeachersDto,
  ) {
    return this.classService.updateClassTeachers(id, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id/teacher-compensation')
  // Follow-up grill 13/11: Kế toán chi chỉ xem lương gia sư theo lớp. Route
  // giữ allowlist để người kiêm Kế toán chi + Trưởng ban Đào tạo / Quản lý
  // lớp của lớp vào được; quyền sửa kiểm ở handler (hợp quyền).
  @AllowStaffRolesOnAdminRoutes(StaffRole.accountant_expense)
  @ApiOperation({
    summary: 'Update class teacher compensation',
    description:
      'Update custom allowance and/or operating deduction rate for existing class teachers only. Send only teachers and fields that changed; omit a field to leave it unchanged; send custom_allowance null to inherit the class default. Follow-up grill 13/11: Admin sửa; Kế toán chi chỉ xem (403), trừ khi kiêm Trưởng ban Đào tạo hoặc Quản lý lớp của lớp này. Không sửa lương của chính mình (#265). Response bỏ học phí / số dư ví theo người xem.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: UpdateClassTeacherCompensationDto })
  @ApiResponse({
    status: 200,
    description: 'Class teacher compensation updated.',
  })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({
    status: 403,
    description:
      'Kế toán chi không kiêm Trưởng ban Đào tạo / Quản lý lớp của lớp (chỉ xem lương gia sư theo lớp), hoặc sửa lương của chính mình (#265).',
  })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  async updateClassTeacherCompensation(
    @CurrentUser() user: JwtPayload,
    @Req() req: RequestWithResolvedAuthContext,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Body() dto: UpdateClassTeacherCompensationDto,
  ) {
    // Admin / Trưởng ban Đào tạo / Quản lý lớp của lớp; Kế toán chi thuần → 403.
    await this.staffOperationsAccess.resolveClassTeacherManagerScope(
      user.id,
      user.roleType,
      id,
    );
    const updated = await this.classService.updateClassTeacherCompensation(
      id,
      dto,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
    return redactAdminClassResponse(
      updated,
      user.roleType,
      req.resolvedStaffRoles ?? [],
    );
  }

  @Patch(':id/schedule')
  @ApiOperation({
    summary: 'Update class schedule',
    description:
      'Upsert schedule slots (array of { dayOfWeek, from, to, teacherId } in HH:mm:ss). ' +
      'Slot đang active nhưng không có trong `schedule` sẽ được GIỮ NGUYÊN — muốn xoá phải liệt kê id trong `removedEntryIds`. ' +
      'Truyền `expectedUpdatedAt` (lấy từ response GET class gần nhất) để bật optimistic lock, tránh ghi đè thay đổi của người khác.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: UpdateClassScheduleDto })
  @ApiResponse({ status: 200, description: 'Class updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  @ApiResponse({
    status: 409,
    description:
      'Lịch vừa bị người khác cập nhật (optimistic lock) hoặc đang có request khác xử lý cùng lớp.',
  })
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
  async updateClassSchedule(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Body() dto: UpdateClassScheduleDto,
  ) {
    return this.classService.updateClassSchedule(id, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id/students')
  @ApiOperation({
    summary: 'Update class students',
    description:
      'Replace the list of students in the class (thêm/bớt học sinh). Admin + Trưởng phòng Sale & CSKH (#273). ' +
      'Lớp đang chưa có học sinh đang học mà chưa có Học phí lớp theo cách thu đang chọn → 400 (0đ tính là đã điền; học phí riêng của học sinh không thay được).',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: UpdateClassStudentsDto })
  @ApiResponse({ status: 200, description: 'Class updated.' })
  @ApiResponse({
    status: 400,
    description:
      'Validation error, hoặc «Lớp chưa có học phí. Hãy điền Học phí lớp trước khi thêm học sinh đầu tiên.»',
  })
  @ApiResponse({
    status: 403,
    description: 'Chỉ Admin và Trưởng phòng Sale & CSKH.',
  })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  // #273: thêm/bớt học sinh trong lớp — Admin + Trưởng phòng Sale & CSKH.
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE)
  async updateClassStudents(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Body() dto: UpdateClassStudentsDto,
  ) {
    return this.classService.updateClassStudents(id, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post(':id/end')
  @ApiOperation({
    summary: 'End class operations',
    description:
      'Set class status to ended, close active roster/teacher assignments, clear fixed schedule, and remove future makeup events.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: ClassStatusActionDto, required: false })
  @ApiResponse({
    status: 200,
    description:
      'Class ended. Response = class detail + `calendarSyncWarnings: string[]` (Google Calendar cleanup errors after commit; class is still ended).',
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation error (class already ended or teacher sessions not fully paid).',
  })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
  async endClass(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Body() dto: ClassStatusActionDto,
  ) {
    return this.classService.endClass(id, dto ?? {}, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post(':id/teachers/:teacherId/stop-teaching')
  @ApiOperation({
    summary: 'Mark a teacher as stopped teaching this class',
    description:
      'Marks the class-teacher assignment inactive, removes future fixed schedule slots for that teacher, and removes related future makeup events.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiParam({ name: 'teacherId', description: 'Staff id of the teacher' })
  @ApiBody({ type: ClassStatusActionDto, required: false })
  @ApiResponse({
    status: 200,
    description:
      'Teacher assignment stopped. Response = class detail + `calendarSyncWarnings: string[]` (Google Calendar cleanup errors after commit).',
  })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({
    status: 404,
    description: 'Class or teacher assignment not found.',
  })
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
  async stopClassTeacher(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Param('teacherId', new ParseStaffIdPipe()) teacherId: string,
    @Body() dto: ClassStatusActionDto,
  ) {
    return this.classService.stopClassTeacher(id, teacherId, dto ?? {}, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id/student-tuition')
  // #272: học phí riêng của học sinh — Admin, TP Sale & CSKH, Kế toán thu.
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE, StaffRole.accountant_income)
  @ApiOperation({
    summary: 'Update one student tuition in class',
    description:
      'Học phí riêng của học sinh trong lớp (override / gói riêng) cho một quan hệ học sinh–lớp đã có. Does not change roster. Admin, Trưởng phòng Sale & CSKH và Kế toán thu sửa (#272); Kế toán chi 403. Response bỏ lương gia sư với người không được xem.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: UpdateClassStudentTuitionDto })
  @ApiResponse({ status: 200, description: 'Student tuition updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({
    status: 403,
    description:
      'Chỉ Admin, Trưởng phòng Sale & CSKH, Kế toán thu sửa học phí riêng.',
  })
  @ApiResponse({
    status: 404,
    description: 'Class or student-class relation not found.',
  })
  async updateClassStudentTuition(
    @CurrentUser() user: JwtPayload,
    @Req() req: RequestWithResolvedAuthContext,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Body() dto: UpdateClassStudentTuitionDto,
  ) {
    const classDetail = await this.classService.updateClassStudentTuition(
      id,
      dto,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
    return redactAdminClassResponse(
      classDetail,
      user.roleType,
      req.resolvedStaffRoles ?? [],
    );
  }

  @Get(':id/makeup-events')
  @ApiOperation({
    summary: 'List class makeup schedule events',
    description: 'Read one-off makeup schedule events for a class.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'List of makeup schedule events for the class.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/MakeupScheduleEventDto' },
        },
        total: { type: 'number', example: 2 },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Role không được xem lớp.' })
  @AllowStaffRolesOnAdminRoutes(...CLASS_VIEWER_STAFF_ROLES)
  async listMakeupEventsByClassId(
    @Param('id', new ParseClassIdPipe()) id: string,
    @Query() filters: ClassScheduleFilterDto,
  ): Promise<{
    success: boolean;
    data: MakeupScheduleEventDto[];
    total: number;
  }> {
    return this.calendarService.listMakeupScheduleEventsForClass(id, filters);
  }

  @Post(':id/schedule/google-calendar/resync')
  @ApiOperation({
    summary: 'Resync class schedule to Google Calendar',
    description:
      'Treat Class.schedule as the system of record, update existing Google recurring events first, recreate stale/missing events, then delete orphaned Google events.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiResponse({
    status: 200,
    description: 'Class schedule resynced to Google Calendar.',
    type: ClassScheduleGoogleCalendarResyncResponseDto,
  })
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
  async resyncClassScheduleGoogleCalendar(
    @Param('id', new ParseClassIdPipe()) id: string,
  ): Promise<ClassScheduleGoogleCalendarResyncResponseDto> {
    return this.calendarService.resyncClassScheduleWithGoogleCalendar(id);
  }

  @Post(':id/makeup-events/:eventId/google-calendar/resync')
  @ApiOperation({
    summary: 'Resync one makeup event to Google Calendar',
    description:
      'Treat the makeup_schedule_events row as the system of record and update or recreate the Google Calendar event.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiParam({ name: 'eventId', description: 'Makeup event id' })
  @ApiResponse({
    status: 200,
    description: 'Makeup event resynced to Google Calendar.',
    type: MakeupGoogleCalendarResyncResponseDto,
  })
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
  async resyncClassMakeupGoogleCalendar(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ): Promise<MakeupGoogleCalendarResyncResponseDto> {
    return this.calendarService.resyncMakeupScheduleEventWithGoogleCalendarForClass(
      id,
      eventId,
      {
        actor: {
          userId: user.id,
          userEmail: user.email,
          roleType: user.roleType,
        },
      },
    );
  }

  @Get('missing-standard-blocks')
  @ApiOperation({
    summary: 'List classes missing a standard 30-minute block count',
    description:
      'Classes without a unique active class_schedule_entries duration (to − from) that is a whole multiple of 30 minutes. Admin must enter per-block rates by hand for these classes.',
  })
  @ApiResponse({
    status: 200,
    description: 'Classes that could not be backfilled with per-block rates.',
  })
  listClassesMissingStandardBlockCount() {
    return this.classService.listClassesMissingStandardBlockCount();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get class by id',
    description: 'Get a single class record by id.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiResponse({
    status: 200,
    description:
      'Class found. Trưởng phòng Sale & CSKH / Kế toán thu: không có lương gia sư; Kế toán chi: không có học phí nhưng giữ số dư ví học sinh (#272). Trưởng ban Đào tạo: không có học phí, không số dư ví học sinh (#274/#277); kiêm role xem được ví thì thấy ví (follow-up grill 13/11). Trưởng ban Đào tạo thuần: `students[]` chỉ còn tên, trạng thái, CSKH, số buổi (không email / SĐT / phụ huynh / hồ sơ — quyết định 13/11).',
  })
  @ApiResponse({ status: 403, description: 'Role không được xem lớp.' })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  @AllowStaffRolesOnAdminRoutes(...CLASS_VIEWER_STAFF_ROLES)
  async getClassById(
    @CurrentUser() user: JwtPayload,
    @Req() req: RequestWithResolvedAuthContext,
    @Param('id', new ParseClassIdPipe()) id: string,
  ) {
    const classDetail = await this.classService.getClassById(id);
    // #277 + follow-up grill 13/11: Trưởng ban Đào tạo không thấy số dư ví;
    // kiêm Kế toán chi / Kế toán thu / Trưởng phòng thì thấy (hợp quyền).
    return redactAdminClassResponse(
      classDetail,
      user.roleType,
      req.resolvedStaffRoles ?? [],
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Create class',
    description:
      'Create a new class record. Class id is auto-generated by backend. Optional student_tuition_per_block stores the class / 30 phút tuition rate as typed; omit or null to derive from student_tuition_per_session. The block field never writes student_tuition_per_session. #274: Admin gửi mọi trường. Trưởng ban Đào tạo: thông tin lớp (name, course_id, max_students) + gia sư (teacher_ids/teachers) + Quản lý lớp (training_manager_staff_id) + lương gia sư (allowance_per_session_per_student, max_allowance_per_session, scale_amount, trợ cấp riêng/scale riêng/% vận hành từng gia sư); không học phí, không học sinh, không tự gán mình làm gia sư. Trưởng phòng Sale & CSKH: thông tin lớp + học phí (tuỳ chọn) + student_ids. Mang cả hai role → hợp hai tập trường. schedule, pricing_mode, no_attendance và status khác running chỉ Admin. Gửi trường ngoài quyền → 403 liệt kê trường bị từ chối. Response bỏ học phí/lương gia sư theo role người xem.',
  })
  @ApiBody({ type: CreateClassDto, description: 'Class create payload' })
  @ApiResponse({ status: 201, description: 'Class created.' })
  @ApiResponse({
    status: 400,
    description:
      'Validation error, hoặc có student_ids mà lớp chưa có học phí theo cách thu (#273), hoặc Quản lý lớp không phải nhân sự Đào Tạo/gia sư đang hoạt động.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Role không được tạo lớp, gửi trường ngoài quyền, hoặc tự gán mình làm gia sư (#274/#265).',
  })
  // #274: Admin + Trưởng ban Đào tạo + Trưởng phòng; giới hạn trường ở service.
  @AllowStaffRolesOnAdminRoutes(StaffRole.training_head, SALE_CS_HEAD_ROLE)
  async createClass(
    @CurrentUser() user: JwtPayload,
    @Req() req: RequestWithResolvedAuthContext,
    @Body() data: CreateClassDto,
  ) {
    const created = await this.classService.createClass(data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
    return redactAdminClassResponse(
      created,
      user.roleType,
      req.resolvedStaffRoles ?? [],
    );
  }

  @Post(':id/surveys')
  @ApiOperation({
    summary: 'Create class survey',
    description:
      'Create one class survey report. Responsible teacher must belong to the class.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: CreateClassSurveyDto })
  @ApiResponse({ status: 201, description: 'Class survey created.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
  async createClassSurvey(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Body() dto: CreateClassSurveyDto,
  ) {
    return this.classSurveyService.createClassSurvey(id, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post(':id/makeup-events')
  @ApiOperation({
    summary: 'Create class makeup schedule event',
    description: 'Create one makeup event for the specified class.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: CreateClassScopedMakeupScheduleEventDto })
  @ApiResponse({
    status: 201,
    description: 'Makeup schedule event created.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: { $ref: '#/components/schemas/MakeupScheduleEventDto' },
      },
    },
  })
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
  async createMakeupEventByClassId(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Body() dto: CreateClassScopedMakeupScheduleEventDto,
  ): Promise<{ success: boolean; data: MakeupScheduleEventDto }> {
    return this.calendarService.createMakeupScheduleEventForClass(id, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch()
  @ApiOperation({
    summary: 'Update class',
    description:
      'Update a class record except schedule. Schedule changes must use PATCH /class/:id/schedule.',
  })
  @ApiBody({
    type: UpdateClassDto,
    description: 'Class update payload (id required)',
  })
  @ApiResponse({ status: 200, description: 'Class updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 403, description: 'Chỉ Admin.' })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  // #272: trước đây kế thừa danh sách kế toán cấp class → kế toán ghi được
  // thông tin lớp. Nay chỉ Admin.
  @AllowStaffRolesOnAdminRoutes()
  async updateClass(
    @CurrentUser() user: JwtPayload,
    @Body() data: UpdateClassDto,
  ) {
    return this.classService.updateClass(data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id/surveys/:surveyId')
  @ApiOperation({
    summary: 'Update class survey',
    description:
      'Update one class survey report. Responsible teacher must belong to the class.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiParam({ name: 'surveyId', description: 'Survey id' })
  @ApiBody({ type: UpdateClassSurveyDto })
  @ApiResponse({ status: 200, description: 'Class survey updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Class survey not found.' })
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
  async updateClassSurvey(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Param('surveyId', new ParseUUIDPipe()) surveyId: string,
    @Body() dto: UpdateClassSurveyDto,
  ) {
    return this.classSurveyService.updateClassSurvey(id, surveyId, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id/makeup-events/:eventId')
  @ApiOperation({
    summary: 'Update class makeup schedule event',
    description: 'Update one makeup event that belongs to the specified class.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiParam({ name: 'eventId', description: 'Makeup event id' })
  @ApiBody({ type: UpdateClassScopedMakeupScheduleEventDto })
  @ApiResponse({
    status: 200,
    description: 'Makeup schedule event updated.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: { $ref: '#/components/schemas/MakeupScheduleEventDto' },
      },
    },
  })
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
  async updateMakeupEventByClassId(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() dto: UpdateClassScopedMakeupScheduleEventDto,
  ): Promise<{ success: boolean; data: MakeupScheduleEventDto }> {
    return this.calendarService.updateMakeupScheduleEventForClass(
      id,
      eventId,
      dto,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete class',
    description: 'Delete a class record by id.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiResponse({ status: 200, description: 'Class deleted.' })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
  async deleteClass(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
  ) {
    return this.classService.deleteClass(id, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':id/surveys/:surveyId')
  @ApiOperation({
    summary: 'Delete class survey',
    description: 'Delete one class survey report.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiParam({ name: 'surveyId', description: 'Survey id' })
  @ApiResponse({ status: 200, description: 'Class survey deleted.' })
  @ApiResponse({ status: 404, description: 'Class survey not found.' })
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
  async deleteClassSurvey(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Param('surveyId', new ParseUUIDPipe()) surveyId: string,
  ) {
    return this.classSurveyService.deleteClassSurvey(id, surveyId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':id/makeup-events/:eventId')
  @ApiOperation({
    summary: 'Delete class makeup schedule event',
    description: 'Delete one makeup event that belongs to the specified class.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiParam({ name: 'eventId', description: 'Makeup event id' })
  @ApiResponse({
    status: 200,
    description: 'Makeup schedule event deleted.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
      },
    },
  })
  // #267: chỉ Admin (không kế thừa danh sách staff role cấp class).
  @AllowStaffRolesOnAdminRoutes()
  async deleteMakeupEventByClassId(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ): Promise<{ success: boolean }> {
    return this.calendarService.deleteMakeupScheduleEventForClass(id, eventId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }
}
