import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ActionHistoryModule } from 'src/action-history/action-history.module';
import { ClassModule } from 'src/class/class.module';
import { ClassContentController } from './class-content.controller';
import { ClassContentService } from './class-content.service';
import { ClassLessonController } from './class-lesson.controller';
import { CourseModuleController } from './course-module.controller';
import { CourseModuleService } from './course-module.service';
import { CourseLessonController } from './course-lesson.controller';
import { CourseLessonService } from './course-lesson.service';
import { CourseExamLibraryController } from './exam-library.controller';
import { ExamLibraryService } from './exam-library.service';
import { LessonQuizController } from './lesson-quiz.controller';
import { LessonQuizService } from './lesson-quiz.service';
import { PracticeLessonQuestionController } from './practice-lesson-question.controller';
import { PracticeQuestionLinkService } from './practice-question-link.service';
import { CourseContentSupportService } from './course-content-support.service';
import { CourseContentService } from './course-content.service';

@Module({
  imports: [PrismaModule, ActionHistoryModule, ClassModule],
  controllers: [
    CourseModuleController,
    CourseLessonController,
    ClassLessonController,
    LessonQuizController,
    ClassContentController,
    PracticeLessonQuestionController,
    CourseExamLibraryController,
  ],
  providers: [
    CourseContentSupportService,
    CourseModuleService,
    CourseLessonService,
    LessonQuizService,
    ClassContentService,
    PracticeQuestionLinkService,
    ExamLibraryService,
    CourseContentService,
  ],
  exports: [
    CourseContentSupportService,
    CourseModuleService,
    CourseLessonService,
    LessonQuizService,
    ClassContentService,
    PracticeQuestionLinkService,
    ExamLibraryService,
    CourseContentService,
  ],
})
export class CourseContentModule {}
