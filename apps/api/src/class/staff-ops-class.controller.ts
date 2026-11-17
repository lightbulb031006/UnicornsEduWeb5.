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
  Query,
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
import { UserRole } from 'generated/enums';
import {
  CurrentUser,
  type JwtPayload,
} from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import {
  AddClassTeacherDto,
  ClassStatusActionDto,
  CreateStaffOpsClassDto,
  UpdateClassScheduleDto,
  UpdateClassTeacherPayDto,
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
import { PaginationQueryDto } from 'src/dtos/pagination.dto';
import { CalendarService } from 'src/calendar/calendar.service';
import {
  StaffOperationsAccessService,
  canWorkOnAllClassSessions,
} from 'src/staff-ops/staff-operations-access.service';
import { ClassService } from './class.service';
import { ClassSurveyService } from './class-survey.service';

@Controller('staff-ops/classes')
@ApiTags('staff-ops-classes')
@ApiCookieAuth('access_token')
@Roles(UserRole.staff, UserRole.admin)
export class StaffOpsClassController {
  constructor(
    private readonly classService: ClassService,
    private readonly classSurveyService: ClassSurveyService,
    private readonly calendarService: CalendarService,
    private readonly staffOperationsAccess: StaffOperationsAccessService,
  ) {}

  /**
   * Buổi bù (#275): Admin + Quản lý lớp quản lý mọi buổi bù của lớp; gia sư chỉ
   * buổi bù do chính mình phụ trách. Trả `undefined` = không khoá gia sư.
   */
  private async resolveMakeupManagementTeacherScope(
    user: JwtPayload,
    classId: string,
    eventId: string,
    dto?: UpdateClassScopedMakeupScheduleEventDto,
  ): Promise<string | undefined> {
    const access = await this.staffOperationsAccess.resolveClassWorkAccess(
      user.id,
      user.roleType,
      classId,
    );

    if (canWorkOnAllClassSessions(access)) {
      return undefined;
    }

    if (access.isClassTeacher && access.staffId) {
      await this.calendarService.assertTeacherCanManageMakeupScheduleEventForClass(
        classId,
        eventId,
        access.staffId,
      );

      if (dto?.teacherId && dto.teacherId !== access.staffId) {
        throw new ForbiddenException(
          'Teacher chỉ được quản lý buổi bù do chính mình phụ trách.',
        );
      }

      return access.staffId;
    }

    throw new ForbiddenException(
      'Chỉ Admin, Quản lý lớp hoặc teacher phụ trách buổi bù mới được quản lý buổi bù trong staff workspace.',
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List classes for staff operations',
    description:
      'List classes for staff operations UI. Finance and student/teacher mutations remain unavailable from this route family. ' +
      '#277: Trưởng ban Đào tạo nhận **mọi lớp** (bỏ học phí lớp + học phí từng học sinh); `scope=managed` lọc về lớp mình quản lý.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['running', 'ended'] })
  @ApiQuery({
    name: 'courseId',
    required: false,
    description: 'Filter by course id (see GET /courses)',
  })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['managed'],
    description:
      'Ban Đào Tạo: `managed` chỉ trả lớp mình quản lý (mặc định: lớp mình dạy hoặc quản lý; Trưởng ban Đào tạo mặc định mọi lớp — #277). Role khác bỏ qua.',
  })
  @ApiResponse({ status: 200, description: 'Paginated class list.' })
  async getClasses(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQueryDto,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('courseId') courseId?: string,
    @Query('scope') scope?: string,
  ) {
    return this.classService.getClassesForStaff(user.id, user.roleType, {
      ...query,
      search,
      status,
      courseId,
      scope,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get class detail for staff operations',
    description:
      '#277: Trưởng ban Đào tạo xem mọi lớp: thông tin lớp, gia sư + lương gia sư theo lớp, lịch; không có học phí lớp / học phí từng học sinh / số dư ví. Quyết định 13/11: Trưởng ban Đào tạo, Quản lý lớp, gia sư nhận `students[]` chỉ gồm `id`, `fullName`, `status`, `customerCareStaff`, `totalAttendedSession` (không email / SĐT / phụ huynh / hồ sơ học sinh); CSKH, Admin, Kế toán giữ.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiResponse({ status: 200, description: 'Class detail.' })
  @ApiResponse({
    status: 403,
    description: 'Role không được mở màn chi tiết lớp.',
  })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  async getClassById(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
  ) {
    return this.classService.getClassByIdForStaff(user.id, user.roleType, id);
  }

  @Get(':id/surveys')
  @ApiOperation({
    summary: 'List class surveys for staff operations',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiQuery({ name: 'month', required: true, description: 'Tháng (01-12)' })
  @ApiQuery({ name: 'year', required: true, description: 'Năm (YYYY)' })
  @ApiResponse({
    status: 200,
    description: 'Class survey reports in selected month.',
  })
  async getClassSurveys(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.classSurveyService.getClassSurveysForStaff(
      user.id,
      user.roleType,
      id,
      { month, year },
    );
  }

  @Get(':id/makeup-events')
  @ApiOperation({
    summary: 'List class makeup events for staff operations',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'Makeup events for the selected class.',
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
  async listMakeupEventsByClassId(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Query() filters: ClassScheduleFilterDto,
  ): Promise<{
    success: boolean;
    data: MakeupScheduleEventDto[];
    total: number;
  }> {
    const actor = await this.staffOperationsAccess.resolveClassViewerActor(
      user.id,
      user.roleType,
    );
    await this.staffOperationsAccess.resolveClassViewAccessMode(actor, id);
    return this.calendarService.listMakeupScheduleEventsForClass(id, filters);
  }

  @Post()
  @ApiOperation({
    summary: 'Create class with minimal metadata',
    description:
      'Create a new class for staff operations. Only minimal class metadata is accepted. #274: chỉ Admin và Trưởng ban Đào tạo (Trưởng phòng Sale & CSKH dùng POST /class); lịch học (schedule) và trạng thái khác running chỉ Admin.',
  })
  @ApiBody({ type: CreateStaffOpsClassDto })
  @ApiResponse({ status: 201, description: 'Class created.' })
  @ApiResponse({
    status: 403,
    description:
      'Role không được tạo lớp, hoặc role trưởng gửi lịch học / trạng thái kết thúc (#274).',
  })
  async createClass(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateStaffOpsClassDto,
  ) {
    return this.classService.createClassForStaff(user.id, user.roleType, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post(':id/makeup-events')
  @ApiOperation({
    summary: 'Create class makeup event for staff operations',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: CreateClassScopedMakeupScheduleEventDto })
  @ApiResponse({ status: 201, description: 'Makeup event created.' })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Admin / Quản lý lớp / gia sư của lớp, hoặc gia sư đụng buổi bù của gia sư khác (#275).',
  })
  async createMakeupEventByClassId(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Body() dto: CreateClassScopedMakeupScheduleEventDto,
  ): Promise<{ success: boolean; data: MakeupScheduleEventDto }> {
    // #275: Admin / Quản lý lớp tạo buổi bù cho bất kỳ gia sư nào của lớp;
    // gia sư chỉ cho chính mình; lớp khác → 403.
    const access = await this.staffOperationsAccess.resolveClassWorkAccess(
      user.id,
      user.roleType,
      id,
    );

    if (
      !canWorkOnAllClassSessions(access) &&
      dto.teacherId !== access.staffId
    ) {
      throw new ForbiddenException(
        'Teacher chỉ được tạo buổi bù với chính mình là người phụ trách.',
      );
    }

    return this.calendarService.createMakeupScheduleEventForClass(id, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post(':id/surveys')
  @ApiOperation({
    summary: 'Create class survey for staff operations',
    description:
      'Teacher-scoped staff can only create a survey assigned to themselves.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: CreateClassSurveyDto })
  @ApiResponse({ status: 201, description: 'Class survey created.' })
  @ApiResponse({
    status: 403,
    description:
      'Khảo sát của lớp (#275): chỉ Admin, Quản lý lớp (mọi khảo sát của lớp) và gia sư của lớp (khảo sát do mình phụ trách).',
  })
  async createClassSurvey(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Body() dto: CreateClassSurveyDto,
  ) {
    return this.classSurveyService.createClassSurveyForStaff(
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

  @Patch(':id/teacher-pay')
  @ApiOperation({
    summary: 'Update teacher pay of a class (training manager)',
    description:
      'Admin, Trưởng ban Đào tạo (mọi lớp — #277) hoặc Quản lý lớp (lớp mình) chỉnh trợ cấp/hs, trần trợ cấp, scale mặc định của lớp và trợ cấp/scale/% vận hành của gia sư đã có trong lớp. ' +
      'Không nhận học phí, % trợ cấp quản lý lớp (chỉ Admin, qua PATCH /class/:id/training-manager) hay thông tin lớp khác. ' +
      '#276/#277: Quản lý lớp và Trưởng ban Đào tạo không được sửa phần lương của chính mình (403): dòng của mình, và khi đang dạy lớp thì cả trợ cấp tối đa, trợ cấp mỗi học sinh / scale mặc định mà dòng của mình đang kế thừa. ' +
      'Chỉ áp dụng cho buổi tạo sau khi lưu.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: UpdateClassTeacherPayDto })
  @ApiResponse({ status: 200, description: 'Class detail (staff view).' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Admin / Trưởng ban Đào tạo / Quản lý lớp của lớp, hoặc chạm phần lương của chính mình (#276/#277).',
  })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  async updateClassTeacherPay(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Body() dto: UpdateClassTeacherPayDto,
  ) {
    const scope =
      await this.staffOperationsAccess.resolveClassTeacherManagerScope(
        user.id,
        user.roleType,
        id,
      );
    await this.classService.updateClassTeacherPay(id, dto, scope, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
    return this.classService.getClassByIdForStaff(user.id, user.roleType, id);
  }

  @Post(':id/teachers')
  @ApiOperation({
    summary: 'Add a teacher to a class (training manager)',
    description:
      'Thêm 1 gia sư (staff role `teacher`, đang active) mà không đụng gia sư khác. Gia sư từng nghỉ dạy lớp này được mở lại với lương reset về mặc định lớp. ' +
      'Gia sư mới tự thêm khung giờ của mình qua PATCH :id/schedule. ' +
      'Quyền: Admin, Trưởng ban Đào tạo (mọi lớp — #277), Quản lý lớp (lớp mình); không tự thêm chính mình (403).',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: AddClassTeacherDto })
  @ApiResponse({ status: 201, description: 'Class detail (staff view).' })
  @ApiResponse({
    status: 400,
    description: 'Lớp đã kết thúc hoặc gia sư không active.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Admin / Trưởng ban Đào tạo / Quản lý lớp của lớp, hoặc tự thêm chính mình.',
  })
  @ApiResponse({ status: 404, description: 'Class or teacher not found.' })
  @ApiResponse({ status: 409, description: 'Gia sư đã ở trong lớp.' })
  async addClassTeacher(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Body() dto: AddClassTeacherDto,
  ) {
    const { lockedTeacherId } =
      await this.staffOperationsAccess.resolveClassTeacherManagerScope(
        user.id,
        user.roleType,
        id,
      );
    if (lockedTeacherId && dto.teacher_id === lockedTeacherId) {
      throw new ForbiddenException(
        'Không được tự thêm chính mình làm gia sư (lương của chính mình).',
      );
    }
    await this.classService.addClassTeacher(id, dto.teacher_id, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
    return this.classService.getClassByIdForStaff(user.id, user.roleType, id);
  }

  @Post(':id/teachers/:teacherId/stop-teaching')
  @ApiOperation({
    summary: 'Mark a teacher as stopped teaching (training manager)',
    description:
      'Chuyển phân công gia sư sang nghỉ dạy, xoá khung giờ cố định và buổi bù tương lai của gia sư đó. Quyền: Admin, Trưởng ban Đào tạo (mọi lớp — #277), Quản lý lớp (lớp mình); không được cho chính mình nghỉ (403).',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiParam({ name: 'teacherId', description: 'Staff id of the teacher' })
  @ApiBody({ type: ClassStatusActionDto, required: false })
  @ApiResponse({
    status: 201,
    description:
      'Class detail (staff view) + `calendarSyncWarnings: string[]` (Google Calendar cleanup errors after commit).',
  })
  @ApiResponse({
    status: 400,
    description: 'Lớp đã kết thúc hoặc gia sư đã nghỉ.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Admin / Trưởng ban Đào tạo / Quản lý lớp của lớp, hoặc cho chính mình nghỉ.',
  })
  @ApiResponse({
    status: 404,
    description: 'Class or teacher assignment not found.',
  })
  async stopClassTeacher(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Param('teacherId', new ParseStaffIdPipe()) teacherId: string,
    @Body() dto: ClassStatusActionDto,
  ) {
    const { lockedTeacherId } =
      await this.staffOperationsAccess.resolveClassTeacherManagerScope(
        user.id,
        user.roleType,
        id,
      );
    if (lockedTeacherId && teacherId === lockedTeacherId) {
      throw new ForbiddenException(
        'Không được tự cho chính mình nghỉ dạy (lương của chính mình).',
      );
    }
    const { calendarSyncWarnings } = await this.classService.stopClassTeacher(
      id,
      teacherId,
      dto ?? {},
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
    const classDetail = await this.classService.getClassByIdForStaff(
      user.id,
      user.roleType,
      id,
    );
    return { ...classDetail, calendarSyncWarnings };
  }

  @Patch(':id/schedule')
  @ApiOperation({
    summary: 'Update class schedule for staff operations',
    description:
      'Upsert schedule slots. Slot active nhưng vắng mặt trong `schedule` sẽ được giữ nguyên — ' +
      'xoá phải liệt kê id trong `removedEntryIds`. Gia sư (teacher-only role) chỉ được thêm/sửa/xoá ' +
      'slot có `teacherId` là chính mình; đụng vào slot của gia sư khác sẽ bị từ chối (403). ' +
      '#275: Admin và Quản lý lớp sửa mọi slot của lớp (Quản lý lớp không backdate `effectiveFrom`); ' +
      'lớp không được giao / Kế toán → 403. ' +
      'Truyền `expectedUpdatedAt` để bật optimistic lock.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: UpdateClassScheduleDto })
  @ApiResponse({ status: 200, description: 'Class schedule updated.' })
  @ApiResponse({
    status: 403,
    description:
      'Gia sư cố sửa/xoá lịch của gia sư khác, hoặc không phải Admin / gia sư / Quản lý lớp của lớp.',
  })
  @ApiResponse({
    status: 409,
    description: 'Lịch vừa bị người khác cập nhật (optimistic lock).',
  })
  async updateClassSchedule(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Body() dto: UpdateClassScheduleDto,
  ) {
    return this.classService.updateClassScheduleForStaff(
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

  @Post(':id/schedule/google-calendar/resync')
  @ApiOperation({
    summary: 'Resync class schedule to Google Calendar for staff operations',
    description:
      'Admin và Quản lý lớp (#276) resync toàn bộ lịch của lớp. Gia sư chỉ resync khung giờ của chính mình. Existing Google events are updated before orphaned events are deleted.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiResponse({
    status: 200,
    description: 'Class schedule resynced to Google Calendar.',
    type: ClassScheduleGoogleCalendarResyncResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Không phải Admin / Quản lý lớp / gia sư của lớp.',
  })
  async resyncClassScheduleGoogleCalendar(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
  ): Promise<ClassScheduleGoogleCalendarResyncResponseDto> {
    if (user.roleType === UserRole.admin) {
      return this.calendarService.resyncClassScheduleWithGoogleCalendar(id);
    }

    // #276: Admin (staff role) + Quản lý lớp đồng bộ lại toàn bộ lịch (link
    // Meet) của lớp; gia sư chỉ khung giờ của mình; lớp khác → 403.
    const access = await this.staffOperationsAccess.resolveClassWorkAccess(
      user.id,
      user.roleType,
      id,
    );
    if (canWorkOnAllClassSessions(access)) {
      return this.calendarService.resyncClassScheduleWithGoogleCalendar(id);
    }
    if (!access.staffId) {
      throw new ForbiddenException('Staff profile required');
    }
    return this.calendarService.resyncClassScheduleWithGoogleCalendarForTeacher(
      id,
      access.staffId,
    );
  }

  @Post(':id/makeup-events/:eventId/google-calendar/resync')
  @ApiOperation({
    summary: 'Resync one makeup event to Google Calendar for staff operations',
    description:
      'Admin và Quản lý lớp (#276) resync mọi buổi bù của lớp. Gia sư chỉ resync buổi bù do chính mình phụ trách.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiParam({ name: 'eventId', description: 'Makeup event id' })
  @ApiResponse({
    status: 200,
    description: 'Makeup event resynced to Google Calendar.',
    type: MakeupGoogleCalendarResyncResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Không phải Admin / Quản lý lớp / gia sư của lớp.',
  })
  async resyncClassMakeupGoogleCalendar(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ): Promise<MakeupGoogleCalendarResyncResponseDto> {
    if (user.roleType === UserRole.admin) {
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

    // #276: Admin (staff role) + Quản lý lớp đồng bộ mọi buổi bù của lớp;
    // gia sư chỉ buổi bù do mình phụ trách.
    const access = await this.staffOperationsAccess.resolveClassWorkAccess(
      user.id,
      user.roleType,
      id,
    );
    if (!access.staffId) {
      throw new ForbiddenException('Staff profile required');
    }
    return this.calendarService.resyncMakeupScheduleEventWithGoogleCalendarForClass(
      id,
      eventId,
      {
        ...(canWorkOnAllClassSessions(access)
          ? {}
          : { teacherId: access.staffId }),
        actor: {
          userId: user.id,
          userEmail: user.email,
          roleType: user.roleType,
        },
      },
    );
  }

  @Patch(':id/makeup-events/:eventId')
  @ApiOperation({
    summary: 'Update class makeup event for staff operations',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiParam({ name: 'eventId', description: 'Makeup event id' })
  @ApiBody({ type: UpdateClassScopedMakeupScheduleEventDto })
  @ApiResponse({ status: 200, description: 'Makeup event updated.' })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Admin / Quản lý lớp / gia sư của lớp, hoặc gia sư đụng buổi bù của gia sư khác (#275).',
  })
  async updateMakeupEventByClassId(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() dto: UpdateClassScopedMakeupScheduleEventDto,
  ): Promise<{ success: boolean; data: MakeupScheduleEventDto }> {
    const teacherScope = await this.resolveMakeupManagementTeacherScope(
      user,
      id,
      eventId,
      dto,
    );

    return this.calendarService.updateMakeupScheduleEventForClass(
      id,
      eventId,
      teacherScope ? { ...dto, teacherId: teacherScope } : dto,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Patch(':id/surveys/:surveyId')
  @ApiOperation({
    summary: 'Update class survey for staff operations',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiParam({ name: 'surveyId', description: 'Survey id' })
  @ApiBody({ type: UpdateClassSurveyDto })
  @ApiResponse({ status: 200, description: 'Class survey updated.' })
  @ApiResponse({
    status: 403,
    description:
      'Khảo sát của lớp (#275): chỉ Admin, Quản lý lớp (mọi khảo sát của lớp) và gia sư của lớp (khảo sát do mình phụ trách).',
  })
  async updateClassSurvey(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Param('surveyId', new ParseUUIDPipe()) surveyId: string,
    @Body() dto: UpdateClassSurveyDto,
  ) {
    return this.classSurveyService.updateClassSurveyForStaff(
      user.id,
      user.roleType,
      id,
      surveyId,
      dto,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Delete(':id/makeup-events/:eventId')
  @ApiOperation({
    summary: 'Delete class makeup event for staff operations',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiParam({ name: 'eventId', description: 'Makeup event id' })
  @ApiResponse({ status: 200, description: 'Makeup event deleted.' })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Admin / Quản lý lớp / gia sư của lớp, hoặc gia sư đụng buổi bù của gia sư khác (#275).',
  })
  async deleteMakeupEventByClassId(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ): Promise<{ success: boolean }> {
    await this.resolveMakeupManagementTeacherScope(user, id, eventId);

    return this.calendarService.deleteMakeupScheduleEventForClass(id, eventId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':id/surveys/:surveyId')
  @ApiOperation({
    summary: 'Delete class survey for staff operations',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiParam({ name: 'surveyId', description: 'Survey id' })
  @ApiResponse({ status: 200, description: 'Class survey deleted.' })
  @ApiResponse({
    status: 403,
    description:
      'Khảo sát của lớp (#275): chỉ Admin, Quản lý lớp (mọi khảo sát của lớp) và gia sư của lớp (khảo sát do mình phụ trách).',
  })
  async deleteClassSurvey(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Param('surveyId', new ParseUUIDPipe()) surveyId: string,
  ) {
    return this.classSurveyService.deleteClassSurveyForStaff(
      user.id,
      user.roleType,
      id,
      surveyId,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }
}
