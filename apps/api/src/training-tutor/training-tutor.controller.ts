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
import { UserRole } from 'generated/enums';
import {
  CurrentUser,
  type JwtPayload,
} from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ParseStaffIdPipe } from 'src/common/pipes/parse-entity-id.pipe';
import { PaginationQueryDto } from 'src/dtos/pagination.dto';
import {
  TrainingRoleCandidateQueryDto,
  TrainingTutorListQueryDto,
  TrainingTutorMonthQueryDto,
  UpdateTrainingTutorAccountStatusDto,
  UpdateTrainingTutorProfileDto,
  UpdateTrainingTutorStatusDto,
} from 'src/dtos/training-tutor.dto';
import { SetAccountHandleDto } from 'src/dtos/user.dto';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { TrainingTutorService } from './training-tutor.service';

type UploadedImage = { buffer: Buffer; mimetype: string; size: number };

@ApiTags('training-tutors')
@Controller('training/tutors')
@ApiCookieAuth('access_token')
@Roles(UserRole.staff, UserRole.admin)
export class TrainingTutorController {
  constructor(
    private readonly trainingTutorService: TrainingTutorService,
    private readonly achievementService: AchievementService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Ban Đào Tạo: danh sách gia sư (gồm cả inactive)',
    description:
      'Chỉ trả field allowlist: id, fullName, status, roles, avatarUrl, university, highSchool, achievementCount, currentClasses (Lớp đang dạy: {id, name}[]). `scope=all`: nhân sự ba nhóm Gia sư / Ban Chuyên môn / Đào tạo — chỉ Trưởng ban Đào tạo/admin, Ban Đào Tạo thường 403. Ngoài Admin, `roles` chỉ gồm ba role này. Trưởng ban Đào tạo nhận thêm `management` (cấp dưới hay không, trạng thái khoá, cờ quyền) (#278).',
  })
  @ApiResponse({ status: 200, description: 'Paginated tutor summaries.' })
  @ApiResponse({ status: 403, description: 'Không phải Ban Đào Tạo.' })
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: TrainingTutorListQueryDto,
  ) {
    return this.trainingTutorService.listTutors(user, query);
  }

  // Khai báo trước `:id` để không bị route động nuốt.
  @Get('role-candidates')
  @ApiOperation({
    summary:
      'Trưởng ban Đào tạo: ứng viên bật role Gia sư / Ban Chuyên môn / Đào tạo',
    description:
      'Nhân sự thường **ngoài** ba nhóm (vd CSKH thuần), đang active: loại Admin, người mang role trưởng, tài khoản admin hệ thống và chính người gọi. Chỉ trả `{ id, fullName, roles }` (roles = role hiện có) — không email, SĐT, CCCD, ảnh, ngân hàng, tiền. Bật role qua `PATCH /staff/:id/training-roles`. Follow-up grill 13/11 mục 2.2.',
  })
  @ApiResponse({
    status: 200,
    description:
      '`{ data: { id, fullName, roles }[], meta: { total, page, limit } }`.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Không phải staff active mang role Trưởng ban Đào tạo (kể cả Admin không có role này, Ban Đào Tạo thường).',
  })
  roleCandidates(
    @CurrentUser() user: JwtPayload,
    @Query() query: TrainingRoleCandidateQueryDto,
  ) {
    return this.trainingTutorService.listRoleCandidates(user, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Ban Đào Tạo: hồ sơ gia sư + Lớp đang dạy / Lớp đã nghỉ',
  })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
  @ApiResponse({
    status: 200,
    description: 'Tutor detail without hidden fields.',
  })
  @ApiResponse({ status: 403, description: 'Không phải Ban Đào Tạo.' })
  @ApiResponse({
    status: 404,
    description:
      'Không phải gia sư (Ban Đào Tạo thường) hoặc không tồn tại. Trưởng ban/admin mở được nhân sự ba nhóm Gia sư / Ban Chuyên môn / Đào tạo.',
  })
  detail(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
  ) {
    return this.trainingTutorService.getTutor(user, staffId);
  }

  @Get(':id/sessions')
  @ApiOperation({
    summary: 'Ban Đào Tạo: buổi gia sư đã dạy (không có tiền)',
  })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated sessions: date, time, class.',
  })
  @ApiResponse({ status: 403, description: 'Không phải Ban Đào Tạo.' })
  @ApiResponse({ status: 404, description: 'Không phải gia sư.' })
  sessions(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.trainingTutorService.listTutorSessions(user, staffId, query);
  }

  @Get(':id/achievements')
  @ApiOperation({ summary: 'Ban Đào Tạo: thành tích gia sư' })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
  @ApiResponse({ status: 200, description: 'Achievements in profile order.' })
  @ApiResponse({ status: 403, description: 'Không phải Ban Đào Tạo.' })
  @ApiResponse({ status: 404, description: 'Không phải gia sư.' })
  achievements(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
  ) {
    return this.trainingTutorService.listTutorAchievements(user, staffId);
  }

  // Ban Đào Tạo sửa thành tích như admin: không ràng buộc minh chứng, ghi lịch
  // sử thao tác (trừ sắp xếp). Phạm vi = phạm vi xem; hồ sơ của mình → 403.

  @Post(':id/achievements')
  @UseInterceptors(achievementImageUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Ban Đào Tạo: thêm thành tích (ảnh tuỳ chọn)',
  })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
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
  @ApiResponse({
    status: 403,
    description: 'Không phải Ban Đào Tạo hoặc hồ sơ của chính mình.',
  })
  @ApiResponse({ status: 404, description: 'Ngoài phạm vi xem.' })
  async createAchievement(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
    @Body() body: CreateAchievementDto,
    @UploadedFile() file?: UploadedImage,
  ) {
    const editor = await this.trainingTutorService.resolveAchievementEditor(
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

  @Patch(':id/achievements/:achievementId')
  @ApiOperation({ summary: 'Ban Đào Tạo: sửa tiêu đề/sortOrder thành tích' })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiBody({ type: UpdateAchievementDto })
  @ApiResponse({ status: 200, description: 'Updated achievement.' })
  @ApiResponse({
    status: 403,
    description: 'Không phải Ban Đào Tạo hoặc hồ sơ của chính mình.',
  })
  @ApiResponse({ status: 404, description: 'Ngoài phạm vi / không có.' })
  async updateAchievement(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
    @Body() body: UpdateAchievementDto,
  ) {
    const editor = await this.trainingTutorService.resolveAchievementEditor(
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

  @Delete(':id/achievements/:achievementId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ban Đào Tạo: xoá thành tích (kèm ảnh)' })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiResponse({ status: 200, description: 'Deleted.' })
  @ApiResponse({
    status: 403,
    description: 'Không phải Ban Đào Tạo hoặc hồ sơ của chính mình.',
  })
  @ApiResponse({ status: 404, description: 'Ngoài phạm vi / không có.' })
  async deleteAchievement(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
  ) {
    const editor = await this.trainingTutorService.resolveAchievementEditor(
      user,
      staffId,
    );
    return this.achievementService.deleteStaffAchievement(
      staffId,
      achievementId,
      editor,
    );
  }

  @Put(':id/achievements/reorder')
  @ApiOperation({ summary: 'Ban Đào Tạo: sắp xếp thành tích' })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
  @ApiBody({ type: ReorderAchievementsDto })
  @ApiResponse({ status: 200, description: 'Reordered list.' })
  @ApiResponse({ status: 400, description: 'Incomplete or invalid id set.' })
  @ApiResponse({
    status: 403,
    description: 'Không phải Ban Đào Tạo hoặc hồ sơ của chính mình.',
  })
  async reorderAchievements(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
    @Body() body: ReorderAchievementsDto,
  ) {
    await this.trainingTutorService.resolveAchievementEditor(user, staffId);
    return this.achievementService.reorderStaffAchievements(staffId, body);
  }

  @Put(':id/achievements/:achievementId/highlight')
  @ApiOperation({
    summary: 'Ban Đào Tạo: gắn sao thành tích nổi bật (không cần ảnh)',
  })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiResponse({
    status: 200,
    description: 'Danh sách thành tích sau khi đổi, dòng có sao đứng đầu.',
  })
  @ApiResponse({
    status: 403,
    description: 'Không phải Ban Đào Tạo hoặc hồ sơ của chính mình.',
  })
  @ApiResponse({ status: 404, description: 'Ngoài phạm vi / không có.' })
  async setHighlightAchievement(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
  ) {
    const editor = await this.trainingTutorService.resolveAchievementEditor(
      user,
      staffId,
    );
    return this.achievementService.setStaffHighlightAchievement(
      staffId,
      achievementId,
      editor,
    );
  }

  @Post(':id/achievements/:achievementId/image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(achievementImageUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Ban Đào Tạo: tải/thay ảnh minh chứng' })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
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
  @ApiResponse({
    status: 403,
    description: 'Không phải Ban Đào Tạo hoặc hồ sơ của chính mình.',
  })
  async uploadAchievementImage(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
    @UploadedFile() file?: UploadedImage,
  ) {
    const editor = await this.trainingTutorService.resolveAchievementEditor(
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

  @Delete(':id/achievements/:achievementId/image')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ban Đào Tạo: gỡ ảnh minh chứng (kể cả dòng có sao)',
  })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiResponse({ status: 200, description: 'Achievement without image.' })
  @ApiResponse({
    status: 403,
    description: 'Không phải Ban Đào Tạo hoặc hồ sơ của chính mình.',
  })
  @ApiResponse({ status: 404, description: 'Ngoài phạm vi / không có.' })
  async deleteAchievementImage(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
  ) {
    const editor = await this.trainingTutorService.resolveAchievementEditor(
      user,
      staffId,
    );
    return this.achievementService.deleteStaffAchievementImage(
      staffId,
      achievementId,
      editor,
    );
  }

  // ---------------------------------------------------------------------------
  // Trưởng ban Đào tạo quản lý cấp dưới (#278). Cấp dưới = mang role Gia sư /
  // Ban Chuyên môn / Đào tạo, không phải chính mình, Admin hay người mang role
  // trưởng. Không có thông tin cá nhân hay thu nhập cá nhân.
  // ---------------------------------------------------------------------------

  @Get(':id/bonuses')
  @ApiOperation({
    summary: 'Trưởng ban Đào tạo: xem thưởng của cấp dưới (chỉ đọc)',
    description:
      'Thưởng không phải thu nhập cá nhân nên Trưởng ban xem được, có số tiền. Không có API tạo/sửa/xoá thưởng cho Trưởng ban.',
  })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
  @ApiResponse({ status: 200, description: 'Danh sách thưởng.' })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Trưởng ban Đào tạo hoặc người đích không phải cấp dưới.',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy nhân sự.' })
  bonuses(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
    @Query() query: TrainingTutorMonthQueryDto,
  ) {
    return this.trainingTutorService.listBonuses(user, staffId, query);
  }

  @Patch(':id/professional-profile')
  @ApiOperation({
    summary: 'Trưởng ban Đào tạo: sửa hồ sơ chuyên môn của cấp dưới',
    description:
      'Chỉ họ, tên, trường đại học, trường THPT. Thông tin cá nhân (SĐT, CCCD, ngân hàng…) không sửa được qua API này.',
  })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
  @ApiBody({ type: UpdateTrainingTutorProfileDto })
  @ApiResponse({ status: 200, description: 'Hồ sơ sau khi sửa.' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ.' })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Trưởng ban Đào tạo hoặc người đích không phải cấp dưới.',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy nhân sự.' })
  updateProfessionalProfile(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
    @Body() body: UpdateTrainingTutorProfileDto,
  ) {
    return this.trainingTutorService.updateProfessionalProfile(
      user,
      staffId,
      body,
    );
  }

  @Post(':id/avatar')
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
    summary: 'Trưởng ban Đào tạo: đổi ảnh đại diện của cấp dưới',
  })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['avatar'],
      properties: { avatar: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Hồ sơ sau khi đổi ảnh.' })
  @ApiResponse({ status: 400, description: 'Ảnh không hợp lệ.' })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Trưởng ban Đào tạo hoặc người đích không phải cấp dưới.',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy nhân sự.' })
  uploadAvatar(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
    @UploadedFile() file?: UploadedImage,
  ) {
    return this.trainingTutorService.uploadAvatar(user, staffId, file);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Trưởng ban Đào tạo: đổi trạng thái đang làm / đã nghỉ',
    description:
      'Chỉ khi người đích chỉ mang role Gia sư / Ban Chuyên môn / Đào tạo (trạng thái ảnh hưởng mọi role). Chuyển nghỉ thì đóng lịch dạy tương lai như luồng Admin.',
  })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
  @ApiBody({ type: UpdateTrainingTutorStatusDto })
  @ApiResponse({ status: 200, description: '{ id, status }.' })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Trưởng ban Đào tạo, người đích không phải cấp dưới hoặc mang role ngoài ba nhóm.',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy nhân sự.' })
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
    @Body() body: UpdateTrainingTutorStatusDto,
  ) {
    return this.trainingTutorService.updateStatus(user, staffId, body);
  }

  @Patch(':id/account-handle')
  @ApiOperation({
    summary: 'Trưởng ban Đào tạo: đổi tên đăng nhập của cấp dưới',
    description:
      'Đổi `users.account_handle` (3–50 ký tự, không khoảng trắng, không `@`, kiểm trùng không phân biệt hoa thường). Cùng điều kiện khoá tài khoản: người đích CHỈ mang role Gia sư / Ban Chuyên môn / Đào tạo. Không đăng xuất thiết bị.',
  })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
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
      'Không phải Trưởng ban Đào tạo, chính mình, người đích không phải cấp dưới hoặc mang role ngoài ba nhóm.',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy nhân sự.' })
  updateAccountHandle(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
    @Body() body: SetAccountHandleDto,
  ) {
    return this.trainingTutorService.updateAccountHandle(user, staffId, body);
  }

  @Patch(':id/account-status')
  @ApiOperation({
    summary: 'Trưởng ban Đào tạo: khoá / mở khoá tài khoản của cấp dưới',
    description:
      'Chỉ khi người đích chỉ mang role Gia sư / Ban Chuyên môn / Đào tạo. Không khoá được chính mình, Admin hay người mang role trưởng.',
  })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
  @ApiBody({ type: UpdateTrainingTutorAccountStatusDto })
  @ApiResponse({ status: 200, description: '{ id, accountLocked }.' })
  @ApiResponse({ status: 400, description: 'Nhân sự chưa có tài khoản.' })
  @ApiResponse({
    status: 403,
    description:
      'Không phải Trưởng ban Đào tạo, chính mình, người đích không phải cấp dưới hoặc mang role ngoài ba nhóm.',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy nhân sự.' })
  updateAccountStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
    @Body() body: UpdateTrainingTutorAccountStatusDto,
  ) {
    return this.trainingTutorService.updateAccountStatus(user, staffId, body);
  }
}
