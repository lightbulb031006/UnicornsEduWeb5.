import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from 'generated/enums';
import {
  CurrentUser,
  type JwtPayload,
} from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ParseStaffIdPipe } from 'src/common/pipes/parse-entity-id.pipe';
import {
  buildImageUploadFileFilter,
  DEFAULT_MAX_IMAGE_BYTES,
} from 'src/storage/supabase-storage';
import { achievementImageUploadInterceptor } from 'src/achievements/achievement-image-upload';
import { AchievementService } from 'src/achievements/achievement.service';
import {
  CreateAchievementDto,
  ReorderAchievementsDto,
  UpdateAchievementDto,
} from 'src/dtos/achievement.dto';
import {
  SaleCsTeamListQueryDto,
  SaleCsTeamMonthQueryDto,
  UpdateSaleCsTeamAccountStatusDto,
  UpdateSaleCsTeamProfileDto,
  UpdateSaleCsTeamRolesDto,
} from 'src/dtos/sale-cs-team.dto';
import { SetAccountHandleDto } from 'src/dtos/user.dto';
import { SaleCsTeamService } from './sale-cs-team.service';

const FORBIDDEN_NOT_HEAD = 'Không phải Trưởng phòng Sale & CSKH đang active.';
const FORBIDDEN_ACHIEVEMENT_EDIT =
  'Không phải Trưởng phòng Sale & CSKH, hoặc hồ sơ của chính mình / Admin / trưởng, hoặc không thuộc đội.';

type UploadedImage = { buffer: Buffer; mimetype: string; size: number };

/**
 * Trưởng phòng Sale & CSKH quản lý đội Sale & CSKH (#271). Route khu staff
 * (`@Roles(staff)`), không mở route admin nào; service kiểm role trưởng phòng.
 */
@ApiTags('sale-cs-team')
@Controller('sale-cs-team')
@ApiCookieAuth('access_token')
@Roles(UserRole.staff)
export class SaleCsTeamController {
  constructor(
    private readonly saleCsTeamService: SaleCsTeamService,
    private readonly achievementService: AchievementService,
  ) {}

  @Get('members')
  @ApiOperation({
    summary: 'Trưởng phòng: danh sách đội Sale & CSKH',
    description:
      'Allowlist: id, họ tên, ảnh, roles, trạng thái nhân sự, khoá tài khoản, trường, % CSKH mặc định (chỉ đọc), trưởng phòng quản lý, số học sinh CSKH, Tỉnh/TP, số thành tích, cờ quyền từng dòng. Không email, SĐT, CCCD, ngày sinh, địa chỉ, ngân hàng, lương. `scope=candidates`: nhân sự chưa thuộc đội (không Admin/trưởng) để bật role Sale/CSKH.',
  })
  @ApiResponse({ status: 200, description: 'Trang thành viên.' })
  @ApiResponse({ status: 403, description: FORBIDDEN_NOT_HEAD })
  listMembers(
    @CurrentUser() user: JwtPayload,
    @Query() query: SaleCsTeamListQueryDto,
  ) {
    return this.saleCsTeamService.listMembers(user, query);
  }

  @Get('members/:staffId')
  @ApiOperation({
    summary: 'Trưởng phòng: hồ sơ một thành viên đội',
    description:
      'Allowlist của danh sách + handle, Tỉnh/TP, link Google Meet. Không email, SĐT, CCCD, ngày sinh, dân tộc, giới tính, địa chỉ, ngân hàng, QR (#270).',
  })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiResponse({ status: 200, description: 'Thành viên (allowlist).' })
  @ApiResponse({ status: 403, description: FORBIDDEN_NOT_HEAD })
  @ApiResponse({ status: 404, description: 'Không thuộc đội Sale & CSKH.' })
  getMember(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
  ) {
    return this.saleCsTeamService.getMember(user, staffId);
  }

  @Get('members/:staffId/achievements')
  @ApiOperation({
    summary: 'Trưởng phòng: thành tích của thành viên',
    description:
      'Thứ tự hồ sơ. Trưởng phòng sửa được thành tích của nhân sự dưới cấp qua các route ghi bên dưới.',
  })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiResponse({ status: 200, description: 'Thành tích theo thứ tự hồ sơ.' })
  @ApiResponse({ status: 403, description: FORBIDDEN_NOT_HEAD })
  @ApiResponse({ status: 404, description: 'Không thuộc đội Sale & CSKH.' })
  listAchievements(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
  ) {
    return this.saleCsTeamService.listAchievements(user, staffId);
  }

