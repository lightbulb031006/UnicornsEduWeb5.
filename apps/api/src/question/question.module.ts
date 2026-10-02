import { Module } from '@nestjs/common';
import { QuestionController } from './question.controller';
import { QuestionService } from './question.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ActionHistoryModule } from '../action-history/action-history.module';
import { ClassModule } from '../class/class.module';

@Module({
  imports: [PrismaModule, ActionHistoryModule, ClassModule],
  controllers: [QuestionController],
  providers: [QuestionService],
  exports: [QuestionService],
})
export class QuestionModule {}
