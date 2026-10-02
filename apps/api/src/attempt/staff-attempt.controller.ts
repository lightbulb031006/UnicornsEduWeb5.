import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiBody,
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
import { ParseClassIdPipe } from 'src/common/pipes/parse-entity-id.pipe';
import { GradeEssayAnswerDto } from 'src/dtos/attempt.dto';
import { StaffOperationsAccessService } from 'src/staff-ops/staff-operations-access.service';
import { AttemptService } from './attempt.service';

@ApiTags('staff-ops-essay-grading')
@ApiCookieAuth('access_token')
@Controller(
  'staff-ops/classes/:classId/assignments/:assignmentId/grading-queue',
)
@Roles(UserRole.staff, UserRole.admin)
export class StaffAttemptGradingController {
  constructor(
    private readonly attemptService: AttemptService,
    private readonly staffOperationsAccess: StaffOperationsAccessService,
  ) {}

  /** Chỉ admin hoặc gia sư phụ trách lớp mới được chấm tự luận. */
  private async assertGraderAccess(
    user: JwtPayload,
    classId: string,
  ): Promise<void> {
    const actor = await this.staffOperationsAccess.resolveClassViewerActor(
      user.id,
      user.roleType,
    );
    const mode = await this.staffOperationsAccess.resolveClassViewAccessMode(
      actor,
      classId,
    );
    if (mode !== 'admin' && mode !== 'teacher') {
      throw new ForbiddenException(
        'Chỉ gia sư phụ trách lớp hoặc admin mới được chấm tự luận.',
      );
    }
  }

  @Get()
  @ApiOperation({
    summary: 'Hàng đợi chấm tự luận của một lần giao',
    description:
      'Chỉ câu tự luận chưa chấm của lượt làm mới nhất mỗi học sinh. Lượt cũ không nằm trong hàng đợi. Bài tập ôn nhẹ không xuất hiện.',
  })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'assignmentId', description: 'class_content_items.id' })
  @ApiResponse({ status: 200, description: 'Essay grading queue.' })
  @ApiResponse({ status: 403, description: 'Không có quyền chấm lớp này.' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lần giao.' })
  async getQueue(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    await this.assertGraderAccess(user, classId);
    return this.attemptService.getGradingQueue(classId, assignmentId);
  }

  @Patch(':attemptAnswerId')
  @ApiOperation({
    summary: 'Chấm 1 câu tự luận',
    description:
      'Lưu điểm (theo thang điểm snapshot của câu) và nhận xét. Chỉ chấp nhận câu thuộc lượt làm mới nhất của học sinh; lượt cũ trả 404.',
  })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'assignmentId', description: 'class_content_items.id' })
  @ApiParam({ name: 'attemptAnswerId', description: 'attempt_answers.id' })
  @ApiBody({ type: GradeEssayAnswerDto })
  @ApiResponse({ status: 200, description: 'Đã chấm.' })
  @ApiResponse({ status: 400, description: 'Điểm vượt quá thang điểm câu.' })
  @ApiResponse({ status: 403, description: 'Không có quyền chấm lớp này.' })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy câu tự luận cần chấm.',
  })
  async grade(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Param('attemptAnswerId', ParseUUIDPipe) attemptAnswerId: string,
    @Body() dto: GradeEssayAnswerDto,
  ) {
    await this.assertGraderAccess(user, classId);
    await this.attemptService.gradeEssayAnswer(
      classId,
      assignmentId,
      attemptAnswerId,
      dto,
    );
    return { ok: true };
  }
}

@ApiTags('staff-ops-practice-stats')
@ApiCookieAuth('access_token')
@Controller('staff-ops/classes/:classId/assignments/:assignmentId')
@Roles(UserRole.staff, UserRole.admin)
export class StaffAttemptStatsController {
  constructor(
    private readonly attemptService: AttemptService,
    private readonly staffOperationsAccess: StaffOperationsAccessService,
  ) {}

  private async assertViewerAccess(
    user: JwtPayload,
    classId: string,
  ): Promise<void> {
    const actor = await this.staffOperationsAccess.resolveClassViewerActor(
      user.id,
      user.roleType,
    );
    const mode = await this.staffOperationsAccess.resolveClassViewAccessMode(
      actor,
      classId,
    );
    if (mode !== 'admin' && mode !== 'teacher') {
      throw new ForbiddenException(
        'Chỉ gia sư phụ trách lớp hoặc admin mới xem thống kê lần giao.',
      );
    }
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Thống kê một lần giao luyện tập',
    description:
      'Bảng độc lập theo classContentItemId + classId. Điểm trên thang 100 (chia đều N câu lúc start). Lượt cao nhất đã chấm xong (MCQ autoGradedScore + tổng pointsAwarded essay). Lượt còn hasUngradedEssay không vào điểm / trung bình / tỉ lệ đúng. Essay “đúng” khi pointsAwarded === pointsPossible.',
  })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'assignmentId', description: 'class_content_items.id' })
  @ApiResponse({ status: 200, description: 'Practice assignment stats.' })
  @ApiResponse({ status: 403, description: 'Không có quyền xem lớp này.' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lần giao.' })
  async getStats(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    await this.assertViewerAccess(user, classId);
    return this.attemptService.getPracticeStats(classId, assignmentId);
  }
}
