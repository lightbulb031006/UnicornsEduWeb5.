import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { UserModule } from './user/user.module';
import { StudentModule } from './student/student.module';
import { StaffModule } from './staff/staff.module';
import { ClassModule } from './class/class.module';
import { CostModule } from './cost/cost.module';
import { BonusModule } from './bonus/bonus.module';
import { ExtraAllowanceModule } from './extra-allowance/extra-allowance.module';
import { CodeforcesModule } from './codeforces/codeforces.module';
import { CfProblemTutorialModule } from './cf-problem-tutorial/cf-problem-tutorial.module';
import { SessionModule } from './session/session.module';
import { UniojModule } from './unioj/unioj.module';
import { CustomerCareModule } from './customer-care/customer-care.module';
import { AssistantCommissionModule } from './assistant-commission/assistant-commission.module';
import { TrainingManagerModule } from './training-manager/training-manager.module';
import { ActionHistoryModule } from './action-history/action-history.module';
import { LessonModule } from './lesson/lesson.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationModule } from './notification/notification.module';
import { PrismaModule } from './prisma/prisma.module';
import { RegulationModule } from './regulation/regulation.module';
import { GoogleCalendarModule } from './google-calendar/google-calendar.module';
import { CalendarModule } from './calendar/calendar.module';
import { DeductionSettingsModule } from './deduction-settings/deduction-settings.module';
import { FixedSalarySettingsModule } from './fixed-salary-settings/fixed-salary-settings.module';
import { AchievementModule } from './achievements/achievement.module';
import { StudentGalleryModule } from './student-gallery/student-gallery.module';
import { DeviceModule } from './device/device.module';
import { QuestionModule } from './question/question.module';
import { AttemptModule } from './attempt/attempt.module';
import { ClassTimelineModule } from './class-timeline/class-timeline.module';
import { CourseContentModule } from './course-content/course-content.module';

function parsePositiveIntegerEnv(
  value: string | undefined,
  fallback: number,
): number {
  const parsedValue = Number.parseInt(value ?? '', 10);

  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}

@Module({
  imports: [
    ScheduleModule.forRoot({
      // Jest boots AppModule in e2e; keep cron timers off so existing tests stay isolated.
      cronJobs: process.env.NODE_ENV !== 'test',
    }),
    ThrottlerModule.forRoot([
      {
        ttl: parsePositiveIntegerEnv(
          process.env.THROTTLE_DEFAULT_TTL_MS,
          60_000,
        ),
        limit: parsePositiveIntegerEnv(process.env.THROTTLE_DEFAULT_LIMIT, 300),
        blockDuration: parsePositiveIntegerEnv(
          process.env.THROTTLE_DEFAULT_BLOCK_DURATION_MS,
          60_000,
        ),
      },
    ]),
    ScheduleModule.forRoot(),
    AuthModule,
    UserModule,
    StudentModule,
    StaffModule,
    ClassModule,
    CostModule,
    BonusModule,
    ExtraAllowanceModule,
    CodeforcesModule,
    CfProblemTutorialModule,
    SessionModule,
    UniojModule,
    CustomerCareModule,
    AssistantCommissionModule,
    TrainingManagerModule,
    ActionHistoryModule,
    LessonModule,
    DashboardModule,
    NotificationModule,
    RegulationModule,
    PrismaModule,
    GoogleCalendarModule,
    CalendarModule,
    DeductionSettingsModule,
    FixedSalarySettingsModule,
    AchievementModule,
    StudentGalleryModule,
    DeviceModule,
    QuestionModule,
    CourseContentModule,
    AttemptModule,
    ClassTimelineModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RolesGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
