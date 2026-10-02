import { Module } from '@nestjs/common';
import { ActionHistoryModule } from 'src/action-history/action-history.module';
import { GoogleCalendarModule } from 'src/google-calendar/google-calendar.module';
import { CalendarModule } from 'src/calendar/calendar.module';
import { NotificationModule } from 'src/notification/notification.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { StaffOperationsModule } from 'src/staff-ops/staff-operations.module';
import { ClassController } from './class.controller';
import { CourseAccessService } from './course-access.service';
import { CourseController } from './course.controller';
import { CourseService } from './course.service';
import { ClassSurveyService } from './class-survey.service';
import { ClassService } from './class.service';
import { StaffOpsClassController } from './staff-ops-class.controller';
import { SurveysController } from './surveys.controller';
import { SurveyWarningsController } from './survey-warnings.controller';
import { SurveyRoundService } from './survey-round.service';
import { SurveyService } from './survey.service';

@Module({
  imports: [
    PrismaModule,
    StaffOperationsModule,
    ActionHistoryModule,
    GoogleCalendarModule,
    CalendarModule,
    NotificationModule,
  ],
  controllers: [
    ClassController,
    CourseController,
    StaffOpsClassController,
    SurveysController,
    SurveyWarningsController,
  ],
  providers: [
    ClassService,
    CourseService,
    CourseAccessService,
    ClassSurveyService,
    SurveyRoundService,
    SurveyService,
  ],
  exports: [
    ClassService,
    CourseService,
    CourseAccessService,
    ClassSurveyService,
    SurveyRoundService,
    SurveyService,
  ],
})
export class ClassModule {}
