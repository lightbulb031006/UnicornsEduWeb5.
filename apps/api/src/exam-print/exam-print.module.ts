import { Module } from '@nestjs/common';
import { CourseContentModule } from 'src/course-content/course-content.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { StaffOperationsModule } from 'src/staff-ops/staff-operations.module';
import { ExamPdfRendererService } from './exam-pdf-renderer.service';
import {
  LessonExamPrintController,
  StaffAssignmentExamPrintController,
  StudentAssignmentExamPrintController,
} from './exam-print.controller';
import { ExamPrintService } from './exam-print.service';

@Module({
  imports: [PrismaModule, CourseContentModule, StaffOperationsModule],
  controllers: [
    LessonExamPrintController,
    StaffAssignmentExamPrintController,
    StudentAssignmentExamPrintController,
  ],
  providers: [ExamPrintService, ExamPdfRendererService],
})
export class ExamPrintModule {}
