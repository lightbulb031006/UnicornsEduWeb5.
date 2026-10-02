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
import { StaffRole, UserRole } from 'generated/enums';
import { AllowStaffRolesOnAdminRoutes } from 'src/auth/decorators/allow-staff-roles-on-admin.decorator';
import {
  CurrentUser,
  type JwtPayload,
} from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import {
  QuestionLinkCreateDto,
  QuestionLinkUpdateDto,
  ReorderQuestionLinksDto,
} from 'src/dtos/course-content.dto';
import { PracticeQuestionLinkService } from './practice-question-link.service';

const COURSE_CONTENT_FORBIDDEN =
  'Không thuộc đội giáo án của khoá. Dạy lớp không đồng nghĩa soạn giáo án.';

@Controller('lessons/:lessonId/questions')
@ApiTags('practice-lesson-questions')
@ApiCookieAuth('access_token')
export class PracticeLessonQuestionController {
  constructor(private readonly topicService: PracticeQuestionLinkService) {}

  @Get()
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan,
    StaffRole.lesson_plan_head,
    StaffRole.teacher,
  )
  @ApiOperation({ summary: 'Lấy danh sách câu hỏi của tiết thực hành' })
  @ApiParam({ name: 'lessonId', description: 'ID tiết thực hành' })
  @ApiResponse({ status: 200, description: 'Danh sách câu hỏi.' })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  async getQuestions(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
  ) {
    return this.topicService.getQuestionsByLessonId(lessonId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post()
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan,
    StaffRole.lesson_plan_head,
    StaffRole.teacher,
  )
  @ApiOperation({ summary: 'Thêm câu hỏi vào tiết thực hành' })
  @ApiParam({ name: 'lessonId', description: 'ID tiết thực hành' })
  @ApiBody({ type: QuestionLinkCreateDto })
  @ApiResponse({ status: 201, description: 'Đã thêm câu hỏi.' })
  @ApiResponse({ status: 400, description: 'Lỗi dữ liệu đầu vào.' })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  async addQuestion(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Body() dto: QuestionLinkCreateDto,
  ) {
    return this.topicService.addQuestionToLesson(lessonId, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':linkId')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan,
    StaffRole.lesson_plan_head,
    StaffRole.teacher,
  )
  @ApiOperation({ summary: 'Cập nhật thứ tự/điểm câu hỏi' })
  @ApiParam({ name: 'lessonId', description: 'ID tiết thực hành' })
  @ApiParam({ name: 'linkId', description: 'ID liên kết câu hỏi' })
  @ApiBody({ type: QuestionLinkUpdateDto })
  @ApiResponse({ status: 200, description: 'Đã cập nhật.' })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  async updateQuestionLink(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Param('linkId') linkId: string,
    @Body() dto: QuestionLinkUpdateDto,
  ) {
    return this.topicService.updateQuestionLink(lessonId, linkId, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':linkId')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan,
    StaffRole.lesson_plan_head,
    StaffRole.teacher,
  )
  @ApiOperation({ summary: 'Xóa câu hỏi khỏi tiết thực hành' })
  @ApiParam({ name: 'lessonId', description: 'ID tiết thực hành' })
  @ApiParam({ name: 'linkId', description: 'ID liên kết câu hỏi' })
  @ApiResponse({ status: 200, description: 'Đã xóa.' })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  async removeQuestion(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Param('linkId') linkId: string,
  ) {
    return this.topicService.removeQuestionFromLesson(lessonId, linkId, {
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
    StaffRole.teacher,
  )
  @ApiOperation({ summary: 'Sắp xếp lại thứ tự câu hỏi' })
  @ApiParam({ name: 'lessonId', description: 'ID tiết thực hành' })
  @ApiBody({ type: ReorderQuestionLinksDto })
  @ApiResponse({ status: 200, description: 'Đã sắp xếp lại.' })
  @ApiResponse({ status: 403, description: COURSE_CONTENT_FORBIDDEN })
  async reorderQuestions(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Body() dto: ReorderQuestionLinksDto,
  ) {
    return this.topicService.reorderQuestionLinks(lessonId, dto.linkIds, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get('summary')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan,
    StaffRole.lesson_plan_head,
    StaffRole.teacher,
  )
  @ApiOperation({ summary: 'Tổng quan câu hỏi và điểm' })
  @ApiParam({ name: 'lessonId', description: 'ID tiết thực hành' })
  @ApiResponse({ status: 200, description: 'Tổng số câu hỏi và tổng điểm.' })
  async getSummary(@Param('lessonId') lessonId: string) {
    return this.topicService.getQuestionLinkSummary(lessonId);
  }

  @Get('is-assigned')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
  @ApiOperation({ summary: 'Kiểm tra chuyên đề đã được giao cho lớp nào chưa' })
  @ApiParam({ name: 'lessonId', description: 'ID tiết thực hành' })
  @ApiResponse({ status: 200, description: 'Đã giao hay chưa.' })
  async isAssigned(@Param('lessonId') lessonId: string) {
    const assigned = await this.topicService.isLessonAssignedToClass(lessonId);
    return { assigned };
  }
}
