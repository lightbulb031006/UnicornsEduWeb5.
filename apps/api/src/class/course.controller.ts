import {
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
  AssignCourseLessonPlanMembersDto,
  CreateCourseDifficultyLevelDto,
  CreateCourseDto,
  ReorderCourseDifficultyLevelsDto,
  UpdateCourseDifficultyLevelDto,
  UpdateCourseDto,
} from 'src/dtos/course.dto';
import { CourseAccessService } from './course-access.service';
import { CourseService } from './course.service';

@Controller('courses')
@ApiTags('courses')
@ApiCookieAuth('access_token')
@Roles(UserRole.admin, UserRole.staff)
export class CourseController {
  constructor(
    private readonly courseService: CourseService,
    private readonly courseAccess: CourseAccessService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List courses',
    description:
      'Danh sách khoá học (VIP, Basic, Advance, Hardcore, THPT Basic, ...). Dùng cho dropdown chọn khoá khi tạo/sửa lớp. Lọc phía server theo người gọi: `lesson_plan` thuần chỉ nhận khoá được phân công; mọi role khác (kể cả `lesson_plan_head`, training, giáo viên, kế toán) nhận toàn bộ danh sách. Không nhận cờ lọc từ client.',
  })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    description: 'Include deactivated courses (admin only).',
  })
  @ApiResponse({ status: 200, description: 'List of courses.' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập.' })
  async list(
    @CurrentUser() user: JwtPayload,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const actor = await this.courseAccess.resolveActor(user.id, user.roleType);
    const listableCourseIds =
      await this.courseAccess.resolveListableCourseIds(actor);
    return this.courseService.list(
      includeInactive === 'true',
      listableCourseIds,
    );
  }

  @Get('lesson-plan-staff')
  @ApiOperation({
    summary: 'Search assignable lesson-plan staff',
    description:
      'Tìm nhân sự active có vai trò lesson_plan/lesson_plan_head để gán vào đội giáo án của khoá.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of lesson-plan staff.' })
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.lesson_plan_head)
  async searchLessonPlanStaff(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Number(limit);
    return this.courseService.searchLessonPlanStaff(
      search,
      Number.isInteger(parsedLimit) ? parsedLimit : 20,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a course detail',
    description:
      'Chi tiết khoá học kèm thang mức độ khó và đội giáo án. Mở cho admin/trợ lí/trưởng giáo án; thành viên lesson_plan chỉ xem khoá mình được gán.',
  })
  @ApiParam({ name: 'id', description: 'Course id' })
  @ApiResponse({ status: 200, description: 'Course detail.' })
  @ApiResponse({ status: 403, description: 'Không có quyền xem khoá này.' })
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan_head,
    StaffRole.lesson_plan,
  )
  async getById(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const actor = await this.courseAccess.resolveActor(user.id, user.roleType);
    await this.courseAccess.assertCanManageCourse(actor, id);
    return this.courseService.getDetail(id);
  }

  @Post()
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.lesson_plan_head)
  @ApiOperation({
    summary: 'Create a new course',
    description:
      'Tạo khoá học. Mở cho admin, trợ lí, trưởng giáo án. default_duration_days để trống nghĩa là vô hạn.',
  })
  @ApiBody({ type: CreateCourseDto })
  @ApiResponse({ status: 201, description: 'Course created.' })
  async create(@Body() dto: CreateCourseDto) {
    return this.courseService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.lesson_plan_head)
  @ApiOperation({
    summary: 'Update a course',
    description:
      'Cập nhật khoá học (kể cả bật/tắt is_active). Mở cho admin, trợ lí, trưởng giáo án. default_duration_days truyền null để chuyển về vô hạn.',
  })
  @ApiParam({ name: 'id', description: 'Course id' })
  @ApiBody({ type: UpdateCourseDto })
  @ApiResponse({ status: 200, description: 'Course updated.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.courseService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.lesson_plan_head)
  @ApiOperation({
    summary: 'Delete a course',
    description:
      'Mở cho admin, trợ lí, trưởng giáo án. Chỉ xoá được khi không còn lớp nào dùng khoá học này. Nếu muốn ẩn tạm thời, dùng PATCH với is_active=false.',
  })
  @ApiParam({ name: 'id', description: 'Course id' })
  @ApiResponse({ status: 200, description: 'Course deleted.' })
  @ApiResponse({
    status: 400,
    description:
      'Không thể xoá khi còn lớp đang dùng khoá học này (message tiếng Việt).',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.courseService.remove(id);
  }

  // ── Difficulty levels ──

  @Get(':id/difficulty-levels')
  @ApiOperation({ summary: 'List difficulty levels of a course' })
  @ApiParam({ name: 'id', description: 'Course id' })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    description: 'Include deactivated difficulty levels.',
  })
  @ApiResponse({ status: 200, description: 'List of difficulty levels.' })
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan_head,
    StaffRole.lesson_plan,
  )
  async listDifficultyLevels(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const actor = await this.courseAccess.resolveActor(user.id, user.roleType);
    await this.courseAccess.assertCanManageCourse(actor, id);
    return this.courseService.listDifficultyLevels(
      id,
      includeInactive === 'true',
    );
  }

  @Post(':id/difficulty-levels')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan_head,
    StaffRole.lesson_plan,
  )
  @ApiOperation({ summary: 'Add a difficulty level to a course' })
  @ApiParam({ name: 'id', description: 'Course id' })
  @ApiBody({ type: CreateCourseDifficultyLevelDto })
  @ApiResponse({ status: 201, description: 'Difficulty level created.' })
  async createDifficultyLevel(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCourseDifficultyLevelDto,
  ) {
    const actor = await this.courseAccess.resolveActor(user.id, user.roleType);
    return this.courseService.createDifficultyLevel(actor, id, dto);
  }

  @Patch(':id/difficulty-levels/reorder')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan_head,
    StaffRole.lesson_plan,
  )
  @ApiOperation({ summary: 'Reorder difficulty levels of a course' })
  @ApiParam({ name: 'id', description: 'Course id' })
  @ApiBody({ type: ReorderCourseDifficultyLevelsDto })
  @ApiResponse({ status: 200, description: 'Difficulty levels reordered.' })
  async reorderDifficultyLevels(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderCourseDifficultyLevelsDto,
  ) {
    const actor = await this.courseAccess.resolveActor(user.id, user.roleType);
    return this.courseService.reorderDifficultyLevels(actor, id, dto);
  }

  @Patch(':id/difficulty-levels/:levelId')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan_head,
    StaffRole.lesson_plan,
  )
  @ApiOperation({ summary: 'Update a difficulty level' })
  @ApiParam({ name: 'id', description: 'Course id' })
  @ApiParam({ name: 'levelId', description: 'Difficulty level id' })
  @ApiBody({ type: UpdateCourseDifficultyLevelDto })
  @ApiResponse({ status: 200, description: 'Difficulty level updated.' })
  async updateDifficultyLevel(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('levelId', ParseUUIDPipe) levelId: string,
    @Body() dto: UpdateCourseDifficultyLevelDto,
  ) {
    const actor = await this.courseAccess.resolveActor(user.id, user.roleType);
    return this.courseService.updateDifficultyLevel(actor, id, levelId, dto);
  }

  @Delete(':id/difficulty-levels/:levelId')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan_head,
    StaffRole.lesson_plan,
  )
  @ApiOperation({ summary: 'Delete a difficulty level' })
  @ApiParam({ name: 'id', description: 'Course id' })
  @ApiParam({ name: 'levelId', description: 'Difficulty level id' })
  @ApiResponse({ status: 200, description: 'Difficulty level deleted.' })
  async removeDifficultyLevel(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('levelId', ParseUUIDPipe) levelId: string,
  ) {
    const actor = await this.courseAccess.resolveActor(user.id, user.roleType);
    return this.courseService.removeDifficultyLevel(actor, id, levelId);
  }

  // ── Lesson plan members ──

  @Get(':id/lesson-plan-members')
  @ApiOperation({ summary: 'List lesson plan members of a course' })
  @ApiParam({ name: 'id', description: 'Course id' })
  @ApiResponse({ status: 200, description: 'List of lesson plan members.' })
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan_head,
    StaffRole.lesson_plan,
  )
  async listLessonPlanMembers(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const actor = await this.courseAccess.resolveActor(user.id, user.roleType);
    await this.courseAccess.assertCanManageCourse(actor, id);
    return this.courseService.listLessonPlanMembers(id);
  }

  @Put(':id/lesson-plan-members')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.lesson_plan_head)
  @ApiOperation({
    summary: 'Assign lesson plan members to a course',
    description:
      'Thay thế toàn bộ đội giáo án của khoá. Chỉ admin, trợ lí, trưởng giáo án được gán; chỉ gán được nhân sự active có vai trò lesson_plan/lesson_plan_head.',
  })
  @ApiParam({ name: 'id', description: 'Course id' })
  @ApiBody({ type: AssignCourseLessonPlanMembersDto })
  @ApiResponse({ status: 200, description: 'Lesson plan members updated.' })
  async assignLessonPlanMembers(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignCourseLessonPlanMembersDto,
  ) {
    const actor = await this.courseAccess.resolveActor(user.id, user.roleType);
    return this.courseService.assignLessonPlanMembers(actor, id, dto);
  }
}
