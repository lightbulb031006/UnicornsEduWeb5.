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
import { StaffRole, UserRole } from 'generated/enums';
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
import { StaffOperationsAccessService } from 'src/staff-ops/staff-operations-access.service';
import { ClassService } from './class.service';
import { ClassSurveyService } from './class-survey.service';

const ELEVATED_CLASS_ACCESS_ROLES: readonly StaffRole[] = [
  StaffRole.admin,
  StaffRole.assistant,
  StaffRole.accountant,
  StaffRole.accountant_income,
  StaffRole.accountant_expense,
];

function isTeacherScopedActor(roles: StaffRole[]) {
  return (
    roles.includes(StaffRole.teacher) &&
    !roles.some((role) => ELEVATED_CLASS_ACCESS_ROLES.includes(role))
  );
}

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

  private async resolveMakeupManagementTeacherScope(
    user: JwtPayload,
    classId: string,
    eventId: string,
    dto?: UpdateClassScopedMakeupScheduleEventDto,
  ): Promise<string | undefined> {
    if (user.roleType === UserRole.admin) {
      return undefined;
    }

    const actor = await this.staffOperationsAccess.resolveClassViewerActor(
      user.id,
      user.roleType,
    );

    if (
      actor.roles.includes(StaffRole.admin) ||
      actor.roles.includes(StaffRole.assistant)
    ) {
      return undefined;
    }

    if (isTeacherScopedActor(actor.roles)) {
      await this.staffOperationsAccess.assertTeacherAssignedToClass(
        actor.id,
        classId,
      );
      await this.calendarService.assertTeacherCanManageMakeupScheduleEventForClass(
        classId,
        eventId,
        actor.id,
      );

      if (dto?.teacherId && dto.teacherId !== actor.id) {
        throw new ForbiddenException(
          'Teacher chỉ được quản lý buổi bù do chính mình phụ trách.',
        );
      }

      return actor.id;
    }

    throw new ForbiddenException(
      'Chỉ admin, trợ lí hoặc teacher phụ trách buổi bù mới được quản lý buổi bù trong staff workspace.',
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List classes for staff operations',
    description:
      'List classes for staff operations UI. Finance and student/teacher mutations remain unavailable from this route family.',
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
      'Ban Đào Tạo kiêm gia sư: `managed` chỉ trả lớp mình quản lý (mặc định trả lớp mình dạy hoặc quản lý). Role khác bỏ qua.',
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
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiResponse({ status: 200, description: 'Class detail.' })
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
      'Create a new class for staff operations. Only minimal class metadata is accepted.',
  })
  @ApiBody({ type: CreateStaffOpsClassDto })
  @ApiResponse({ status: 201, description: 'Class created.' })
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
  async createMakeupEventByClassId(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @Body() dto: CreateClassScopedMakeupScheduleEventDto,
  ): Promise<{ success: boolean; data: MakeupScheduleEventDto }> {
    const actor = await this.staffOperationsAccess.resolveActor(
      user.id,
      user.roleType,
    );

    if (isTeacherScopedActor(actor.roles)) {
      await this.staffOperationsAccess.assertTeacherAssignedToClass(
        actor.id,
        id,
      );
      if (dto.teacherId !== actor.id) {
        throw new ForbiddenException(
          'Teacher chỉ được tạo buổi bù với chính mình là người phụ trách.',
        );
      }
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
      'Quản lý lớp (Ban Đào Tạo), trợ lí hoặc admin chỉnh trợ cấp/hs, trần trợ cấp, scale mặc định của lớp và trợ cấp/scale/% vận hành của gia sư đã có trong lớp. ' +
      'Không nhận học phí hay thông tin lớp khác. Quản lý lớp không được sửa dòng của chính mình (403). ' +
      'Chỉ áp dụng cho buổi tạo sau khi lưu.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: UpdateClassTeacherPayDto })
  @ApiResponse({ status: 200, description: 'Class detail (staff view).' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({
    status: 403,
    description: 'Không phải quản lý lớp, hoặc sửa dòng của chính mình.',
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
      'Gia sư mới tự thêm khung giờ của mình qua PATCH :id/schedule.',
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
    description: 'Không phải quản lý lớp, hoặc tự thêm chính mình.',
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
        'Quản lý lớp không được tự thêm chính mình làm gia sư.',
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
      'Chuyển phân công gia sư sang nghỉ dạy, xoá khung giờ cố định và buổi bù tương lai của gia sư đó. Quản lý lớp không được cho chính mình nghỉ (403).',
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
    description: 'Không phải quản lý lớp, hoặc cho chính mình nghỉ.',
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
        'Quản lý lớp không được tự cho chính mình nghỉ dạy.',
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
      'Truyền `expectedUpdatedAt` để bật optimistic lock.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: UpdateClassScheduleDto })
  @ApiResponse({ status: 200, description: 'Class schedule updated.' })
  @ApiResponse({
    status: 403,
    description: 'Gia sư cố sửa/xoá lịch của gia sư khác.',
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
      'Admin resyncs the whole class schedule. Staff accounts resync only the current actor teacher schedule entries. Existing Google events are updated before orphaned events are deleted.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiResponse({
    status: 200,
    description: 'Class schedule resynced to Google Calendar.',
    type: ClassScheduleGoogleCalendarResyncResponseDto,
  })
  async resyncClassScheduleGoogleCalendar(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
  ): Promise<ClassScheduleGoogleCalendarResyncResponseDto> {
    if (user.roleType === UserRole.admin) {
      return this.calendarService.resyncClassScheduleWithGoogleCalendar(id);
    }

    const actor = await this.staffOperationsAccess.resolveActor(
      user.id,
      user.roleType,
    );
    await this.staffOperationsAccess.assertTeacherAssignedToClass(actor.id, id);
    return this.calendarService.resyncClassScheduleWithGoogleCalendarForTeacher(
      id,
      actor.id,
    );
  }

  @Post(':id/makeup-events/:eventId/google-calendar/resync')
  @ApiOperation({
    summary: 'Resync one makeup event to Google Calendar for staff operations',
    description:
      'Admin resyncs any makeup event in the class. Staff accounts resync only makeup events assigned to their own staff profile.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiParam({ name: 'eventId', description: 'Makeup event id' })
  @ApiResponse({
    status: 200,
    description: 'Makeup event resynced to Google Calendar.',
    type: MakeupGoogleCalendarResyncResponseDto,
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

    const actor = await this.staffOperationsAccess.resolveActor(
      user.id,
      user.roleType,
    );
    await this.staffOperationsAccess.assertTeacherAssignedToClass(actor.id, id);
    return this.calendarService.resyncMakeupScheduleEventWithGoogleCalendarForClass(
      id,
      eventId,
      {
        teacherId: actor.id,
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
