import { Module } from '@nestjs/common';
import { ActionHistoryModule } from '../action-history/action-history.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FixedSalaryCloseScheduler } from './fixed-salary-close.scheduler';
import { FixedSalaryCloseService } from './fixed-salary-close.service';
import { FixedSalarySettingsController } from './fixed-salary-settings.controller';
import { FixedSalarySettingsService } from './fixed-salary-settings.service';

@Module({
  imports: [PrismaModule, ActionHistoryModule],
  controllers: [FixedSalarySettingsController],
  providers: [
    FixedSalarySettingsService,
    FixedSalaryCloseService,
    FixedSalaryCloseScheduler,
  ],
  exports: [FixedSalarySettingsService, FixedSalaryCloseService],
})
export class FixedSalarySettingsModule {}
