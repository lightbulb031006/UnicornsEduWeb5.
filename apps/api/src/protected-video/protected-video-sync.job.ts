import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProtectedVideoService } from './protected-video.service';

export const PROTECTED_VIDEO_SYNC_CRON = CronExpression.EVERY_MINUTE;

@Injectable()
export class ProtectedVideoSyncJob {
  private readonly logger = new Logger(ProtectedVideoSyncJob.name);
  private running = false;

  constructor(private readonly protectedVideos: ProtectedVideoService) {}

  @Cron(PROTECTED_VIDEO_SYNC_CRON)
  async handleCron(): Promise<void> {
    // Lượt trước chưa xong (UNIOJ chậm/backfill lớn) thì bỏ lượt này, tránh chồng request.
    if (this.running) return;
    this.running = true;
    try {
      const { submitted, polled } = await this.protectedVideos.syncTick();
      if (submitted || polled) {
        this.logger.log(`Video sync: submitted ${submitted}, polled ${polled}`);
      }
    } catch (error) {
      this.logger.error('Video sync tick failed', error as Error);
    } finally {
      this.running = false;
    }
  }
}
