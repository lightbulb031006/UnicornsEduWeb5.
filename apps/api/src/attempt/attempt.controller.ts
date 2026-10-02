import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { SaveAttemptAnswersDto } from 'src/dtos/attempt.dto';
import { CourseContentService } from 'src/course-content/course-content.service';
import { AttemptService } from './attempt.service';

@ApiTags('attempts')
@ApiCookieAuth('access_token')
@Controller('users/me/student-classes/:classId')
@Roles(UserRole.student)
export class StudentAttemptController {
  constructor(
    private readonly attemptService: AttemptService,
    private readonly topicService: CourseContentService,
  ) {}

  private async studentId(userId: string): Promise<string> {
    const studentId = await this.topicService.findStudentIdByUserId(userId);
    if (!studentId) {
      throw new NotFoundException('Student profile not found');
    }
    return studentId;
  }

  @Get('assignments/:assignmentId')
  @ApiOperation({
    summary: 'Lobby lần giao luyện tập',
    description:
      'Danh sách lượt làm của học sinh cho một ClassContentItem (assignment). Chặn trước openAt và khi lớp hết hạn xem.',
  })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'assignmentId', description: 'class_content_items.id' })
  @ApiResponse({ status: 200, description: 'Assignment lobby.' })
  @ApiResponse({ status: 403, description: 'Chưa mở bài hoặc lớp hết hạn.' })
  async lobby(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    return this.attemptService.getLobby(
      classId,
      assignmentId,
      await this.studentId(user.id),
    );
  }

  @Post('assignments/:assignmentId/attempts')
  @ApiOperation({
    summary: 'Bắt đầu hoặc tiếp tục Attempt',
    description:
      'Tạo lượt mới gắn assignmentId. Nếu đang có lượt in_progress thì trả lại lượt đó (đồng hồ không reset).',
  })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'assignmentId', description: 'class_content_items.id' })
  @ApiResponse({ status: 201, description: 'Attempt started or resumed.' })
  @ApiResponse({ status: 403, description: 'Chưa mở bài hoặc lớp hết hạn.' })
  async start(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    return this.attemptService.start(
      classId,
      assignmentId,
      await this.studentId(user.id),
    );
  }

  @Get('attempts/:attemptId')
  @ApiOperation({
    summary: 'Chi tiết Attempt',
    description:
      'Nếu hết giờ thì chốt câu đã trả lời và chấm MCQ (không huỷ bài). Cron mỗi phút cũng chốt lượt in_progress đã quá endsAt khi học sinh không quay lại.',
  })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'attemptId', description: 'Attempt ID' })
  @ApiResponse({ status: 200, description: 'Attempt detail.' })
  async get(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    return this.attemptService.get(
      classId,
      attemptId,
      await this.studentId(user.id),
    );
  }

  @Patch('attempts/:attemptId/answers')
  @ApiOperation({ summary: 'Lưu câu trả lời (autosave)' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'attemptId', description: 'Attempt ID' })
  @ApiBody({ type: SaveAttemptAnswersDto })
  @ApiResponse({ status: 200, description: 'Saved (or already closed).' })
  async saveAnswers(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: SaveAttemptAnswersDto,
  ) {
    return this.attemptService.saveAnswers(
      classId,
      attemptId,
      await this.studentId(user.id),
      dto.answers ?? [],
    );
  }

  @Post('attempts/:attemptId/submit')
  @ApiOperation({
    summary: 'Nộp bài',
    description:
      'Chốt câu đã trả lời, chấm trắc nghiệm. Hết giờ dùng status timed_out, không huỷ. Trùng cron finalize thì chỉ một bên claim được (status = in_progress).',
  })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'attemptId', description: 'Attempt ID' })
  @ApiResponse({ status: 201, description: 'Submitted or timed out.' })
  async submit(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    return this.attemptService.submit(
      classId,
      attemptId,
      await this.studentId(user.id),
    );
  }
}