  // Trưởng phòng sửa thành tích nhân sự dưới cấp như admin: không ràng buộc
  // minh chứng, ghi lịch sử thao tác (trừ sắp xếp). «Dưới cấp» = thành viên
  // đội, không phải mình / Admin / trưởng (cùng rule sửa hồ sơ chuyên môn).

  @Post('members/:staffId/achievements')
  @UseInterceptors(achievementImageUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Trưởng phòng: thêm thành tích (ảnh tuỳ chọn)' })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string' },
        sortOrder: { type: 'integer' },
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Created achievement.' })
  @ApiResponse({ status: 400, description: 'Missing title or invalid image.' })
  @ApiResponse({ status: 403, description: FORBIDDEN_ACHIEVEMENT_EDIT })
  @ApiResponse({ status: 404, description: 'Không tìm thấy nhân sự.' })
  async createAchievement(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Body() body: CreateAchievementDto,
    @UploadedFile() file?: UploadedImage,
  ) {
    const editor = await this.saleCsTeamService.resolveAchievementEditor(
      user,
      staffId,
    );
    return this.achievementService.createStaffAchievement(
      staffId,
      body,
      file,
      editor,
    );
  }

  @Put('members/:staffId/achievements/reorder')
  @ApiOperation({ summary: 'Trưởng phòng: sắp xếp thành tích' })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiBody({ type: ReorderAchievementsDto })
  @ApiResponse({ status: 200, description: 'Reordered list.' })
  @ApiResponse({ status: 400, description: 'Incomplete or invalid id set.' })
  @ApiResponse({ status: 403, description: FORBIDDEN_ACHIEVEMENT_EDIT })
  async reorderAchievements(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Body() body: ReorderAchievementsDto,
  ) {
    await this.saleCsTeamService.resolveAchievementEditor(user, staffId);
    return this.achievementService.reorderStaffAchievements(staffId, body);
  }

  @Patch('members/:staffId/achievements/:achievementId')
  @ApiOperation({ summary: 'Trưởng phòng: sửa tiêu đề/sortOrder thành tích' })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiBody({ type: UpdateAchievementDto })
  @ApiResponse({ status: 200, description: 'Updated achievement.' })
  @ApiResponse({ status: 403, description: FORBIDDEN_ACHIEVEMENT_EDIT })
  @ApiResponse({ status: 404, description: 'Không có nhân sự / thành tích.' })
  async updateAchievement(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
    @Body() body: UpdateAchievementDto,
  ) {
    const editor = await this.saleCsTeamService.resolveAchievementEditor(
      user,
      staffId,
    );
    return this.achievementService.updateStaffAchievement(
      staffId,
      achievementId,
      body,
      editor,
    );
  }

