import {
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { StaffRole, UserRole } from 'generated/enums';
import { AllowStaffRolesOnAdminRoutes } from 'src/auth/decorators/allow-staff-roles-on-admin.decorator';
import {
  CurrentUser,
  type JwtPayload,
} from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ParseClassIdPipe } from 'src/common/pipes/parse-entity-id.pipe';
import { ExamPrintService, type ExamPrintFile } from './exam-print.service';

function toSafeFilenameSlug(label: string): string {
  return (
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'de'
  );
}

function sendPdf(
  res: Response,
  file: ExamPrintFile,
  withAnswers: boolean,
): StreamableFile {
  const prefix = withAnswers ? 'de-dap-an' : 'de';
  const filename = `${prefix}-${toSafeFilenameSlug(file.lessonTitle)}.pdf`;
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': file.pdf.length,
    'Cache-Control': 'private, no-store',
  });
  return new StreamableFile(file.pdf);
}

const PDF_DESCRIPTION =
  'Đề trắng theo form đề tốt nghiệp THPT môn Tin học (Phần I trắc nghiệm, Phần II Đúng/Sai, Nhóm tự chọn). Thứ tự gốc của tiết, không đảo câu, không mã đề. Chỉ instance IT.';
const ANSWERS_QUERY = {
  name: 'answers',
  required: false,
  type: Boolean,
  description:
    'true = thêm trang đáp án ở cuối (Phần I: phương án đúng; Phần II: Đ/S từng ý).',
};

@Controller('lessons/:lessonId/print.pdf')
@ApiTags('exam-print')
@ApiCookieAuth('access_token')
export class LessonExamPrintController {
  constructor(private readonly examPrint: ExamPrintService) {}

  @Get()
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan,
    StaffRole.lesson_plan_head,
    StaffRole.teacher,
  )
  @ApiOperation({
    summary: 'Xuất PDF Đề in của tiết thực hành (cấp khoá)',
    description: `${PDF_DESCRIPTION} Quyền như xem danh sách câu của tiết: admin/trợ lí hoặc đội giáo án của khoá. Thời gian làm bài lấy từ tiết.`,
  })
  @ApiParam({ name: 'lessonId', description: 'ID tiết thực hành' })
  @ApiQuery(ANSWERS_QUERY)
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'File PDF.' })
  @ApiResponse({
    status: 400,
    description: 'Không phải tiết thực hành hoặc tiết chưa có câu.',
  })
  @ApiResponse({
    status: 403,
    description: 'Không thuộc đội giáo án của khoá.',
  })
  @ApiResponse({
    status: 404,
    description: 'Không có tiết, hoặc instance không bật Đề in.',
  })
  async print(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Query('answers', new ParseBoolPipe({ optional: true }))
    answers: boolean | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const withAnswers = answers === true;
    const file = await this.examPrint.printCourseLesson(
      lessonId,
      { userId: user.id, userEmail: user.email, roleType: user.roleType },
      withAnswers,
    );
    return sendPdf(res, file, withAnswers);
  }
}

@Controller('staff-ops/classes/:classId/assignments/:assignmentId/print.pdf')
@ApiTags('exam-print')
@ApiCookieAuth('access_token')
@Roles(UserRole.staff, UserRole.admin)
export class StaffAssignmentExamPrintController {
  constructor(private readonly examPrint: ExamPrintService) {}

  @Get()
  @ApiOperation({
    summary: 'Xuất PDF Đề in của lần giao (phía dạy)',
    description: `${PDF_DESCRIPTION} Admin/trợ lí hoặc gia sư phụ trách lớp. Thời gian làm bài là thời gian hiệu lực của lần giao.`,
  })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'assignmentId', description: 'class_content_items.id' })
  @ApiQuery(ANSWERS_QUERY)
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'File PDF.' })
  @ApiResponse({
    status: 400,
    description: 'Không phải tiết thực hành hoặc tiết chưa có câu.',
  })
  @ApiResponse({ status: 403, description: 'Không phụ trách lớp này.' })
  @ApiResponse({
    status: 404,
    description: 'Không có lần giao, hoặc instance không bật Đề in.',
  })
  async print(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Param('assignmentId', new ParseUUIDPipe()) assignmentId: string,
    @Query('answers', new ParseBoolPipe({ optional: true }))
    answers: boolean | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const withAnswers = answers === true;
    const file = await this.examPrint.printClassAssignment(
      { id: user.id, roleType: user.roleType },
      classId,
      assignmentId,
      withAnswers,
    );
    return sendPdf(res, file, withAnswers);
  }
}

@Controller(
  'users/me/student-classes/:classId/assignments/:assignmentId/print.pdf',
)
@ApiTags('exam-print')
@ApiCookieAuth('access_token')
@Roles(UserRole.student)
export class StudentAssignmentExamPrintController {
  constructor(private readonly examPrint: ExamPrintService) {}

  @Get()
  @ApiOperation({
    summary: 'Xuất PDF Đề in của lần giao (học sinh)',
    description: `${PDF_DESCRIPTION} Chỉ bản Đề (không đáp án). In được bất cứ lúc nào thấy lần giao, kể cả trước khi bắt đầu lượt làm.`,
  })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'assignmentId', description: 'class_content_items.id' })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'File PDF.' })
  @ApiResponse({
    status: 400,
    description:
      'Không phải tiết thực hành, lần giao không có thời lượng, hoặc tiết chưa có câu.',
  })
  @ApiResponse({
    status: 403,
    description: 'Không học lớp này, hoặc chưa tới giờ mở lần giao.',
  })
  @ApiResponse({
    status: 404,
    description: 'Không thấy lần giao, hoặc instance không bật Đề in.',
  })
  async print(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Param('assignmentId', new ParseUUIDPipe()) assignmentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.examPrint.printStudentAssignment(
      user.id,
      classId,
      assignmentId,
    );
    return sendPdf(res, file, false);
  }
}
