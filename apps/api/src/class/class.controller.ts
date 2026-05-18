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
import { PaginationQueryDto } from 'src/dtos/pagination.dto';
import {
  CreateClassDto,
  UpdateClassBasicInfoDto,
  UpdateClassDto,
  UpdateClassScheduleDto,
  UpdateClassStudentsDto,
  UpdateClassTeachersDto,
} from 'src/dtos/class.dto';
import {
  ClassScheduleFilterDto,
  CreateClassScopedMakeupScheduleEventDto,
  MakeupScheduleEventDto,
  UpdateClassScopedMakeupScheduleEventDto,
} from 'src/dtos/class-schedule.dto';
import { CalendarService } from 'src/calendar/calendar.service';
import { ClassService } from './class.service';

@Controller('class')
@ApiTags('class')
@ApiCookieAuth('access_token')
@AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.accountant)
@Roles(UserRole.admin)
export class ClassController {
  constructor(
    private readonly classService: ClassService,
    private readonly calendarService: CalendarService,
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
    name: 'type',
    required: false,
    enum: ['vip', 'basic', 'advance', 'hardcore'],
    description: 'Filter by class type',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated class list with data and meta.',
  })
  async getClasses(
    @Query() query: PaginationQueryDto,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.classService.getClasses({
      ...query,
      search,
      status,
      type,
    });
  }

  @Get(':id/students')
  @ApiOperation({
    summary: 'Get students by class id',
    description: 'Get list of students enrolled in the class.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiResponse({ status: 200, description: 'List of students in the class.' })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  async getStudentsByClassId(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.classService.getStudentsByClassId(id);
  }

  @Patch(':id/basic-info')
  @ApiOperation({
    summary: 'Update class basic info',
    description:
      'Update basic info and tuition. When allowance_per_session_per_student is sent, all class_teachers.customAllowance for this class are set to that value.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: UpdateClassBasicInfoDto })
  @ApiResponse({ status: 200, description: 'Class updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  async updateClassBasicInfo(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateClassBasicInfoDto,
  ) {
    return this.classService.updateClassBasicInfo(id, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id/teachers')
  @ApiOperation({
    summary: 'Update class teachers',
    description:
      'Replace the list of teachers for the class. If a teacher omits custom_allowance, backend persists the class default allowance_per_session_per_student. If a teacher omits operating_deduction_rate_percent, backend persists 0.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: UpdateClassTeachersDto })
  @ApiResponse({ status: 200, description: 'Class updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  async updateClassTeachers(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateClassTeachersDto,
  ) {
    return this.classService.updateClassTeachers(id, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id/schedule')
  @ApiOperation({
    summary: 'Update class schedule',
    description:
      'Replace the class schedule (array of { dayOfWeek, from, to, teacherId } in HH:mm:ss).',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: UpdateClassScheduleDto })
  @ApiResponse({ status: 200, description: 'Class updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  async updateClassSchedule(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
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
    description: 'Replace the list of students in the class.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({ type: UpdateClassStudentsDto })
  @ApiResponse({ status: 200, description: 'Class updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  @AllowStaffRolesOnAdminRoutes()
  async updateClassStudents(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateClassStudentsDto,
  ) {
    return this.classService.updateClassStudents(id, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
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
  async listMakeupEventsByClassId(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() filters: ClassScheduleFilterDto,
  ): Promise<{
    success: boolean;
    data: MakeupScheduleEventDto[];
    total: number;
  }> {
    return this.calendarService.listMakeupScheduleEventsForClass(id, filters);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get class by id',
    description: 'Get a single class record by id.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiResponse({ status: 200, description: 'Class found.' })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  async getClassById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.classService.getClassById(id);
  }

  @Post()
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
  @ApiOperation({
    summary: 'Create class',
    description:
      'Create a new class record. Class id is auto-generated by backend.',
  })
  @ApiBody({ type: CreateClassDto, description: 'Class create payload' })
  @ApiResponse({ status: 201, description: 'Class created.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  async createClass(
    @CurrentUser() user: JwtPayload,
    @Body() data: CreateClassDto,
  ) {
    return this.classService.createClass(data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post(':id/makeup-events')
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
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
  async createMakeupEventByClassId(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateClassScopedMakeupScheduleEventDto,
  ): Promise<{ success: boolean; data: MakeupScheduleEventDto }> {
    return this.calendarService.createMakeupScheduleEventForClass(id, dto);
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
  @ApiResponse({ status: 404, description: 'Class not found.' })
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

  @Patch(':id/makeup-events/:eventId')
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
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
  async updateMakeupEventByClassId(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() dto: UpdateClassScopedMakeupScheduleEventDto,
  ): Promise<{ success: boolean; data: MakeupScheduleEventDto }> {
    return this.calendarService.updateMakeupScheduleEventForClass(
      id,
      eventId,
      dto,
    );
  }

  @Delete(':id')
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
  @ApiOperation({
    summary: 'Delete class',
    description: 'Delete a class record by id.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiResponse({ status: 200, description: 'Class deleted.' })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  async deleteClass(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.classService.deleteClass(id, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':id/makeup-events/:eventId')
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
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
  async deleteMakeupEventByClassId(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ): Promise<{ success: boolean }> {
    return this.calendarService.deleteMakeupScheduleEventForClass(id, eventId);
  }
}
