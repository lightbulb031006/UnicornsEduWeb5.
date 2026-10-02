import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { StaffOperationsModule } from 'src/staff-ops/staff-operations.module';
import { CourseContentModule } from 'src/course-content/course-content.module';
import { StudentAttemptController } from './attempt.controller';
import {
  StaffAttemptGradingController,
  StaffAttemptStatsController,
} from './staff-attempt.controller';
import { AttemptExpiryJob } from './attempt-expiry.job';
import { AttemptService } from './attempt.service';

@Module({
  imports: [PrismaModule, CourseContentModule, StaffOperationsModule],
  controllers: [
    StudentAttemptController,
    StaffAttemptGradingController,
    StaffAttemptStatsController,
  ],
  providers: [AttemptService, AttemptExpiryJob],
  exports: [AttemptService],
})
export class AttemptModule {}
