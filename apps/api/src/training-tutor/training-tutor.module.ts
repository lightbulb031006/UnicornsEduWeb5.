import { Module } from '@nestjs/common';
import { AchievementModule } from 'src/achievements/achievement.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { TrainingTutorController } from './training-tutor.controller';
import { TrainingTutorService } from './training-tutor.service';

@Module({
  imports: [PrismaModule, AchievementModule],
  controllers: [TrainingTutorController],
  providers: [TrainingTutorService],
})
export class TrainingTutorModule {}
