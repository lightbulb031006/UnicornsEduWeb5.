import { Module } from '@nestjs/common';
import { ActionHistoryModule } from 'src/action-history/action-history.module';
import { AuthModule } from 'src/auth/auth.module';
import { BonusModule } from 'src/bonus/bonus.module';
import { DashboardModule } from 'src/dashboard/dashboard.module';
import { ExtraAllowanceModule } from 'src/extra-allowance/extra-allowance.module';
import { LessonModule } from 'src/lesson/lesson.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SessionModule } from 'src/session/session.module';
import { StaffModule } from 'src/staff/staff.module';
import { StudentModule } from 'src/student/student.module';
import { SePayModule } from 'src/sepay/sepay.module';
import { CourseContentModule } from 'src/course-content/course-content.module';
import { UserController } from './user.controller';
import { UserProfileController } from './user-profile.controller';
import { UserService } from './user.service';

@Module({
  imports: [
    PrismaModule,
    ActionHistoryModule,
    AuthModule,
    StaffModule,
    BonusModule,
    DashboardModule,
    SessionModule,
    ExtraAllowanceModule,
    LessonModule,
    StudentModule,
    SePayModule,
    CourseContentModule,
  ],
  controllers: [UserController, UserProfileController],
  providers: [UserService],
})
export class UserModule {}
