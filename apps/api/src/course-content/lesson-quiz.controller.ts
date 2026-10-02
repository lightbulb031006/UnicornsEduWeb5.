import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { LessonQuizLinkDto } from 'src/dtos/course-content.dto';
import { LessonQuizService } from './lesson-quiz.service';
import { COURSE_TREE_STAFF_ROLES } from './course-tree-roles';

const COURSE_CONTENT_FORBIDDEN =
  'Không thuộc đội giáo án của khoá. Dạy lớp không đồng nghĩa soạn giáo án.';

@Controller('lessons/:lessonId/quizzes')
@ApiTags('lesson-quizzes')
@ApiCookieAuth('access_token')
export class LessonQuizController {
  constructor(private readonly quizService: LessonQuizService) {}

  @Post()
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(...COURSE_TREE_STAFF_ROLES)
  @ApiOperation({ summary: 'Gắn câu hỏi ôn nhẹ vào tiết lý thuyết' })
  @ApiParam({ name: 'lessonId', description: 'ID tiết học' })
  @ApiBody({ type: LessonQuizLinkDto })
  @ApiResponse({ status: 200, description: 'Đã gắn câu hỏi.' })
  @ApiResponse({ status: 400, description: 'Câu hỏi không thuộc khoá học, hoặc không phải tiết lý thuyết.' })
  @ApiResponse({ status: 404, description: 'Tiết học không tồn tại.' })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  async linkQuizQuestions(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Body() dto: LessonQuizLinkDto,
  ): Promise<void> {
    return this.quizService.linkQuizQuestions(lessonId, dto.questionIds, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':questionId')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(...COURSE_TREE_STAFF_ROLES)
  @ApiOperation({ summary: 'Gỡ câu hỏi ôn nhẹ khỏi tiết lý thuyết' })
  @ApiParam({ name: 'lessonId', description: 'ID tiết học' })
  @ApiParam({ name: 'questionId', description: 'ID câu hỏi' })
  @ApiResponse({ status: 200, description: 'Đã gỡ câu hỏi.' })
  @ApiResponse({ status: 404, description: 'Câu hỏi chưa được gắn.' })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  async unlinkQuizQuestion(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Param('questionId') questionId: string,
  ): Promise<void> {
    return this.quizService.unlinkQuizQuestion(lessonId, questionId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get()
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(...COURSE_TREE_STAFF_ROLES)
  @ApiOperation({
    summary: 'Danh sách câu hỏi ôn nhẹ của tiết lý thuyết (admin/staff soạn nội dung)',
    description:
      'Học sinh không dùng route này. Student đọc quiz đã enrollment-check qua GET /users/me/student-classes/:classId/lessons/:lessonId/quizzes.',
  })
  @ApiParam({ name: 'lessonId', description: 'ID tiết học' })
  @ApiResponse({
    status: 200,
    description: 'Danh sách câu hỏi (kèm đáp án đúng).',
  })
  @ApiResponse({
    status: 403,
    description: COURSE_CONTENT_FORBIDDEN,
  })
  async getLessonQuizzes(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
  ) {
    return this.quizService.getLessonQuizzes(lessonId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }
}
