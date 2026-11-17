import { SALE_CS_HEAD_ROLE } from 'src/common/sale-cs-head-access';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from 'generated/enums';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { AllowStaffRolesOnAdminRoutes } from 'src/auth/decorators/allow-staff-roles-on-admin.decorator';
import {
  CurrentUser,
  type JwtPayload,
} from 'src/auth/decorators/current-user.decorator';
import { StaffRole } from 'generated/enums';
import { DeviceService } from './device.service';

@ApiTags('device')
@Controller('device')
@ApiCookieAuth('access_token')
@Roles(UserRole.admin)
@AllowStaffRolesOnAdminRoutes(
  StaffRole.admin,
  StaffRole.customer_care,
  SALE_CS_HEAD_ROLE,
)
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Get('student/:studentId')
  @ApiOperation({
    summary: 'Lấy danh sách thiết bị của học sinh',
    description:
      'Trả về danh sách thiết bị hiện tại và lịch sử đăng nhập của học sinh.',
  })
  @ApiParam({ name: 'studentId', description: 'ID học sinh (UNIST-*)' })
  @ApiQuery({
    name: 'includeExpired',
    required: false,
    description: 'Bao gồm thiết bị đã hết hạn',
  })
  @ApiResponse({ status: 200, description: 'Danh sách thiết bị' })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy học sinh (hoặc ngoài phạm vi CSKH)',
  })
  async getStudentDevices(
    @Param('studentId') studentId: string,
    @CurrentUser() user: JwtPayload,
    @Query('includeExpired') includeExpired?: string,
  ) {
    const devices = await this.deviceService.getDevicesByStudentId(studentId, {
      userId: user.id,
      roleType: user.roleType,
    });

    if (includeExpired !== 'true') {
      return devices.filter((d) => !d.isExpired);
    }

    return devices;
  }

  @Delete(':deviceId/force-logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Buộc đăng xuất thiết bị',
    description:
      'Xóa phiên đăng nhập hiện tại của thiết bị, buộc học sinh phải đăng nhập lại.',
  })
  @ApiParam({ name: 'deviceId', description: 'ID thiết bị' })
  @ApiResponse({ status: 200, description: 'Đã buộc đăng xuất thành công' })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy thiết bị (hoặc ngoài phạm vi CSKH)',
  })
  async forceLogout(
    @Param('deviceId') deviceId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.deviceService.forceLogoutDevice(
      deviceId,
      {
        userId: user.id,
        userEmail: user.accountHandle,
        roleType: user.roleType,
      },
      'Buộc đăng xuất thiết bị qua trang quản trị',
    );
  }

  @Delete('cleanup-expired')
  @HttpCode(HttpStatus.OK)
  // Dọn thiết bị toàn hệ thống: không cho CSKH (chỉ admin + trợ lí).
  @AllowStaffRolesOnAdminRoutes(StaffRole.admin)
  @ApiOperation({
    summary: 'Dọn dẹp thiết bị hết hạn',
    description:
      'Xóa các thiết bị không hoạt động quá 60 ngày hoặc refresh token đã hết hạn.',
  })
  @ApiResponse({ status: 200, description: 'Đã dọn dẹp thành công' })
  @ApiResponse({ status: 403, description: 'Không có quyền' })
  async cleanupExpired() {
    return this.deviceService.cleanupExpiredDevices();
  }
}
