import { SALE_CS_HEAD_ROLE } from 'src/common/sale-cs-head-access';
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
  UploadedFile,
  UseGuards,
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
import { StaffRole, UserRole } from 'generated/enums';
import {
  CurrentUser,
  type JwtPayload,
} from '../auth/decorators/current-user.decorator';
import { AllowStaffRolesOnAdminRoutes } from '../auth/decorators/allow-staff-roles-on-admin.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import {
  CreateAchievementDto,
  CreateStudentAchievementDto,
  ReorderAchievementsDto,
  UpdateAchievementDto,
  UpdateStudentAchievementDto,
} from '../dtos/achievement.dto';
import {
  ParseStaffIdPipe,
  ParseStudentIdPipe,
} from '../common/pipes/parse-entity-id.pipe';
import { achievementImageUploadInterceptor } from './achievement-image-upload';
import {
  AchievementService,
  SELF_STAFF_ACHIEVEMENT_EDITOR,
} from './achievement.service';

const imageUploadInterceptor = achievementImageUploadInterceptor;

@ApiTags('achievements')
@ApiCookieAuth('access_token')
@Controller('staff/:staffId/achievements')
@Roles(UserRole.admin)
export class StaffAchievementController {
  constructor(private readonly achievementService: AchievementService) {}

  /** Admin/trợ lí sửa hồ sơ người khác; hồ sơ của chính mình → 403. */
  private editorFor(user: JwtPayload, staffId: string) {
    return this.achievementService.resolveOtherStaffAchievementEditor(
      user,
      staffId,
    );
  }

  @Get()
  // Viewing must match whoever can view the staff profile itself
  // (GET staff/:id allows assistant + accountant_expense on admin routes).
  @AllowStaffRolesOnAdminRoutes(StaffRole.accountant_expense)
  @ApiOperation({ summary: 'List staff achievements' })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiResponse({
    status: 200,
    description: 'Achievements ordered by sortOrder.',
  })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  list(@Param('staffId', new ParseStaffIdPipe()) staffId: string) {
    return this.achievementService.listStaffAchievements(staffId);
  }

  @Post()
  @UseInterceptors(imageUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Create staff achievement (proof image optional; never auto-highlighted)',
  })
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
  @ApiResponse({ status: 403, description: 'Own staff record.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Body() body: CreateAchievementDto,
    @UploadedFile()
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    const editor = await this.editorFor(user, staffId);
    return this.achievementService.createStaffAchievement(
      staffId,
      body,
      file,
      editor,
    );
  }

  @Patch(':achievementId')
  @ApiOperation({ summary: 'Update staff achievement title/sortOrder' })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiBody({ type: UpdateAchievementDto })
  @ApiResponse({ status: 200, description: 'Updated achievement.' })
  @ApiResponse({ status: 403, description: 'Own staff record.' })
  @ApiResponse({ status: 404, description: 'Achievement not found.' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
    @Body() body: UpdateAchievementDto,
  ) {
    const editor = await this.editorFor(user, staffId);
    return this.achievementService.updateStaffAchievement(
      staffId,
      achievementId,
      body,
      editor,
    );
  }

  @Delete(':achievementId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete staff achievement (and storage image)' })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiResponse({ status: 200, description: 'Deleted.' })
  @ApiResponse({ status: 403, description: 'Own staff record.' })
  @ApiResponse({ status: 404, description: 'Achievement not found.' })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
  ) {
    const editor = await this.editorFor(user, staffId);
    return this.achievementService.deleteStaffAchievement(
      staffId,
      achievementId,
      editor,
    );
  }

  @Put('reorder')
  @ApiOperation({ summary: 'Reorder staff achievements' })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiBody({ type: ReorderAchievementsDto })
  @ApiResponse({ status: 200, description: 'Reordered list.' })
  @ApiResponse({ status: 400, description: 'Incomplete or invalid id set.' })
  @ApiResponse({ status: 403, description: 'Own staff record.' })
  async reorder(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Body() body: ReorderAchievementsDto,
  ) {
    await this.editorFor(user, staffId);
    return this.achievementService.reorderStaffAchievements(staffId, body);
  }

  @Put(':achievementId/highlight')
  @ApiOperation({
    summary: 'Set staff highlight achievement (thành tích nổi bật)',
    description:
      'Đánh dấu sao một thành tích: bỏ sao cũ, đưa thành tích này lên đầu danh sách.',
  })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiResponse({
    status: 200,
    description:
      'Danh sách thành tích sau khi đổi, thành tích nổi bật đứng đầu.',
  })
  @ApiResponse({ status: 403, description: 'Own staff record.' })
  @ApiResponse({ status: 404, description: 'Achievement not found.' })
  async setHighlight(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
  ) {
    const editor = await this.editorFor(user, staffId);
    return this.achievementService.setStaffHighlightAchievement(
      staffId,
      achievementId,
      editor,
    );
  }

  @Post(':achievementId/image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(imageUploadInterceptor)
  @ApiOperation({ summary: 'Upload/replace staff achievement proof image' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Achievement with signed image URL.',
  })
  @ApiResponse({ status: 400, description: 'Invalid image.' })
  @ApiResponse({ status: 403, description: 'Own staff record.' })
  async uploadImage(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
    @UploadedFile()
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    const editor = await this.editorFor(user, staffId);
    return this.achievementService.uploadStaffAchievementImage(
      staffId,
      achievementId,
      file,
      editor,
    );
  }

  @Delete(':achievementId/image')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Clear a staff achievement proof image (highlight rows allowed for admin/assistant)',
  })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiResponse({ status: 200, description: 'Achievement without image.' })
  @ApiResponse({ status: 403, description: 'Own staff record.' })
  @ApiResponse({ status: 404, description: 'Achievement not found.' })
  async deleteImage(
    @CurrentUser() user: JwtPayload,
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
  ) {
    const editor = await this.editorFor(user, staffId);
    return this.achievementService.deleteStaffAchievementImage(
      staffId,
      achievementId,
      editor,
    );
  }
}

