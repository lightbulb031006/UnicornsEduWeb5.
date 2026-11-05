import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ProtectedVideoController } from './protected-video.controller';
import { ProtectedVideoSyncJob } from './protected-video-sync.job';
import { ProtectedVideoService } from './protected-video.service';
import { UniojVideoSyncClient } from './unioj-video-sync.client';

@Module({
  imports: [HttpModule, ConfigModule, PrismaModule],
  controllers: [ProtectedVideoController],
  providers: [
    ProtectedVideoService,
    UniojVideoSyncClient,
    ProtectedVideoSyncJob,
  ],
  exports: [ProtectedVideoService],
})
export class ProtectedVideoModule {}
