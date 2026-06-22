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
import {
  CurrentUser,
  type JwtPayload,
} from 'src/auth/decorators/current-user.decorator';
import { AllowStaffRolesOnAdminRoutes } from 'src/auth/decorators/allow-staff-roles-on-admin.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { StaffRole, UserRole } from 'generated/enums';
import {
  AdminCreateStudentUserDto,
  AdminCreateUserDto,
  GetUsersQueryDto,
  UpdateUserDto,
} from 'src/dtos/user.dto';
import { UserService } from './user.service';

@ApiTags('users')
@Controller('users')
@ApiCookieAuth('access_token')
@Roles(UserRole.admin)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({
    summary: 'List users',
    description: 'Get all users. Full admin and assistant read-only.',
  })
  @ApiResponse({ status: 200, description: 'List of users.' })
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
    description:
      'Search by account handle, email, phone, first name, or last name.',
    example: 'nguyen van',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin only.' })
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
  async getUsers(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetUsersQueryDto,
  ) {
    return this.userService.getUsers(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Get a user by ID. Full admin and assistant read-only.',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin only.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
  async getUserById(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.userService.getUserById(id);
  }

  @Post()
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
  @ApiOperation({
    summary: 'Create user',
    description:
      'Create a new user. Admin and assistant can assign roleType/staffRoles immediately.',
  })
  @ApiBody({
    type: AdminCreateUserDto,
    description:
      'User data giống luồng register, có thể gán luôn roleType và staffRoles khi tạo từ trang quản trị',
  })
  @ApiResponse({
    status: 201,
    description: 'User created and verification email sent.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or email/handle exists.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin only.' })
  async createUser(
    @CurrentUser() user: JwtPayload,
    @Body() data: AdminCreateUserDto,
  ) {
    return this.userService.createUser(data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post('student')
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
  @ApiOperation({
    summary: 'Create student user with profile and classes',
    description:
      'Create pending user, assign student role, upsert student profile, and assign classes in a single admin flow.',
  })
  @ApiBody({
    type: AdminCreateStudentUserDto,
    description:
      'Payload creates a user account and immediately persists full student profile + class memberships.',
  })
  @ApiResponse({
    status: 201,
    description: 'Student user created and verification email sent.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or email/handle exists.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin only.' })
  @ApiResponse({ status: 404, description: 'One or more classes not found.' })
  async createStudentUser(
    @CurrentUser() user: JwtPayload,
    @Body() data: AdminCreateStudentUserDto,
  ) {
    return this.userService.createStudentUser(data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch()
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
  @ApiOperation({
    summary: 'Update user',
    description: 'Update a user. Admin only.',
  })
  @ApiBody({
    type: UpdateUserDto,
    description: 'User update data (id required, other fields optional)',
  })
  @ApiResponse({ status: 200, description: 'User updated.' })
  @ApiResponse({
    status: 400,
    description: 'Validation error or email/handle exists.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin only.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async updateUser(
    @CurrentUser() user: JwtPayload,
    @Body() data: UpdateUserDto,
  ) {
    return this.userService.updateUser(data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':id')
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
  @ApiOperation({
    summary: 'Delete user',
    description:
      'Soft-delete user account: unlinks staff_info/student_info (sets user_id null, keeps profiles), nulls other user FKs via DB constraints, then removes the user row. Admin/assistant only.',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User deleted.' })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete the currently signed-in account.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin only.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async deleteUser(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.userService.deleteUser(id, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }
}
