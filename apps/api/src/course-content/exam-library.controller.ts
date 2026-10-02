import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import {
  LessonCreateDto,
  LessonUpdateDto,
  LessonResponseDto,
} from 'src/dtos/course-content.dto';
import { ExamLibraryService } from './exam-library.service';

const COURSE_CONTENT_FORBIDDEN =
  'Không thuộc đội giáo án của khoá. Dạy lớp không đồng nghĩa soạn giáo án.';

@Controller('course/:courseId/exam-library')
@ApiTags('exam-library')
@ApiCookieAuth('access_token')
export class CourseExamLibraryController {
  constructor(private readonly topicService: ExamLibraryService) {}

  @Get()
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan,
    StaffRole.lesson_plan_head,
  )
  @ApiOperation({ summary: 'Thư viện đề thi — danh sách đề thi của khoá học' })
  @ApiParam({ name: 'courseId', description: 'ID khoá học' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({
    name: 'moduleId',
    required: false,
    description: 'Lọc đề theo chương',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Danh sách đề thi.' })
  async list(
    @Param('courseId') courseId: string,
    @Query('search') search?: string,
    @Query('moduleId') moduleId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.topicService.getExamLibrary(courseId, {
      search,
      moduleId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post()
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan,
    StaffRole.lesson_plan_head,
  )
  @ApiOperation({
    summary: 'Tạo đề thi mới trong thư viện (bắt buộc thuộc một chương)',
  })
  @ApiParam({ name: 'courseId', description: 'ID khoá học' })
  @ApiBody({ type: LessonCreateDto })
  @ApiResponse({ status: 201, description: 'Đề thi đã được tạo.' })
  @ApiResponse({ status: 400, description: 'Lỗi dữ liệu đầu vào.' })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  async create(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Body() dto: LessonCreateDto,
  ): Promise<LessonResponseDto> {
    return this.topicService.createExamLesson(courseId, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':lessonId')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan,
    StaffRole.lesson_plan_head,
  )
  @ApiOperation({ summary: 'Cập nhật đề thi trong thư viện' })
  @ApiParam({ name: 'courseId', description: 'ID khoá học' })
  @ApiParam({ name: 'lessonId', description: 'ID đề thi' })
  @ApiBody({ type: LessonUpdateDto })
  @ApiResponse({ status: 200, description: 'Đề thi đã được cập nhật.' })
  @ApiResponse({ status: 404, description: 'Đề thi không tồn tại.' })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @Body() dto: LessonUpdateDto,
  ): Promise<LessonResponseDto> {
    return this.topicService.updateExamLesson(courseId, lessonId, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':lessonId')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan,
    StaffRole.lesson_plan_head,
  )
  @ApiOperation({ summary: 'Xóa đề thi khỏi thư viện' })
  @ApiParam({ name: 'courseId', description: 'ID khoá học' })
  @ApiParam({ name: 'lessonId', description: 'ID đề thi' })
  @ApiResponse({ status: 200, description: 'Đề thi đã được xóa.' })
  @ApiResponse({ status: 404, description: 'Đề thi không tồn tại.' })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  @ApiResponse({
    status: 409,
    description: 'Chuyên đề đang được N lớp sử dụng (kể cả nội dung đã ẩn).',
  })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
  ): Promise<void> {
    return this.topicService.deleteExamLesson(courseId, lessonId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post('reorder')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan,
    StaffRole.lesson_plan_head,
  )
  @ApiOperation({ summary: 'Sắp xếp lại thứ tự đề thi trong thư viện' })
  @ApiParam({ name: 'courseId', description: 'ID khoá học' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { lessonIds: { type: 'array', items: { type: 'string' } } },
    },
  })
  @ApiResponse({ status: 200, description: 'Đã sắp xếp lại.' })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  async reorder(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Body('lessonIds') lessonIds: string[],
  ): Promise<void> {
    return this.topicService.reorderExamLessons(courseId, lessonIds, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }
}
