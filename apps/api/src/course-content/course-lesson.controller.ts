import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from 'generated/enums';
import { AllowStaffRolesOnAdminRoutes } from 'src/auth/decorators/allow-staff-roles-on-admin.decorator';
import {
  CurrentUser,
  type JwtPayload,
} from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import {
  LessonCreateDto,
  LessonResponseDto,
  LessonUpdateDto,
} from 'src/dtos/course-content.dto';
import { CourseLessonService } from './course-lesson.service';
import { COURSE_TREE_STAFF_ROLES } from './course-tree-roles';

const COURSE_CONTENT_FORBIDDEN =
  'Không thuộc đội giáo án của khoá. Dạy lớp không đồng nghĩa soạn giáo án.';

const TREE_STAFF_DESC =
  'Staff: assistant, teacher, lesson_plan, lesson_plan_head.';

@Controller('course/:courseId/modules/:moduleId/lessons')
@ApiTags('course-lessons')
@ApiCookieAuth('access_token')
export class CourseLessonController {
  constructor(private readonly lessonService: CourseLessonService) {}

  @Post()
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(...COURSE_TREE_STAFF_ROLES)
  @ApiOperation({
    summary: 'Tạo tiết học mới trong chuyên đề (khoá học)',
    description:
      `${TREE_STAFF_DESC} Loại tiết: lý thuyết (video/nội dung) hoặc thực hành (chỉ câu hỏi).`,
  })
  @ApiParam({ name: 'courseId', description: 'ID khoá học' })
  @ApiParam({ name: 'moduleId', description: 'ID chuyên đề' })
  @ApiBody({ type: LessonCreateDto })
  @ApiResponse({
    status: 201,
    description: 'Tiết học đã được tạo.',
    type: Object,
  })
  @ApiResponse({
    status: 400,
    description: 'Lỗi khi tạo tiết học, hoặc tiết thực hành kèm video/nội dung.',
  })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  async createLesson(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: LessonCreateDto,
  ): Promise<LessonResponseDto> {
    return this.lessonService.createLesson(
      { ...dto, courseId, moduleId },
      { userId: user.id, userEmail: user.email, roleType: user.roleType },
    );
  }

  @Get()
  @Roles(UserRole.admin, UserRole.student)
  @AllowStaffRolesOnAdminRoutes(...COURSE_TREE_STAFF_ROLES)
  @ApiOperation({
    summary: 'Lấy danh sách tiết học trong chuyên đề (khoá học)',
    description: TREE_STAFF_DESC,
  })
  @ApiParam({ name: 'courseId', description: 'ID khoá học' })
  @ApiParam({ name: 'moduleId', description: 'ID chuyên đề' })
  @ApiResponse({ status: 200, description: 'Danh sách tiết học.' })
  async getLessons(
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
  ): Promise<LessonResponseDto[]> {
    return this.lessonService.getLessonsByCourseId(courseId, moduleId);
  }

  @Post('reorder')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(...COURSE_TREE_STAFF_ROLES)
  @ApiOperation({
    summary: 'Sắp xếp lại thứ tự tiết học trong chuyên đề',
    description: TREE_STAFF_DESC,
  })
  @ApiParam({ name: 'courseId', description: 'ID khoá học' })
  @ApiParam({ name: 'moduleId', description: 'ID chuyên đề' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { lessonIds: { type: 'array', items: { type: 'string' } } },
    },
  })
  @ApiResponse({ status: 200, description: 'Đã sắp xếp lại.' })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  async reorderLessons(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') _courseId: string,
    @Param('moduleId') moduleId: string,
    @Body('lessonIds') lessonIds: string[],
  ): Promise<void> {
    return this.lessonService.reorderLessons(
      lessonIds,
      { moduleId },
      { userId: user.id, userEmail: user.email, roleType: user.roleType },
    );
  }

  @Get(':lessonId')
  @Roles(UserRole.admin, UserRole.student)
  @AllowStaffRolesOnAdminRoutes(...COURSE_TREE_STAFF_ROLES)
  @ApiOperation({
    summary: 'Lấy chi tiết tiết học trong chuyên đề',
    description: TREE_STAFF_DESC,
  })
  @ApiParam({ name: 'courseId', description: 'ID khoá học' })
  @ApiParam({ name: 'moduleId', description: 'ID chuyên đề' })
  @ApiParam({ name: 'lessonId', description: 'ID tiết học' })
  @ApiResponse({ status: 200, description: 'Chi tiết tiết học.', type: Object })
  @ApiResponse({ status: 404, description: 'Tiết học không tồn tại.' })
  async getLesson(
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Param('lessonId') lessonId: string,
  ): Promise<LessonResponseDto> {
    return this.lessonService.getCourseLesson(courseId, moduleId, lessonId);
  }

  @Patch(':lessonId')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(...COURSE_TREE_STAFF_ROLES)
  @ApiOperation({
    summary: 'Cập nhật tiết học trong chuyên đề (khoá học)',
    description: TREE_STAFF_DESC,
  })
  @ApiParam({ name: 'courseId', description: 'ID khoá học' })
  @ApiParam({ name: 'moduleId', description: 'ID chuyên đề' })
  @ApiParam({ name: 'lessonId', description: 'ID tiết học' })
  @ApiBody({ type: LessonUpdateDto })
  @ApiResponse({
    status: 200,
    description: 'Tiết học đã được cập nhật.',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Tiết học không tồn tại.' })
  @ApiResponse({
    status: 400,
    description: 'Tiết thực hành không được kèm video hoặc nội dung.',
  })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  async updateLesson(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Param('lessonId') lessonId: string,
    @Body() dto: LessonUpdateDto,
  ): Promise<LessonResponseDto> {
    await this.lessonService.getCourseLesson(courseId, moduleId, lessonId);
    return this.lessonService.updateLesson(lessonId, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':lessonId')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(...COURSE_TREE_STAFF_ROLES)
  @ApiOperation({
    summary: 'Xóa tiết học trong chuyên đề (khoá học)',
    description: TREE_STAFF_DESC,
  })
  @ApiParam({ name: 'courseId', description: 'ID khoá học' })
  @ApiParam({ name: 'moduleId', description: 'ID chuyên đề' })
  @ApiParam({ name: 'lessonId', description: 'ID tiết học' })
  @ApiResponse({ status: 200, description: 'Tiết học đã được xóa.' })
  @ApiResponse({ status: 404, description: 'Tiết học không tồn tại.' })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  @ApiResponse({
    status: 409,
    description: 'Tiết học còn lớp tham chiếu (kể cả lần giao đang ẩn).',
  })
  async deleteLesson(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Param('lessonId') lessonId: string,
  ): Promise<void> {
    await this.lessonService.getCourseLesson(courseId, moduleId, lessonId);
    return this.lessonService.deleteLesson(lessonId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }
}
