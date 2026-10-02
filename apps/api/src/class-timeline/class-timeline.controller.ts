import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
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
import { ParseClassIdPipe } from 'src/common/pipes/parse-entity-id.pipe';
import {
  ReorderClassTimelineDto,
} from 'src/dtos/class-timeline.dto';
import { ClassTimelineService } from './class-timeline.service';

@Controller('class/:classId/timeline')
@ApiTags('class-timeline')
@ApiCookieAuth('access_token')
export class ClassTimelineController {
  constructor(private readonly timeline: ClassTimelineService) {}

  @Get()
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.teacher,
    StaffRole.customer_care,
    StaffRole.training,
    StaffRole.accountant,
    StaffRole.accountant_income,
    StaffRole.accountant_expense,
  )
  @ApiOperation({ summary: 'Danh sách timeline lớp (admin/staff, đủ thứ tự)' })
  @ApiParam({ name: 'classId' })
  @ApiResponse({ status: 200, description: 'Timeline đầy đủ.' })
  async list(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
  ) {
    return this.timeline.listForStaff(classId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post('reorder')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.teacher)
  @ApiOperation({ summary: 'Sắp xếp lại timeline lớp' })
  @ApiParam({ name: 'classId' })
  @ApiBody({ type: ReorderClassTimelineDto })
  @ApiResponse({ status: 200, description: 'Đã lưu thứ tự.' })
  @ApiResponse({
    status: 400,
    description:
      'orderedIds trùng, thiếu item của lớp, hoặc chứa id không thuộc timeline lớp.',
  })
  async reorder(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Body() dto: ReorderClassTimelineDto,
  ) {
    return this.timeline.reorder(classId, dto.orderedIds, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get('student')
  @Roles(UserRole.student)
  @ApiOperation({ summary: 'Timeline lớp cho học sinh (infinite scroll)' })
  @ApiParam({ name: 'classId' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Một trang timeline.' })
  async listStudent(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const studentId = await this.timeline.findStudentIdByUserId(user.id);
    if (!studentId) {
      throw new NotFoundException('Student profile not found');
    }
    const parsed = Number.parseInt(limit ?? '20', 10);
    return this.timeline.listForStudent(
      classId,
      studentId,
      cursor,
      Number.isFinite(parsed) ? parsed : 20,
    );
  }
}
