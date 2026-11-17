import { Module } from '@nestjs/common';
import { ActionHistoryModule } from 'src/action-history/action-history.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { TrainingManagerController } from './training-manager.controller';
import { TrainingManagerService } from './training-manager.service';

@Module({
  imports: [PrismaModule, ActionHistoryModule],
  controllers: [TrainingManagerController],
  providers: [TrainingManagerService],
  exports: [TrainingManagerService],
})
export class TrainingManagerModule {}
