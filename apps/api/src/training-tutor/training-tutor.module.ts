import { Module } from '@nestjs/common';
import { AchievementModule } from 'src/achievements/achievement.module';
import { ActionHistoryModule } from 'src/action-history/action-history.module';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { StaffModule } from 'src/staff/staff.module';
import { TrainingTutorController } from './training-tutor.controller';
import { TrainingTutorService } from './training-tutor.service';

@Module({
  imports: [
    PrismaModule,
    AchievementModule,
    ActionHistoryModule,
    AuthModule,
    StaffModule,
  ],
  controllers: [TrainingTutorController],
  providers: [TrainingTutorService],
})
export class TrainingTutorModule {}