  @Delete('members/:staffId/achievements/:achievementId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trưởng phòng: xoá thành tích (kèm ảnh)' })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiResponse({ status: 200, description: 'Deleted.' })
  @ApiResponse({ status: 403, description: FORBIDDEN_ACHIEVEMENT_EDIT })
  @ApiResponse({ status: 404, description: 'Không có nhân sự / thành tích.' })
  async deleteAchievement(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
  ) {
    const editor = await this.saleCsTeamService.resolveAchievementEditor(
      user,
      staffId,
    );
    return this.achievementService.deleteStaffAchievement(
      staffId,
      achievementId,
      editor,
    );
  }

  @Put('members/:staffId/achievements/:achievementId/highlight')
  @ApiOperation({
    summary: 'Trưởng phòng: gắn sao thành tích nổi bật (không cần ảnh)',
  })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiResponse({
    status: 200,
    description: 'Danh sách thành tích sau khi đổi, dòng có sao đứng đầu.',
  })
  @ApiResponse({ status: 403, description: FORBIDDEN_ACHIEVEMENT_EDIT })
  @ApiResponse({ status: 404, description: 'Không có nhân sự / thành tích.' })
  async setHighlightAchievement(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
  ) {
    const editor = await this.saleCsTeamService.resolveAchievementEditor(
      user,
      staffId,
    );
    return this.achievementService.setStaffHighlightAchievement(
      staffId,
      achievementId,
      editor,
    );
  }

  @Post('members/:staffId/achievements/:achievementId/image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(achievementImageUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Trưởng phòng: tải/thay ảnh minh chứng' })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Achievement with signed URL.' })
  @ApiResponse({ status: 400, description: 'Invalid image.' })
  @ApiResponse({ status: 403, description: FORBIDDEN_ACHIEVEMENT_EDIT })
  async uploadAchievementImage(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
    @UploadedFile() file?: UploadedImage,
  ) {
    const editor = await this.saleCsTeamService.resolveAchievementEditor(
      user,
      staffId,
    );
    return this.achievementService.uploadStaffAchievementImage(
      staffId,
      achievementId,
      file,
      editor,
    );
  }

  @Delete('members/:staffId/achievements/:achievementId/image')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trưởng phòng: gỡ ảnh minh chứng (kể cả dòng có sao)',
  })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiResponse({ status: 200, description: 'Achievement without image.' })
  @ApiResponse({ status: 403, description: FORBIDDEN_ACHIEVEMENT_EDIT })
  @ApiResponse({ status: 404, description: 'Không có nhân sự / thành tích.' })
  async deleteAchievementImage(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
  ) {
    const editor = await this.saleCsTeamService.resolveAchievementEditor(
      user,
      staffId,
    );
    return this.achievementService.deleteStaffAchievementImage(
      staffId,
      achievementId,
      editor,
    );
  }

  @Get('members/:staffId/sale-allowances')
  @ApiOperation({
    summary: 'Trưởng phòng: trợ cấp sale của thành viên (ẩn số tiền)',
    description:
      'Chỉ học sinh, ghi chú, tháng, ngày tạo. Không có số tiền, thuế, trạng thái thanh toán.',
  })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiResponse({ status: 200, description: 'Danh sách trợ cấp sale.' })
  @ApiResponse({ status: 400, description: 'Tháng sai định dạng.' })
  @ApiResponse({ status: 403, description: FORBIDDEN_NOT_HEAD })
  @ApiResponse({ status: 404, description: 'Không thuộc đội Sale & CSKH.' })
  listSaleAllowances(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Query() query: SaleCsTeamMonthQueryDto,
  ) {
    return this.saleCsTeamService.listSaleAllowances(user, staffId, query);
  }

  @Get('members/:staffId/bonuses')
  @ApiOperation({
    summary: 'Trưởng phòng: thưởng của thành viên (có số tiền, chỉ đọc)',
    description:
      'Tạo/sửa/thanh toán thưởng vẫn chỉ Admin và Kế toán chi qua /bonuses.',
  })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiResponse({ status: 200, description: 'Danh sách thưởng.' })
  @ApiResponse({ status: 400, description: 'Tháng sai định dạng.' })
  @ApiResponse({ status: 403, description: FORBIDDEN_NOT_HEAD })
  @ApiResponse({ status: 404, description: 'Không thuộc đội Sale & CSKH.' })
  listBonuses(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Query() query: SaleCsTeamMonthQueryDto,
  ) {
    return this.saleCsTeamService.listBonuses(user, staffId, query);
  }

  @Patch('members/:staffId/roles')
  @ApiOperation({
    summary: 'Trưởng phòng: bật/tắt role Sale / CSKH',
    description:
      'Body là trạng thái đích của role sale / customer_care; role khác giữ nguyên. 403 nếu tự chỉnh, target là Admin hoặc mang role trưởng, hoặc body có role ngoài sale/customer_care. 400 nếu bỏ hết role. Tắt CSKH → mọi học sinh người đó đang chăm sóc mất Người chăm sóc ngay (gỡ `customer_care_service` cùng transaction, trả `releasedCustomerCareStudentCount`); bật lại không khôi phục, buổi đã ghi giữ nguyên. Role bị tắt mất mức đè lương cứng / % vận hành (ghi action_history).',
  })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiBody({ type: UpdateSaleCsTeamRolesDto })
  @ApiResponse({ status: 200, description: 'Roles sau khi lưu.' })
  @ApiResponse({
    status: 400,
    description: 'Bỏ hết role.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Trưởng phòng, tự chỉnh, target Admin/trưởng hoặc role ngoài phạm vi.',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy nhân sự.' })
  updateRoles(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Body() data: UpdateSaleCsTeamRolesDto,
  ) {
    return this.saleCsTeamService.updateRoles(user, staffId, data);
  }

  @Patch('members/:staffId/account-status')
  @ApiOperation({
    summary: 'Trưởng phòng: khoá / mở khoá tài khoản đăng nhập',
    description:
      'Đổi `users.status` (inactive = khoá). Chỉ khi target CHỈ mang role sale và/hoặc customer_care; mang role khác → 403.',
  })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiBody({ type: UpdateSaleCsTeamAccountStatusDto })
  @ApiResponse({ status: 200, description: 'Trạng thái khoá sau khi lưu.' })
  @ApiResponse({ status: 400, description: 'Nhân sự chưa có tài khoản.' })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Trưởng phòng, tự khoá, target Admin/trưởng hoặc mang role ngoài Sale/CSKH.',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy nhân sự.' })
  updateAccountStatus(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Body() data: UpdateSaleCsTeamAccountStatusDto,
  ) {
    return this.saleCsTeamService.updateAccountStatus(user, staffId, data);
  }

  @Patch('members/:staffId/account-handle')
  @ApiOperation({
    summary: 'Trưởng phòng: đổi tên đăng nhập của nhân sự',
    description:
      'Đổi `users.account_handle` (3–50 ký tự, không khoảng trắng, không `@`, kiểm trùng không phân biệt hoa thường). Cùng phạm vi khoá tài khoản: target CHỈ mang role sale và/hoặc customer_care. Không đăng xuất thiết bị.',
  })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiBody({ type: SetAccountHandleDto })
  @ApiResponse({
    status: 200,
    description: '{ id (staff id), accountHandle }.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Sai định dạng, tên đăng nhập đã được dùng, hoặc nhân sự chưa có tài khoản.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Trưởng phòng, chính mình, target Admin/trưởng hoặc mang role ngoài Sale/CSKH.',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy nhân sự.' })
  updateAccountHandle(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Body() data: SetAccountHandleDto,
  ) {
    return this.saleCsTeamService.updateAccountHandle(user, staffId, data);
  }

  @Patch('members/:staffId/professional-profile')
  @ApiOperation({
    summary: 'Trưởng phòng: sửa hồ sơ chuyên môn',
    description:
      'Chỉ họ, tên, trường đại học, trường THPT. Không sửa được dữ liệu cá nhân, ngân hàng, lương (field ngoài DTO bị loại bỏ).',
  })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiBody({ type: UpdateSaleCsTeamProfileDto })
  @ApiResponse({ status: 200, description: 'Thành viên sau khi lưu.' })
  @ApiResponse({ status: 400, description: 'Tên trống.' })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Trưởng phòng, tự sửa, target Admin/trưởng hoặc ngoài đội.',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy nhân sự.' })
  updateProfessionalProfile(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Body() data: UpdateSaleCsTeamProfileDto,
  ) {
    return this.saleCsTeamService.updateProfessionalProfile(
      user,
      staffId,
      data,
    );
  }

  @Post('members/:staffId/avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: DEFAULT_MAX_IMAGE_BYTES },
      fileFilter: buildImageUploadFileFilter({
        defaultFieldLabel: 'Ảnh đại diện',
        labelsByFieldName: { avatar: 'Ảnh đại diện' },
      }),
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Trưởng phòng: đổi ảnh đại diện của nhân sự dưới cấp',
    description:
      'Cùng phạm vi sửa hồ sơ chuyên môn (`permissions.canEditProfile`). Lưu bản gốc + bản watermark, ghi lịch sử thao tác.',
  })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['avatar'],
      properties: { avatar: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Hồ sơ thành viên sau khi đổi ảnh.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ảnh không hợp lệ / thiếu ảnh / nhân sự chưa có tài khoản.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Trưởng phòng, tự sửa, target Admin/trưởng hoặc ngoài đội.',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy nhân sự.' })
  uploadAvatar(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @UploadedFile() file?: UploadedImage,
  ) {
    return this.saleCsTeamService.uploadAvatar(user, staffId, file);
  }
}
