import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
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
  ModuleCreateDto,
  ModuleUpdateDto,
  ModuleResponseDto,
} from 'src/dtos/course-content.dto';
import { CourseModuleService } from './course-module.service';
import { COURSE_TREE_STAFF_ROLES } from './course-tree-roles';

const COURSE_CONTENT_FORBIDDEN =
  'Không thuộc đội giáo án của khoá. Dạy lớp không đồng nghĩa soạn giáo án.';

@Controller('course/:courseId/modules')
@ApiTags('course-modules')
@ApiCookieAuth('access_token')
export class CourseModuleController {
  constructor(private readonly moduleService: CourseModuleService) {}

  @Post()
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(...COURSE_TREE_STAFF_ROLES)
  @ApiOperation({
    summary: 'Tạo chuyên đề mới cho khoá học',
    description:
      'Staff: assistant, teacher, lesson_plan, lesson_plan_head. Tầng service vẫn từ chối teacher không thuộc đội giáo án.',
  })
  @ApiParam({ name: 'courseId', description: 'ID khoá học' })
  @ApiBody({ type: ModuleCreateDto })
  @ApiResponse({
    status: 201,
    description: 'Chuyên đề đã được tạo.',
    type: Object,
  })
  @ApiResponse({ status: 400, description: 'Lỗi khi tạo chuyên đề.' })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  async createModule(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Body() dto: ModuleCreateDto,
  ): Promise<ModuleResponseDto> {
    return this.moduleService.createModule(
      { ...dto, courseId },
      { userId: user.id, userEmail: user.email, roleType: user.roleType },
    );
  }

  @Get()
  @Roles(UserRole.admin, UserRole.student)
  @AllowStaffRolesOnAdminRoutes(...COURSE_TREE_STAFF_ROLES)
  @ApiOperation({
    summary: 'Lấy danh sách chuyên đề của khoá học',
    description:
      'Staff: assistant, teacher, lesson_plan, lesson_plan_head (cùng GET chi tiết).',
  })
  @ApiParam({ name: 'courseId', description: 'ID khoá học' })
  @ApiResponse({ status: 200, description: 'Danh sách chuyên đề.' })
  async getModules(
    @Param('courseId') courseId: string,
  ): Promise<ModuleResponseDto[]> {
    return this.moduleService.getModulesByCourseId(courseId);
  }

  @Get(':moduleId')
  @Roles(UserRole.admin, UserRole.student)
  @AllowStaffRolesOnAdminRoutes(...COURSE_TREE_STAFF_ROLES)
  @ApiOperation({
    summary: 'Lấy chi tiết 1 chuyên đề',
    description: 'Staff: assistant, teacher, lesson_plan, lesson_plan_head.',
  })
  @ApiParam({ name: 'courseId', description: 'ID khoá học' })
  @ApiParam({ name: 'moduleId', description: 'ID chuyên đề' })
  @ApiResponse({ status: 200, description: 'Chi tiết chuyên đề.', type: Object })
  @ApiResponse({ status: 404, description: 'Chuyên đề không tồn tại.' })
  async getModule(
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
  ): Promise<ModuleResponseDto> {
    return this.moduleService.getModuleById(moduleId);
  }

  @Patch(':moduleId')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(...COURSE_TREE_STAFF_ROLES)
  @ApiOperation({
    summary: 'Cập nhật chuyên đề',
    description: 'Staff: assistant, teacher, lesson_plan, lesson_plan_head.',
  })
  @ApiParam({ name: 'courseId', description: 'ID khoá học' })
  @ApiParam({ name: 'moduleId', description: 'ID chuyên đề' })
  @ApiBody({ type: ModuleUpdateDto })
  @ApiResponse({
    status: 200,
    description: 'Chuyên đề đã được cập nhật.',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Chuyên đề không tồn tại.' })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  async updateModule(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: ModuleUpdateDto,
  ): Promise<ModuleResponseDto> {
    return this.moduleService.updateModule(moduleId, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':moduleId')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(...COURSE_TREE_STAFF_ROLES)
  @ApiOperation({
    summary: 'Xóa chuyên đề',
    description: 'Staff: assistant, teacher, lesson_plan, lesson_plan_head.',
  })
  @ApiParam({ name: 'courseId', description: 'ID khoá học' })
  @ApiParam({ name: 'moduleId', description: 'ID chuyên đề' })
  @ApiResponse({ status: 200, description: 'Chuyên đề đã được xóa.' })
  @ApiResponse({ status: 404, description: 'Chuyên đề không tồn tại.' })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  @ApiResponse({
    status: 409,
    description:
      'Chuyên đề còn lớp tham chiếu tiết học (kể cả lần giao đang ẩn).',
  })
  async deleteModule(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
  ): Promise<void> {
    return this.moduleService.deleteModule(moduleId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post('reorder')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(...COURSE_TREE_STAFF_ROLES)
  @ApiOperation({
    summary: 'Sắp xếp lại thứ tự chuyên đề',
    description: 'Staff: assistant, teacher, lesson_plan, lesson_plan_head.',
  })
  @ApiParam({ name: 'courseId', description: 'ID khoá học' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { moduleIds: { type: 'array', items: { type: 'string' } } },
    },
  })
  @ApiResponse({ status: 200, description: 'Đã sắp xếp lại.' })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  async reorderModules(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Body('moduleIds') moduleIds: string[],
  ): Promise<void> {
    return this.moduleService.reorderModules(courseId, moduleIds, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }
}
