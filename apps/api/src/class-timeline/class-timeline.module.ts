import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { StaffOperationsModule } from 'src/staff-ops/staff-operations.module';
import { ClassTimelineController } from './class-timeline.controller';
import { ClassTimelineService } from './class-timeline.service';

@Module({
  imports: [PrismaModule, StaffOperationsModule],
  controllers: [ClassTimelineController],
  providers: [ClassTimelineService],
  exports: [ClassTimelineService],
})
export class ClassTimelineModule {}
