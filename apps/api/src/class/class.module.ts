import { Module } from '@nestjs/common';
import { ActionHistoryModule } from 'src/action-history/action-history.module';
import { GoogleCalendarModule } from 'src/google-calendar/google-calendar.module';
import { CalendarModule } from 'src/calendar/calendar.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { StaffOperationsModule } from 'src/staff-ops/staff-operations.module';
import { ClassController } from './class.controller';
import { ClassSurveyService } from './class-survey.service';
import { ClassService } from './class.service';
import { StaffOpsClassController } from './staff-ops-class.controller';

@Module({
  imports: [
    PrismaModule,
    StaffOperationsModule,
    ActionHistoryModule,
    GoogleCalendarModule,
    CalendarModule,
  ],
  controllers: [ClassController, StaffOpsClassController],
  providers: [ClassService, ClassSurveyService],
  exports: [ClassService, ClassSurveyService],
})
export class ClassModule {}
