import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
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
  ClassModuleAddDto,
  ClassModuleRemovalImpactDto,
  ClassModuleReorderDto,
  ClassModuleResponseDto,
} from 'src/dtos/course-content.dto';
import { ClassCourseModuleService } from './class-course-module.service';

@Controller('class/:classId/modules')
@ApiTags('class-modules')
@ApiCookieAuth('access_token')
export class ClassCourseModuleController {
  constructor(private readonly classModules: ClassCourseModuleService) {}

  @Get()
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.teacher)
  @ApiOperation({
    summary:
      'Danh sách chuyên đề của khoá, đánh dấu chuyên đề lớp đã thêm và số tiết lý thuyết/thực hành.',
  })
  @ApiParam({ name: 'classId', description: 'ID lớp học' })
  @ApiResponse({ status: 200, description: 'Danh sách chuyên đề.' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lớp.' })
  async list(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
  ): Promise<ClassModuleResponseDto[]> {
    return this.classModules.listClassModules(classId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post()
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.teacher)
  @ApiOperation({
    summary:
      'Thêm chuyên đề vào lớp: nhóm lên đầu, đưa mọi tiết lý thuyết của chuyên đề vào nội dung lớp, hiện lại item bị ẩn do lần gỡ trước (item gia sư tự ẩn giữ nguyên). Tiết thực hành không tự giao.',
  })
  @ApiParam({ name: 'classId', description: 'ID lớp học' })
  @ApiBody({ type: ClassModuleAddDto })
  @ApiResponse({
    status: 201,
    description: 'Đã thêm chuyên đề; trả danh sách chuyên đề mới.',
  })
  @ApiResponse({
    status: 400,
    description: 'Chuyên đề không thuộc khoá của lớp.',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy lớp hoặc chuyên đề.',
  })
  @ApiResponse({ status: 409, description: 'Lớp đã có chuyên đề này.' })
  async add(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Body() dto: ClassModuleAddDto,
  ): Promise<ClassModuleResponseDto[]> {
    return this.classModules.addClassModule(classId, dto.moduleId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Put('order')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.teacher)
  @ApiOperation({
    summary:
      'Sắp lại thứ tự nhóm chuyên đề của lớp (học sinh thấy cùng thứ tự). Không đổi thứ tự chuyên đề cấp khoá.',
  })
  @ApiParam({ name: 'classId', description: 'ID lớp học' })
  @ApiBody({ type: ClassModuleReorderDto })
  @ApiResponse({
    status: 200,
    description: 'Đã lưu thứ tự; trả danh sách chuyên đề mới.',
  })
  @ApiResponse({
    status: 400,
    description:
      'moduleIds trùng, thiếu hoặc thừa so với chuyên đề lớp đang có.',
  })
  async reorder(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Body() dto: ClassModuleReorderDto,
  ): Promise<ClassModuleResponseDto[]> {
    return this.classModules.reorderClassModules(classId, dto.moduleIds, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get(':moduleId/removal-impact')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.teacher)
  @ApiOperation({
    summary:
      'Ảnh hưởng nếu gỡ chuyên đề: số câu tự luận chưa chấm và số học sinh đang làm dở lần giao của chuyên đề.',
  })
  @ApiParam({ name: 'classId', description: 'ID lớp học' })
  @ApiParam({ name: 'moduleId', description: 'ID chuyên đề' })
  @ApiResponse({ status: 200, description: 'Số liệu cảnh báo trước khi gỡ.' })
  async removalImpact(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Param('moduleId') moduleId: string,
  ): Promise<ClassModuleRemovalImpactDto> {
    return this.classModules.getClassModuleRemovalImpact(classId, moduleId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':moduleId')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.teacher)
  @ApiOperation({
    summary:
      'Gỡ chuyên đề khỏi lớp (coi như chưa từng thêm): ẩn mềm tiết lý thuyết và lần giao tiết thực hành của chuyên đề. Bài làm, điểm, lượt xem giữ nguyên.',
  })
  @ApiParam({ name: 'classId', description: 'ID lớp học' })
  @ApiParam({ name: 'moduleId', description: 'ID chuyên đề' })
  @ApiResponse({
    status: 200,
    description: 'Đã gỡ chuyên đề; trả danh sách chuyên đề mới.',
  })
  @ApiResponse({ status: 404, description: 'Lớp chưa thêm chuyên đề này.' })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Param('moduleId') moduleId: string,
  ): Promise<ClassModuleResponseDto[]> {
    return this.classModules.removeClassModule(classId, moduleId, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }
}