@ApiTags('achievements')
@ApiCookieAuth('access_token')
@Controller('student/:studentId/achievements')
@Roles(UserRole.admin)
// Mutations (create/update/delete/upload/reorder) stay admin + assistant only;
// customer_care/accountant/accountant_income can view (see the `list()` override) but not edit.
@AllowStaffRolesOnAdminRoutes(SALE_CS_HEAD_ROLE)
export class StudentAchievementController {
  constructor(private readonly achievementService: AchievementService) {}

  @Get()
  // Viewing must match whoever can view the student profile itself
  // (GET student/:id also allows accountant_income on admin routes).
  @AllowStaffRolesOnAdminRoutes(
    SALE_CS_HEAD_ROLE,
    StaffRole.customer_care,
    StaffRole.accountant_income,
  )
  @ApiOperation({ summary: 'List student achievements' })
  @ApiParam({ name: 'studentId', description: 'Student id (UNIST-…)' })
  @ApiResponse({
    status: 200,
    description: 'Achievements ordered by sortOrder.',
  })
  list(@Param('studentId', new ParseStudentIdPipe()) studentId: string) {
    return this.achievementService.listStudentAchievements(studentId);
  }

  @Post()
  @ApiOperation({ summary: 'Create student achievement' })
  @ApiParam({ name: 'studentId', description: 'Student id (UNIST-…)' })
  @ApiBody({ type: CreateStudentAchievementDto })
  @ApiResponse({ status: 201, description: 'Created achievement.' })
  create(
    @Param('studentId', new ParseStudentIdPipe()) studentId: string,
    @Body() body: CreateStudentAchievementDto,
  ) {
    return this.achievementService.createStudentAchievement(studentId, body);
  }

