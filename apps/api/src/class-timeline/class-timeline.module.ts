import { Module } from '@nestjs/common';
import { ProtectedVideoModule } from 'src/protected-video/protected-video.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { StaffOperationsModule } from 'src/staff-ops/staff-operations.module';
import { ClassTimelineController } from './class-timeline.controller';
import { ClassTimelineService } from './class-timeline.service';

@Module({
  imports: [PrismaModule, StaffOperationsModule, ProtectedVideoModule],
  controllers: [ClassTimelineController],
  providers: [ClassTimelineService],
  exports: [ClassTimelineService],
})
export class ClassTimelineModule {}
