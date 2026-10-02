import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  MyAchievementController,
  StaffAchievementController,
  StudentAchievementController,
} from './achievement.controller';
import { AchievementService } from './achievement.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [
    StaffAchievementController,
    StudentAchievementController,
    MyAchievementController,
  ],
  providers: [AchievementService],
  exports: [AchievementService],
})
export class AchievementModule {}
