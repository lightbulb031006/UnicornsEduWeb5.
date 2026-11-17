import { Module } from '@nestjs/common';
import { AchievementModule } from 'src/achievements/achievement.module';
import { ActionHistoryModule } from 'src/action-history/action-history.module';
import { AuthModule } from 'src/auth/auth.module';
import { FixedSalarySettingsModule } from 'src/fixed-salary-settings/fixed-salary-settings.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SaleCsTeamController } from './sale-cs-team.controller';
import { SaleCsTeamService } from './sale-cs-team.service';

@Module({
  imports: [
    PrismaModule,
    AchievementModule,
    ActionHistoryModule,
    AuthModule,
    FixedSalarySettingsModule,
  ],
  controllers: [SaleCsTeamController],
  providers: [SaleCsTeamService],
})
export class SaleCsTeamModule {}
