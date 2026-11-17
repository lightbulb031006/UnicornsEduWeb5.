import { Module } from '@nestjs/common';
import { ActionHistoryModule } from '../action-history/action-history.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  MyAchievementController,
  StaffAchievementController,
  StudentAchievementController,
} from './achievement.controller';
import { AchievementService } from './achievement.service';

@Module({
  imports: [PrismaModule, AuthModule, ActionHistoryModule],
  controllers: [
    StaffAchievementController,
    StudentAchievementController,
    MyAchievementController,
  ],
  providers: [AchievementService],
  exports: [AchievementService],
})
export class AchievementModule {}
