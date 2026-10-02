import { Module } from '@nestjs/common';
import { ActionHistoryModule } from 'src/action-history/action-history.module';
import { AuthModule } from 'src/auth/auth.module';
import { GoogleCalendarModule } from 'src/google-calendar/google-calendar.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { FixedSalarySettingsModule } from 'src/fixed-salary-settings/fixed-salary-settings.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [
    PrismaModule,
    ActionHistoryModule,
    GoogleCalendarModule,
    AuthModule,
    FixedSalarySettingsModule,
  ],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