  @Patch(':achievementId')
  @ApiOperation({ summary: 'Update student achievement' })
  @ApiParam({ name: 'studentId', description: 'Student id (UNIST-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiBody({ type: UpdateStudentAchievementDto })
  update(
    @Param('studentId', new ParseStudentIdPipe()) studentId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
    @Body() body: UpdateStudentAchievementDto,
  ) {
    return this.achievementService.updateStudentAchievement(
      studentId,
      achievementId,
      body,
    );
  }

  @Delete(':achievementId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete student achievement' })
  @ApiParam({ name: 'studentId', description: 'Student id (UNIST-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  remove(
    @Param('studentId', new ParseStudentIdPipe()) studentId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
  ) {
    return this.achievementService.deleteStudentAchievement(
      studentId,
      achievementId,
    );
  }

  @Put('reorder')
  @ApiOperation({ summary: 'Reorder student achievements' })
  @ApiParam({ name: 'studentId', description: 'Student id (UNIST-…)' })
  @ApiBody({ type: ReorderAchievementsDto })
  reorder(
    @Param('studentId', new ParseStudentIdPipe()) studentId: string,
    @Body() body: ReorderAchievementsDto,
  ) {
    return this.achievementService.reorderStudentAchievements(studentId, body);
  }

  @Post(':achievementId/image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(imageUploadInterceptor)
  @ApiOperation({ summary: 'Upload/replace student achievement proof image' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'studentId', description: 'Student id (UNIST-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  uploadImage(
    @Param('studentId', new ParseStudentIdPipe()) studentId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
    @UploadedFile()
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    return this.achievementService.uploadStudentAchievementImage(
      studentId,
      achievementId,
      file,
    );
  }

  @Delete(':achievementId/image')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear student achievement proof image' })
  @ApiParam({ name: 'studentId', description: 'Student id (UNIST-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  deleteImage(
    @Param('studentId', new ParseStudentIdPipe()) studentId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
  ) {
    return this.achievementService.deleteStudentAchievementImage(
      studentId,
      achievementId,
    );
  }
}

@ApiTags('achievements')
@ApiCookieAuth('access_token')
@Controller('users/me/achievements')
@UseGuards(VerifiedEmailGuard)
@Roles(UserRole.admin, UserRole.staff)
export class MyAchievementController {
  constructor(private readonly achievementService: AchievementService) {}

  private async staffIdFor(user: JwtPayload) {
    return this.achievementService.resolveStaffIdForUser(user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List my staff achievements' })
  @ApiResponse({ status: 200, description: 'Achievements for linked staff.' })
  @ApiResponse({ status: 404, description: 'No linked staff profile.' })
  async list(@CurrentUser() user: JwtPayload) {
    const staffId = await this.staffIdFor(user);
    return this.achievementService.listStaffAchievements(staffId);
  }

  @Post()
  @UseInterceptors(imageUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Create my staff achievement (proof image optional; never auto-highlighted)',
  })
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
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateAchievementDto,
    @UploadedFile()
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    const staffId = await this.staffIdFor(user);
    return this.achievementService.createStaffAchievement(
      staffId,
      body,
      file,
      SELF_STAFF_ACHIEVEMENT_EDITOR,
    );
  }

  @Patch(':achievementId')
  @ApiOperation({ summary: 'Update my staff achievement' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiBody({ type: UpdateAchievementDto })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
    @Body() body: UpdateAchievementDto,
  ) {
    const staffId = await this.staffIdFor(user);
    return this.achievementService.updateStaffAchievement(
      staffId,
      achievementId,
      body,
      SELF_STAFF_ACHIEVEMENT_EDITOR,
    );
  }

  @Delete(':achievementId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete my staff achievement' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
  ) {
    const staffId = await this.staffIdFor(user);
    return this.achievementService.deleteStaffAchievement(
      staffId,
      achievementId,
      SELF_STAFF_ACHIEVEMENT_EDITOR,
    );
  }

  @Put('reorder')
  @ApiOperation({ summary: 'Reorder my staff achievements' })
  @ApiBody({ type: ReorderAchievementsDto })
  async reorder(
    @CurrentUser() user: JwtPayload,
    @Body() body: ReorderAchievementsDto,
  ) {
    const staffId = await this.staffIdFor(user);
    return this.achievementService.reorderStaffAchievements(staffId, body);
  }

  @Put(':achievementId/highlight')
  @ApiOperation({
    summary: 'Set my highlight achievement (thành tích nổi bật)',
    description:
      'Đánh dấu sao một thành tích: bỏ sao cũ, đưa thành tích này lên đầu danh sách.',
  })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiResponse({
    status: 200,
    description:
      'Danh sách thành tích sau khi đổi, thành tích nổi bật đứng đầu.',
  })
  @ApiResponse({ status: 404, description: 'Achievement not found.' })
  async setHighlight(
    @CurrentUser() user: JwtPayload,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
  ) {
    const staffId = await this.staffIdFor(user);
    return this.achievementService.setStaffHighlightAchievement(
      staffId,
      achievementId,
      SELF_STAFF_ACHIEVEMENT_EDITOR,
    );
  }

  @Post(':achievementId/image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(imageUploadInterceptor)
  @ApiOperation({ summary: 'Upload/replace my achievement proof image' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  async uploadImage(
    @CurrentUser() user: JwtPayload,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
    @UploadedFile()
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    const staffId = await this.staffIdFor(user);
    return this.achievementService.uploadStaffAchievementImage(
      staffId,
      achievementId,
      file,
      SELF_STAFF_ACHIEVEMENT_EDITOR,
    );
  }

  @Delete(':achievementId/image')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Clear my staff achievement proof image (not allowed on the highlight row)',
  })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiResponse({ status: 200, description: 'Achievement without image.' })
  @ApiResponse({
    status: 400,
    description: 'Highlight achievement image can be replaced, not removed.',
  })
  @ApiResponse({ status: 404, description: 'Achievement not found.' })
  async deleteImage(
    @CurrentUser() user: JwtPayload,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
  ) {
    const staffId = await this.staffIdFor(user);
    return this.achievementService.deleteStaffAchievementImage(
      staffId,
      achievementId,
      SELF_STAFF_ACHIEVEMENT_EDITOR,
    );
  }
}
