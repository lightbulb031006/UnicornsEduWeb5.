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
import { FileInterceptor } from '@nestjs/platform-express';
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
import {
  buildImageUploadFileFilter,
  DEFAULT_MAX_IMAGE_BYTES,
} from '../storage/supabase-storage';
import { AchievementService } from './achievement.service';

const imageUploadInterceptor = FileInterceptor('image', {
  limits: { fileSize: DEFAULT_MAX_IMAGE_BYTES },
  fileFilter: buildImageUploadFileFilter({
    defaultFieldLabel: 'Ảnh minh chứng',
    labelsByFieldName: { image: 'Ảnh minh chứng' },
  }),
});

@ApiTags('achievements')
@ApiCookieAuth('access_token')
@Controller('staff/:staffId/achievements')
@Roles(UserRole.admin)
@AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
export class StaffAchievementController {
  constructor(private readonly achievementService: AchievementService) {}

  @Get()
  // Viewing must match whoever can view the staff profile itself
  // (GET staff/:id allows assistant + accountant_expense on admin routes).
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.accountant_expense,
  )
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
  @ApiOperation({ summary: 'Create staff achievement' })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiBody({ type: CreateAchievementDto })
  @ApiResponse({ status: 201, description: 'Created achievement.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Staff not found.' })
  create(
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Body() body: CreateAchievementDto,
  ) {
    return this.achievementService.createStaffAchievement(staffId, body);
  }

  @Patch(':achievementId')
  @ApiOperation({ summary: 'Update staff achievement title/sortOrder' })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiBody({ type: UpdateAchievementDto })
  @ApiResponse({ status: 200, description: 'Updated achievement.' })
  @ApiResponse({ status: 404, description: 'Achievement not found.' })
  update(
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
    @Body() body: UpdateAchievementDto,
  ) {
    return this.achievementService.updateStaffAchievement(
      staffId,
      achievementId,
      body,
    );
  }

  @Delete(':achievementId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete staff achievement (and storage image)' })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiResponse({ status: 200, description: 'Deleted.' })
  @ApiResponse({ status: 404, description: 'Achievement not found.' })
  remove(
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
  ) {
    return this.achievementService.deleteStaffAchievement(
      staffId,
      achievementId,
    );
  }

  @Put('reorder')
  @ApiOperation({ summary: 'Reorder staff achievements' })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiBody({ type: ReorderAchievementsDto })
  @ApiResponse({ status: 200, description: 'Reordered list.' })
  @ApiResponse({ status: 400, description: 'Incomplete or invalid id set.' })
  reorder(
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Body() body: ReorderAchievementsDto,
  ) {
    return this.achievementService.reorderStaffAchievements(staffId, body);
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
  uploadImage(
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
    @UploadedFile()
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    return this.achievementService.uploadStaffAchievementImage(
      staffId,
      achievementId,
      file,
    );
  }

  @Delete(':achievementId/image')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear staff achievement proof image' })
  @ApiParam({ name: 'staffId', description: 'Staff id (UNISTAFF-…)' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  @ApiResponse({ status: 200, description: 'Achievement without image.' })
  deleteImage(
    @Param('staffId', new ParseStaffIdPipe()) staffId: string,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
  ) {
    return this.achievementService.deleteStaffAchievementImage(
      staffId,
      achievementId,
    );
  }
}

@ApiTags('achievements')
@ApiCookieAuth('access_token')
@Controller('student/:studentId/achievements')
@Roles(UserRole.admin)
// Mutations (create/update/delete/upload/reorder) stay admin + assistant only;
// customer_care/accountant/accountant_income can view (see the `list()` override) but not edit.
@AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
export class StudentAchievementController {
  constructor(private readonly achievementService: AchievementService) {}

  @Get()
  // Viewing must match whoever can view the student profile itself
  // (GET student/:id also allows accountant + accountant_income on admin routes).
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.customer_care,
    StaffRole.accountant,
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
  @ApiOperation({ summary: 'Create my staff achievement' })
  @ApiBody({ type: CreateAchievementDto })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateAchievementDto,
  ) {
    const staffId = await this.staffIdFor(user);
    return this.achievementService.createStaffAchievement(staffId, body);
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
    );
  }

  @Delete(':achievementId/image')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear my achievement proof image' })
  @ApiParam({ name: 'achievementId', description: 'Achievement UUID' })
  async deleteImage(
    @CurrentUser() user: JwtPayload,
    @Param('achievementId', ParseUUIDPipe) achievementId: string,
  ) {
    const staffId = await this.staffIdFor(user);
    return this.achievementService.deleteStaffAchievementImage(
      staffId,
      achievementId,
    );
  }
}
