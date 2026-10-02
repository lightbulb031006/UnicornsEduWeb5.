import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
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
import { ParseClassIdPipe } from 'src/common/pipes/parse-entity-id.pipe';
import {
  ClassContentCreateDto,
  ClassContentScheduleUpdateDto,
  ClassTheoryProgressDto,
  CourseLessonForClassDto,
} from 'src/dtos/course-content.dto';
import { ClassContentService } from './class-content.service';

@Controller('class/:classId/content')
@ApiTags('class-content')
@ApiCookieAuth('access_token')
export class ClassContentController {
  constructor(private readonly topicService: ClassContentService) {}

  @Post()
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.teacher)
  @ApiOperation({
    summary:
      'Thêm nội dung vào lớp học. Luyện tập: openAt tuỳ chọn — bỏ trống thì backend lấy thời điểm thêm vào lớp (server).',
  })
  @ApiParam({ name: 'classId', description: 'ID lớp học' })
  @ApiBody({ type: ClassContentCreateDto })
  @ApiResponse({ status: 201, description: 'Đã thêm nội dung.' })
  @ApiResponse({ status: 400, description: 'Lỗi dữ liệu đầu vào.' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Body() dto: ClassContentCreateDto,
  ) {
    return this.topicService.createClassContentItem(classId, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get()
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.teacher)
  @ApiOperation({ summary: 'Lấy danh sách nội dung lớp học' })
  @ApiParam({ name: 'classId', description: 'ID lớp học' })
  @ApiResponse({ status: 200, description: 'Danh sách nội dung.' })
  async listItems(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
  ) {
    return this.topicService.listClassContentItems(classId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get('course-lessons')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.teacher)
  @ApiOperation({ summary: 'Lấy danh sách tiết học cấp khoá để giao vào lớp' })
  @ApiParam({ name: 'classId', description: 'ID lớp học' })
  @ApiResponse({ status: 200, description: 'Danh sách tiết học từ khoá học.' })
  async listCourseLessons(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
  ): Promise<CourseLessonForClassDto[]> {
    return this.topicService.listCourseLessonsForClass(classId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post('reorder')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.teacher)
  @ApiOperation({ summary: 'Sắp xếp lại thứ tự nội dung lớp học' })
  @ApiParam({ name: 'classId', description: 'ID lớp học' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { orderedIds: { type: 'array', items: { type: 'string' } } },
    },
  })
  @ApiResponse({ status: 200, description: 'Đã sắp xếp lại.' })
  async reorder(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Body('orderedIds') orderedIds: string[],
  ) {
    return this.topicService.reorderClassContentItems(classId, orderedIds, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get(':itemId/theory-progress')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.teacher)
  @ApiOperation({
    summary:
      'Lấy tiến độ tiết lý thuyết của roster lớp: đã xem và hoàn thành bài tập ôn nhẹ',
  })
  @ApiParam({ name: 'classId', description: 'ID lớp học' })
  @ApiParam({ name: 'itemId', description: 'ID class content item' })
  @ApiResponse({ status: 200, description: 'Tiến độ tiết lý thuyết.' })
  @ApiResponse({ status: 400, description: 'Không phải tiết lý thuyết.' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy nội dung lớp.' })
  async getTheoryProgress(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Param('itemId') itemId: string,
  ): Promise<ClassTheoryProgressDto> {
    return this.topicService.getClassTheoryProgress(classId, itemId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':itemId')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.teacher)
  @ApiOperation({
    summary: 'Cập nhật lịch lần giao (openAt, durationMinutes) — không sửa đề',
  })
  @ApiParam({ name: 'classId', description: 'ID lớp học' })
  @ApiParam({ name: 'itemId', description: 'ID lần giao / class content item' })
  @ApiBody({ type: ClassContentScheduleUpdateDto })
  @ApiResponse({ status: 200, description: 'Đã cập nhật lịch lần giao.' })
  @ApiResponse({ status: 400, description: 'Không phải tiết thực hành.' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lần giao.' })
  async updateSchedule(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Param('itemId') itemId: string,
    @Body() dto: ClassContentScheduleUpdateDto,
  ) {
    return this.topicService.updateClassContentSchedule(classId, itemId, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':itemId')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.teacher)
  @ApiOperation({
    summary: 'Ẩn nội dung lớp khỏi học sinh (không xoá dữ liệu / bài làm)',
  })
  @ApiParam({ name: 'classId', description: 'ID lớp học' })
  @ApiParam({ name: 'itemId', description: 'ID nội dung' })
  @ApiResponse({
    status: 200,
    description: 'Đã ẩn. Danh sách nội dung (gồm item đã ẩn).',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy nội dung.' })
  async delete(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.topicService.deleteClassContentItem(classId, itemId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post(':itemId/restore')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.teacher)
  @ApiOperation({ summary: 'Khôi phục nội dung lớp đã ẩn — học sinh thấy lại' })
  @ApiParam({ name: 'classId', description: 'ID lớp học' })
  @ApiParam({ name: 'itemId', description: 'ID nội dung' })
  @ApiResponse({ status: 200, description: 'Đã khôi phục.' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy nội dung.' })
  async restore(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.topicService.restoreClassContentItem(classId, itemId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get('student')
  @Roles(UserRole.student)
  @ApiOperation({ summary: 'Lấy danh sách nội dung lớp học cho học sinh' })
  @ApiParam({ name: 'classId', description: 'ID lớp học' })
  @ApiResponse({ status: 200, description: 'Danh sách nội dung.' })
  async listForStudent(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
  ) {
    const studentId = await this.topicService.findStudentIdByUserId(user.id);
    if (!studentId) {
      throw new NotFoundException('Student profile not found');
    }
    return this.topicService.listClassContentForStudent(classId, studentId);
  }
}
