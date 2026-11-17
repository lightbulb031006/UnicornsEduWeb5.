import { SALE_CS_HEAD_ROLE } from 'src/common/sale-cs-head-access';
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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
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
  AdminCreateStaffUserDto,
  AdminCreateStudentUserDto,
  AdminSetUserPasswordDto,
  AdminCreateUserDto,
  SetAccountHandleDto,
  GetUsersQueryDto,
  UpdateUserDto,
} from 'src/dtos/user.dto';
import { AuthService } from 'src/auth/auth.service';
import { UserService } from './user.service';
import { readProxyPublicOrigin } from 'src/mail/public-frontend-url';
import { STAFF_CREATOR_HEAD_ROLES } from 'src/common/staff-role-policy';
import { normalizeHttpHttpsUrl } from 'src/storage/supabase-storage';

@ApiTags('users')
@Controller('users')
@ApiCookieAuth('access_token')
@Roles(UserRole.admin)
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List users',
    description: 'Get all users. Admin only.',
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
  async getUsers(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetUsersQueryDto,
  ) {
    return this.userService.getUsers(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Get a user by ID. Admin only.',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin only.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async getUserById(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.userService.getUserById(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create user',
    description:
      'Create a new user. Admin only; can assign roleType/staffRoles immediately.',
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
    @Req() req: Request,
  ) {
    return this.userService.createUser(
      data,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
      readProxyPublicOrigin(req),
    );
  }

  @Post('student')
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE, StaffRole.customer_care)
  @ApiOperation({
    summary: 'Create student user with profile and classes',
    description:
      'Create pending user, assign student role, upsert student profile, and assign classes in a single admin flow. Customer care staff (without admin/sale_customer_care_head role) cannot assign classes and become the student customer care owner with their default profit percent.',
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
    description:
      'Validation error or email/handle exists, hoặc xếp vào lớp đang trống chưa có Học phí lớp (#273).',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden. Admin, sale_customer_care_head or customer care only; customer care cannot assign classes.',
  })
  @ApiResponse({ status: 404, description: 'One or more classes not found.' })
  async createStudentUser(
    @CurrentUser() user: JwtPayload,
    @Body() data: AdminCreateStudentUserDto,
    @Req() req: Request,
  ) {
    return this.userService.createStudentUser(
      data,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
      readProxyPublicOrigin(req),
    );
  }

  @Post('staff')
  // 15/11: Admin + 3 role trưởng tạo nhân sự mới (tài khoản + hồ sơ). Role
  // trưởng không gán được Admin / role trưởng (`assertStaffRoleChangeAllowed`).
  @AllowStaffRolesOnAdminRoutes(...STAFF_CREATOR_HEAD_ROLES)
  @ApiOperation({
    summary: 'Create staff user with profile',
    description:
      'Tạo tài khoản đăng nhập mới + hồ sơ nhân sự trong một bước. Email / tên đăng nhập phải chưa thuộc tài khoản nào (không gắn vào user có sẵn); số CCCD chưa tồn tại. Hồ sơ lỗi thì tài khoản vừa tạo bị xoá. Không nhận mức % thu nhập.',
  })
  @ApiBody({ type: AdminCreateStaffUserDto })
  @ApiResponse({
    status: 201,
    description: 'Đã tạo nhân sự: `{ message, staffId }`.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation error, email / tên đăng nhập đã có tài khoản, hoặc CCCD đã tồn tại.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Admin / role trưởng, hoặc role trưởng gán Admin / role trưởng.',
  })
  async createStaffUser(
    @CurrentUser() user: JwtPayload,
    @Body() data: AdminCreateStaffUserDto,
    @Req() req: Request,
  ) {
    const normalizedBankQrLink = normalizeHttpHttpsUrl(
      data.bank_qr_link,
      'Link QR ngân hàng',
    );

    return this.userService.createStaffUser(
      { ...data, bank_qr_link: normalizedBankQrLink ?? undefined },
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
      readProxyPublicOrigin(req),
    );
  }

  @Patch()
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

  @Patch(':id/password')
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE)
  @ApiOperation({
    summary: 'Set user password',
    description:
      'Admin/sale_customer_care_head sets a new password for a user without the old one. Revokes all devices and refresh token of the target user. Sale & CSKH heads (#267, #268) may only set passwords of student accounts.',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({ type: AdminSetUserPasswordDto })
  @ApiResponse({ status: 200, description: 'Password updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden. Non-admin staff, or sale_customer_care_head targeting a non-student account.',
  })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async setUserPassword(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() data: AdminSetUserPasswordDto,
  ) {
    return this.authService.adminSetUserPassword(id, data.newPassword, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id/account-handle')
  @AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE)
  @ApiOperation({
    summary: 'Set user account handle',
    description:
      'Đổi tên đăng nhập (`account_handle`). Admin: mọi tài khoản. Trưởng phòng Sale & CSKH: chỉ tài khoản học sinh (nhân sự đội Sale/CSKH dùng `PATCH /sale-cs-team/members/:staffId/account-handle`). Handle mới 3–50 ký tự, không khoảng trắng, không `@`; kiểm trùng không phân biệt hoa thường. Không đăng xuất thiết bị.',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({ type: SetAccountHandleDto })
  @ApiResponse({ status: 200, description: '{ id, accountHandle }.' })
  @ApiResponse({
    status: 400,
    description: 'Sai định dạng hoặc tên đăng nhập đã được dùng.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden. Non-admin staff, or sale_customer_care_head targeting a non-student account.',
  })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async setUserAccountHandle(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() data: SetAccountHandleDto,
  ) {
    return this.userService.setAccountHandle(id, data.accountHandle, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete user',
    description:
      'Soft-delete user account: unlinks staff_info/student_info (sets user_id null, keeps profiles), nulls other user FKs via DB constraints, then removes the user row. Admin only.',
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
